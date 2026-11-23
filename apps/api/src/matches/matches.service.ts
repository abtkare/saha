import { Injectable } from '@nestjs/common';
import { TIMEZONE } from '@saha/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/arabic-error.filter';
import { PUBLIC_PLAYER_SELECT, publicPlayerName } from '../teams/players';
import { disputeDeadline } from './result-flow';

const BAGHDAD_OFFSET = '+03:00'; // العراق بلا توقيت صيفي

/** تاريخ اليوم بتوقيت بغداد بصيغة YYYY-MM-DD */
export function baghdadToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

const MATCH_SELECT = {
  id: true, stage: true, round: true, kickoffAt: true, venue: true,
  homeScore: true, awayScore: true, resultStatus: true, liveText: true,
  tournament: { select: { id: true, nameAr: true, slug: true, kind: true } },
  homeTeam: { select: { id: true, nameAr: true, logoUrl: true } },
  awayTeam: { select: { id: true, nameAr: true, logoUrl: true } },
} as const;

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  byDate(date?: string) {
    const day = date ?? baghdadToday();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00${BAGHDAD_OFFSET}`))) {
      throw new AppError(400, 'INVALID_DATE', 'صيغة التاريخ غير صحيحة. استخدم سنة-شهر-يوم مثل 2026-11-23.');
    }
    const from = new Date(`${day}T00:00:00${BAGHDAD_OFFSET}`);
    const to = new Date(from.getTime() + 24 * 3600 * 1000);
    return this.prisma.match.findMany({
      where: { kickoffAt: { gte: from, lt: to }, tournament: { status: { not: 'draft' } } },
      orderBy: [{ kickoffAt: 'asc' }, { id: 'asc' }],
      select: MATCH_SELECT,
    });
  }

  /** تفاصيل المباراة مع أحداثها (القاصر بالاسم الأول فقط) */
  async get(id: string) {
    if (!/^\d+$/.test(id)) throw new AppError(404, 'MATCH_NOT_FOUND', 'المباراة غير موجودة.');
    const m = await this.prisma.match.findFirst({
      where: { id: Number(id), tournament: { status: { not: 'draft' } } },
      select: {
        ...MATCH_SELECT, homePens: true, awayPens: true,
        homeConfirmed: true, awayConfirmed: true, resultEnteredAt: true, finalizedAt: true, sheetMediaId: true,
        tournament: { select: { id: true, nameAr: true, slug: true, kind: true, disputeWindowHrs: true } },
        disputes: { orderBy: { id: 'asc' }, select: { id: true, status: true, decision: true, teamId: true, createdAt: true, decidedAt: true } },
        events: { orderBy: [{ minute: 'asc' }, { id: 'asc' }], select: { id: true, type: true, minute: true, teamId: true, player: { select: PUBLIC_PLAYER_SELECT } } },
      },
    });
    if (!m) throw new AppError(404, 'MATCH_NOT_FOUND', 'المباراة غير موجودة.');
    const { sheetMediaId, ...rest } = m;
    const open = m.resultStatus === 'provisional' || m.resultStatus === 'confirmed';
    return {
      ...rest,
      hasSheet: sheetMediaId !== null,
      disputeDeadline: open ? disputeDeadline(m.resultEnteredAt, m.tournament.disputeWindowHrs) : null,
      events: m.events.map((e) => ({ id: e.id, type: e.type, minute: e.minute, teamId: e.teamId, player: e.player ? { id: e.player.id, name: publicPlayerName(e.player) } : null })),
    };
  }
}
