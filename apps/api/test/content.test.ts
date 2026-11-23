/**
 * الجلسة 5 — منطق خالص: تجميع تقرير الراعي، ملف CSV، نسبة النقر، ونطاق دور «راعٍ» في مصفوفة الصلاحيات.
 */
import { describe, expect, it } from 'vitest';
import { ctr, hasPermission, permissionsOf, type Role } from '@saha/shared';
import { buildReport, reportCsv } from '../src/content/report';

describe('نسبة النقر', () => {
  it('بمنزلتين، وصفر بلا ظهور', () => {
    expect(ctr(0, 0)).toBe(0);
    expect(ctr(3, 1)).toBe(33.33);
    expect(ctr(8, 2)).toBe(25);
    expect(ctr(7, 7)).toBe(100);
  });
});

describe('تقرير الراعي', () => {
  const slides = [
    { id: 1, titleAr: 'شريحة أ', type: 'sponsor', status: 'published' },
    { id: 2, titleAr: 'شريحة ب', type: 'sponsor', status: 'archived' },
  ];

  it('يطابق عدّاً مستقلاً للأحداث الخام', () => {
    // أحداث خام عشوائية ثابتة البذرة: (شريحة، يوم، نوع)
    let x = 7;
    const rnd = (n: number) => { x = (x * 1103515245 + 12345) % 2 ** 31; return x % n; };
    const raw = Array.from({ length: 500 }, () => ({
      slideId: [1, 2, 99][rnd(3)], day: `2026-11-${String(10 + rnd(5)).padStart(2, '0')}`, type: rnd(4) === 0 ? 'click' : 'impression',
    }));
    // ما يرجعه GROUP BY
    const grouped = new Map<string, number>();
    for (const e of raw) grouped.set(`${e.slideId}|${e.day}|${e.type}`, (grouped.get(`${e.slideId}|${e.day}|${e.type}`) ?? 0) + 1);
    const rows = [...grouped].map(([k, n]) => { const [s, day, type] = k.split('|'); return { slideId: Number(s), day, type, n }; });

    const r = buildReport(slides, rows);
    for (const s of slides) {
      const mine = raw.filter((e) => e.slideId === s.id);
      const out = r.slides.find((o) => o.id === s.id)!;
      expect(out.impressions).toBe(mine.filter((e) => e.type === 'impression').length);
      expect(out.clicks).toBe(mine.filter((e) => e.type === 'click').length);
      for (const d of out.days) {
        expect(d.impressions).toBe(mine.filter((e) => e.day === d.day && e.type === 'impression').length);
        expect(d.clicks).toBe(mine.filter((e) => e.day === d.day && e.type === 'click').length);
      }
      expect(out.days.map((d) => d.day)).toEqual([...new Set(mine.map((e) => e.day))].sort());
    }
    // شريحة راعٍ آخر (99) لا تدخل المجموع
    const own = raw.filter((e) => e.slideId !== 99);
    expect(r.totals.impressions).toBe(own.filter((e) => e.type === 'impression').length);
    expect(r.totals.clicks).toBe(own.filter((e) => e.type === 'click').length);
    expect(r.totals.ctr).toBe(ctr(r.totals.impressions, r.totals.clicks));
  });

  it('شريحة بلا أحداث تظهر بأصفار', () => {
    const r = buildReport(slides, []);
    expect(r.totals).toEqual({ impressions: 0, clicks: 0, ctr: 0 });
    expect(r.slides.map((s) => s.days.length)).toEqual([0, 0]);
  });

  it('CSV بعلامة UTF-8 ومجموع، ويمنع حقن الصيغ', () => {
    const r = buildReport([{ id: 5, titleAr: '=HYPERLINK("x"), "عرض"', type: 'sponsor', status: 'published' }], [
      { slideId: 5, day: '2026-11-20', type: 'impression', n: 4 },
      { slideId: 5, day: '2026-11-20', type: 'click', n: 1 },
    ]);
    const csv = reportCsv(r);
    expect(csv.startsWith('﻿التاريخ,')).toBe(true);
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe(`2026-11-20,"'=HYPERLINK(""x""), ""عرض""",4,1,25`);
    expect(lines[2]).toBe('المجموع,,4,1,25');
  });
});

describe('دور «راعٍ» مقيّد براعيه', () => {
  const viewer = [{ role: 'sponsor_viewer' as Role, sponsorId: 3 }];
  it('يرى تقرير راعيه فقط، ولا شيء غيره', () => {
    expect(hasPermission(viewer, 'sponsor.reports.view', { sponsorId: 3 })).toBe(true);
    expect(hasPermission(viewer, 'sponsor.reports.view', { sponsorId: 4 })).toBe(false);
    expect(hasPermission(viewer, 'sponsor.reports.view', {})).toBe(false);
    expect(permissionsOf(viewer)).toEqual(['sponsor.reports.view']);
  });
  it('مدير الرعاة يرى كل الرعاة بدخول TOTP فقط', () => {
    const mgr = [{ role: 'sponsor_manager' as Role }];
    expect(hasPermission(mgr, 'sponsor.reports.view', { sponsorId: 4 }, true)).toBe(true);
    expect(hasPermission(mgr, 'sponsor.reports.view', { sponsorId: 4 }, false)).toBe(false);
    expect(hasPermission(mgr, 'content.publish', {}, true)).toBe(false);
  });
});
