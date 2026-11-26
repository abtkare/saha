import { Body, Controller, Delete, Get, Header, HttpCode, Injectable, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Prisma, type PrizeCategory } from '@prisma/client';
import { PRIZE_CATEGORIES, formatIqd, hasPermission, prizeLabel } from '@saha/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/arabic-error.filter';
import { bool, idParam, int, nullableStr, oneOf, str } from '../common/validate';
import { AuthGuard, assertActive, assertCan } from '../auth/auth.guard';
import { clientIp, type AuthContext, type AuthedRequest } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications';
import { TEAM_CARD_SELECT, TournamentsService } from '../tournaments/tournaments.service';
import { PUBLIC_PLAYER_SELECT, publicPlayerName } from '../teams/players';

/**
 * الجوائز (الجلسة 16): لكل بطولة جوائز المراكز الثلاثة الأولى وأفضل ثلاثة لاعبين.
 * الإدارة (مدير البطولة بنطاقها أو المدير العام) تحدد القيم وتعدّلها وتختار الفائزين وتعلنها للجمهور،
 * ثم تسجّل «سُلّمت»، ثم يؤكد المستفيد الاستلام من حسابه. الجائزة المؤكَّدة مجمّدة وتبقى في الأرشيف.
 *
 * المستفيد: جائزة المركز ← مدير الفريق. جائزة اللاعب ← حساب اللاعب، وإن لم يكن له حساب فولي أمره،
 * وإلا مدير فريقه.
 */
type B = Record<string, unknown>;
type Ctx = { auth: AuthContext; ip: string };

const NOT_FOUND = () => new AppError(404, 'PRIZE_NOT_FOUND', 'الجائزة غير موجودة.');
const T_NOT_FOUND = () => new AppError(404, 'TOURNAMENT_NOT_FOUND', 'البطولة غير موجودة.');

const PLAYER_SELECT = { ...PUBLIC_PLAYER_SELECT, userId: true, guardianId: true } as const;

const SELECT = {
  id: true, tournamentId: true, category: true, rank: true, titleAr: true, amountIqd: true, extraAr: true, status: true,
  awardedAt: true, deliveredAt: true, deliveryNote: true, confirmedAt: true, updatedAt: true,
  team: { select: { ...TEAM_CARD_SELECT, managerId: true } },
  player: { select: PLAYER_SELECT },
  tournament: { select: { id: true, nameAr: true, slug: true, status: true, endsOn: true, prizesAnnouncedAt: true } },
} satisfies Prisma.PrizeSelect;

type Row = Prisma.PrizeGetPayload<{ select: typeof SELECT }>;

/** صاحب تأكيد الاستلام */
export function beneficiaryId(p: Pick<Row, 'category' | 'team' | 'player'>): number | null {
  if (p.category === 'team_place') return p.team?.managerId ?? null;
  return p.player?.userId ?? p.player?.guardianId ?? p.team?.managerId ?? null;
}

/** الشكل العام (بلا أرقام مستخدمين) */
function view(p: Row) {
  return {
    id: p.id, category: p.category, rank: p.rank, label: prizeLabel(p.category, p.rank, p.titleAr), titleAr: p.titleAr,
    amountIqd: p.amountIqd, extraAr: p.extraAr, status: p.status,
    team: p.team ? { id: p.team.id, nameAr: p.team.nameAr, logoUrl: p.team.logoUrl, ownerName: p.team.ownerName, ownerPhotoUrl: p.team.ownerPhotoUrl } : null,
    player: p.player ? { id: p.player.id, name: publicPlayerName(p.player) } : null,
    awardedAt: p.awardedAt, deliveredAt: p.deliveredAt, confirmedAt: p.confirmedAt,
  };
}

const sortRows = (rows: Row[]) => rows.sort((a, b) => (a.category === b.category ? a.rank - b.rank : a.category === 'team_place' ? -1 : 1));
const total = (rows: { amountIqd: number }[]) => rows.reduce((s, p) => s + p.amountIqd, 0);

