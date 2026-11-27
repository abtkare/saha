import { Injectable } from '@nestjs/common';
import { Prisma, type AgeCategory, type TournamentFormat, type TournamentKind, type TournamentStatus } from '@prisma/client';
import {
  AGE_CATEGORIES, COMMUNITY_KIND_FOR_TOURNAMENT, TOURNAMENT_FORMATS, TOURNAMENT_KINDS, TOURNAMENT_STATUS_LABELS,
  hasPermission,
} from '@saha/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/arabic-error.filter';
import { bool, date, int, list, nullableStr, oneOf, str } from '../common/validate';
import { assertActive, assertCan } from '../auth/auth.guard';
import type { AuthContext } from '../auth/auth.types';
import { eligibilityProblems } from '../teams/players';
import { computeStandings } from './standings';
import { NotificationsService } from '../notifications/notifications';
import { isSuperAdmin } from '../content/slides';
import {
  GROUP_LABELS, crossQualifiers, drawGroups, isPowerOfTwo, knockoutStage, knockoutWinner, newSeed, pairUp, roundRobin,
  schedule, shuffle, type Pair,
} from './fixtures';

type B = Record<string, unknown>;
type Ctx = { auth: AuthContext; ip: string };

const NOT_FOUND = () => new AppError(404, 'TOURNAMENT_NOT_FOUND', 'البطولة غير موجودة.');
const KO_STAGES = ['r64', 'r32', 'r16', 'qf', 'sf', 'final'];

/** الانتقالات المسموحة لحالة البطولة */
const TRANSITIONS: Record<TournamentStatus, TournamentStatus[]> = {
  draft: ['registration', 'cancelled'],
  registration: ['draft', 'running', 'cancelled'],
  running: ['finished', 'cancelled'],
  finished: [],
  cancelled: [],
};

const dbDate = (d: string | undefined) => (d === undefined ? undefined : new Date(`${d}T00:00:00Z`));

/**
 * إدارة البطولات: الإنشاء والتعديل والحالة، التسجيل واعتماده، القرعة، الجدولة، الدور التالي.
 * كل نقطة تغيير: assertCan بنطاق البطولة + سجل تدقيق.
 */
