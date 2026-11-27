import { Controller, Get, Injectable, Query, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SLIDE_TYPES, SLIDE_TYPE_LABELS, TOURNAMENT_KINDS, ctr, hasPermission, type SlideType } from '@saha/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/arabic-error.filter';
import { AuthGuard, assertActive } from '../auth/auth.guard';
import type { AuthContext, AuthedRequest } from '../auth/auth.types';
import { baghdadToday } from '../matches/matches.service';
import { addDays, dayParam, daysBetween } from './common';
import { REPORT_MAX_DAYS } from './report';
import { HEATMAP_METRICS, buildHeatmap, buildSeries, delta, parseDays, parseHour, previousRange, type HeatmapMetric } from './analytics';

export interface AnalyticsQuery {
  from?: string; to?: string; sponsorId?: string; slideId?: string; slideType?: string; tournamentId?: string; kind?: string;
  days?: string; hourFrom?: string; hourTo?: string; metric?: string;
}

const optId = (v: string | undefined, label: string) => {
  if (v === undefined || v === '') return undefined;
  if (!/^\d{1,9}$/.test(v)) throw new AppError(400, 'VALIDATION_ERROR', `قيمة «${label}» غير صحيحة.`);
  return Number(v);
};

/**
 * تحليلات الرعاة للوحة: ظهور ونقرات الشرائح بفلاتر متقدمة، مقارنة بالفترة السابقة،
 * خريطة حرارية (يوم × ساعة بتوقيت بغداد)، وترتيب الرعاة والشرائح.
 * المدير العام ومدير الرعاة (بدخول TOTP) يرون كل الرعاة؛ دور «راعٍ» يرى راعيه فقط.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** الرعاة المسموح بهم للمستخدم: null = الكل */
  private scope(auth: AuthContext): number[] | null {
    if (hasPermission(auth.grants, 'sponsor.reports.view', {}, auth.mfa)) return null;
    const own = [...new Set(auth.grants.filter((g) => g.role === 'sponsor_viewer' && g.sponsorId).map((g) => g.sponsorId!))];
    if (!own.length) throw new AppError(403, 'FORBIDDEN', 'لا تملك صلاحية لهذا الإجراء.');
    return own;
  }

  async sponsors(auth: AuthContext, q: AnalyticsQuery) {
    assertActive(auth);
    const allowed = this.scope(auth);

    const to = dayParam(q.to, 'إلى تاريخ') ?? baghdadToday();
    const from = dayParam(q.from, 'من تاريخ') ?? addDays(to, -29);
    if (from > to) throw new AppError(400, 'INVALID_RANGE', 'تاريخ البداية بعد تاريخ النهاية.');
    if (daysBetween(from, to) + 1 > REPORT_MAX_DAYS) throw new AppError(400, 'RANGE_TOO_LONG', `الفترة أطول من ${REPORT_MAX_DAYS} يوماً.`);

    const sponsorId = optId(q.sponsorId, 'الراعي');
    if (sponsorId !== undefined && allowed && !allowed.includes(sponsorId)) throw new AppError(403, 'FORBIDDEN', 'لا تملك صلاحية لهذا الراعي.');
    const slideId = optId(q.slideId, 'الشريحة');
    const tournamentId = optId(q.tournamentId, 'البطولة');
    const slideType = q.slideType ? q.slideType : undefined;
    if (slideType && !(SLIDE_TYPES as readonly string[]).includes(slideType)) throw new AppError(400, 'VALIDATION_ERROR', 'نوع الشريحة غير معروف.');
    const kind = q.kind ? q.kind : undefined;
    if (kind && !(TOURNAMENT_KINDS as readonly string[]).includes(kind)) throw new AppError(400, 'VALIDATION_ERROR', 'نوع البطولة غير معروف.');
    const metric = (q.metric || 'impressions') as HeatmapMetric;
    if (!(HEATMAP_METRICS as readonly string[]).includes(metric)) throw new AppError(400, 'VALIDATION_ERROR', 'مقياس الخريطة غير معروف.');
    let days: number[]; let hourFrom: number | undefined; let hourTo: number | undefined;
    try { days = parseDays(q.days); hourFrom = parseHour(q.hourFrom); hourTo = parseHour(q.hourTo); } catch {
      throw new AppError(400, 'VALIDATION_ERROR', 'فلتر الأيام أو الساعات غير صحيح.');
    }

    // ───── شروط مشتركة (الشريحة + الحدث) ─────
    const local = Prisma.sql`(e.created_at AT TIME ZONE 'Asia/Baghdad')`;
    const conds = (a: string, b: string): Prisma.Sql => {
      const c: Prisma.Sql[] = [Prisma.sql`e.day BETWEEN ${a}::date AND ${b}::date`];
      if (allowed) c.push(Prisma.sql`s.sponsor_id = ANY(${allowed}::int[])`);
      else c.push(Prisma.sql`(s.sponsor_id IS NOT NULL OR s.type = 'sponsor')`);
      if (sponsorId !== undefined) c.push(Prisma.sql`s.sponsor_id = ${sponsorId}`);
      if (slideId !== undefined) c.push(Prisma.sql`s.id = ${slideId}`);
      if (slideType) c.push(Prisma.sql`s.type::text = ${slideType}`);
      if (tournamentId !== undefined) c.push(Prisma.sql`s.tournament_id = ${tournamentId}`);
      if (kind) c.push(Prisma.sql`EXISTS (SELECT 1 FROM tournaments t WHERE t.id = s.tournament_id AND t.kind::text = ${kind})`);
      if (days.length) c.push(Prisma.sql`extract(isodow from ${local})::int = ANY(${days}::int[])`);
      if (hourFrom !== undefined || hourTo !== undefined) {
        const hf = hourFrom ?? 0, ht = hourTo ?? 23;
        const hour = Prisma.sql`extract(hour from ${local})::int`;
        c.push(hf <= ht ? Prisma.sql`${hour} BETWEEN ${hf} AND ${ht}` : Prisma.sql`(${hour} >= ${hf} OR ${hour} <= ${ht})`);
      }
      return Prisma.join(c, ' AND ');
    };
    const base = Prisma.sql`FROM slide_events e JOIN hero_slides s ON s.id = e.slide_id`;
    const prev = previousRange(from, to);

    const [dayRows, cellRows, totalsNow, totalsPrev, bySponsor, bySlide, byType] = await Promise.all([
      this.prisma.$queryRaw<{ day: string; type: string; n: bigint }[]>`
        SELECT to_char(e.day, 'YYYY-MM-DD') AS day, e.type::text AS type, count(*) AS n ${base} WHERE ${conds(from, to)} GROUP BY 1, 2`,
      this.prisma.$queryRaw<{ dow: number; hour: number; type: string; n: bigint }[]>`
        SELECT extract(isodow from ${local})::int AS dow, extract(hour from ${local})::int AS hour, e.type::text AS type, count(*) AS n
        ${base} WHERE ${conds(from, to)} GROUP BY 1, 2, 3`,
      this.totals(base, conds(from, to)),
      this.totals(base, conds(prev.from, prev.to)),
      this.prisma.$queryRaw<{ id: number | null; impressions: bigint; clicks: bigint }[]>`
        SELECT s.sponsor_id AS id, count(*) FILTER (WHERE e.type = 'impression') AS impressions, count(*) FILTER (WHERE e.type = 'click') AS clicks
        ${base} WHERE ${conds(from, to)} GROUP BY 1 ORDER BY 2 DESC LIMIT 50`,
      this.prisma.$queryRaw<{ id: number; impressions: bigint; clicks: bigint }[]>`
        SELECT s.id, count(*) FILTER (WHERE e.type = 'impression') AS impressions, count(*) FILTER (WHERE e.type = 'click') AS clicks
        ${base} WHERE ${conds(from, to)} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
      this.prisma.$queryRaw<{ type: string; impressions: bigint; clicks: bigint }[]>`
        SELECT s.type::text AS type, count(*) FILTER (WHERE e.type = 'impression') AS impressions, count(*) FILTER (WHERE e.type = 'click') AS clicks
        ${base} WHERE ${conds(from, to)} GROUP BY 1 ORDER BY 2 DESC`,
    ]);

    const sponsorNames = await this.prisma.sponsor.findMany({
      where: allowed ? { id: { in: allowed } } : {}, orderBy: { nameAr: 'asc' }, select: { id: true, nameAr: true, logoUrl: true },
    });
    const slideInfo = bySlide.length
      ? await this.prisma.heroSlide.findMany({ where: { id: { in: bySlide.map((s) => s.id) } }, select: { id: true, titleAr: true, type: true, status: true, sponsor: { select: { nameAr: true } } } })
      : [];
    const slideMap = new Map(slideInfo.map((s) => [s.id, s]));
    const nameOf = new Map(sponsorNames.map((s) => [s.id, s.nameAr]));
    const n = (v: bigint) => Number(v);

    return {
      from, to, previous: prev, timezone: 'Asia/Baghdad',
      totals: { ...totalsNow, ctr: ctr(totalsNow.impressions, totalsNow.clicks) },
      previousTotals: { ...totalsPrev, ctr: ctr(totalsPrev.impressions, totalsPrev.clicks) },
      change: {
        impressions: delta(totalsNow.impressions, totalsPrev.impressions),
        clicks: delta(totalsNow.clicks, totalsPrev.clicks),
        devices: delta(totalsNow.devices, totalsPrev.devices),
        ctr: delta(ctr(totalsNow.impressions, totalsNow.clicks), ctr(totalsPrev.impressions, totalsPrev.clicks)),
      },
      series: buildSeries(from, to, dayRows.map((r) => ({ ...r, n: n(r.n) }))),
      heatmap: buildHeatmap(cellRows.map((r) => ({ ...r, n: n(r.n) })), metric),
      sponsors: bySponsor.map((r) => ({
        id: r.id, nameAr: r.id === null ? 'بلا راعٍ' : nameOf.get(r.id) ?? `راعٍ #${r.id}`,
        impressions: n(r.impressions), clicks: n(r.clicks), ctr: ctr(n(r.impressions), n(r.clicks)),
      })),
      slides: bySlide.map((r) => {
        const s = slideMap.get(r.id);
        return { id: r.id, titleAr: s?.titleAr ?? `#${r.id}`, type: s?.type ?? null, status: s?.status ?? null, sponsorAr: s?.sponsor?.nameAr ?? null, impressions: n(r.impressions), clicks: n(r.clicks), ctr: ctr(n(r.impressions), n(r.clicks)) };
      }),
      types: byType.map((r) => ({ type: r.type, label: SLIDE_TYPE_LABELS[r.type as SlideType] ?? r.type, impressions: n(r.impressions), clicks: n(r.clicks) })),
      options: {
        sponsors: sponsorNames,
        tournaments: await this.prisma.tournament.findMany({ where: { status: { not: 'draft' } }, orderBy: { id: 'desc' }, take: 100, select: { id: true, nameAr: true, kind: true } }),
        slides: await this.prisma.heroSlide.findMany({
          where: allowed ? { sponsorId: { in: allowed } } : { OR: [{ sponsorId: { not: null } }, { type: 'sponsor' }] },
          orderBy: { id: 'desc' }, take: 100, select: { id: true, titleAr: true, sponsorId: true },
        }),
      },
    };
  }

  private async totals(base: Prisma.Sql, where: Prisma.Sql) {
    const [r] = await this.prisma.$queryRaw<{ impressions: bigint; clicks: bigint; devices: bigint }[]>`
      SELECT count(*) FILTER (WHERE e.type = 'impression') AS impressions, count(*) FILTER (WHERE e.type = 'click') AS clicks,
             count(DISTINCT e.device_id) AS devices
      ${base} WHERE ${where}`;
    return { impressions: Number(r?.impressions ?? 0), clicks: Number(r?.clicks ?? 0), devices: Number(r?.devices ?? 0) };
  }
}

@Controller()
@UseGuards(AuthGuard)
export class AnalyticsController {
  constructor(private readonly svc: AnalyticsService) {}

  /** GET /admin/analytics/sponsors?from&to&sponsorId&slideId&slideType&tournamentId&kind&days=1,2&hourFrom&hourTo&metric */
  @Get('admin/analytics/sponsors')
  sponsors(@Req() req: AuthedRequest, @Query() q: AnalyticsQuery) {
    return this.svc.sponsors(req.auth, q ?? {});
  }
}
