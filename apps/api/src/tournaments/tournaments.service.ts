import { Injectable } from '@nestjs/common';
import { TournamentKind } from '@prisma/client';
import { TOURNAMENT_KINDS } from '@saha/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/arabic-error.filter';
import { computeStandings, COUNTED_STATUSES, isGroupStage } from './standings';
import { GROUP_LABELS } from './fixtures';
import { PUBLIC_PLAYER_SELECT, publicPlayerName } from '../teams/players';
import { bestPlayers, buildBracket, firstKnockoutSize, groupQualifierSlots, KO_STAGES, starLines, topScorers, withZones } from './road';

/** بيانات الفريق في الجداول والشجرة: الشعار وصورة صاحب الفريق/المؤثر */
export const TEAM_CARD_SELECT = { id: true, nameAr: true, logoUrl: true, ownerName: true, ownerPhotoUrl: true } as const;

@Injectable()
export class TournamentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(kind?: string) {
    if (kind && !(TOURNAMENT_KINDS as readonly string[]).includes(kind)) {
      throw new AppError(400, 'INVALID_KIND', 'نوع البطولة غير معروف.');
    }
    const list = await this.prisma.tournament.findMany({
      where: { status: { not: 'draft' }, ...(kind ? { kind: kind as TournamentKind } : {}) },
      orderBy: [{ startsOn: 'desc' }, { id: 'desc' }],
      select: {
        id: true, nameAr: true, slug: true, kind: true, city: true, startsOn: true, endsOn: true,
        format: true, ageCategory: true, status: true, feesEnabled: true, entryFeeIqd: true,
        community: { select: { id: true, kind: true, nameAr: true, platformUrl: true } },
        maxTeams: true,
        _count: { select: { registrations: { where: { status: 'approved' } }, matches: true } },
      },
    });
    // تقدّم البطولة: المباريات المحسومة من مجموع المباريات، وآخر جولة لُعبت من عدد الجولات
    const matches = await this.prisma.match.findMany({
      where: { tournamentId: { in: list.map((t) => t.id) } },
      select: { tournamentId: true, round: true, resultStatus: true },
    });
    return list.map((t) => {
      const own = matches.filter((m) => m.tournamentId === t.id);
      const played = own.filter((m) => m.resultStatus !== 'scheduled');
      const rounds = Math.max(0, ...own.map((m) => m.round ?? 0));
      const currentRound = Math.max(0, ...played.map((m) => m.round ?? 0));
      return { ...t, entryFeeIqd: t.feesEnabled ? t.entryFeeIqd : 0, progress: { played: played.length, total: own.length, currentRound, rounds } };
    });
  }

  /**
   * GET /tournaments/:id/standings — ترتيب الدوري أو المجموعات (مباريات الأدوار الإقصائية لا تدخل).
   * rows: الترتيب العام، groups: ترتيب كل مجموعة (لنظام المجموعات).
   */
  async standings(idOrSlug: string) {
    const where = /^\d+$/.test(idOrSlug) ? { id: Number(idOrSlug) } : { slug: idOrSlug };
    const t = await this.prisma.tournament.findFirst({
      where: { ...where, status: { not: 'draft' } },
      select: {
        id: true, nameAr: true, slug: true, format: true,
        registrations: { where: { status: 'approved' }, select: { groupLabel: true, team: { select: TEAM_CARD_SELECT } } },
        matches: { select: { stage: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, resultStatus: true } },
      },
    });
    if (!t) throw new AppError(404, 'TOURNAMENT_NOT_FOUND', 'البطولة غير موجودة.');
    const matches = t.matches.filter((m) => isGroupStage(m.stage));
    const groups = GROUP_LABELS
      .map((label) => ({ label, teams: t.registrations.filter((r) => r.groupLabel === label).map((r) => r.team) }))
      .filter((g) => g.teams.length)
      .map((g) => ({ label: g.label, rows: computeStandings(g.teams, matches.filter((m) => g.teams.some((x) => x.id === m.homeTeamId))) }));
    return {
      tournament: { id: t.id, nameAr: t.nameAr, slug: t.slug, format: t.format },
      rows: computeStandings(t.registrations.map((r) => r.team), matches),
      groups,
    };
  }

  /**
   * GET /tournaments/:id/road — «طريق التأهل» كما في كأس العالم: جداول المجموعات بمنطقة التأهل،
   * وشجرة الإقصاء حتى النهائي (المتوقع من الترتيب الحالي قبل اكتمال المجموعات)، والبطل.
   */
  async road(idOrSlug: string) {
    const where = /^\d+$/.test(idOrSlug) ? { id: Number(idOrSlug) } : { slug: idOrSlug };
    const t = await this.prisma.tournament.findFirst({
      where: { ...where, status: { not: 'draft' } },
      select: {
        id: true, nameAr: true, slug: true, format: true, status: true, groupCount: true, qualifiersPerGroup: true,
        registrations: { where: { status: 'approved' }, orderBy: { teamId: 'asc' }, select: { groupLabel: true, team: { select: TEAM_CARD_SELECT } } },
        matches: {
          select: {
            id: true, stage: true, round: true, kickoffAt: true, homeTeamId: true, awayTeamId: true,
            homeScore: true, awayScore: true, homePens: true, awayPens: true, resultStatus: true,
          },
        },
      },
    });
    if (!t) throw new AppError(404, 'TOURNAMENT_NOT_FOUND', 'البطولة غير موجودة.');
    const teams = t.registrations.map((r) => r.team);
    const byId = new Map(teams.map((x) => [x.id, x]));
    // فريق خرج من التسجيل بعد بدء الأدوار يبقى ظاهراً في الشجرة
    const missing = [...new Set(t.matches.flatMap((m) => [m.homeTeamId, m.awayTeamId]))].filter((id) => !byId.has(id));
    if (missing.length) for (const x of await this.prisma.team.findMany({ where: { id: { in: missing } }, select: TEAM_CARD_SELECT })) byId.set(x.id, x);

    const tableMatches = t.matches.filter((m) => isGroupStage(m.stage));
    const ko = t.matches.filter((m) => m.stage && KO_STAGES.includes(m.stage));
    const perGroup = t.format === 'groups_knockout' ? ((t.qualifiersPerGroup ?? 1) as 1 | 2) : null;

    const groups = GROUP_LABELS
      .map((label) => ({ label, teams: t.registrations.filter((r) => r.groupLabel === label).map((r) => r.team) }))
      .filter((g) => g.teams.length)
      .map((g) => ({ label: g.label, rows: computeStandings(g.teams, tableMatches.filter((m) => g.teams.some((x) => x.id === m.homeTeamId))) }));
    const league = t.format === 'league' ? withZones(computeStandings(teams, tableMatches), null) : [];

    const size = firstKnockoutSize(t.format, teams.length, groups.length || (t.groupCount ?? 0), perGroup, ko);
    const firstSlots = t.format === 'groups_knockout' && !ko.length && groups.length && perGroup ? groupQualifierSlots(groups, perGroup) : undefined;
    const bracket = buildBracket(size, ko, byId, firstSlots);
    const groupMatches = t.matches.filter((m) => m.stage === 'group');
    return {
      tournament: { id: t.id, nameAr: t.nameAr, slug: t.slug, format: t.format, status: t.status, qualifiersPerGroup: perGroup },
      groups: groups.map((g) => ({ label: g.label, qualifiers: perGroup, rows: withZones(g.rows, perGroup) })),
      league,
      groupStage: t.format === 'groups_knockout'
        ? { played: groupMatches.filter((m) => m.resultStatus === 'confirmed' || m.resultStatus === 'final').length, total: groupMatches.length, finished: ko.length > 0 }
        : null,
      bracket: bracket.rounds,
      champion: bracket.champion,
    };
  }

  /**
   * GET /tournaments/:id/stars — أفضل 3 هدافين (منصة التتويج) وقائمة أفضل اللاعبين
   * (الأكثر نيلاً لجائزة أفضل لاعب في المباراة ثم الأهداف)، من المباريات المعتمدة والنهائية فقط.
   */
  async stars(idOrSlug: string) {
    const where = /^\d+$/.test(idOrSlug) ? { id: Number(idOrSlug) } : { slug: idOrSlug };
    const t = await this.prisma.tournament.findFirst({ where: { ...where, status: { not: 'draft' } }, select: { id: true } });
    if (!t) throw new AppError(404, 'TOURNAMENT_NOT_FOUND', 'البطولة غير موجودة.');
    const events = await this.prisma.matchEvent.findMany({
      where: { playerId: { not: null }, type: { in: ['goal', 'mvp', 'yellow_card', 'red_card'] }, match: { tournamentId: t.id, resultStatus: { in: [...COUNTED_STATUSES] } } },
      select: { playerId: true, teamId: true, type: true, matchId: true },
    });
    const lines = starLines(events.map((e) => ({ ...e, playerId: e.playerId! })));
    const players = await this.prisma.player.findMany({ where: { id: { in: lines.map((l) => l.playerId) } }, select: PUBLIC_PLAYER_SELECT });
    const teams = await this.prisma.team.findMany({ where: { id: { in: [...new Set(lines.map((l) => l.teamId))] } }, select: TEAM_CARD_SELECT });
    const names = new Map(players.map((p) => [p.id, publicPlayerName(p)]));
    const name = (id: number) => names.get(id) ?? '';
    const view = <L extends { playerId: number; teamId: number }>({ playerId, teamId, ...rest }: L) => ({
      ...rest, player: { id: playerId, name: name(playerId) }, team: teams.find((x) => x.id === teamId) ?? null,
    });
    return {
      topScorers: topScorers(lines, name).map(view),
      bestPlayers: bestPlayers(lines, name).map(view),
    };
  }

  /** GET /tournaments/:id/scorers — الهدافون من أحداث المباريات المعتمدة والنهائية */
  async scorers(idOrSlug: string) {
    const where = /^\d+$/.test(idOrSlug) ? { id: Number(idOrSlug) } : { slug: idOrSlug };
    const t = await this.prisma.tournament.findFirst({ where: { ...where, status: { not: 'draft' } }, select: { id: true } });
    if (!t) throw new AppError(404, 'TOURNAMENT_NOT_FOUND', 'البطولة غير موجودة.');
    const goals = await this.prisma.matchEvent.groupBy({
      by: ['playerId', 'teamId'],
      where: { type: 'goal', playerId: { not: null }, match: { tournamentId: t.id, resultStatus: { in: [...COUNTED_STATUSES] } } },
      _count: { _all: true },
    });
    const players = await this.prisma.player.findMany({ where: { id: { in: goals.map((g) => g.playerId!) } }, select: PUBLIC_PLAYER_SELECT });
    const teams = await this.prisma.team.findMany({ where: { id: { in: goals.map((g) => g.teamId) } }, select: TEAM_CARD_SELECT });
    return goals
      .map((g) => {
        const p = players.find((x) => x.id === g.playerId)!;
        return { player: { id: p.id, name: publicPlayerName(p) }, team: teams.find((x) => x.id === g.teamId)!, goals: g._count._all };
      })
      .sort((a, b) => b.goals - a.goals || a.player.name.localeCompare(b.player.name, 'ar'))
      .slice(0, 20);
  }

  /** GET /tournaments/:id/draw — بيانات التحقق من القرعة: البذرة والفرق بترتيبها قبل الخلط */
  async drawInfo(idOrSlug: string) {
    const where = /^\d+$/.test(idOrSlug) ? { id: Number(idOrSlug) } : { slug: idOrSlug };
    const t = await this.prisma.tournament.findFirst({ where: { ...where, status: { not: 'draft' } }, select: { id: true, drawSeed: true, drawnAt: true, format: true, groupCount: true } });
    if (!t) throw new AppError(404, 'TOURNAMENT_NOT_FOUND', 'البطولة غير موجودة.');
    if (!t.drawnAt) return { drawn: false };
    const entry = await this.prisma.auditLog.findFirst({
      where: { entity: 'tournament', entityId: String(t.id), action: { in: ['tournament.draw', 'tournament.redraw'] } },
      orderBy: { seq: 'desc' }, select: { payload: true, seq: true, hash: true },
    });
    return {
      drawn: true, drawnAt: t.drawnAt, seed: t.drawSeed, format: t.format, groupCount: t.groupCount,
      teamIdsBeforeDraw: (entry?.payload as unknown as { teamIds?: number[] } | null)?.teamIds ?? null,
      auditSeq: entry ? Number(entry.seq) : null, auditHash: entry?.hash ?? null,
      method: 'خلط Fisher–Yates لأرقام الفرق المعتمدة مرتبة تصاعدياً، والأرقام العشوائية من sha256(البذرة:العدّاد).',
    };
  }

  async get(idOrSlug: string) {
    const where = /^\d+$/.test(idOrSlug) ? { id: Number(idOrSlug) } : { slug: idOrSlug };
    const t = await this.prisma.tournament.findFirst({
      where: { ...where, status: { not: 'draft' } },
      include: {
        community: { select: { id: true, kind: true, nameAr: true, platformUrl: true } },
        registrations: { where: { status: 'approved' }, select: { groupLabel: true, team: { select: { ...TEAM_CARD_SELECT, verifiedAt: true } } } },
        matches: {
          orderBy: [{ kickoffAt: 'asc' }],
          select: {
            id: true, stage: true, round: true, kickoffAt: true, venue: true, homeScore: true, awayScore: true, resultStatus: true,
            homeTeam: { select: { id: true, nameAr: true, logoUrl: true } }, awayTeam: { select: { id: true, nameAr: true, logoUrl: true } },
          },
        },
      },
    });
    if (!t) throw new AppError(404, 'TOURNAMENT_NOT_FOUND', 'البطولة غير موجودة.');
    // الرسوم الملغاة لا تظهر للجمهور: الاشتراك مجاني
    return { ...t, entryFeeIqd: t.feesEnabled ? t.entryFeeIqd : 0 };
  }
}