@Injectable()
export class PrizesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly tournaments: TournamentsService,
  ) {}

  private async tournament(idOrSlug: string) {
    const where = /^\d+$/.test(idOrSlug) ? { id: Number(idOrSlug) } : { slug: idOrSlug };
    const t = await this.prisma.tournament.findFirst({ where: { ...where, status: { not: 'draft' } }, select: { id: true, nameAr: true, slug: true, status: true, prizesAnnouncedAt: true } });
    if (!t) throw T_NOT_FOUND();
    return t;
  }

  // ───────────── العامة ─────────────

  /** GET /tournaments/:id/prizes — الجوائز المعلنة فقط (قبل الإعلان: قائمة فارغة) */
  async forTournament(idOrSlug: string) {
    const t = await this.tournament(idOrSlug);
    if (!t.prizesAnnouncedAt) return { announcedAt: null, totalIqd: 0, prizes: [] };
    const rows = sortRows(await this.prisma.prize.findMany({ where: { tournamentId: t.id }, select: SELECT }));
    return { announcedAt: t.prizesAnnouncedAt, totalIqd: total(rows), prizes: rows.map(view) };
  }

  /**
   * GET /prizes/archive — الأرشيف التاريخي: جوائز البطولات المعلنة التي انتهت أو سُلّمت كل جوائزها،
   * مجمّعة بالبطولة، الأحدث أولاً. before = رقم بطولة للصفحة التالية.
   */
  async archive(limitRaw?: string, beforeRaw?: string) {
    const limit = Math.min(Math.max(Number(limitRaw) || 20, 1), 50);
    const before = /^\d+$/.test(beforeRaw ?? '') ? Number(beforeRaw) : undefined;
    const archived: Prisma.TournamentWhereInput = {
      prizesAnnouncedAt: { not: null }, status: { not: 'draft' },
      OR: [{ status: 'finished' }, { prizes: { some: {}, every: { status: { in: ['delivered', 'confirmed'] } } } }],
    };
    const ts = await this.prisma.tournament.findMany({
      where: { ...archived, ...(before ? { id: { lt: before } } : {}) },
      orderBy: { id: 'desc' }, take: limit + 1,
      select: { id: true, nameAr: true, slug: true, kind: true, status: true, startsOn: true, endsOn: true, prizesAnnouncedAt: true },
    });
    const page = ts.slice(0, limit);
    const rows = await this.prisma.prize.findMany({ where: { tournamentId: { in: page.map((t) => t.id) } }, select: SELECT });
    const tournaments = page.map((t) => {
      const mine = sortRows(rows.filter((p) => p.tournamentId === t.id));
      return {
        tournament: t, totalIqd: total(mine),
        delivered: mine.filter((p) => p.status === 'delivered' || p.status === 'confirmed').length,
        confirmed: mine.filter((p) => p.status === 'confirmed').length,
        prizes: mine.map(view),
      };
    }).filter((x) => x.prizes.length);
    const [sum, confirmed] = await Promise.all([
      this.prisma.prize.aggregate({ where: { tournament: archived }, _count: { _all: true }, _sum: { amountIqd: true } }),
      this.prisma.prize.count({ where: { tournament: archived, status: 'confirmed' } }),
    ]);
    return {
      totals: { tournaments: await this.prisma.tournament.count({ where: archived }), prizes: sum._count._all, amountIqd: sum._sum.amountIqd ?? 0, confirmed },
      tournaments,
      next: ts.length > limit ? String(page[page.length - 1].id) : null,
    };
  }

  // ───────────── الإدارة ─────────────

  private can(auth: AuthContext, tournamentId: number) {
    assertCan(auth, 'tournaments.manage', { tournamentId });
  }

  private async load(id: number) {
    const p = await this.prisma.prize.findUnique({ where: { id }, select: SELECT });
    if (!p) throw NOT_FOUND();
    return p;
  }

  /** GET /admin/prizes?status=&tournamentId= — كل جوائز البطولات التي أديرها (أرشيف اللوحة) */
  async adminList(auth: AuthContext, status?: string, tournamentId?: string) {
    const where: Prisma.PrizeWhereInput = {};
    if (status && ['pending', 'awarded', 'delivered', 'confirmed'].includes(status)) where.status = status as never;
    if (tournamentId && /^\d+$/.test(tournamentId)) where.tournamentId = Number(tournamentId);
    const any = auth.grants.some((g) => hasPermission([g], 'tournaments.manage', { tournamentId: g.tournamentId ?? undefined }, auth.mfa));
    if (!any) throw new AppError(403, 'FORBIDDEN', 'لا تملك صلاحية لهذا الإجراء.');
    // enum prize_category مرتّب: team_place ثم best_player
    const rows = await this.prisma.prize.findMany({ where, select: SELECT, orderBy: [{ tournamentId: 'desc' }, { category: 'asc' }, { rank: 'asc' }] });
    const mine = rows.filter((p) => hasPermission(auth.grants, 'tournaments.manage', { tournamentId: p.tournamentId }, auth.mfa));
    return mine.map((p) => ({ ...view(p), tournament: p.tournament, deliveryNote: p.deliveryNote, hasBeneficiary: beneficiaryId(p) !== null }));
  }

  /**
   * GET /admin/tournaments/:id/prizes — جوائز البطولة للإدارة + المرشحون (الفرق المعتمدة ولاعبوها)
   * + اقتراحات من النتائج (البطل والوصيف أو صدارة الدوري، وأفضل اللاعبين).
   */
  async adminTournament(id: number, auth: AuthContext) {
    this.can(auth, id);
    const t = await this.prisma.tournament.findUnique({ where: { id }, select: { id: true, nameAr: true, slug: true, status: true, format: true, prizesAnnouncedAt: true } });
    if (!t) throw T_NOT_FOUND();
    const [rows, regs] = await Promise.all([
      this.prisma.prize.findMany({ where: { tournamentId: id }, select: SELECT }),
      this.prisma.tournamentRegistration.findMany({
        where: { tournamentId: id, status: 'approved' }, orderBy: { teamId: 'asc' },
        select: { team: { select: { ...TEAM_CARD_SELECT, players: { select: { player: { select: PUBLIC_PLAYER_SELECT } } } } } },
      }),
    ]);
    const teams = regs.map((r) => ({ id: r.team.id, nameAr: r.team.nameAr }));
    const players = regs.flatMap((r) => r.team.players.map((tp) => ({ id: tp.player.id, name: publicPlayerName(tp.player), team: { id: r.team.id, nameAr: r.team.nameAr } })))
      .sort((a, b) => a.team.nameAr.localeCompare(b.team.nameAr, 'ar') || a.name.localeCompare(b.name, 'ar'));
    return {
      tournament: t,
      totalIqd: total(rows),
      prizes: sortRows(rows).map((p) => ({ ...view(p), deliveryNote: p.deliveryNote, hasBeneficiary: beneficiaryId(p) !== null })),
      candidates: { teams, players },
      suggestions: t.status === 'draft' ? { places: [], players: [] } : await this.suggestions(id),
    };
  }

  /** اقتراح الفائزين من النتائج — يُعرض في اللوحة فقط، ولا يُحفظ إلا بضغطة من الإدارة */
  private async suggestions(id: number) {
    const places: { rank: number; teamId: number }[] = [];
    const players: { rank: number; playerId: number; teamId: number | null }[] = [];
    try {
      const road = await this.tournaments.road(String(id));
      if (road.league.length) {
        if (road.league.some((r) => r.played > 0)) road.league.slice(0, 3).forEach((r, i) => places.push({ rank: i + 1, teamId: r.team.id }));
      } else if (road.champion) {
        places.push({ rank: 1, teamId: road.champion.id });
        const final = road.bracket[road.bracket.length - 1]?.matches[0];
        const other = final && [final.home.team, final.away.team].find((x) => x && x.id !== road.champion!.id);
        if (other) places.push({ rank: 2, teamId: other.id });
      }
      const stars = await this.tournaments.stars(String(id));
      stars.bestPlayers.slice(0, 3).forEach((b, i) => players.push({ rank: i + 1, playerId: b.player.id, teamId: b.team?.id ?? null }));
    } catch { /* بطولة بلا مباريات بعد */ }
    return { places, players };
  }

  private async value(body: B, creating: boolean) {
    const data: Prisma.PrizeUncheckedUpdateInput = {};
    const amount = int(body, 'amountIqd', { optional: !creating, min: 0, max: 2_000_000_000, label: 'قيمة الجائزة' });
    if (amount !== undefined) data.amountIqd = amount;
    const extra = nullableStr(body, 'extraAr', { max: 120, label: 'الجائزة العينية' });
    if (extra !== undefined) {
      if (extra !== null && extra.length < 2) throw new AppError(400, 'VALIDATION_ERROR', 'الجائزة العينية قصيرة جداً.');
      data.extraAr = extra;
    }
    const title = nullableStr(body, 'titleAr', { max: 40, label: 'اسم الجائزة' });
    if (title !== undefined) {
      if (title !== null && title.length < 2) throw new AppError(400, 'VALIDATION_ERROR', 'اسم الجائزة قصير جداً.');
      data.titleAr = title;
    }
    return data;
  }

  private checkValue(amountIqd: number, extraAr: string | null | undefined) {
    if (!(amountIqd > 0) && !extraAr) throw new AppError(400, 'PRIZE_VALUE_REQUIRED', 'حدّد مبلغ الجائزة أو جائزة عينية.');
  }

  /** POST /admin/prizes {tournamentId, category, rank, amountIqd, extraAr?, titleAr?} */
  async create(body: B, { auth, ip }: Ctx) {
    assertActive(auth);
    const tournamentId = int(body, 'tournamentId', { min: 1, label: 'البطولة' })!;
    this.can(auth, tournamentId);
    if (!(await this.prisma.tournament.findUnique({ where: { id: tournamentId }, select: { id: true } }))) throw T_NOT_FOUND();
    const category = oneOf(body, 'category', PRIZE_CATEGORIES, { label: 'نوع الجائزة' })! as PrizeCategory;
    const rank = int(body, 'rank', { min: 1, max: 3, label: 'المركز' })!;
    const data = await this.value(body, true);
    this.checkValue(data.amountIqd as number, data.extraAr as string | null | undefined);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const p = await tx.prize.create({
          data: { ...(data as Prisma.PrizeUncheckedCreateInput), tournamentId, category, rank, updatedById: auth.userId },
          select: SELECT,
        });
        await this.audit.record({ actorUserId: auth.userId, action: 'prize.create', entity: 'prize', entityId: p.id, payload: { tournamentId, category, rank, amountIqd: p.amountIqd, extraAr: p.extraAr }, ip }, tx);
        return view(p);
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new AppError(409, 'PRIZE_EXISTS', 'هذه الجائزة موجودة لهذه البطولة. عدّلها بدل إضافتها مرة أخرى.');
      throw e;
    }
  }

  /** الفائز: teamId لجائزة المركز، playerId (و teamId اختياري) لجائزة اللاعب؛ null يلغي الاختيار */
  private async winner(p: Row, body: B): Promise<Prisma.PrizeUncheckedUpdateInput | null> {
    const key = p.category === 'team_place' ? 'teamId' : 'playerId';
    if (!(key in body)) return null;
    if (body[key] === null) return { teamId: null, playerId: null, status: 'pending', awardedAt: null };
    const approved = (teamId: number) => this.prisma.tournamentRegistration.findFirst({ where: { tournamentId: p.tournamentId, teamId, status: 'approved' }, select: { id: true } });
    if (p.category === 'team_place') {
      const teamId = int(body, 'teamId', { min: 1, label: 'الفريق' })!;
      if (!(await approved(teamId))) throw new AppError(400, 'WINNER_NOT_IN_TOURNAMENT', 'الفريق ليس من فرق هذه البطولة المعتمدة.');
      const dup = await this.prisma.prize.findFirst({ where: { tournamentId: p.tournamentId, category: 'team_place', teamId, id: { not: p.id } }, select: { rank: true } });
      if (dup) throw new AppError(409, 'WINNER_DUPLICATE', `هذا الفريق فاز بالفعل بـ ${prizeLabel('team_place', dup.rank)}.`);
      return { teamId, playerId: null, status: 'awarded', awardedAt: new Date() };
    }
    const playerId = int(body, 'playerId', { min: 1, label: 'اللاعب' })!;
    const wanted = int(body, 'teamId', { optional: true, min: 1, label: 'الفريق' });
    const links = await this.prisma.teamPlayer.findMany({
      where: { playerId, ...(wanted ? { teamId: wanted } : {}), team: { registrations: { some: { tournamentId: p.tournamentId, status: 'approved' } } } },
      select: { teamId: true },
    });
    if (!links.length) throw new AppError(400, 'WINNER_NOT_IN_TOURNAMENT', 'اللاعب ليس في فريق معتمد بهذه البطولة.');
    const dup = await this.prisma.prize.findFirst({ where: { tournamentId: p.tournamentId, category: 'best_player', playerId, id: { not: p.id } }, select: { rank: true } });
    if (dup) throw new AppError(409, 'WINNER_DUPLICATE', `هذا اللاعب فاز بالفعل بـ ${prizeLabel('best_player', dup.rank)}.`);
    return { playerId, teamId: links[0].teamId, status: 'awarded', awardedAt: new Date() };
  }

  /** PATCH /admin/prizes/:id {amountIqd?, extraAr?, titleAr?, teamId?, playerId?} */
  async update(id: number, body: B, { auth, ip }: Ctx) {
    assertActive(auth);
    const p = await this.load(id);
    this.can(auth, p.tournamentId);
    if (p.status === 'confirmed') throw new AppError(409, 'PRIZE_CONFIRMED', 'أكّد المستفيد استلام هذه الجائزة، فلا تُعدَّل. تبقى في الأرشيف كما هي.');
    const data = await this.value(body, false);
    const win = await this.winner(p, body);
    if (p.status === 'delivered') {
      const locked = ['amountIqd', 'extraAr'].some((k) => k in data) || win;
      if (locked) throw new AppError(409, 'PRIZE_DELIVERED', 'الجائزة مسلّمة: لا تتغير قيمتها ولا فائزها. ألغِ «سُلّمت» أولاً إن كان التسليم خطأً.');
    }
    if (win) Object.assign(data, win);
    if (!Object.keys(data).length) throw new AppError(400, 'NOTHING_TO_UPDATE', 'لم ترسل أي تعديل.');
    this.checkValue((data.amountIqd as number | undefined) ?? p.amountIqd, data.extraAr === undefined ? p.extraAr : (data.extraAr as string | null));
    return this.prisma.$transaction(async (tx) => {
      const n = await tx.prize.update({ where: { id }, data: { ...data, updatedById: auth.userId }, select: SELECT });
      await this.audit.record({
        actorUserId: auth.userId, action: 'prize.update', entity: 'prize', entityId: id,
        payload: { fields: Object.keys(data), from: { amountIqd: p.amountIqd, teamId: p.team?.id ?? null, playerId: p.player?.id ?? null }, to: { amountIqd: n.amountIqd, teamId: n.team?.id ?? null, playerId: n.player?.id ?? null } }, ip,
      }, tx);
      return { ...view(n), deliveryNote: n.deliveryNote, hasBeneficiary: beneficiaryId(n) !== null };
    });
  }

  /** DELETE /admin/prizes/:id — قبل التسليم فقط */
  async remove(id: number, { auth, ip }: Ctx) {
    assertActive(auth);
    const p = await this.load(id);
    this.can(auth, p.tournamentId);
    if (p.status === 'delivered' || p.status === 'confirmed') throw new AppError(409, 'PRIZE_DELIVERED', 'لا تُحذف جائزة مسلّمة؛ تبقى في الأرشيف.');
    await this.prisma.$transaction(async (tx) => {
      await tx.prize.delete({ where: { id } });
      await this.audit.record({ actorUserId: auth.userId, action: 'prize.delete', entity: 'prize', entityId: id, payload: { tournamentId: p.tournamentId, category: p.category, rank: p.rank, amountIqd: p.amountIqd }, ip }, tx);
    });
    return { id, deleted: true };
  }

  /** POST /admin/prizes/:id/deliver {note?} — سُلّمت، ويصل للمستفيد إشعار ليؤكد الاستلام */
  async deliver(id: number, body: B, { auth, ip }: Ctx) {
    assertActive(auth);
    const p = await this.load(id);
    this.can(auth, p.tournamentId);
    if (p.status === 'pending') throw new AppError(409, 'PRIZE_NO_WINNER', 'اختر الفائز أولاً.');
    if (p.status !== 'awarded') throw new AppError(409, 'PRIZE_ALREADY_DELIVERED', 'الجائزة مسجّلة كمسلّمة بالفعل.');
    const note = str(body, 'note', { optional: true, max: 200, label: 'ملاحظة التسليم' }) ?? null;
    return this.prisma.$transaction(async (tx) => {
      const n = await tx.prize.update({ where: { id }, data: { status: 'delivered', deliveredAt: new Date(), deliveredById: auth.userId, deliveryNote: note, updatedById: auth.userId }, select: SELECT });
      await this.audit.record({ actorUserId: auth.userId, action: 'prize.deliver', entity: 'prize', entityId: id, payload: { amountIqd: n.amountIqd, teamId: n.team?.id ?? null, playerId: n.player?.id ?? null, note }, ip }, tx);
      const label = prizeLabel(n.category, n.rank, n.titleAr);
      await this.notifications.notify([beneficiaryId(n)], {
        titleAr: 'سُلّمت جائزتك 🏆',
        bodyAr: `${label} في ${n.tournament.nameAr}${n.amountIqd ? ` (${formatIqd(n.amountIqd)})` : ''}. أكّد الاستلام من حسابي ← جوائزي.`,
        data: { type: 'prize', prizeId: n.id, tournamentId: n.tournamentId },
      }, tx);
      return { ...view(n), deliveryNote: n.deliveryNote, hasBeneficiary: beneficiaryId(n) !== null };
    });
  }

  /** POST /admin/prizes/:id/undeliver — تراجع عن «سُلّمت» قبل تأكيد المستفيد */
  async undeliver(id: number, { auth, ip }: Ctx) {
    assertActive(auth);
    const p = await this.load(id);
    this.can(auth, p.tournamentId);
    if (p.status === 'confirmed') throw new AppError(409, 'PRIZE_CONFIRMED', 'أكّد المستفيد الاستلام، فلا يُتراجع عن التسليم.');
    if (p.status !== 'delivered') throw new AppError(409, 'PRIZE_NOT_DELIVERED', 'الجائزة غير مسجّلة كمسلّمة.');
    return this.prisma.$transaction(async (tx) => {
      const n = await tx.prize.update({ where: { id }, data: { status: 'awarded', deliveredAt: null, deliveredById: null, deliveryNote: null, updatedById: auth.userId }, select: SELECT });
      await this.audit.record({ actorUserId: auth.userId, action: 'prize.undeliver', entity: 'prize', entityId: id, payload: { deliveredAt: p.deliveredAt?.toISOString() ?? null }, ip }, tx);
      return { ...view(n), deliveryNote: n.deliveryNote, hasBeneficiary: beneficiaryId(n) !== null };
    });
  }

  /**
   * POST /admin/tournaments/:id/prizes/announce {announced, notify?}
   * الإعلان يُظهر الجوائز في الموقع والتطبيق، ويُشعر مديري الفرق المعتمدة ولاعبيها (notify افتراضياً نعم).
   */
  async announce(id: number, body: B, { auth, ip }: Ctx) {
    assertActive(auth);
    this.can(auth, id);
    const t = await this.prisma.tournament.findUnique({ where: { id }, select: { id: true, nameAr: true, slug: true, status: true, prizesAnnouncedAt: true } });
    if (!t) throw T_NOT_FOUND();
    const announced = bool(body, 'announced', 'الإعلان');
    const notify = body.notify === undefined ? true : bool(body, 'notify', 'الإشعار');
    const rows = await this.prisma.prize.findMany({ where: { tournamentId: id }, select: { amountIqd: true } });
    if (announced && !rows.length) throw new AppError(409, 'NO_PRIZES', 'أضف الجوائز وقيمها أولاً ثم أعلنها.');
    if (announced && t.status === 'draft') throw new AppError(409, 'TOURNAMENT_DRAFT', 'البطولة مسودة لا يراها الجمهور. انقلها إلى «التسجيل» أولاً.');
    const again = !!t.prizesAnnouncedAt;
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.tournament.update({ where: { id }, data: { prizesAnnouncedAt: announced ? new Date() : null }, select: { prizesAnnouncedAt: true } });
      await this.audit.record({ actorUserId: auth.userId, action: announced ? 'tournament.prizes_announce' : 'tournament.prizes_hide', entity: 'tournament', entityId: id, payload: { totalIqd: total(rows), count: rows.length }, ip }, tx);
      let notified = 0;
      if (announced && notify) {
        const regs = await tx.tournamentRegistration.findMany({
          where: { tournamentId: id, status: 'approved' },
          select: { team: { select: { managerId: true, players: { select: { player: { select: { userId: true } } } } } } },
        });
        const users = regs.flatMap((r) => [r.team.managerId, ...r.team.players.map((x) => x.player.userId)]);
        const sum = total(rows);
        notified = await this.notifications.notify(users, {
          titleAr: again ? `تحديث جوائز ${t.nameAr}` : `أُعلنت جوائز ${t.nameAr} 🏆`,
          bodyAr: `${rows.length} جوائز${sum ? ` بقيمة ${formatIqd(sum)}` : ''} للمراكز الثلاثة الأولى وأفضل اللاعبين.`,
          data: { type: 'prizes', tournamentId: id, slug: t.slug },
        }, tx);
      }
      return { announcedAt: u.prizesAnnouncedAt, notified };
    });
  }

  // ───────────── المستفيد ─────────────

  private mineWhere(userId: number): Prisma.PrizeWhereInput {
    return {
      status: { not: 'pending' },
      OR: [
        { category: 'team_place', team: { managerId: userId } },
        { category: 'best_player', player: { userId } },
        { category: 'best_player', player: { userId: null, guardianId: userId } },
        { category: 'best_player', player: { userId: null, guardianId: null }, team: { managerId: userId } },
      ],
    };
  }

  /** GET /me/prizes — جوائزي (وجوائز فريقي ولاعبيّ القاصرين) */
  async mine(auth: AuthContext) {
    const rows = await this.prisma.prize.findMany({ where: this.mineWhere(auth.userId), select: SELECT, orderBy: [{ updatedAt: 'desc' }] });
    return rows.map((p) => ({ ...view(p), tournament: { id: p.tournament.id, nameAr: p.tournament.nameAr, slug: p.tournament.slug }, deliveryNote: p.deliveryNote, canConfirm: p.status === 'delivered' }));
  }

  /** POST /me/prizes/:id/confirm — المستفيد يؤكد الاستلام (نهائي) */
  async confirm(id: number, { auth, ip }: Ctx) {
    assertActive(auth);
    const p = await this.prisma.prize.findFirst({ where: { id, ...this.mineWhere(auth.userId) }, select: SELECT });
    if (!p) throw NOT_FOUND();
    if (p.status === 'confirmed') throw new AppError(409, 'PRIZE_CONFIRMED', 'أكّدت استلام هذه الجائزة من قبل.');
    if (p.status !== 'delivered') throw new AppError(409, 'PRIZE_NOT_DELIVERED', 'لم تُسجَّل الجائزة كمسلّمة بعد. تواصل مع إدارة البطولة.');
    return this.prisma.$transaction(async (tx) => {
      const n = await tx.prize.update({ where: { id }, data: { status: 'confirmed', confirmedAt: new Date(), confirmedById: auth.userId }, select: SELECT });
      await this.audit.record({ actorUserId: auth.userId, action: 'prize.confirm', entity: 'prize', entityId: id, payload: { amountIqd: n.amountIqd, deliveredAt: n.deliveredAt?.toISOString() ?? null }, ip }, tx);
      return { ...view(n), tournament: { id: n.tournament.id, nameAr: n.tournament.nameAr, slug: n.tournament.slug }, deliveryNote: n.deliveryNote, canConfirm: false };
    });
  }
}

