import { Injectable } from '@nestjs/common';
import { TournamentKind } from '@prisma/client';
import { TOURNAMENT_KINDS } from '@saha/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/arabic-error.filter';
import { computeStandings } from './standings';

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

  /** GET /tournaments/:id/standings — فرق البطولة المعتمدة مع نقاطها */
  async standings(idOrSlug: string) {
    const where = /^\d+$/.test(idOrSlug) ? { id: Number(idOrSlug) } : { slug: idOrSlug };
    const t = await this.prisma.tournament.findFirst({
      where: { ...where, status: { not: 'draft' } },
      select: {
        id: true, nameAr: true, slug: true,
        registrations: { where: { status: 'approved' }, select: { team: { select: { id: true, nameAr: true } } } },
        matches: { select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, resultStatus: true } },
      },
    });
    if (!t) throw new AppError(404, 'TOURNAMENT_NOT_FOUND', 'البطولة غير موجودة.');
    return {
      tournament: { id: t.id, nameAr: t.nameAr, slug: t.slug },
      rows: computeStandings(t.registrations.map((r) => r.team), t.matches),
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
