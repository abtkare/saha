import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { isMinor, normalizeIraqiPhone } from '@saha/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/arabic-error.filter';
import { bool, int, nullableStr, str } from '../common/validate';
import { assertActive, assertCan } from '../auth/auth.guard';
import type { AuthContext } from '../auth/auth.types';
import { eligibilityProblems, publicPlayerName, PUBLIC_PLAYER_SELECT } from './players';
import { NotificationsService } from '../notifications/notifications';
import { mediaUrl } from '../uploads/uploads';

type B = Record<string, unknown>;
type Ctx = { auth: AuthContext; ip: string };

export const MAX_TEAMS_PER_MANAGER = 5;
export const MAX_PLAYERS_PER_TEAM = 30;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // بلا 0/O و1/I لتجنب الالتباس

export function randomCode(len = 6): string {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

const FB_URL = /^https:\/\/(www\.|m\.|web\.)?facebook\.com\/\S+$/i;
const TEAM_NOT_FOUND = () => new AppError(404, 'TEAM_NOT_FOUND', 'الفريق غير موجود.');

/** الفرق: الإنشاء، الصفحة العامة، اللاعبون، رمز الانضمام، التوثيق اليدوي */
@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly notifications: NotificationsService) {}

  private async adult(userId: number, what: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!u.birthYear || isMinor(u.birthYear)) throw new AppError(403, 'ADULT_REQUIRED', `${what} يجب أن يكون بالغاً وأن يكمل سنة ميلاده.`);
    return u;
  }

  /**
   * صورة الفريق (الشعار أو صورة صاحب الفريق): رقم صورة رفعها المستخدم نفسه بـ POST /uploads (خاصة أو عامة).
   * undefined = لم يُرسل الحقل، null = حذف الصورة. الصورة تصير عامة عند ربطها بالفريق لتظهر في الجداول.
   */
  private async teamImage(tx: Prisma.TransactionClient, body: B, field: string, label: string, userId: number): Promise<string | null | undefined> {
    if (!(field in (body ?? {}))) return undefined;
    if (body[field] === null) return null;
    const id = int(body, field, { min: 1, label })!;
    const media = await tx.mediaAsset.findUnique({ where: { id }, select: { uploadedById: true, isPublic: true } });
    if (!media || media.uploadedById !== userId) throw new AppError(400, 'MEDIA_INVALID', `${label}: الصورة غير موجودة أو لم ترفعها أنت.`);
    if (!media.isPublic) await tx.mediaAsset.update({ where: { id }, data: { isPublic: true } });
    return mediaUrl(id);
  }

  /** الحقول الاختيارية للهوية: الشعار، اسم صاحب الفريق/المؤثر/صاحب الصفحة، وصورته */
  private async identity(tx: Prisma.TransactionClient, body: B, userId: number) {
    const data: { logoUrl?: string | null; ownerPhotoUrl?: string | null; ownerName?: string | null } = {};
    const logo = await this.teamImage(tx, body, 'logoMediaId', 'شعار الفريق', userId);
    if (logo !== undefined) data.logoUrl = logo;
    const photo = await this.teamImage(tx, body, 'ownerPhotoMediaId', 'صورة صاحب الفريق', userId);
    if (photo !== undefined) data.ownerPhotoUrl = photo;
    const ownerName = nullableStr(body, 'ownerName', { max: 60, label: 'اسم صاحب الفريق' });
    if (ownerName !== undefined) data.ownerName = ownerName || null;
    return data;
  }

  // ───────────── الفريق ─────────────

  /** POST /teams {nameAr, city?, fbPageUrl?, communityId?} — المنشئ يصبح مدير الفريق */
  async create(body: B, { auth, ip }: Ctx) {
    assertActive(auth);
    await this.adult(auth.userId, 'مدير الفريق');
    if ((await this.prisma.team.count({ where: { managerId: auth.userId } })) >= MAX_TEAMS_PER_MANAGER) {
      throw new AppError(409, 'TEAMS_LIMIT', `لا يمكن إدارة أكثر من ${MAX_TEAMS_PER_MANAGER} فرق بحساب واحد.`);
    }
    const nameAr = str(body, 'nameAr', { min: 2, max: 40, label: 'اسم الفريق' })!;
    const fbPageUrl = str(body, 'fbPageUrl', { optional: true, max: 200, label: 'رابط صفحة فيسبوك' }) ?? null;
    if (fbPageUrl && !FB_URL.test(fbPageUrl)) throw new AppError(400, 'INVALID_FB_URL', 'رابط صفحة فيسبوك غير صحيح.');
    const communityId = int(body, 'communityId', { optional: true, min: 1, label: 'المجتمع' }) ?? null;
    if (communityId !== null && !(await this.prisma.community.findUnique({ where: { id: communityId } }))) {
      throw new AppError(400, 'COMMUNITY_NOT_FOUND', 'المجتمع غير موجود.');
    }
    const city = str(body, 'city', { optional: true, max: 40, label: 'المدينة' }) ?? null;
    const team = await this.prisma.$transaction(async (tx) => {
      const ident = await this.identity(tx, body, auth.userId);
      const t = await tx.team.create({
        data: { nameAr, city, fbPageUrl, communityId, managerId: auth.userId, joinCode: randomCode(), ...ident },
      });
      await tx.userRole.create({ data: { userId: auth.userId, role: 'team_manager', teamId: t.id } });
      await this.audit.record({ actorUserId: auth.userId, action: 'team.create', entity: 'team', entityId: t.id, payload: { nameAr }, ip }, tx);
      return t;
    });
    return team;
  }

  /** GET /teams/:id — الصفحة العامة: اللاعبون (القاصر بالاسم الأول)، البطولات، المباريات */
  async publicTeam(id: number) {
    const t = await this.prisma.team.findUnique({
      where: { id },
      select: {
        id: true, nameAr: true, logoUrl: true, ownerName: true, ownerPhotoUrl: true, city: true, fbPageUrl: true, verifiedAt: true, verifyMethod: true,
        community: { select: { id: true, kind: true, nameAr: true } },
        players: { orderBy: [{ shirtNo: 'asc' }], select: { shirtNo: true, player: { select: PUBLIC_PLAYER_SELECT } } },
        registrations: { where: { status: 'approved', tournament: { status: { not: 'draft' } } }, select: { groupLabel: true, tournament: { select: { id: true, nameAr: true, slug: true, status: true, kind: true } } } },
      },
    });
    if (!t) throw TEAM_NOT_FOUND();
    const matches = await this.prisma.match.findMany({
      where: { OR: [{ homeTeamId: id }, { awayTeamId: id }], tournament: { status: { not: 'draft' } } },
      orderBy: [{ kickoffAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true, stage: true, round: true, kickoffAt: true, venue: true, homeScore: true, awayScore: true, resultStatus: true,
        tournament: { select: { id: true, nameAr: true, slug: true } },
        homeTeam: { select: { id: true, nameAr: true } }, awayTeam: { select: { id: true, nameAr: true } },
      },
    });
    return {
      ...t,
      verified: t.verifiedAt !== null,
      players: t.players.map((tp) => ({ id: tp.player.id, name: publicPlayerName(tp.player), shirtNo: tp.shirtNo })),
      tournaments: t.registrations.map((r) => ({ ...r.tournament, groupLabel: r.groupLabel })),
      matches,
    };
  }

  /** GET /me/teams — فرقي (كمدير) مع رمز الانضمام */
  myTeams(auth: AuthContext) {
    return this.prisma.team.findMany({
      where: { managerId: auth.userId },
      select: { id: true, nameAr: true, city: true, joinCode: true, verifiedAt: true, fbPageUrl: true, logoUrl: true, ownerName: true, ownerPhotoUrl: true, _count: { select: { players: true } } },
    });
  }

  async update(id: number, body: B, { auth, ip }: Ctx) {
    assertCan(auth, 'team.page.edit', { teamId: id });
    const team = await this.prisma.team.findUnique({ where: { id } });
    if (!team) throw TEAM_NOT_FOUND();
    const data: Prisma.TeamUpdateInput = {};
    const nameAr = str(body, 'nameAr', { optional: true, min: 2, max: 40, label: 'اسم الفريق' });
    if (nameAr) data.nameAr = nameAr;
    const city = nullableStr(body, 'city', { max: 40, label: 'المدينة' });
    if (city !== undefined) data.city = city;
    const fb = nullableStr(body, 'fbPageUrl', { max: 200, label: 'رابط صفحة فيسبوك' });
    if (fb !== undefined && fb !== team.fbPageUrl) {
      if (fb && !FB_URL.test(fb)) throw new AppError(400, 'INVALID_FB_URL', 'رابط صفحة فيسبوك غير صحيح.');
      // تغيير الصفحة يلغي التوثيق السابق
      Object.assign(data, { fbPageUrl: fb, fbPageId: null, verifiedAt: null, verifyMethod: null });
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      Object.assign(data, await this.identity(tx, body, auth.userId));
      if ('verifiedAt' in data) await tx.teamVerificationRequest.updateMany({ where: { teamId: id, status: 'pending' }, data: { status: 'withdrawn' } });
      const u = await tx.team.update({ where: { id }, data });
      await this.audit.record({ actorUserId: auth.userId, action: 'team.update', entity: 'team', entityId: id, payload: { fields: Object.keys(data) }, ip }, tx);
      return u;
    });
    return updated;
  }

  async regenerateJoinCode(id: number, { auth, ip }: Ctx) {
    assertCan(auth, 'team.players.manage', { teamId: id });
    const joinCode = randomCode();
    await this.prisma.team.update({ where: { id }, data: { joinCode } }).catch(() => { throw TEAM_NOT_FOUND(); });
    await this.audit.record({ actorUserId: auth.userId, action: 'team.join_code', entity: 'team', entityId: id, ip });
    return { joinCode };
  }

  // ───────────── اللاعبون ─────────────

  /**
   * إضافة لاعب لفريق مع الفحوص: الحد الأعلى، التكرار، رقم القميص، والأهلية في البطولات
   * المعتمد فيها الفريق ولم تنتهِ (الفئة العمرية، واللاعب مع فريق آخر في البطولة نفسها).
   */
  private async addPlayer(teamId: number, playerId: number, shirtNo: number | null, actor: number, ip: string, via: string) {
    return this.prisma.$transaction(async (tx) => {
      if ((await tx.teamPlayer.count({ where: { teamId } })) >= MAX_PLAYERS_PER_TEAM) {
        throw new AppError(409, 'TEAM_FULL', `الحد الأعلى ${MAX_PLAYERS_PER_TEAM} لاعباً في الفريق.`);
      }
      if (await tx.teamPlayer.findUnique({ where: { teamId_playerId: { teamId, playerId } } })) {
        throw new AppError(409, 'ALREADY_IN_TEAM', 'اللاعب موجود في الفريق مسبقاً.');
      }
      if (shirtNo !== null && (await tx.teamPlayer.findFirst({ where: { teamId, shirtNo } }))) {
        throw new AppError(409, 'SHIRT_TAKEN', `الرقم ${shirtNo} محجوز للاعب آخر في الفريق.`);
      }
      const active = await tx.tournamentRegistration.findMany({
        where: { teamId, status: 'approved', tournament: { status: { in: ['registration', 'running'] } } },
        select: { tournament: { select: { id: true, ageCategory: true } } },
      });
      for (const r of active) {
        const problems = await eligibilityProblems(tx, r.tournament, teamId, [playerId]);
        if (problems.length) throw new AppError(409, 'PLAYER_NOT_ELIGIBLE', problems[0]);
      }
      await tx.teamPlayer.create({ data: { teamId, playerId, shirtNo } });
      await this.audit.record({ actorUserId: actor, action: 'team.player_add', entity: 'team', entityId: teamId, payload: { playerId, shirtNo, via }, ip }, tx);
      return { ok: true, teamId, playerId, shirtNo };
    });
  }

  /** ملف اللاعب لحساب بالغ (يُنشأ عند أول انضمام) */
  private async playerForUser(user: { id: number; fullName: string; birthYear: number | null }) {
    const existing = await this.prisma.player.findUnique({ where: { userId: user.id } });
    if (existing) return existing;
    const [firstName, ...rest] = user.fullName.trim().split(/\s+/);
    return this.prisma.player.create({ data: { userId: user.id, firstName, lastName: rest.join(' ') || null, birthYear: user.birthYear!, mediaConsent: false } });
  }

  private shirt(body: B) {
    return int(body, 'shirtNo', { optional: true, min: 1, max: 99, label: 'رقم القميص' }) ?? null;
  }

  private async teamByCode(body: B) {
    const code = str(body, 'code', { min: 6, max: 6, label: 'رمز الانضمام' })!.toUpperCase();
    const team = await this.prisma.team.findUnique({ where: { joinCode: code } });
    if (!team) throw new AppError(404, 'INVALID_JOIN_CODE', 'رمز الانضمام غير صحيح. اطلبه من مدير الفريق.');
    return team;
  }

  /** POST /teams/join {code, shirtNo?} — لاعب بالغ ينضم بنفسه برمز الفريق */
  async joinSelf(body: B, { auth, ip }: Ctx) {
    assertActive(auth);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (!user.birthYear) throw new AppError(403, 'PROFILE_REQUIRED', 'أكمل سنة ميلادك أولاً.');
    if (isMinor(user.birthYear)) throw new AppError(403, 'GUARDIAN_JOINS', 'اللاعب دون 18 سنة يضيفه ولي أمره من حسابه.');
    const team = await this.teamByCode(body);
    const player = await this.playerForUser(user);
    const r = await this.addPlayer(team.id, player.id, this.shirt(body), auth.userId, ip, 'join_code');
    return { ...r, team: { id: team.id, nameAr: team.nameAr } };
  }

  /** POST /me/children/:id/teams {code, shirtNo?} — ولي الأمر يضم ابنه برمز الفريق (موافقته ضمنية) */
  async joinChild(childId: number, body: B, { auth, ip }: Ctx) {
    assertActive(auth);
    const child = await this.prisma.player.findFirst({ where: { id: childId, guardianId: auth.userId } });
    if (!child) throw new AppError(404, 'PLAYER_NOT_FOUND', 'اللاعب غير موجود ضمن أبنائك.');
    const team = await this.teamByCode(body);
    const r = await this.addPlayer(team.id, child.id, this.shirt(body), auth.userId, ip, 'guardian');
    return { ...r, team: { id: team.id, nameAr: team.nameAr } };
  }

  /** POST /teams/:id/players {phone, shirtNo?} — مدير الفريق يضيف لاعباً بالغاً له حساب */
  async addByPhone(teamId: number, body: B, { auth, ip }: Ctx) {
    assertCan(auth, 'team.players.manage', { teamId });
    if (!(await this.prisma.team.findUnique({ where: { id: teamId } }))) throw TEAM_NOT_FOUND();
    const phone = normalizeIraqiPhone(str(body, 'phone', { label: 'رقم الهاتف' })!);
    if (!phone) throw new AppError(400, 'INVALID_PHONE', 'رقم الهاتف غير صحيح.');
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user || user.status !== 'active' || !user.birthYear) {
      throw new AppError(404, 'PLAYER_ACCOUNT_REQUIRED', 'لا يوجد حساب فعّال بهذا الرقم. اطلب من اللاعب التسجيل في التطبيق أو شارك معه رمز الانضمام.');
    }
    if (isMinor(user.birthYear)) throw new AppError(403, 'GUARDIAN_JOINS', 'اللاعب دون 18 سنة يضيفه ولي أمره برمز الانضمام.');
    const player = await this.playerForUser(user);
    return this.addPlayer(teamId, player.id, this.shirt(body), auth.userId, ip, 'manager');
  }

  /** PATCH /teams/:id/players/:playerId {shirtNo} */
  async setShirt(teamId: number, playerId: number, body: B, { auth, ip }: Ctx) {
    assertCan(auth, 'team.players.manage', { teamId });
    const shirtNo = body?.shirtNo === null ? null : this.shirt(body);
    if (shirtNo !== null && (await this.prisma.teamPlayer.findFirst({ where: { teamId, shirtNo, playerId: { not: playerId } } }))) {
      throw new AppError(409, 'SHIRT_TAKEN', `الرقم ${shirtNo} محجوز للاعب آخر في الفريق.`);
    }
    const r = await this.prisma.teamPlayer.updateMany({ where: { teamId, playerId }, data: { shirtNo } });
    if (r.count !== 1) throw new AppError(404, 'PLAYER_NOT_FOUND', 'اللاعب ليس في هذا الفريق.');
    await this.audit.record({ actorUserId: auth.userId, action: 'team.player_shirt', entity: 'team', entityId: teamId, payload: { playerId, shirtNo }, ip });
    return { ok: true, shirtNo };
  }

  /** DELETE /teams/:id/players/:playerId — مدير الفريق، أو اللاعب نفسه، أو ولي أمره */
  async removePlayer(teamId: number, playerId: number, { auth, ip }: Ctx) {
    const player = await this.prisma.player.findUnique({ where: { id: playerId } });
    const self = player && (player.userId === auth.userId || player.guardianId === auth.userId);
    if (!self) assertCan(auth, 'team.players.manage', { teamId });
    const r = await this.prisma.teamPlayer.deleteMany({ where: { teamId, playerId } });
    if (r.count !== 1) throw new AppError(404, 'PLAYER_NOT_FOUND', 'اللاعب ليس في هذا الفريق.');
    await this.audit.record({ actorUserId: auth.userId, action: 'team.player_remove', entity: 'team', entityId: teamId, payload: { playerId, by: self ? 'self' : 'manager' }, ip });
    return { ok: true };
  }

  // ───────────── التوثيق اليدوي ─────────────

  /** POST /teams/:id/verification — رمز ينشره المدير في منشور على صفحة الفريق */
  async requestVerification(teamId: number, { auth, ip }: Ctx) {
    assertCan(auth, 'team.page.edit', { teamId });
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) throw TEAM_NOT_FOUND();
    if (!team.fbPageUrl) throw new AppError(409, 'FB_PAGE_REQUIRED', 'أضف رابط صفحة الفريق على فيسبوك أولاً.');
    if (team.verifiedAt) throw new AppError(409, 'ALREADY_VERIFIED', 'الفريق موثّق مسبقاً.');
    const pending = await this.prisma.teamVerificationRequest.findFirst({ where: { teamId, status: 'pending' } });
    const req = pending ?? (await this.prisma.teamVerificationRequest.create({ data: { teamId, method: 'manual', code: `SAHA-${randomCode()}` } }));
    if (!pending) await this.audit.record({ actorUserId: auth.userId, action: 'team.verification_request', entity: 'team', entityId: teamId, payload: { requestId: req.id }, ip });
    return { ...this.view(req), instructions: `انشر منشوراً عاماً على صفحة «${team.nameAr}» فيه الرمز ${req.code}، ثم أرسل رابط المنشور هنا لتراجعه الإدارة.` };
  }

  private view(r: { id: number; code: string; status: string; postUrl: string | null; note: string | null; createdAt: Date; reviewedAt: Date | null }) {
    return { id: r.id, code: r.code, status: r.status, postUrl: r.postUrl, note: r.note, createdAt: r.createdAt, reviewedAt: r.reviewedAt };
  }

  async verificationStatus(teamId: number, auth: AuthContext) {
    assertCan(auth, 'team.page.edit', { teamId });
    const r = await this.prisma.teamVerificationRequest.findFirst({ where: { teamId }, orderBy: { id: 'desc' } });
    return r ? this.view(r) : null;
  }

  /** PATCH /teams/:id/verification {postUrl} */
  async submitPost(teamId: number, body: B, { auth, ip }: Ctx) {
    assertCan(auth, 'team.page.edit', { teamId });
    const postUrl = str(body, 'postUrl', { max: 300, label: 'رابط المنشور' })!;
    if (!FB_URL.test(postUrl)) throw new AppError(400, 'INVALID_FB_URL', 'رابط المنشور يجب أن يكون من facebook.com.');
    const req = await this.prisma.teamVerificationRequest.findFirst({ where: { teamId, status: 'pending' } });
    if (!req) throw new AppError(404, 'NO_PENDING_REQUEST', 'لا يوجد طلب توثيق قائم. اطلب رمزاً أولاً.');
    const updated = await this.prisma.teamVerificationRequest.update({ where: { id: req.id }, data: { postUrl } });
    await this.audit.record({ actorUserId: auth.userId, action: 'team.verification_post', entity: 'team', entityId: teamId, payload: { requestId: req.id, postUrl }, ip });
    return this.view(updated);
  }

  /** GET /admin/verifications?status=pending */
  adminList(status: string | undefined, auth: AuthContext) {
    assertCan(auth, 'tournaments.manage');
    const s = (['pending', 'approved', 'rejected', 'withdrawn'] as const).find((x) => x === status) ?? 'pending';
    return this.prisma.teamVerificationRequest.findMany({
      where: { status: s }, orderBy: { createdAt: 'asc' },
      select: { id: true, code: true, postUrl: true, status: true, note: true, createdAt: true, reviewedAt: true, team: { select: { id: true, nameAr: true, fbPageUrl: true, manager: { select: { id: true, fullName: true, phone: true } } } } },
    });
  }

  /** POST /admin/verifications/:id/decide {approve, note?} — المراجع يفتح المنشور ويتأكد من الرمز */
  async decide(requestId: number, body: B, { auth, ip }: Ctx) {
    assertCan(auth, 'tournaments.manage');
    const approve = bool(body, 'approve', 'القرار');
    const note = str(body, 'note', { optional: true, max: 200, label: 'الملاحظة' }) ?? null;
    const req = await this.prisma.teamVerificationRequest.findUnique({ where: { id: requestId } });
    if (!req || req.status !== 'pending') throw new AppError(404, 'NO_PENDING_REQUEST', 'طلب التوثيق غير موجود أو تمت مراجعته.');
    if (approve && !req.postUrl) throw new AppError(409, 'POST_URL_REQUIRED', 'لم يرسل الفريق رابط المنشور بعد.');
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.teamVerificationRequest.update({ where: { id: requestId }, data: { status: approve ? 'approved' : 'rejected', note, reviewedById: auth.userId, reviewedAt: now } });
      if (approve) await tx.team.update({ where: { id: req.teamId }, data: { verifiedAt: now, verifyMethod: 'manual' } });
      await this.audit.record({ actorUserId: auth.userId, action: approve ? 'team.verify' : 'team.verify_reject', entity: 'team', entityId: req.teamId, payload: { requestId, note }, ip }, tx);
      const team = await tx.team.findUniqueOrThrow({ where: { id: req.teamId }, select: { managerId: true, nameAr: true } });
      await this.notifications.notify([team.managerId], approve
        ? { titleAr: 'وُثّقت صفحة فريقك', bodyAr: `صار «${team.nameAr}» فريقاً موثّقاً في ساحة.`, data: { type: 'team.verified', teamId: req.teamId } }
        : { titleAr: 'لم يُقبل طلب التوثيق', bodyAr: note ? `«${team.nameAr}»: ${note}` : `راجع منشور التوثيق لفريق «${team.nameAr}» وأعد المحاولة.`, data: { type: 'team.verify_rejected', teamId: req.teamId } }, tx);
    });
    return { ok: true, status: approve ? 'approved' : 'rejected' };
  }
}