@Controller()
export class PrizesPublicController {
  constructor(private readonly svc: PrizesService) {}

  /** GET /tournaments/:id/prizes — الجوائز المعلنة للبطولة */
  @Get('tournaments/:id/prizes') @Header('cache-control', 'public, max-age=30')
  forTournament(@Param('id') id: string) {
    return this.svc.forTournament(id);
  }

  /** GET /prizes/archive?limit=&before= — سجل الجوائز السابقة */
  @Get('prizes/archive') @Header('cache-control', 'public, max-age=60')
  archive(@Query('limit') limit?: string, @Query('before') before?: string) {
    return this.svc.archive(limit, before);
  }
}

@Controller()
@UseGuards(AuthGuard)
export class PrizesAdminController {
  constructor(private readonly svc: PrizesService) {}

  @Get('admin/prizes')
  list(@Req() req: AuthedRequest, @Query('status') status?: string, @Query('tournamentId') tournamentId?: string) {
    return this.svc.adminList(req.auth, status, tournamentId);
  }

  @Get('admin/tournaments/:id/prizes')
  tournament(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.svc.adminTournament(idParam(id, 'البطولة'), req.auth);
  }

  @Post('admin/tournaments/:id/prizes/announce') @HttpCode(200)
  announce(@Param('id') id: string, @Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.announce(idParam(id, 'البطولة'), body ?? {}, { auth: req.auth, ip: clientIp(req) });
  }

