/**
 * «طريق التأهل» (الجلسة 12) — منطق خالص بلا قاعدة بيانات (يُختبر في test/road.test.ts).
 *
 * يجمع في رد واحد ما تعرضه شاشة كأس العالم:
 *  - جداول المجموعات (أو الدوري) مع منطقة التأهل لكل صف،
 *  - شجرة الأدوار الإقصائية كاملة حتى النهائي: المباريات الموجودة بنتائجها، والأدوار القادمة بخانات
 *    «الفائز من…» أو «أول (أ)»، ومع المجموعات قبل الإقصاء: المتأهلون المتوقعون حسب الترتيب الحالي،
 *  - البطل عند حسم النهائي.
 * وأفضل اللاعبين: أفضل 3 هدافين (بترتيب يتشارك فيه المتساوون) وقائمة أفضل اللاعبين.
 */
import { crossQualifiers, knockoutStage, knockoutWinner, type KoMatch } from './fixtures';
import type { StandingRow, StandingTeam } from './standings';

export const KO_STAGES = ['r64', 'r32', 'r16', 'qf', 'sf', 'final'];

export type Zone = 'qualify' | 'leader' | null;
export type RoadRow<T extends StandingTeam> = StandingRow<T> & { zone: Zone };

/** خانة فريق في الشجرة: الفريق إن عُرف، ووصف الخانة («أول (أ)» أو «الفائز من م3»)، وهل هو متوقع لم يُحسم */
export interface Slot<T> { team: T | null; label: string | null; projected: boolean }

export interface BracketMatch<T> {
  /** رقم المباراة إن وُلِّدت، وإلا null (دور لم يُولَّد بعد) */
  id: number | null;
  /** رقم الخانة داخل الدور (1، 2، ...) — يُستخدم في «الفائز من م3» */
  slot: number;
  kickoffAt: Date | string | null;
  homeScore: number | null; awayScore: number | null;
  homePens: number | null; awayPens: number | null;
  resultStatus: string | null;
  winnerId: number | null;
  home: Slot<T>; away: Slot<T>;
}
export interface BracketRound<T> { stage: string; matches: BracketMatch<T>[] }

export interface RoadKoMatch extends KoMatch {
  id: number; stage: string | null; round: number | null; kickoffAt: Date | string | null;
}

const RANK = ['أول', 'ثاني'];

/** صفوف الجدول مع منطقة التأهل: أول qualifiers في المجموعة، أو المتصدر في الدوري */
export function withZones<T extends StandingTeam>(rows: StandingRow<T>[], qualifiers: number | null): RoadRow<T>[] {
  return rows.map((r) => ({
    ...r,
    zone: qualifiers ? (r.position <= qualifiers ? 'qualify' : null) : r.position === 1 && r.played > 0 ? 'leader' : null,
  }));
}

/**
 * خانات الدور الإقصائي الأول من المجموعات بترتيب الشجرة نفسه الذي يستخدمه «الدور التالي» (crossQualifiers).
 * الفريق يظهر متوقعاً (projected) من الترتيب الحالي متى لعب مباراة على الأقل في مجموعته.
 */
export function groupQualifierSlots<T extends StandingTeam>(groups: { label: string; rows: StandingRow<T>[] }[], perGroup: 1 | 2): [Slot<T>, Slot<T>][] {
  // نمرّر «مواقع» (مجموعة، مركز) مرمّزة كأرقام إلى crossQualifiers نفسها لنحصل على الترتيب ذاته
  const code = (g: number, rank: number) => g * 10 + rank;
  const tables = groups.map((_, g) => [code(g, 0), code(g, 1)]);
  const slot = (c: number): Slot<T> => {
    const g = Math.floor(c / 10), rank = c % 10;
    const grp = groups[g];
    const row = grp?.rows[rank];
    const started = !!grp && grp.rows.some((r) => r.played > 0);
    return { team: started && row ? row.team : null, label: `${RANK[rank]} (${grp?.label ?? '؟'})`, projected: true };
  };
  return crossQualifiers(tables, perGroup).map((p) => [slot(p.home), slot(p.away)]);
}

/**
 * شجرة الإقصاء كاملة.
 * firstSize: عدد فرق الدور الإقصائي الأول (قوة للعدد 2)، و firstSlots: خانات الدور الأول إن لم يُولَّد بعد.
 * الأدوار الموجودة تُؤخذ بترتيب رقم الجولة، والمباريات داخلها بترتيب رقمها (نفس ترتيب الأزواج عند التوليد).
 */
