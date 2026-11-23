import { Injectable } from '@nestjs/common';
import { TournamentKind } from '@prisma/client';
import { TOURNAMENT_KINDS } from '@saha/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/arabic-error.filter';
import { computeStandings, COUNTED_STATUSES, isGroupStage } from './standings';
import { GROUP_LABELS } from './fixtures';
import { PUBLIC_PLAYER_SELECT, publicPlayerName } from '../teams/players';

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
        format: true, ageCategory: true, status: true,
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
      return { ...t, progress: { played: played.length, total: own.length, currentRound, rounds } };
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
        registrations: { where: { status: 'approved' }, select: { groupLabel: true, team: { select: { id: true, nameAr: true } } } },
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
    const teams = await this.prisma.team.findMany({ where: { id: { in: goals.map((g) => g.teamId) } }, select: { id: true, nameAr: true } });
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
        registrations: { where: { status: 'approved' }, select: { groupLabel: true, team: { select: { id: true, nameAr: true, logoUrl: true, verifiedAt: true } } } },
        matches: {
          orderBy: [{ kickoffAt: 'asc' }],
          select: {
            id: true, stage: true, round: true, kickoffAt: true, venue: true, homeScore: true, awayScore: true, resultStatus: true,
            homeTeam: { select: { id: true, nameAr: true } }, awayTeam: { select: { id: true, nameAr: true } },
          },
        },
      },
    });
    if (!t) throw new AppError(404, 'TOURNAMENT_NOT_FOUND', 'البطولة غير موجودة.');
    return t;
  }
}
