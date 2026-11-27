/**
 * الجلسة 19 — منطق خالص: الخريطة الحرارية (يوم × ساعة)، السلسلة اليومية، الفترة السابقة، الفلاتر.
 */
import { describe, expect, it } from 'vitest';
import { WEEK_ORDER, buildHeatmap, buildSeries, delta, parseDays, parseHour, previousRange } from '../src/content/analytics';

describe('الخريطة الحرارية', () => {
  it('تطابق عدّاً مستقلاً للأحداث الخام، والأسبوع يبدأ بالسبت', () => {
    let x = 11;
    const rnd = (n: number) => { x = (x * 1103515245 + 12345) % 2 ** 31; return x % n; };
    const raw = Array.from({ length: 800 }, () => ({ dow: 1 + rnd(7), hour: rnd(24), type: rnd(5) === 0 ? 'click' : 'impression' }));
    const grouped = new Map<string, number>();
    for (const r of raw) grouped.set(`${r.dow}|${r.hour}|${r.type}`, (grouped.get(`${r.dow}|${r.hour}|${r.type}`) ?? 0) + 1);
    const rows = [...grouped.entries()].map(([k, n]) => { const [dow, hour, type] = k.split('|'); return { dow: +dow, hour: +hour, type, n }; });
    const h = buildHeatmap(rows, 'impressions');
    expect(h.days.map((d) => d.label)).toEqual(['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة']);
    for (let d = 0; d < 7; d++) for (let hr = 0; hr < 24; hr++) {
      expect(h.impressions[d][hr]).toBe(raw.filter((r) => r.dow === WEEK_ORDER[d] && r.hour === hr && r.type === 'impression').length);
      expect(h.clicks[d][hr]).toBe(raw.filter((r) => r.dow === WEEK_ORDER[d] && r.hour === hr && r.type === 'click').length);
    }
    expect(h.max).toBe(Math.max(...h.impressions.flat()));
    expect(h.byHour.reduce((a, b) => a + b, 0)).toBe(raw.filter((r) => r.type === 'impression').length);
    expect(h.byDay.reduce((a, b) => a + b, 0)).toBe(raw.filter((r) => r.type === 'impression').length);
  });

  it('أعلى خانة ونسبة النقر، وتتجاهل القيم الشاذة', () => {
    const h = buildHeatmap([
      { dow: 5, hour: 20, type: 'impression', n: 40 }, { dow: 5, hour: 20, type: 'click', n: 4 },
      { dow: 6, hour: 9, type: 'impression', n: 10 }, { dow: 6, hour: 9, type: 'click', n: 5 },
      { dow: 9, hour: 3, type: 'impression', n: 999 }, { dow: 1, hour: 24, type: 'impression', n: 999 },
    ], 'ctr');
    expect(h.peak).toEqual({ dow: 6, label: 'السبت', hour: 9, value: 50 });
    expect(h.ctr[6][20]).toBe(10);
    expect(h.impressions.flat().reduce((a, b) => a + b, 0)).toBe(50);
    expect(buildHeatmap([], 'clicks').peak).toBeNull();
  });
});

describe('السلسلة والمقارنة والفلاتر', () => {
  it('سلسلة متصلة بأصفار للأيام الفارغة', () => {
    const s = buildSeries('2026-11-28', '2026-12-02', [
      { day: '2026-11-29', type: 'impression', n: 8 }, { day: '2026-11-29', type: 'click', n: 2 }, { day: '2026-12-05', type: 'impression', n: 5 },
    ]);
    expect(s.map((p) => p.day)).toEqual(['2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
    expect(s[1]).toEqual({ day: '2026-11-29', impressions: 8, clicks: 2, ctr: 25 });
    expect(s[0].impressions + s[2].impressions).toBe(0);
  });

  it('الفترة السابقة المساوية ونسبة التغيّر', () => {
    expect(previousRange('2026-11-01', '2026-11-30')).toEqual({ from: '2026-10-02', to: '2026-10-31' });
    expect(previousRange('2026-11-27', '2026-11-27')).toEqual({ from: '2026-11-26', to: '2026-11-26' });
    expect(delta(150, 100)).toBe(50);
    expect(delta(1, 3)).toBe(-66.7);
    expect(delta(5, 0)).toBeNull();
  });

  it('فلاتر الأيام والساعات', () => {
    expect(parseDays('5,6,5, 7')).toEqual([5, 6, 7]);
    expect(parseDays('')).toEqual([]);
    expect(() => parseDays('0,8')).toThrow();
    expect(parseHour('0')).toBe(0);
    expect(parseHour(undefined)).toBeUndefined();
    expect(() => parseHour('24')).toThrow();
  });
});
