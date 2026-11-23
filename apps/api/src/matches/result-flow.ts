/**
 * منطق النتائج الخالص (بلا قاعدة بيانات) — يُختبر وحده في test/result-flow.test.ts.
 * الانتقالات المسموحة في @saha/shared → RESULT_TRANSITIONS.
 */
import { DISPUTE_MAJORITY, RESULT_TRANSITIONS, type DisputeDecision, type ResultStatus } from '@saha/shared';

export const KNOCKOUT_STAGES = ['r64', 'r32', 'r16', 'qf', 'sf', 'final'];
export const isKnockout = (stage: string | null) => !!stage && KNOCKOUT_STAGES.includes(stage);

export function canTransition(from: ResultStatus, to: ResultStatus): boolean {
  return RESULT_TRANSITIONS[from].includes(to);
}

/** نهاية نافذة الاعتراض: وقت إدخال النتيجة + ساعات النافذة */
export function disputeDeadline(enteredAt: Date | null, windowHrs: number): Date | null {
  return enteredAt ? new Date(enteredAt.getTime() + windowHrs * 3600_000) : null;
}

export function windowOpen(enteredAt: Date | null, windowHrs: number, now = new Date()): boolean {
  const d = disputeDeadline(enteredAt, windowHrs);
  return !!d && now < d;
}

export interface Score { homeScore: number; awayScore: number; homePens: number | null; awayPens: number | null }

/** يتحقق من النتيجة: ركلات الترجيح في الأدوار الإقصائية فقط وعند التعادل فقط، وإلزامية عند تعادل إقصائي. يعيد رمز الخطأ أو null. */
export function scoreError(s: Score, knockout: boolean): null | 'PENS_PAIR' | 'PENS_NOT_ALLOWED' | 'PENS_REQUIRED' | 'PENS_TIE' {
  const hasPens = s.homePens !== null || s.awayPens !== null;
  if (hasPens && (s.homePens === null || s.awayPens === null)) return 'PENS_PAIR';
  if (hasPens && (!knockout || s.homeScore !== s.awayScore)) return 'PENS_NOT_ALLOWED';
  if (knockout && s.homeScore === s.awayScore && !hasPens) return 'PENS_REQUIRED';
  if (hasPens && s.homePens === s.awayPens) return 'PENS_TIE';
  return null;
}

/** بعد تأكيد مدير فريق (أو مدير الفريقين معاً): تصبح النتيجة معتمدة إذا أكد الطرفان */
export function applyConfirm(
  m: { homeConfirmed: boolean; awayConfirmed: boolean },
  sides: { home: boolean; away: boolean },
): { homeConfirmed: boolean; awayConfirmed: boolean; resultStatus: ResultStatus } {
  const homeConfirmed = m.homeConfirmed || sides.home;
  const awayConfirmed = m.awayConfirmed || sides.away;
  return { homeConfirmed, awayConfirmed, resultStatus: homeConfirmed && awayConfirmed ? 'confirmed' : 'provisional' };
}

/** صوت عضو اللجنة: رفض، أو تصحيح بنتيجة محددة، أو إعادة المباراة */
export type Remedy =
  | { decision: 'reject' }
  | ({ decision: 'correct' } & Score)
  | { decision: 'replay' };

/** مفتاح المقارنة: صوتان متطابقان = القرار نفسه والنتيجة نفسها */
export function remedyKey(r: Remedy): string {
  return r.decision === 'correct' ? `correct:${r.homeScore}-${r.awayScore}:${r.homePens ?? ''}-${r.awayPens ?? ''}` : r.decision;
}

/** يعيد القرار إذا اتفق عليه DISPUTE_MAJORITY أعضاء، وإلا null */
export function tally(votes: readonly Remedy[], majority = DISPUTE_MAJORITY): Remedy | null {
  const counts = new Map<string, { n: number; r: Remedy }>();
  for (const v of votes) {
    const k = remedyKey(v);
    const c = counts.get(k) ?? { n: 0, r: v };
    c.n++;
    counts.set(k, c);
    if (c.n >= majority) return c.r;
  }
  return null;
}

/** الحالة بعد القرار */
export function statusAfterDecision(decision: DisputeDecision): ResultStatus {
  return decision === 'replay' ? 'scheduled' : 'final';
}