@Injectable()
export class TournamentManageService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly notifications: NotificationsService) {}

  private async load(id: number) {
    const t = await this.prisma.tournament.findUnique({ where: { id } });
    if (!t) throw NOT_FOUND();
    return t;
  }

  /** قيود نظام البطولة: المجموعات والمتأهلون والدورين */
  private checkFormat(format: TournamentFormat, groupCount: number | null, qualifiers: number | null, doubleRound: boolean) {
    if (format === 'groups_knockout') {
      if (!groupCount || !qualifiers) throw new AppError(400, 'GROUPS_REQUIRED', 'حدد عدد المجموعات وعدد المتأهلين من كل مجموعة.');
      if (!isPowerOfTwo(groupCount * qualifiers)) {
        throw new AppError(400, 'GROUPS_BRACKET', 'عدد المتأهلين الكلي (المجموعات × المتأهلين) يجب أن يكون 2 أو 4 أو 8 أو 16 أو 32.');
      }
      if (groupCount === 1 && qualifiers === 1) throw new AppError(400, 'GROUPS_BRACKET', 'مجموعة واحدة تحتاج متأهلَين اثنين.');
    } else if (groupCount != null || qualifiers != null) {
      throw new AppError(400, 'GROUPS_NOT_ALLOWED', 'المجموعات تخص نظام «مجموعات ثم خروج المغلوب» فقط.');
    }
    if (format === 'knockout' && doubleRound) throw new AppError(400, 'DOUBLE_ROUND_NOT_ALLOWED', 'الذهاب والإياب للدوري والمجموعات فقط.');
  }

  // ───────────── الإنشاء والتعديل ─────────────

  async create(body: B, { auth, ip }: Ctx) {
    assertCan(auth, 'tournaments.manage'); // دون نطاق: مدير بطولات عام أو المدير العام
    const nameAr = str(body, 'nameAr', { min: 3, max: 80, label: 'اسم البطولة' })!;
    const kind = oneOf(body, 'kind', TOURNAMENT_KINDS, { label: 'نوع البطولة' })! as TournamentKind;
    const format = oneOf(body, 'format', TOURNAMENT_FORMATS, { label: 'نظام البطولة' })! as TournamentFormat;
    const ageCategory = (oneOf(body, 'ageCategory', AGE_CATEGORIES, { optional: true, label: 'الفئة العمرية' }) ?? 'open') as AgeCategory;
    const groupCount = int(body, 'groupCount', { optional: true, min: 1, max: 8, label: 'عدد المجموعات' }) ?? null;
    const qualifiersPerGroup = int(body, 'qualifiersPerGroup', { optional: true, min: 1, max: 2, label: 'المتأهلون من كل مجموعة' }) ?? null;
    const doubleRound = body?.doubleRound === undefined ? false : bool(body, 'doubleRound', 'ذهاب وإياب');
    this.checkFormat(format, groupCount, qualifiersPerGroup, doubleRound);

    const slug = str(body, 'slug', { optional: true, min: 3, max: 60, label: 'الرابط المختصر' })?.toLowerCase() ?? `t-${Date.now().toString(36)}`;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new AppError(400, 'INVALID_SLUG', 'الرابط المختصر: أحرف إنجليزية صغيرة وأرقام وشرطات فقط.');

    // المجتمع المضيف حسب نوع البطولة
    const communityId = int(body, 'communityId', { optional: true, min: 1, label: 'المجتمع المضيف' }) ?? null;
    const needed = COMMUNITY_KIND_FOR_TOURNAMENT[kind];
    if (communityId !== null) {
      if (!needed) throw new AppError(400, 'COMMUNITY_NOT_ALLOWED', 'بطولات الفرق الشعبية لا ترتبط بمؤثر أو مجموعة.');
      const c = await this.prisma.community.findUnique({ where: { id: communityId } });
      if (!c || c.kind !== needed) throw new AppError(400, 'COMMUNITY_MISMATCH', 'المجتمع المضيف غير موجود أو لا يطابق نوع البطولة.');
    }

    const startsOn = date(body, 'startsOn', { optional: true, label: 'تاريخ البداية' });
    const endsOn = date(body, 'endsOn', { optional: true, label: 'تاريخ النهاية' });
    if (startsOn && endsOn && endsOn < startsOn) throw new AppError(400, 'INVALID_DATES', 'تاريخ النهاية قبل تاريخ البداية.');

    const fee0 = int(body, 'entryFeeIqd', { optional: true, min: 0, max: 100_000_000, label: 'رسوم الاشتراك' }) ?? 0;
    try {
      const t = await this.prisma.tournament.create({
        data: {
          nameAr, slug, kind, format, ageCategory, groupCount, qualifiersPerGroup, doubleRound,
          communityId, communityKind: communityId !== null ? needed : null,
          city: str(body, 'city', { optional: true, max: 40, label: 'المدينة' }) ?? null,
          startsOn: dbDate(startsOn) ?? null, endsOn: dbDate(endsOn) ?? null,
          maxTeams: int(body, 'maxTeams', { optional: true, min: 2, max: 64, label: 'الحد الأعلى للفرق' }) ?? null,
          entryFeeIqd: fee0,
          // الرسوم تُفعَّل بقرار المدير العام؛ غيره ينشئها معطّلة بانتظار قراره
          feesEnabled: fee0 > 0 && isSuperAdmin(auth),
          feesChangedAt: fee0 > 0 && isSuperAdmin(auth) ? new Date() : null,
          disputeWindowHrs: int(body, 'disputeWindowHrs', { optional: true, min: 1, max: 168, label: 'نافذة الاعتراض' }) ?? 24,
          createdById: auth.userId,
        },
      });
      await this.audit.record({ actorUserId: auth.userId, action: 'tournament.create', entity: 'tournament', entityId: t.id, payload: { nameAr, slug, kind, format }, ip });
      return t;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new AppError(409, 'SLUG_TAKEN', 'الرابط المختصر مستخدم لبطولة أخرى.');
      throw e;
    }
  }

  async update(id: number, body: B, { auth, ip }: Ctx) {
    assertCan(auth, 'tournaments.manage', { tournamentId: id });
    const t = await this.load(id);
    if (t.status === 'finished' || t.status === 'cancelled') throw new AppError(409, 'TOURNAMENT_CLOSED', 'لا يمكن تعديل بطولة منتهية أو ملغاة.');

    const data: Prisma.TournamentUpdateInput = {};
    const nameAr = str(body, 'nameAr', { optional: true, min: 3, max: 80, label: 'اسم البطولة' });
    if (nameAr) data.nameAr = nameAr;
    const city = nullableStr(body, 'city', { max: 40, label: 'المدينة' });
    if (city !== undefined) data.city = city;
    const startsOn = date(body, 'startsOn', { optional: true, label: 'تاريخ البداية' });
    const endsOn = date(body, 'endsOn', { optional: true, label: 'تاريخ النهاية' });
    if (startsOn) data.startsOn = dbDate(startsOn);
    if (endsOn) data.endsOn = dbDate(endsOn);
    const s = startsOn ?? t.startsOn?.toISOString().slice(0, 10);
    const e = endsOn ?? t.endsOn?.toISOString().slice(0, 10);
    if (s && e && e < s) throw new AppError(400, 'INVALID_DATES', 'تاريخ النهاية قبل تاريخ البداية.');
    const maxTeams = int(body, 'maxTeams', { optional: true, min: 2, max: 64, label: 'الحد الأعلى للفرق' });
    if (maxTeams !== undefined) data.maxTeams = maxTeams;
    const fee = int(body, 'entryFeeIqd', { optional: true, min: 0, max: 100_000_000, label: 'رسوم الاشتراك' });
    if (fee !== undefined && fee !== t.entryFeeIqd) {
      if (t.feesEnabled && !isSuperAdmin(auth)) throw new AppError(403, 'FEES_ADMIN_ONLY', 'الرسوم مفعّلة: تغيير مبلغها من المدير العام فقط (قسم «رسوم الاشتراك»).');
      data.entryFeeIqd = fee;
      if (fee === 0 && t.feesEnabled) { data.feesEnabled = false; data.feesChangedAt = new Date(); }
    }
    const win = int(body, 'disputeWindowHrs', { optional: true, min: 1, max: 168, label: 'نافذة الاعتراض' });
    if (win !== undefined) data.disputeWindowHrs = win;

    // النظام والفئة لا يتغيران بعد القرعة
    const structural = ['format', 'ageCategory', 'groupCount', 'qualifiersPerGroup', 'doubleRound'].filter((k) => body?.[k] !== undefined);
    if (structural.length) {
      if (t.drawnAt) throw new AppError(409, 'DRAW_DONE', 'لا يمكن تغيير نظام البطولة أو فئتها بعد القرعة.');
      const format = (oneOf(body, 'format', TOURNAMENT_FORMATS, { optional: true, label: 'نظام البطولة' }) ?? t.format) as TournamentFormat;
      const ageCategory = (oneOf(body, 'ageCategory', AGE_CATEGORIES, { optional: true, label: 'الفئة العمرية' }) ?? t.ageCategory) as AgeCategory;
      const groupCount = body?.groupCount === null ? null : int(body, 'groupCount', { optional: true, min: 1, max: 8, label: 'عدد المجموعات' }) ?? t.groupCount;
      const qualifiersPerGroup = body?.qualifiersPerGroup === null ? null : int(body, 'qualifiersPerGroup', { optional: true, min: 1, max: 2, label: 'المتأهلون' }) ?? t.qualifiersPerGroup;
      const doubleRound = body?.doubleRound === undefined ? t.doubleRound : bool(body, 'doubleRound', 'ذهاب وإياب');
      this.checkFormat(format, groupCount, qualifiersPerGroup, doubleRound);
      Object.assign(data, { format, ageCategory, groupCount, qualifiersPerGroup, doubleRound });
    }
    const updated = await this.prisma.tournament.update({ where: { id }, data });
    await this.audit.record({ actorUserId: auth.userId, action: 'tournament.update', entity: 'tournament', entityId: id, payload: { fields: Object.keys(data) }, ip });
    return updated;
  }

  async setStatus(id: number, body: B, { auth, ip }: Ctx) {
    assertCan(auth, 'tournaments.manage', { tournamentId: id });
    const t = await this.load(id);
    const to = oneOf(body, 'status', ['draft', 'registration', 'running', 'finished', 'cancelled'] as const, { label: 'الحالة' })! as TournamentStatus;
    if (!TRANSITIONS[t.status].includes(to)) {
      throw new AppError(409, 'INVALID_TRANSITION', `لا يمكن نقل البطولة من «${TOURNAMENT_STATUS_LABELS[t.status]}» إلى «${TOURNAMENT_STATUS_LABELS[to]}».`);
    }
    if (to === 'draft' && t.drawnAt) throw new AppError(409, 'DRAW_DONE', 'لا تعود البطولة مسودة بعد القرعة.');
    if (to === 'running') {
      const unscheduled = await this.prisma.match.count({ where: { tournamentId: id, kickoffAt: null } });
      const total = await this.prisma.match.count({ where: { tournamentId: id } });
      if (!t.drawnAt || total === 0) throw new AppError(409, 'DRAW_REQUIRED', 'أجرِ القرعة قبل بدء البطولة.');
      if (unscheduled > 0) throw new AppError(409, 'SCHEDULE_REQUIRED', 'حدد مواعيد كل المباريات قبل بدء البطولة.');
    }
    if (to === 'finished') {
      const open = await this.prisma.match.count({ where: { tournamentId: id, resultStatus: { notIn: ['final'] } } });
      if (open > 0) throw new AppError(409, 'MATCHES_OPEN', `بقيت ${open} مباراة لم تصبح نتيجتها نهائية.`);
    }
    const updated = await this.prisma.tournament.update({ where: { id }, data: { status: to } });
    await this.audit.record({ actorUserId: auth.userId, action: 'tournament.status', entity: 'tournament', entityId: id, payload: { from: t.status, to }, ip });
    return updated;
  }

  /** GET /admin/tournaments — كل البطولات (ومنها المسودات) التي يملك المستخدم إدارتها */
  async adminList(auth: AuthContext) {
    const all = await this.prisma.tournament.findMany({
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true, nameAr: true, slug: true, kind: true, format: true, status: true, ageCategory: true, startsOn: true, maxTeams: true, drawnAt: true,
        city: true, endsOn: true, entryFeeIqd: true, feesEnabled: true, feesChangedAt: true, feesNote: true, disputeWindowHrs: true, groupCount: true, qualifiersPerGroup: true, doubleRound: true,
        community: { select: { id: true, nameAr: true } },
        _count: { select: { registrations: { where: { status: { in: ['pending', 'approved'] } } }, matches: true } },
      },
    });
    const mine = all.filter((t) => hasPermission(auth.grants, 'tournaments.manage', { tournamentId: t.id }, auth.mfa));
    if (!mine.length && !hasPermission(auth.grants, 'tournaments.manage', {}, auth.mfa)) throw new AppError(403, 'FORBIDDEN', 'لا تملك صلاحية لهذا الإجراء.');
    return mine;
  }

  // ───────────── التسجيل ─────────────

  async listRegistrations(id: number, auth: AuthContext) {
    assertCan(auth, 'tournaments.manage', { tournamentId: id });
    await this.load(id);
    return this.prisma.tournamentRegistration.findMany({
      where: { tournamentId: id },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true, status: true, groupLabel: true, feePaidIqd: true, createdAt: true,
        team: { select: { id: true, nameAr: true, city: true, verifiedAt: true, _count: { select: { players: true } } } },
      },
    });
  }

  /** POST /tournaments/:id/registrations {teamId} — مدير الفريق يسجّل فريقه */
  async register(id: number, body: B, { auth, ip }: Ctx) {
    assertActive(auth);
    const teamId = int(body, 'teamId', { min: 1, label: 'الفريق' })!;
    assertCan(auth, 'team.page.edit', { teamId });
    const t = await this.prisma.tournament.findUnique({ where: { id } });
    if (!t || t.status === 'draft') throw NOT_FOUND();
    if (t.status !== 'registration' || t.drawnAt) throw new AppError(409, 'REGISTRATION_CLOSED', 'التسجيل في هذه البطولة مغلق.');
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) throw new AppError(404, 'TEAM_NOT_FOUND', 'الفريق غير موجود.');
    if (t.communityId !== null && team.communityId !== t.communityId) {
      throw new AppError(409, 'TEAM_COMMUNITY_MISMATCH', 'هذه البطولة مخصصة لفرق مجتمعها المضيف فقط.');
    }
    if (t.maxTeams !== null && (await this.prisma.tournamentRegistration.count({ where: { tournamentId: id, status: 'approved' } })) >= t.maxTeams) {
      throw new AppError(409, 'TOURNAMENT_FULL', 'اكتمل عدد الفرق في هذه البطولة.');
    }
    const existing = await this.prisma.tournamentRegistration.findUnique({ where: { tournamentId_teamId: { tournamentId: id, teamId } } });
    if (existing && (existing.status === 'pending' || existing.status === 'approved')) {
      throw new AppError(409, 'ALREADY_REGISTERED', 'الفريق مسجّل في هذه البطولة مسبقاً.');
    }
    const reg = existing
      ? await this.prisma.tournamentRegistration.update({ where: { id: existing.id }, data: { status: 'pending', groupLabel: null } })
      : await this.prisma.tournamentRegistration.create({ data: { tournamentId: id, teamId } });
    await this.audit.record({ actorUserId: auth.userId, action: 'registration.create', entity: 'tournament_registration', entityId: reg.id, payload: { tournamentId: id, teamId }, ip });
    return reg;
  }

  private async loadReg(id: number, regId: number) {
    const reg = await this.prisma.tournamentRegistration.findFirst({ where: { id: regId, tournamentId: id }, include: { tournament: true } });
    if (!reg) throw new AppError(404, 'REGISTRATION_NOT_FOUND', 'طلب التسجيل غير موجود.');
    return reg;
  }

  /** مدير الفريق يسحب طلبه قبل القرعة */
  async withdraw(id: number, regId: number, { auth, ip }: Ctx) {
    const reg = await this.loadReg(id, regId);
    assertCan(auth, 'team.page.edit', { teamId: reg.teamId });
    if (reg.tournament.drawnAt) throw new AppError(409, 'DRAW_DONE', 'لا يمكن الانسحاب بعد القرعة. تواصل مع إدارة البطولة.');
    if (reg.status !== 'pending' && reg.status !== 'approved') throw new AppError(409, 'NOT_ACTIVE', 'الطلب ليس قائماً.');
    await this.prisma.tournamentRegistration.update({ where: { id: regId }, data: { status: 'withdrawn' } });
    await this.audit.record({ actorUserId: auth.userId, action: 'registration.withdraw', entity: 'tournament_registration', entityId: regId, payload: { tournamentId: id, teamId: reg.teamId }, ip });
    return { ok: true };
  }

  /** مدير البطولة يعتمد أو يرفض: الاعتماد يفحص العدد والأعمار وتكرار اللاعبين */
  async decide(id: number, regId: number, body: B, { auth, ip }: Ctx) {
    assertCan(auth, 'tournaments.manage', { tournamentId: id });
    const approve = bool(body, 'approve', 'القرار');
    const reg = await this.loadReg(id, regId);
    if (reg.tournament.drawnAt) throw new AppError(409, 'DRAW_DONE', 'لا يُعدَّل التسجيل بعد القرعة.');
    if (reg.status === 'withdrawn') throw new AppError(409, 'WITHDRAWN', 'سحب الفريق طلبه.');
    if (approve) {
      const t = reg.tournament;
      if (t.maxTeams !== null && reg.status !== 'approved' && (await this.prisma.tournamentRegistration.count({ where: { tournamentId: id, status: 'approved' } })) >= t.maxTeams) {
        throw new AppError(409, 'TOURNAMENT_FULL', 'اكتمل عدد الفرق في هذه البطولة.');
      }
      const problems = await eligibilityProblems(this.prisma, t, reg.teamId);
      if (problems.length) throw new AppError(409, 'TEAM_NOT_ELIGIBLE', problems.join(' '));
    }
    const status = approve ? 'approved' : 'rejected';
    const updated = await this.prisma.tournamentRegistration.update({ where: { id: regId }, data: { status } });
    const note = str(body, 'note', { optional: true, max: 200 }) ?? null;
    await this.audit.record({ actorUserId: auth.userId, action: `registration.${status}`, entity: 'tournament_registration', entityId: regId, payload: { tournamentId: id, teamId: reg.teamId, note }, ip });
    const team = await this.prisma.team.findUnique({ where: { id: reg.teamId }, select: { managerId: true, nameAr: true } });
    if (team) {
      await this.notifications.notify([team.managerId], approve
        ? { titleAr: 'قُبل فريقك في البطولة', bodyAr: `«${team.nameAr}» مسجّل الآن في ${reg.tournament.nameAr}.`, data: { type: 'registration.approved', tournamentId: id, teamId: reg.teamId } }
        : { titleAr: 'لم يُقبل تسجيل فريقك', bodyAr: `${reg.tournament.nameAr}${note ? `: ${note}` : '.'}`, data: { type: 'registration.rejected', tournamentId: id, teamId: reg.teamId } });
    }
    return updated;
  }

  /** تسجيل رسوم الاشتراك يدوياً (لا دفع إلكتروني في المرحلة الأولى) — فقط والرسوم مفعّلة */
  async recordFee(id: number, regId: number, body: B, { auth, ip }: Ctx) {
    if (!hasPermission(auth.grants, 'sponsors.manage', { tournamentId: id }, auth.mfa)) assertCan(auth, 'tournaments.manage', { tournamentId: id });
    const reg = await this.loadReg(id, regId);
    const t = await this.prisma.tournament.findUnique({ where: { id }, select: { feesEnabled: true } });
    if (!t?.feesEnabled) throw new AppError(409, 'FEES_DISABLED', 'رسوم الاشتراك ملغاة لهذه البطولة، فلا تُسجَّل مبالغ.');
    const feePaidIqd = int(body, 'feePaidIqd', { min: 0, max: 100_000_000, label: 'المبلغ المدفوع' })!;
    const updated = await this.prisma.tournamentRegistration.update({ where: { id: regId }, data: { feePaidIqd, feeRecordedBy: auth.userId } });
    await this.audit.record({ actorUserId: auth.userId, action: 'registration.fee', entity: 'tournament_registration', entityId: regId, payload: { tournamentId: id, teamId: reg.teamId, feePaidIqd }, ip });
    return updated;
  }

  // ───────────── رسوم الاشتراك (قرار المدير العام) ─────────────

  /** GET /admin/fees — كل البطولات برسومها وحالتها والمحصَّل منها */
  async feesOverview(auth: AuthContext) {
    assertActive(auth);
    const list = await this.prisma.tournament.findMany({
      where: { status: { not: 'cancelled' } },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true, nameAr: true, slug: true, kind: true, status: true, city: true, entryFeeIqd: true, feesEnabled: true, feesChangedAt: true, feesNote: true,
        registrations: { where: { status: { in: ['pending', 'approved'] } }, select: { status: true, feePaidIqd: true } },
      },
    });
    const mine = list.filter((t) => hasPermission(auth.grants, 'tournaments.manage', { tournamentId: t.id }, auth.mfa));
    if (!mine.length && !hasPermission(auth.grants, 'tournaments.manage', {}, auth.mfa)) throw new AppError(403, 'FORBIDDEN', 'لا تملك صلاحية لهذا الإجراء.');
    return {
      canDecide: isSuperAdmin(auth),
      tournaments: mine.map(({ registrations, ...t }) => {
        const approved = registrations.filter((r) => r.status === 'approved');
        const paid = approved.filter((r) => (r.feePaidIqd ?? 0) >= t.entryFeeIqd && t.entryFeeIqd > 0).length;
        return {
          ...t,
          teams: approved.length, pending: registrations.length - approved.length, paid,
          collectedIqd: approved.reduce((n, r) => n + (r.feePaidIqd ?? 0), 0),
          expectedIqd: t.feesEnabled ? approved.length * t.entryFeeIqd : 0,
        };
      }),
    };
  }

  /** POST /tournaments/:id/fees {enabled, entryFeeIqd?, note?} — تفعيل الرسوم أو إلغاؤها (المدير العام بدخول TOTP فقط) */
  async setFees(id: number, body: B, { auth, ip }: Ctx) {
    assertActive(auth);
    if (!isSuperAdmin(auth)) throw new AppError(403, 'FEES_ADMIN_ONLY', 'تفعيل الرسوم وإلغاؤها للمدير العام فقط (بدخول البريد ورمز التحقق).');
    const t = await this.load(id);
    const enabled = bool(body, 'enabled', 'الحالة');
    const fee = int(body, 'entryFeeIqd', { optional: true, min: 0, max: 100_000_000, label: 'رسوم الاشتراك' }) ?? t.entryFeeIqd;
    const note = nullableStr(body, 'note', { max: 300, label: 'السبب' }) ?? null;
    if (enabled && fee <= 0) throw new AppError(400, 'FEE_REQUIRED', 'اكتب مبلغ الرسوم (أكبر من صفر) قبل تفعيلها.');
    if (t.status === 'finished' || t.status === 'cancelled') throw new AppError(409, 'TOURNAMENT_CLOSED', 'البطولة منتهية أو ملغاة.');
    if (enabled === t.feesEnabled && fee === t.entryFeeIqd && note === t.feesNote) return { id, feesEnabled: t.feesEnabled, entryFeeIqd: t.entryFeeIqd, feesNote: t.feesNote };

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.tournament.update({
        where: { id }, data: { feesEnabled: enabled, entryFeeIqd: fee, feesNote: note, feesChangedAt: new Date() },
        select: { id: true, feesEnabled: true, entryFeeIqd: true, feesNote: true, feesChangedAt: true },
      });
      await this.audit.record({
        actorUserId: auth.userId, action: enabled ? 'tournament.fees_enable' : 'tournament.fees_disable', entity: 'tournament', entityId: id,
        payload: { from: { enabled: t.feesEnabled, fee: t.entryFeeIqd }, to: { enabled, fee }, note }, ip,
      }, tx);
      return u;
    });

    // إبلاغ مديري الفرق المسجّلة إن تغيّرت الحالة
    if (enabled !== t.feesEnabled) {
      const regs = await this.prisma.tournamentRegistration.findMany({
        where: { tournamentId: id, status: { in: ['pending', 'approved'] } }, select: { team: { select: { managerId: true } } },
      });
      const managers = [...new Set(regs.map((r) => r.team.managerId))];
      if (managers.length) {
        await this.notifications.notify(managers, enabled
          ? { titleAr: 'فُعّلت رسوم الاشتراك', bodyAr: `${t.nameAr}: الرسوم ${fee.toLocaleString('en-US')} دينار.${note ? ` ${note}` : ''}`, data: { type: 'tournament.fees', tournamentId: id } }
          : { titleAr: 'أُلغيت رسوم الاشتراك', bodyAr: `${t.nameAr}: الاشتراك مجاني الآن.${note ? ` ${note}` : ''}`, data: { type: 'tournament.fees', tournamentId: id } });
      }
    }
    return updated;
  }

  // ───────────── القرعة ─────────────

  /**
   * POST /tournaments/:id/draw — القرعة وتوليد المباريات (بلا مواعيد).
   * البذرة تولَّد في الخادم وتُحفظ؛ تعاد القرعة فقط إن لم تُسجَّل أي نتيجة.
   */
  async draw(id: number, { auth, ip }: Ctx) {
    assertCan(auth, 'tournaments.manage', { tournamentId: id });
    const t = await this.load(id);
    if (t.status !== 'registration') throw new AppError(409, 'DRAW_STATUS', 'القرعة تُجرى والبطولة في مرحلة التسجيل.');
    if (await this.prisma.match.count({ where: { tournamentId: id, resultStatus: { not: 'scheduled' } } })) {
      throw new AppError(409, 'DRAW_LOCKED', 'سُجّلت نتائج في هذه البطولة؛ لا يمكن إعادة القرعة.');
    }
    const regs = await this.prisma.tournamentRegistration.findMany({ where: { tournamentId: id, status: 'approved' }, select: { teamId: true }, orderBy: { teamId: 'asc' } });
    const teamIds = regs.map((r) => r.teamId);
    const n = teamIds.length;
    if (n < 2) throw new AppError(409, 'NOT_ENOUGH_TEAMS', 'تحتاج القرعة فريقين معتمدين على الأقل.');
    if (t.format === 'knockout' && !isPowerOfTwo(n)) {
      throw new AppError(409, 'KNOCKOUT_SIZE', `خروج المغلوب يحتاج 2 أو 4 أو 8 أو 16 أو 32 فريقاً معتمداً (المعتمد الآن ${n}).`);
    }
    if (t.format === 'groups_knockout' && n < t.groupCount! * (t.qualifiersPerGroup! + 1)) {
      throw new AppError(409, 'NOT_ENOUGH_TEAMS', `تحتاج ${t.groupCount! * (t.qualifiersPerGroup! + 1)} فرق معتمدة على الأقل لهذا التقسيم.`);
    }

    const seed = newSeed();
    type NewMatch = { stage: string; round: number; home: number; away: number };
    const matches: NewMatch[] = [];
    let groups: { label: string; teamIds: number[] }[] = [];
    if (t.format === 'league') {
      roundRobin(shuffle(teamIds, seed), t.doubleRound).forEach((round, r) =>
        round.forEach((p) => matches.push({ stage: 'league', round: r + 1, ...p })));
    } else if (t.format === 'knockout') {
      pairUp(shuffle(teamIds, seed)).forEach((p) => matches.push({ stage: knockoutStage(n), round: 1, ...p }));
    } else {
      groups = drawGroups(teamIds, t.groupCount!, seed);
      for (const g of groups) {
        roundRobin(g.teamIds, t.doubleRound).forEach((round, r) =>
          round.forEach((p) => matches.push({ stage: 'group', round: r + 1, ...p })));
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.match.deleteMany({ where: { tournamentId: id } });
      await tx.tournamentRegistration.updateMany({ where: { tournamentId: id }, data: { groupLabel: null } });
      for (const g of groups) {
        await tx.tournamentRegistration.updateMany({ where: { tournamentId: id, teamId: { in: g.teamIds } }, data: { groupLabel: g.label } });
      }
      // الترتيب: الجولة ثم ترتيب التوليد، فتبقى أرقام المباريات بترتيب الشجرة
      matches.sort((a, b) => a.round - b.round);
      await tx.match.createMany({ data: matches.map((m) => ({ tournamentId: id, stage: m.stage, round: m.round, homeTeamId: m.home, awayTeamId: m.away })) });
      await tx.tournament.update({ where: { id }, data: { drawSeed: seed, drawnAt: new Date() } });
      await this.audit.record({
        actorUserId: auth.userId, action: t.drawnAt ? 'tournament.redraw' : 'tournament.draw', entity: 'tournament', entityId: id,
        payload: { seed, teamIds, groups, matches: matches.length }, ip,
      }, tx);
    });
    return this.fixtures(id);
  }

  /** المباريات مجمّعة بالجولة (للوحة بعد القرعة والجدولة) */
  async fixtures(id: number) {
    const t = await this.load(id);
    const matches = await this.prisma.match.findMany({
      where: { tournamentId: id }, orderBy: [{ round: 'asc' }, { id: 'asc' }],
      select: { id: true, stage: true, round: true, kickoffAt: true, venue: true, resultStatus: true, homeScore: true, awayScore: true, referee: { select: { id: true, fullName: true } }, homeTeam: { select: { id: true, nameAr: true } }, awayTeam: { select: { id: true, nameAr: true } } },
    });
    const groups = await this.prisma.tournamentRegistration.findMany({
      where: { tournamentId: id, status: 'approved', groupLabel: { not: null } }, select: { groupLabel: true, team: { select: { id: true, nameAr: true } } },
    });
    return {
      tournament: { id: t.id, nameAr: t.nameAr, format: t.format, drawnAt: t.drawnAt, drawSeed: t.drawSeed },
      groups: GROUP_LABELS.map((label) => ({ label, teams: groups.filter((g) => g.groupLabel === label).map((g) => g.team) })).filter((g) => g.teams.length),
      matches,
    };
  }

  // ───────────── الجدولة ─────────────

  /**
   * POST /tournaments/:id/schedule {startDate, weekdays, times, venues, restDays?, fromRound?}
   * يوزع المباريات التي لم تُلعب (scheduled) جولةً جولة على أيام اللعب، بتوقيت بغداد.
   */
  async schedule(id: number, body: B, { auth, ip }: Ctx) {
    assertCan(auth, 'tournaments.manage', { tournamentId: id });
    const t = await this.load(id);
    if (t.status === 'finished' || t.status === 'cancelled') throw new AppError(409, 'TOURNAMENT_CLOSED', 'البطولة منتهية أو ملغاة.');
    const opts = {
      startDate: date(body, 'startDate', { label: 'تاريخ أول مباراة' })!,
      weekdays: list(body, 'weekdays', 'int', { min: 1, max: 7, label: 'أيام اللعب', each: (d: number) => d >= 0 && d <= 6 }),
      times: list(body, 'times', 'string', { min: 1, max: 8, label: 'أوقات الانطلاق', each: (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s) }),
      venues: list(body, 'venues', 'string', { min: 1, max: 10, label: 'الملاعب' }),
      restDays: int(body, 'restDays', { optional: true, min: 0, max: 30, label: 'أيام الراحة' }) ?? 0,
    };
    const fromRound = int(body, 'fromRound', { optional: true, min: 1, label: 'من الجولة' }) ?? 1;
    const matches = await this.prisma.match.findMany({
      where: { tournamentId: id, resultStatus: 'scheduled', round: { gte: fromRound } },
      orderBy: [{ round: 'asc' }, { id: 'asc' }],
      select: { id: true, round: true, homeTeamId: true, awayTeamId: true },
    });
    if (!matches.length) throw new AppError(409, 'NOTHING_TO_SCHEDULE', 'لا توجد مباريات بانتظار الجدولة. أجرِ القرعة أولاً.');

    const roundNos = [...new Set(matches.map((m) => m.round ?? 1))];
    const rounds = roundNos.map((r) => matches.filter((m) => (m.round ?? 1) === r));
    const pairs: Pair[][] = rounds.map((rm) => rm.map((m) => ({ home: m.homeTeamId, away: m.awayTeamId })));
    const slots = schedule(pairs, opts);

    await this.prisma.$transaction(async (tx) => {
      for (let r = 0; r < rounds.length; r++) {
        for (let i = 0; i < rounds[r].length; i++) {
          await tx.match.update({ where: { id: rounds[r][i].id }, data: { kickoffAt: slots[r][i].kickoffAt, venue: slots[r][i].venue } });
        }
      }
      await this.audit.record({ actorUserId: auth.userId, action: 'tournament.schedule', entity: 'tournament', entityId: id, payload: { ...opts, fromRound, matches: matches.length }, ip }, tx);
    });
    const first = slots[0][0].day;
    const last = slots[slots.length - 1].at(-1)!.day;
    return { scheduled: matches.length, firstDay: first, lastDay: last, ...(await this.fixtures(id)) };
  }

  // ───────────── الدور التالي (خروج المغلوب) ─────────────

  /** POST /tournaments/:id/next-round — يولّد الدور الإقصائي التالي من نتائج الدور الحالي المعتمدة */
  async nextRound(id: number, { auth, ip }: Ctx) {
    assertCan(auth, 'tournaments.manage', { tournamentId: id });
    const t = await this.load(id);
    if (t.format === 'league') throw new AppError(400, 'NOT_KNOCKOUT', 'نظام الدوري لا أدوار إقصائية فيه.');
    if (t.status !== 'running') throw new AppError(409, 'NOT_RUNNING', 'البطولة ليست جارية.');
    const all = await this.prisma.match.findMany({ where: { tournamentId: id }, orderBy: [{ round: 'asc' }, { id: 'asc' }] });
    const ko = all.filter((m) => m.stage && KO_STAGES.includes(m.stage));
    let pairs: Pair[];
    let round: number;

    if (t.format === 'groups_knockout' && ko.length === 0) {
      const groupMatches = all.filter((m) => m.stage === 'group');
      const open = groupMatches.filter((m) => m.resultStatus !== 'confirmed' && m.resultStatus !== 'final');
      if (open.length) throw new AppError(409, 'ROUND_NOT_FINISHED', `بقيت ${open.length} مباراة في دور المجموعات بلا نتيجة معتمدة.`);
      const regs = await this.prisma.tournamentRegistration.findMany({
        where: { tournamentId: id, status: 'approved' }, select: { groupLabel: true, team: { select: { id: true, nameAr: true } } },
      });
      const tables = GROUP_LABELS.map((label) => regs.filter((r) => r.groupLabel === label).map((r) => r.team))
        .filter((g) => g.length)
        .map((teams) => computeStandings(teams, groupMatches.filter((m) => teams.some((x) => x.id === m.homeTeamId))).map((r) => r.team.id));
      pairs = crossQualifiers(tables, t.qualifiersPerGroup as 1 | 2);
      round = Math.max(...groupMatches.map((m) => m.round ?? 1)) + 1;
    } else {
      if (!ko.length) throw new AppError(409, 'DRAW_REQUIRED', 'أجرِ القرعة أولاً.');
      const last = Math.max(...ko.map((m) => m.round ?? 1));
      const current = ko.filter((m) => (m.round ?? 1) === last);
      const winners = current.map(knockoutWinner);
      if (winners.some((w) => w === null)) {
        throw new AppError(409, 'ROUND_NOT_FINISHED', 'لم تُحسم كل مباريات الدور الحالي (نتيجة معتمدة، وركلات ترجيح عند التعادل).');
      }
      if (current.length === 1) throw new AppError(409, 'TOURNAMENT_COMPLETE', 'انتهى النهائي؛ لا يوجد دور تالٍ.');
      pairs = pairUp(winners as number[]);
      round = last + 1;
    }

    const stage = knockoutStage(pairs.length * 2);
    await this.prisma.$transaction(async (tx) => {
      await tx.match.createMany({ data: pairs.map((p) => ({ tournamentId: id, stage, round, homeTeamId: p.home, awayTeamId: p.away })) });
      await this.audit.record({ actorUserId: auth.userId, action: 'tournament.next_round', entity: 'tournament', entityId: id, payload: { stage, round, pairs }, ip }, tx);
    });
    return this.fixtures(id);
  }
}