  @Post('admin/prizes')
  create(@Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.create(body ?? {}, { auth: req.auth, ip: clientIp(req) });
  }

  @Patch('admin/prizes/:id')
  update(@Param('id') id: string, @Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.update(idParam(id, 'الجائزة'), body ?? {}, { auth: req.auth, ip: clientIp(req) });
  }

  @Delete('admin/prizes/:id') @HttpCode(200)
  remove(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.svc.remove(idParam(id, 'الجائزة'), { auth: req.auth, ip: clientIp(req) });
  }

  @Post('admin/prizes/:id/deliver') @HttpCode(200)
  deliver(@Param('id') id: string, @Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.deliver(idParam(id, 'الجائزة'), body ?? {}, { auth: req.auth, ip: clientIp(req) });
  }

  @Post('admin/prizes/:id/undeliver') @HttpCode(200)
  undeliver(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.svc.undeliver(idParam(id, 'الجائزة'), { auth: req.auth, ip: clientIp(req) });
  }

  @Get('me/prizes')
  mine(@Req() req: AuthedRequest) {
    return this.svc.mine(req.auth);
  }

  @Post('me/prizes/:id/confirm') @HttpCode(200)
  confirm(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.svc.confirm(idParam(id, 'الجائزة'), { auth: req.auth, ip: clientIp(req) });
  }
}
