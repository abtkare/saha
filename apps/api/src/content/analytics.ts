import { ctr } from '@saha/shared';
import { addDays, daysBetween } from './common';

/**
 * تحليلات الرعاة — منطق خالص بلا NestJS ولا قاعدة بيانات (يُختبر في test/analytics.test.ts).
 * الخريطة الحرارية: أيام الأسبوع (من السبت) × ساعات اليوم بتوقيت بغداد.
 */

/** ترتيب الأسبوع العراقي من السبت، بقيم ISO (1 = الاثنين … 7 = الأحد) */
export const WEEK_ORDER = [6, 7, 1, 2, 3, 4, 5] as const;
export const WEEKDAY_LABELS: Record<number, string> = { 1: 'الاثنين', 2: 'الثلاثاء', 3: 'الأربعاء', 4: 'الخميس', 5: 'الجمعة', 6: 'السبت', 7: 'الأحد' };
export const HEATMAP_METRICS = ['impressions', 'clicks', 'ctr'] as const;
export type HeatmapMetric = (typeof HEATMAP_METRICS)[number];

export interface CellRow { dow: number; hour: number; type: string; n: number }
export interface DayRow { day: string; type: string; n: number }
export interface SeriesPoint { day: string; impressions: number; clicks: number; ctr: number }

const zeros = () => WEEK_ORDER.map(() => Array.from({ length: 24 }, () => 0));

/** يحوّل صفوف GROUP BY (يوم أسبوع، ساعة، نوع) إلى مصفوفتين 7×24 ونسبة النقر لكل خانة، مع أعلى خانة للمقياس المطلوب */
export function buildHeatmap(rows: CellRow[], metric: HeatmapMetric = 'impressions') {
  const impressions = zeros();
  const clicks = zeros();
  for (const r of rows) {
    const d = WEEK_ORDER.indexOf(r.dow as (typeof WEEK_ORDER)[number]);
    if (d < 0 || r.hour < 0 || r.hour > 23 || !Number.isInteger(r.hour)) continue;
    if (r.type === 'impression') impressions[d][r.hour] += r.n;
    else if (r.type === 'click') clicks[d][r.hour] += r.n;
  }
  const rate = impressions.map((row, d) => row.map((v, h) => ctr(v, clicks[d][h])));
  const values = metric === 'clicks' ? clicks : metric === 'ctr' ? rate : impressions;
  let peak: { dow: number; label: string; hour: number; value: number } | null = null;
  values.forEach((row, d) => row.forEach((v, h) => {
    if (v > 0 && (!peak || v > peak.value)) peak = { dow: WEEK_ORDER[d], label: WEEKDAY_LABELS[WEEK_ORDER[d]], hour: h, value: v };
  }));
  const max = Math.max(0, ...values.flat());
  // مجموع كل ساعة وكل يوم للمقياس المعروض (ما عدا النسبة: تحسب من المجاميع)
  const sum = (a: number[]) => a.reduce((n, v) => n + v, 0);
  const byHour = Array.from({ length: 24 }, (_, h) => {
    const i = sum(impressions.map((row) => row[h])), c = sum(clicks.map((row) => row[h]));
    return metric === 'clicks' ? c : metric === 'ctr' ? ctr(i, c) : i;
  });
  const byDay = WEEK_ORDER.map((_, d) => {
    const i = sum(impressions[d]), c = sum(clicks[d]);
    return metric === 'clicks' ? c : metric === 'ctr' ? ctr(i, c) : i;
  });
  return {
    metric,
    days: WEEK_ORDER.map((dow) => ({ dow, label: WEEKDAY_LABELS[dow] })),
    impressions, clicks, ctr: rate, values, max, peak: peak as { dow: number; label: string; hour: number; value: number } | null, byHour, byDay,
  };
}

/** سلسلة يومية متصلة (الأيام بلا أحداث أصفار) */
export function buildSeries(from: string, to: string, rows: DayRow[]): SeriesPoint[] {
  const map = new Map<string, { impressions: number; clicks: number }>();
  for (let i = 0; i <= daysBetween(from, to); i++) map.set(addDays(from, i), { impressions: 0, clicks: 0 });
  for (const r of rows) {
    const p = map.get(r.day);
    if (!p) continue;
    if (r.type === 'impression') p.impressions += r.n;
    else if (r.type === 'click') p.clicks += r.n;
  }
  return [...map.entries()].map(([day, p]) => ({ day, ...p, ctr: ctr(p.impressions, p.clicks) }));
}

/** الفترة السابقة المساوية في الطول (للمقارنة) */
export function previousRange(from: string, to: string) {
  const len = daysBetween(from, to) + 1;
  return { from: addDays(from, -len), to: addDays(from, -1) };
}

/** نسبة التغيّر بمنزلة واحدة؛ null إن لم تكن هناك قيمة سابقة */
export function delta(now: number, before: number): number | null {
  if (!before) return null;
  return Math.round(((now - before) / before) * 1000) / 10;
}

/** «1,3,5» ← [1,3,5] بعد التحقق؛ قائمة فارغة = كل الأيام */
export function parseDays(v: string | undefined): number[] {
  if (v === undefined || v.trim() === '') return [];
  const out = [...new Set(v.split(',').map((x) => x.trim()).filter(Boolean).map(Number))];
  if (out.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) throw new Error('days');
  return out.sort((a, b) => a - b);
}

/** ساعة 0–23 أو undefined */
export function parseHour(v: string | undefined): number | undefined {
  if (v === undefined || v === '') return undefined;
  if (!/^\d{1,2}$/.test(v) || Number(v) > 23) throw new Error('hour');
  return Number(v);
}
