import { Injectable } from '@nestjs/common';
import { TournamentKind } from '@prisma/client';
import { TOURNAMENT_KINDS } from '@saha/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/arabic-error.filter';

@Injectable()
export class TournamentsService {
  constructor(private readonly prisma: PrismaService) {}

  list(kind?: string) {
    if (kind && !(TOURNAMENT_KINDS as readonly string[]).includes(kind)) {
      throw new AppError(400, 'INVALID_KIND', 'نوع البطولة غير معروف.');
    }
    return this.prisma.tournament.findMany({
      where: { status: { not: 'draft' }, ...(kind ? { kind: kind as TournamentKind } : {}) },
      orderBy: [{ startsOn: 'desc' }, { id: 'desc' }],
      select: {
        id: true, nameAr: true, slug: true, kind: true, city: true, startsOn: true, endsOn: true,
        format: true, ageCategory: true, status: true,
        community: { select: { id: true, kind: true, nameAr: true, platformUrl: true } },
        _count: { select: { registrations: true, matches: true } },
      },
    });
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
