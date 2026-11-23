/**
 * القرعة وتوليد المباريات والجدولة — منطق خالص بلا قاعدة بيانات (يُختبر في test/fixtures.test.ts).
 *
 * القرعة تعتمد بذرة عشوائية (seed) تُحفظ في سجل التدقيق مع ترتيب الفرق قبل القرعة،
 * فيمكن لأي شخص إعادة حساب النتيجة نفسها والتأكد أنها لم تُعدَّل يدوياً.
 */
import { createHash, randomBytes } from 'node:crypto';

export type Pair = { home: number; away: number };

// ───────────── العشوائية القابلة للتحقق ─────────────

export function newSeed(): string {
  return randomBytes(16).toString('hex');
}

/** مولّد أرقام حتمي من البذرة: sha256(seed:counter) */
export function seededRandom(seed: string): () => number {
  let counter = 0;
  return () => {
    const h = createHash('sha256').update(`${seed}:${counter++}`).digest();
    return h.readUInt32BE(0) / 0x1_0000_0000;
  };
}

/** خلط Fisher–Yates حتمي (لا يغيّر المصفوفة الأصلية) */
export function shuffle<T>(items: readonly T[], seed: string): T[] {
  const rnd = seededRandom(seed);
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ───────────── الدوري (كل فريق يلاقي الجميع) ─────────────

/**
 * جدول دوري بطريقة الدائرة (Berger): كل جولة يلعب فيها كل فريق مرة واحدة،
 * ومع العدد الفردي يرتاح فريق واحد في كل جولة. الذهاب والإياب يعكس الأرض.
 * الناتج: مصفوفة جولات، كل جولة مصفوفة مباريات.
 */
export function roundRobin(teamIds: readonly number[], doubleRound = false): Pair[][] {
  if (teamIds.length < 2) return [];
  const BYE = -1;
  const t = teamIds.length % 2 === 0 ? [...teamIds] : [...teamIds, BYE];
  const n = t.length;
  const fixed = t[n - 1];
  const rot = t.slice(0, n - 1);
  const rounds: Pair[][] = [];
  for (let r = 0; r < n - 1; r++) {
    const round: Pair[] = [];
    // الفريق الثابت: يتبادل الأرض بين الجولات
    const first = rot[r % (n - 1)];
    round.push(r % 2 === 0 ? { home: first, away: fixed } : { home: fixed, away: first });
    for (let i = 1; i < n / 2; i++) {
      const a = rot[(r + i) % (n - 1)];
      const b = rot[(r + n - 1 - i) % (n - 1)];
      round.push(i % 2 === 1 ? { home: b, away: a } : { home: a, away: b });
    }
    rounds.push(round.filter((p) => p.home !== BYE && p.away !== BYE));
  }
  if (!doubleRound) return rounds;
  return [...rounds, ...rounds.map((round) => round.map((p) => ({ home: p.away, away: p.home })))];
}

// ───────────── المجموعات ─────────────

export const GROUP_LABELS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح'] as const;

/** توزيع الفرق على المجموعات بعد خلطها: الفرق تُوزَّع بالتناوب فتتساوى الأحجام (فرق لا يتجاوز 1). */
export function drawGroups(teamIds: readonly number[], groupCount: number, seed: string): { label: string; teamIds: number[] }[] {
  const order = shuffle(teamIds, seed);
  const groups = Array.from({ length: groupCount }, (_, i) => ({ label: GROUP_LABELS[i], teamIds: [] as number[] }));
  order.forEach((id, i) => groups[i % groupCount].teamIds.push(id));
  return groups;
}

// ───────────── خروج المغلوب ─────────────

export const isPowerOfTwo = (n: number) => n >= 2 && (n & (n - 1)) === 0;

/** رمز الدور حسب عدد الفرق المتبقية */
export function knockoutStage(teamsLeft: number): string {
  return ({ 2: 'final', 4: 'sf', 8: 'qf', 16: 'r16', 32: 'r32', 64: 'r64' } as Record<number, string>)[teamsLeft] ?? `r${teamsLeft}`;
}

/** أزواج الدور الأول: الترتيب المعطى هو ترتيب الشجرة (1 ضد 2، 3 ضد 4 ...) */
export function pairUp(ordered: readonly number[]): Pair[] {
  const out: Pair[] = [];
  for (let i = 0; i + 1 < ordered.length; i += 2) out.push({ home: ordered[i], away: ordered[i + 1] });
  return out;
}

/**
 * المتأهلون من المجموعات بترتيب الشجرة.
 * متأهل واحد: أول (أ) ضد أول (ب)، أول (ج) ضد أول (د)...
 * متأهلان: أول (أ) ضد ثاني (ب)، أول (ب) ضد ثاني (أ)... ومع مجموعة واحدة: الأول ضد الثاني.
 * standings: لكل مجموعة الفرق مرتبة من الأول.
 */
export function crossQualifiers(standings: number[][], perGroup: 1 | 2): Pair[] {
  if (standings.length === 1) return perGroup === 2 ? [{ home: standings[0][0], away: standings[0][1] }] : [];
  const pairs: Pair[] = [];
  for (let g = 0; g + 1 < standings.length; g += 2) {
    const [A, B] = [standings[g], standings[g + 1]];
    if (perGroup === 1) pairs.push({ home: A[0], away: B[0] });
    else pairs.push({ home: A[0], away: B[1] }, { home: B[0], away: A[1] });
  }
  return pairs;
}

export interface KoMatch {
  homeTeamId: number; awayTeamId: number;
  homeScore: number | null; awayScore: number | null;
  homePens?: number | null; awayPens?: number | null;
  resultStatus: string;
}

/** الفائز في مباراة إقصائية محسومة (معتمدة أو نهائية)، أو null إن لم تُحسم بعد أو كانت تعادلاً بلا ركلات ترجيح */
export function knockoutWinner(m: KoMatch): number | null {
  if (!['confirmed', 'final'].includes(m.resultStatus) || m.homeScore == null || m.awayScore == null) return null;
  if (m.homeScore !== m.awayScore) return m.homeScore > m.awayScore ? m.homeTeamId : m.awayTeamId;
  if (m.homePens == null || m.awayPens == null || m.homePens === m.awayPens) return null;
  return m.homePens > m.awayPens ? m.homeTeamId : m.awayTeamId;
}

// ───────────── الجدولة ─────────────

export interface ScheduleOptions {
  /** أول يوم ممكن YYYY-MM-DD بتوقيت بغداد */
  startDate: string;
  /** أيام اللعب: 0 الأحد … 5 الجمعة 6 السبت */
  weekdays: number[];
  /** أوقات الانطلاق HH:MM بتوقيت بغداد */
  times: string[];
  /** الملاعب المتاحة (ملعب واحد على الأقل) */
  venues: string[];
  /** أيام الراحة الدنيا بين جولتين متتاليتين (افتراضي 0) */
  restDays?: number;
}

export interface Slot { kickoffAt: Date; venue: string; day: string }

const BAGHDAD = '+03:00'; // العراق بلا توقيت صيفي

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();

/**
 * توزيع الجولات على أيام اللعب: كل جولة تبدأ في يوم لعب جديد، ومبارياتها توزَّع على
 * (الأوقات × الملاعب) في ذلك اليوم، وما يزيد ينتقل ليوم اللعب التالي. لا يلعب فريق مرتين في اليوم نفسه.
 * الناتج بنفس شكل الجولات: لكل مباراة موعدها وملعبها.
 */
export function schedule(rounds: readonly Pair[][], opts: ScheduleOptions): Slot[][] {
  const times = [...opts.times].sort();
  const perDay = times.length * opts.venues.length;
  if (perDay === 0 || opts.weekdays.length === 0) throw new Error('no_slots');
  let day = opts.startDate;
  const nextPlayDay = (from: string) => {
    for (let i = 0; i < 400; i++) {
      const d = addDays(from, i);
      if (opts.weekdays.includes(weekday(d))) return d;
    }
    throw new Error('no_play_day');
  };
  const out: Slot[][] = [];
  let lastDay: string | null = null;
  for (const round of rounds) {
    day = nextPlayDay(lastDay ? addDays(lastDay, 1 + (opts.restDays ?? 0)) : day);
    const slots: Slot[] = [];
    let used = 0;
    const busy = new Set<number>();
    for (const p of round) {
      if (used === perDay || busy.has(p.home) || busy.has(p.away)) {
        day = nextPlayDay(addDays(day, 1));
        used = 0;
        busy.clear();
      }
      const time = times[Math.floor(used / opts.venues.length)];
      const venue = opts.venues[used % opts.venues.length];
      slots.push({ kickoffAt: new Date(`${day}T${time}:00${BAGHDAD}`), venue, day });
      busy.add(p.home); busy.add(p.away);
      used++;
    }
    lastDay = day;
    out.push(slots);
  }
  return out;
}
