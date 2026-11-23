import { describe, expect, it } from 'vitest';
import {
  crossQualifiers, drawGroups, isPowerOfTwo, knockoutStage, knockoutWinner, pairUp, roundRobin, schedule, shuffle,
} from '../src/tournaments/fixtures';

const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('الدوري (كل فريق يلاقي الجميع)', () => {
  for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 16]) {
    it(`${n} فرق: كل زوج مرة واحدة، وكل فريق مرة في الجولة، والأرض متوازنة`, () => {
      const rounds = roundRobin(ids(n));
      expect(rounds).toHaveLength(n % 2 === 0 ? n - 1 : n);
      const pairs = new Set<string>();
      const home = new Map<number, number>();
      for (const round of rounds) {
        const seen = new Set<number>();
        for (const p of round) {
          expect(seen.has(p.home) || seen.has(p.away)).toBe(false);
          seen.add(p.home); seen.add(p.away);
          pairs.add([p.home, p.away].sort((a, b) => a - b).join('-'));
          home.set(p.home, (home.get(p.home) ?? 0) + 1);
        }
        // مع العدد الفردي يرتاح فريق واحد فقط
        expect(seen.size).toBe(n % 2 === 0 ? n : n - 1);
      }
      expect(pairs.size).toBe((n * (n - 1)) / 2);
      for (const id of ids(n)) expect(Math.abs(2 * (home.get(id) ?? 0) - (n - 1))).toBeLessThanOrEqual(1);
    });
  }

  it('الذهاب والإياب: كل فريق يستضيف الآخر مرة واحدة بالضبط', () => {
    const rounds = roundRobin(ids(6), true);
    expect(rounds).toHaveLength(10);
    const directed = new Set(rounds.flat().map((p) => `${p.home}>${p.away}`));
    expect(directed.size).toBe(30);
  });
});

describe('القرعة', () => {
  it('حتمية بالبذرة: نفس البذرة ← نفس النتيجة، وبذرة أخرى ← ترتيب آخر', () => {
    expect(shuffle(ids(16), 'abc')).toEqual(shuffle(ids(16), 'abc'));
    expect(shuffle(ids(16), 'abc')).not.toEqual(shuffle(ids(16), 'abd'));
    expect([...shuffle(ids(16), 'abc')].sort((a, b) => a - b)).toEqual(ids(16));
  });

  it('المجموعات متساوية الحجم (فرق لا يتجاوز 1) وكل فريق في مجموعة واحدة', () => {
    const g = drawGroups(ids(10), 3, 'seed');
    expect(g.map((x) => x.label)).toEqual(['أ', 'ب', 'ج']);
    expect(g.map((x) => x.teamIds.length)).toEqual([4, 3, 3]);
    expect(g.flatMap((x) => x.teamIds).sort((a, b) => a - b)).toEqual(ids(10));
  });
});

describe('خروج المغلوب', () => {
  it('الأدوار وقوى العدد 2', () => {
    expect([2, 4, 8, 16].map(knockoutStage)).toEqual(['final', 'sf', 'qf', 'r16']);
    expect([2, 4, 8, 16, 32].every(isPowerOfTwo)).toBe(true);
    expect([0, 1, 3, 6, 12].some(isPowerOfTwo)).toBe(false);
    expect(pairUp([5, 6, 7, 8])).toEqual([{ home: 5, away: 6 }, { home: 7, away: 8 }]);
  });

  it('تقاطع المتأهلين من المجموعات', () => {
    expect(crossQualifiers([[1, 2], [3, 4]], 2)).toEqual([{ home: 1, away: 4 }, { home: 3, away: 2 }]);
    expect(crossQualifiers([[1], [2], [3], [4]], 1)).toEqual([{ home: 1, away: 2 }, { home: 3, away: 4 }]);
    expect(crossQualifiers([[9, 8, 7]], 2)).toEqual([{ home: 9, away: 8 }]);
  });

  it('الفائز: بالنتيجة، ثم بركلات الترجيح، ولا فائز قبل الاعتماد', () => {
    const m = { homeTeamId: 1, awayTeamId: 2, homeScore: 2, awayScore: 1, resultStatus: 'final' };
    expect(knockoutWinner(m)).toBe(1);
    expect(knockoutWinner({ ...m, resultStatus: 'provisional' })).toBeNull();
    expect(knockoutWinner({ ...m, resultStatus: 'disputed' })).toBeNull();
    expect(knockoutWinner({ ...m, homeScore: 1 })).toBeNull();
    expect(knockoutWinner({ ...m, homeScore: 1, homePens: 3, awayPens: 4 })).toBe(2);
  });
});

describe('الجدولة بتوقيت بغداد', () => {
  const opts = { startDate: '2026-12-01', weekdays: [5, 6], times: ['18:00', '16:00'], venues: ['ملعب الكرادة'] };

  it('8 فرق على ملعب واحد ووقتين: كل جولة في نهاية أسبوع (جمعة وسبت)', () => {
    const slots = schedule(roundRobin(ids(8)), opts);
    expect(slots).toHaveLength(7);
    // 2026-12-01 ثلاثاء ← أول جمعة 12-04
    expect(slots[0].map((s) => s.day)).toEqual(['2026-12-04', '2026-12-04', '2026-12-05', '2026-12-05']);
    expect(slots[0][0].kickoffAt.toISOString()).toBe('2026-12-04T13:00:00.000Z'); // 16:00 بغداد
    expect(slots[0][1].kickoffAt.toISOString()).toBe('2026-12-04T15:00:00.000Z'); // 18:00 بغداد
    expect(slots[1][0].day).toBe('2026-12-11');
    for (const s of slots.flat()) expect([5, 6]).toContain(new Date(`${s.day}T00:00:00Z`).getUTCDay());
    // لا يتكرر (يوم، وقت، ملعب)
    const keys = slots.flat().map((s) => `${s.kickoffAt.toISOString()}|${s.venue}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('ملعبان: مباراتان في الوقت نفسه، والجولة في يوم واحد', () => {
    const slots = schedule(roundRobin(ids(8)), { ...opts, venues: ['أ', 'ب'] });
    expect(new Set(slots[0].map((s) => s.day)).size).toBe(1);
    expect(slots[0].map((s) => s.venue)).toEqual(['أ', 'ب', 'أ', 'ب']);
  });

  it('أيام الراحة بين الجولات', () => {
    const slots = schedule(roundRobin(ids(4)), { startDate: '2026-12-01', weekdays: [0, 1, 2, 3, 4, 5, 6], times: ['17:00'], venues: ['م'], restDays: 2 });
    expect(slots.map((r) => r[0].day)).toEqual(['2026-12-01', '2026-12-05', '2026-12-09']);
    expect(slots[0][1].day).toBe('2026-12-02');
  });
});
