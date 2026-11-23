import { describe, expect, it } from 'vitest';
import { computeStandings } from '../src/tournaments/standings';

const teams = [
  { id: 1, nameAr: 'أ' }, { id: 2, nameAr: 'ب' }, { id: 3, nameAr: 'ج' },
];
const m = (h: number, a: number, hs: number | null, as: number | null, resultStatus = 'final') =>
  ({ homeTeamId: h, awayTeamId: a, homeScore: hs, awayScore: as, resultStatus });

describe('جدول الترتيب', () => {
  it('يحسب الفوز والتعادل والنقاط وفارق الأهداف', () => {
    const rows = computeStandings(teams, [m(1, 2, 3, 1), m(2, 3, 1, 1, 'confirmed')]);
    expect(rows.map((r) => [r.team.id, r.played, r.points, r.goalDiff])).toEqual([
      [1, 1, 3, 2], [3, 1, 1, 0], [2, 2, 1, -2],
    ]);
    expect(rows[0].position).toBe(1);
  });

  it('النتيجة المؤقتة والمتنازع عليها لا تدخل الترتيب', () => {
    const rows = computeStandings(teams, [m(1, 2, 5, 0, 'provisional'), m(2, 3, 2, 0, 'disputed'), m(3, 1, null, null, 'scheduled')]);
    expect(rows.every((r) => r.played === 0 && r.points === 0)).toBe(true);
  });

  it('عند تساوي النقاط يُقدَّم الفارق ثم الأهداف المسجّلة', () => {
    const rows = computeStandings(teams, [m(1, 3, 1, 0), m(2, 3, 3, 1)]);
    expect(rows.map((r) => r.team.id)).toEqual([2, 1, 3]);
  });
});