export function buildBracket<T extends StandingTeam>(
  firstSize: number, ko: RoadKoMatch[], teams: Map<number, T>, firstSlots?: [Slot<T>, Slot<T>][],
): { rounds: BracketRound<T>[]; champion: T | null } {
  if (firstSize < 2) return { rounds: [], champion: null };
  const existing = [...new Set(ko.map((m) => m.round ?? 1))].sort((a, b) => a - b)
    .map((r) => ko.filter((m) => (m.round ?? 1) === r).sort((a, b) => a.id - b.id));
  const rounds: BracketRound<T>[] = [];
  const team = (id: number) => teams.get(id) ?? null;

  let size = firstSize;
  for (let i = 0; size >= 2; i++, size /= 2) {
    const count = size / 2;
    const real = existing[i];
    const prev = rounds[i - 1];
    const matches: BracketMatch<T>[] = [];
    for (let k = 0; k < count; k++) {
      const m = real?.[k];
      if (m) {
        const winnerId = knockoutWinner(m);
        matches.push({
          id: m.id, slot: k + 1, kickoffAt: m.kickoffAt,
          homeScore: m.homeScore, awayScore: m.awayScore, homePens: m.homePens ?? null, awayPens: m.awayPens ?? null,
          resultStatus: m.resultStatus, winnerId,
          home: { team: team(m.homeTeamId), label: null, projected: false },
          away: { team: team(m.awayTeamId), label: null, projected: false },
        });
        continue;
      }
      let home: Slot<T>, away: Slot<T>;
      if (prev) {
        const from = (j: number): Slot<T> => {
          const pm = prev.matches[j];
          const w = pm?.winnerId != null ? team(pm.winnerId) : null;
          return { team: w, label: `الفائز من م${j + 1}`, projected: false };
        };
        [home, away] = [from(2 * k), from(2 * k + 1)];
      } else if (firstSlots?.[k]) {
        [home, away] = firstSlots[k];
      } else {
        [home, away] = [{ team: null, label: 'بعد القرعة', projected: false }, { team: null, label: 'بعد القرعة', projected: false }];
      }
      matches.push({ id: null, slot: k + 1, kickoffAt: null, homeScore: null, awayScore: null, homePens: null, awayPens: null, resultStatus: null, winnerId: null, home, away });
    }
    rounds.push({ stage: knockoutStage(size), matches });
  }
  const final = rounds.at(-1)?.matches[0];
  return { rounds, champion: final?.winnerId != null ? team(final.winnerId) : null };
}

/** عدد فرق الدور الإقصائي الأول حسب نظام البطولة */
export function firstKnockoutSize(format: string, approvedTeams: number, groupCount: number, perGroup: number | null, ko: RoadKoMatch[]): number {
  if (format === 'league') return 0;
  if (ko.length) {
    const first = Math.min(...ko.map((m) => m.round ?? 1));
    return ko.filter((m) => (m.round ?? 1) === first).length * 2;
  }
  if (format === 'knockout') return approvedTeams >= 2 && (approvedTeams & (approvedTeams - 1)) === 0 ? approvedTeams : 0;
  const n = groupCount * (perGroup ?? 0);
  return n >= 2 ? n : 0;
}

// ───────────── أفضل اللاعبين ─────────────

export interface StarEvent { playerId: number; teamId: number; type: string; matchId: number }
export interface StarLine { playerId: number; teamId: number; goals: number; mvp: number; yellow: number; red: number; matches: number }

/**
 * إحصاء اللاعبين من أحداث المباريات المحسوبة.
 * «أفضل اللاعبين»: الأكثر نيلاً لجائزة أفضل لاعب في المباراة، ثم الأهداف، ثم الأقل بطاقات.
 * الهدف العكسي لا يُحسب للاعب (يُسجَّل للفريق المستفيد). فريق اللاعب = فريق آخر حدث له.
 */
export function starLines(events: StarEvent[]): StarLine[] {
  const by = new Map<number, StarLine & { ms: Set<number>; lastMatch: number }>();
  for (const e of events) {
    if (e.type === 'own_goal') continue;
    let s = by.get(e.playerId);
    if (!s) { s = { playerId: e.playerId, teamId: e.teamId, goals: 0, mvp: 0, yellow: 0, red: 0, matches: 0, ms: new Set(), lastMatch: e.matchId }; by.set(e.playerId, s); }
    if (e.matchId >= s.lastMatch) { s.teamId = e.teamId; s.lastMatch = e.matchId; }
    s.ms.add(e.matchId);
    if (e.type === 'goal') s.goals++;
    else if (e.type === 'mvp') s.mvp++;
    else if (e.type === 'yellow_card') s.yellow++;
    else if (e.type === 'red_card') s.red++;
  }
  return [...by.values()].map(({ ms, lastMatch: _l, ...s }) => ({ ...s, matches: ms.size }));
}

/** ترتيب تنافسي: المتساوون يتشاركون المركز (1، 1، 3) */
export function competitionRanks<X>(items: X[], key: (x: X) => number): (X & { rank: number })[] {
  let rank = 0, prev: number | null = null;
  return items.map((x, i) => {
    const k = key(x);
    if (k !== prev) { rank = i + 1; prev = k; }
    return { ...x, rank };
  });
}

/** أفضل 3 هدافين: كل من مركزه 1–3 (قد يزيدون عن 3 عند التساوي، بحد 5) */
export function topScorers(lines: StarLine[], name: (id: number) => string): (StarLine & { rank: number })[] {
  const sorted = lines.filter((l) => l.goals > 0)
    .sort((a, b) => b.goals - a.goals || b.mvp - a.mvp || name(a.playerId).localeCompare(name(b.playerId), 'ar'));
  return competitionRanks(sorted, (l) => l.goals).filter((l) => l.rank <= 3).slice(0, 5);
}

export function bestPlayers(lines: StarLine[], name: (id: number) => string, limit = 20): (StarLine & { rank: number })[] {
  const sorted = lines.filter((l) => l.mvp > 0 || l.goals > 0)
    .sort((a, b) => b.mvp - a.mvp || b.goals - a.goals || (a.red * 2 + a.yellow) - (b.red * 2 + b.yellow) || name(a.playerId).localeCompare(name(b.playerId), 'ar'));
  return competitionRanks(sorted, (l) => l.mvp * 1000 + l.goals).slice(0, limit);
}
