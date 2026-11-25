import { describe, expect, it } from 'vitest';
import { computeStandings } from '../src/tournaments/standings';
import { bestPlayers, buildBracket, firstKnockoutSize, groupQualifierSlots, starLines, topScorers, withZones, type RoadKoMatch } from '../src/tournaments/road';

const T = (id: number, nameAr: string) => ({ id, nameAr });
const teams = [T(1, 'أسود'), T(2, 'برق'), T(3, 'جبل'), T(4, 'دجلة'), T(5, 'هور'), T(6, 'وادي'), T(7, 'زاب'), T(8, 'حمرين')];
const byId = new Map(teams.map((t) => [t.id, t]));
const res = (h: number, a: number, hs: number, as: number) => ({ homeTeamId: h, awayTeamId: a, homeScore: hs, awayScore: as, resultStatus: 'final' });
let nextId = 100;
const ko = (round: number, stage: string, h: number, a: number, hs: number | null = null, as: number | null = null, pens?: [number, number]): RoadKoMatch => ({
  id: nextId++, round, stage, kickoffAt: null, homeTeamId: h, awayTeamId: a, homeScore: hs, awayScore: as,
  homePens: pens?.[0] ?? null, awayPens: pens?.[1] ?? null, resultStatus: hs === null ? 'scheduled' : 'final',
});

describe('طريق التأهل', () => {
  it('منطقة التأهل: أول متأهلَين في المجموعة، والمتصدر في الدوري بعد أول مباراة', () => {
    const rows = computeStandings(teams.slice(0, 4), [res(1, 2, 2, 0), res(3, 4, 1, 1)]);
    expect(withZones(rows, 2).map((r) => r.zone)).toEqual(['qualify', 'qualify', null, null]);
    expect(withZones(rows, null).map((r) => r.zone)).toEqual(['leader', null, null, null]);
    expect(withZones(computeStandings(teams.slice(0, 4), []), null).every((r) => r.zone === null)).toBe(true);
  });

  it('المجموعات قبل الإقصاء: خانات «أول (أ)» ضد «ثاني (ب)» بالمتوقعين من الترتيب الحالي', () => {
    const A = computeStandings(teams.slice(0, 4), [res(2, 1, 3, 0)]); // برق أولاً
    const B = computeStandings(teams.slice(4, 8), []);                // لم تُلعب: بلا أسماء
    const slots = groupQualifierSlots([{ label: 'أ', rows: A }, { label: 'ب', rows: B }], 2);
    expect(slots.map(([h, a]) => [h.label, a.label])).toEqual([['أول (أ)', 'ثاني (ب)'], ['أول (ب)', 'ثاني (أ)']]);
    expect(slots[0][0].team?.id).toBe(2);
    expect(slots[0][1].team).toBeNull();
    expect(slots.every(([h, a]) => h.projected && a.projected)).toBe(true);

    const size = firstKnockoutSize('groups_knockout', 8, 2, 2, []);
    expect(size).toBe(4);
    const { rounds, champion } = buildBracket(size, [], byId, slots);
    expect(rounds.map((r) => [r.stage, r.matches.length])).toEqual([['sf', 2], ['final', 1]]);
    expect(rounds[1].matches[0].home.label).toBe('الفائز من م1');
    expect(champion).toBeNull();
  });

  it('خروج المغلوب: الأدوار الموجودة بنتائجها، والفائز ينتقل لخانته، والبطل بعد النهائي', () => {
    nextId = 100;
    const qf = [ko(1, 'qf', 1, 2, 2, 1), ko(1, 'qf', 3, 4, 1, 1, [4, 3]), ko(1, 'qf', 5, 6, 0, 1), ko(1, 'qf', 7, 8)];
    expect(firstKnockoutSize('knockout', 8, 0, null, qf)).toBe(8);
    let b = buildBracket(8, qf, byId);
    expect(b.rounds.map((r) => r.stage)).toEqual(['qf', 'sf', 'final']);
    expect(b.rounds[0].matches.map((m) => m.winnerId)).toEqual([1, 3, 6, null]);
    const sf = b.rounds[1].matches;
    expect([sf[0].home.team?.id, sf[0].away.team?.id]).toEqual([1, 3]);
    expect([sf[1].home.team?.id, sf[1].away.team, sf[1].away.label]).toEqual([6, null, 'الفائز من م4']);

    const all = [...qf.slice(0, 3), { ...qf[3], homeScore: 3, awayScore: 0, resultStatus: 'final' }, ko(2, 'sf', 1, 3, 0, 2), ko(2, 'sf', 6, 7, 1, 0), ko(3, 'final', 3, 6, 2, 2, [5, 4])];
    b = buildBracket(8, all, byId);
    expect(b.rounds[2].matches[0].id).not.toBeNull();
    expect(b.champion?.id).toBe(3);
  });

  it('قبل القرعة: خانات «بعد القرعة»، والدوري بلا شجرة، وعدد غير صالح بلا شجرة', () => {
    const b = buildBracket(firstKnockoutSize('knockout', 4, 0, null, []), [], byId);
    expect(b.rounds[0].matches[0].home.label).toBe('بعد القرعة');
    expect(firstKnockoutSize('league', 8, 0, null, [])).toBe(0);
    expect(firstKnockoutSize('knockout', 6, 0, null, [])).toBe(0);
    expect(buildBracket(0, [], byId).rounds).toEqual([]);
  });
});

describe('أفضل اللاعبين', () => {
  const ev = (playerId: number, teamId: number, type: string, matchId: number) => ({ playerId, teamId, type, matchId });
  const names: Record<number, string> = { 1: 'علي', 2: 'حسن', 3: 'زيد', 4: 'كرار', 5: 'مصطفى' };
  const name = (id: number) => names[id];
  const lines = starLines([
    ev(1, 10, 'goal', 1), ev(1, 10, 'goal', 2), ev(1, 10, 'mvp', 2),
    ev(2, 20, 'goal', 1), ev(2, 20, 'goal', 3), ev(2, 20, 'yellow_card', 3),
    ev(3, 10, 'goal', 1), ev(3, 10, 'mvp', 1), ev(3, 10, 'mvp', 3),
    ev(4, 20, 'own_goal', 2), ev(4, 20, 'red_card', 2),
    ev(5, 30, 'goal', 4),
  ]);

  it('يحسب الأهداف والجوائز والبطاقات وعدد المباريات، والهدف العكسي لا يُحسب', () => {
    const one = lines.find((l) => l.playerId === 1)!;
    expect([one.goals, one.mvp, one.matches]).toEqual([2, 1, 2]);
    expect(lines.find((l) => l.playerId === 4)).toMatchObject({ goals: 0, red: 1 });
  });

  it('أفضل 3 هدافين بترتيب يتشارك فيه المتساوون', () => {
    const top = topScorers(lines, name);
    expect(top.map((l) => [l.playerId, l.rank])).toEqual([[1, 1], [2, 1], [3, 3], [5, 3]]);
  });

  it('أفضل اللاعبين: جوائز أفضل لاعب ثم الأهداف، ومن بلا هدف ولا جائزة لا يظهر', () => {
    const best = bestPlayers(lines, name);
    expect(best.map((l) => l.playerId)).toEqual([3, 1, 2, 5]);
    expect(best[0].rank).toBe(1);
  });
});
