import { ctr } from '@saha/shared';

/** تقرير الراعي — منطق خالص بلا NestJS ولا قاعدة بيانات (يُختبر في test/content.test.ts) */
export const REPORT_MAX_DAYS = 366;

export interface DayRow { day: string; impressions: number; clicks: number }
export interface SlideReport { id: number; titleAr: string; type: string; status: string; impressions: number; clicks: number; ctr: number; days: DayRow[] }

/**
 * يجمع أحداث الشرائح إلى تقرير: الظهور والنقرات لكل شريحة ولكل يوم (بتوقيت بغداد).
 * منطق خالص يُختبر وحده؛ الصفوف تأتي من استعلام GROUP BY على slide_events.
 */
export function buildReport(slides: { id: number; titleAr: string; type: string; status: string }[], rows: { slideId: number; day: string; type: string; n: number }[]) {
  const per = new Map<number, Map<string, DayRow>>();
  for (const s of slides) per.set(s.id, new Map());
  for (const r of rows) {
    const days = per.get(r.slideId);
    if (!days) continue;
    const d = days.get(r.day) ?? { day: r.day, impressions: 0, clicks: 0 };
    if (r.type === 'impression') d.impressions += r.n;
    else if (r.type === 'click') d.clicks += r.n;
    days.set(r.day, d);
  }
  const out: SlideReport[] = slides.map((s) => {
    const days = [...per.get(s.id)!.values()].sort((a, b) => a.day.localeCompare(b.day));
    const impressions = days.reduce((n, d) => n + d.impressions, 0);
    const clicks = days.reduce((n, d) => n + d.clicks, 0);
    return { ...s, impressions, clicks, ctr: ctr(impressions, clicks), days };
  });
  const impressions = out.reduce((n, s) => n + s.impressions, 0);
  const clicks = out.reduce((n, s) => n + s.clicks, 0);
  return { totals: { impressions, clicks, ctr: ctr(impressions, clicks) }, slides: out };
}

const csvCell = (v: string | number) => {
  const s = String(v);
  // يمنع حقن الصيغ في Excel، ويهرّب الفواصل وعلامات الاقتباس
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function reportCsv(r: ReturnType<typeof buildReport>) {
  const lines = [['التاريخ', 'الشريحة', 'مرات الظهور', 'النقرات', 'نسبة النقر %']];
  for (const s of r.slides) for (const d of s.days) lines.push([d.day, s.titleAr, String(d.impressions), String(d.clicks), String(ctr(d.impressions, d.clicks))]);
  lines.push(['المجموع', '', String(r.totals.impressions), String(r.totals.clicks), String(r.totals.ctr)]);
  return '﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

