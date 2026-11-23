/**
 * حساب جدول الترتيب من نتائج المباريات.
 * تدخل الحساب النتائج المعتمدة والنهائية فقط؛ المؤقتة والمتنازع عليها لا تدخل (docs/PLAN.md).
 * الترتيب: النقاط ← فارق الأهداف ← الأهداف المسجّلة ← الاسم.
 */
export interface StandingTeam { id: number; nameAr: string }
export interface StandingMatch {
  homeTeamId: number; awayTeamId: number;
  homeScore: number | null; awayScore: number | null;
  resultStatus: string;
}
export interface StandingRow {
  position: number; team: StandingTeam;
  played: number; won: number; drawn: number; lost: number;
  goalsFor: number; goalsAgainst: number; goalDiff: number; points: number;
}

export const COUNTED_STATUSES = ['confirmed', 'final'] as const;

/** مباريات تدخل جدول الترتيب: الدوري ودور المجموعات (لا الأدوار الإقصائية) */
export const isGroupStage = (stage: string | null) => stage === null || stage === 'league' || stage === 'group';

export function computeStandings(teams: StandingTeam[], matches: StandingMatch[]): StandingRow[] {
  const rows = new Map<number, Omit<StandingRow, 'position'>>();
  for (const team of teams) {
    rows.set(team.id, { team, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 });
  }
  for (const m of matches) {
    if (!(COUNTED_STATUSES as readonly string[]).includes(m.resultStatus)) continue;
    if (m.homeScore === null || m.awayScore === null) continue;
    const home = rows.get(m.homeTeamId);
    const away = rows.get(m.awayTeamId);
    if (!home || !away) continue;
    home.played++; away.played++;
    home.goalsFor += m.homeScore; home.goalsAgainst += m.awayScore;
    away.goalsFor += m.awayScore; away.goalsAgainst += m.homeScore;
    if (m.homeScore > m.awayScore) { home.won++; away.lost++; home.points += 3; }
    else if (m.homeScore < m.awayScore) { away.won++; home.lost++; away.points += 3; }
    else { home.drawn++; away.drawn++; home.points++; away.points++; }
  }
  return [...rows.values()]
    .map((r) => ({ ...r, goalDiff: r.goalsFor - r.goalsAgainst }))
    .sort((a, b) => b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor || a.team.nameAr.localeCompare(b.team.nameAr, 'ar'))
    .map((r, i) => ({ position: i + 1, ...r }));
}
