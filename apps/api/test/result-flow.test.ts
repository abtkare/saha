/** منطق النتائج الخالص: الانتقالات، النافذة، ركلات الترجيح، التأكيد المزدوج، أغلبية اللجنة. */
import { describe, expect, it } from 'vitest';
import { RESULT_STATUSES, RESULT_TRANSITIONS } from '@saha/shared';
import { applyConfirm, canTransition, disputeDeadline, scoreError, statusAfterDecision, tally, windowOpen, type Remedy } from '../src/matches/result-flow';

describe('جدول الانتقالات', () => {
  it('يطابق جدولاً مكتوباً بشكل مستقل', () => {
    const allowed = new Set([
      'scheduled>provisional',
      'provisional>provisional', 'provisional>confirmed', 'provisional>disputed', 'provisional>final',
      'confirmed>final',
      'disputed>final', 'disputed>scheduled',
    ]);
    for (const from of RESULT_STATUSES) for (const to of RESULT_STATUSES) {
      expect(canTransition(from, to), `${from} → ${to}`).toBe(allowed.has(`${from}>${to}`));
    }
    expect(RESULT_TRANSITIONS.final).toEqual([]);
  });
});

describe('نافذة الاعتراض', () => {
  const entered = new Date('2026-12-04T18:00:00+03:00');
  it('تنتهي بعد عدد ساعات البطولة', () => {
    expect(disputeDeadline(entered, 24)!.toISOString()).toBe('2026-12-05T15:00:00.000Z');
    expect(disputeDeadline(null, 24)).toBeNull();
    expect(windowOpen(entered, 24, new Date('2026-12-05T17:59:59+03:00'))).toBe(true);
    expect(windowOpen(entered, 24, new Date('2026-12-05T18:00:00+03:00'))).toBe(false);
    expect(windowOpen(null, 24)).toBe(false);
  });
});

describe('ركلات الترجيح', () => {
  const s = (h: number, a: number, hp: number | null = null, ap: number | null = null) => ({ homeScore: h, awayScore: a, homePens: hp, awayPens: ap });
  it('في الدوري لا ترجيح، والتعادل مقبول', () => {
    expect(scoreError(s(1, 1), false)).toBeNull();
    expect(scoreError(s(1, 1, 4, 3), false)).toBe('PENS_NOT_ALLOWED');
  });
  it('في خروج المغلوب التعادل يحتاج ترجيحاً، والفوز لا يقبله', () => {
    expect(scoreError(s(2, 1), true)).toBeNull();
    expect(scoreError(s(2, 2), true)).toBe('PENS_REQUIRED');
    expect(scoreError(s(2, 2, 5, 4), true)).toBeNull();
    expect(scoreError(s(2, 1, 5, 4), true)).toBe('PENS_NOT_ALLOWED');
    expect(scoreError(s(2, 2, 5, null), true)).toBe('PENS_PAIR');
    expect(scoreError(s(2, 2, 4, 4), true)).toBe('PENS_TIE');
  });
});

describe('التأكيد المزدوج', () => {
  it('طرف واحد يبقيها مؤقتة، والطرفان يعتمدانها', () => {
    const none = { homeConfirmed: false, awayConfirmed: false };
    expect(applyConfirm(none, { home: true, away: false })).toEqual({ homeConfirmed: true, awayConfirmed: false, resultStatus: 'provisional' });
    expect(applyConfirm({ homeConfirmed: true, awayConfirmed: false }, { home: false, away: true }).resultStatus).toBe('confirmed');
    expect(applyConfirm(none, { home: true, away: true }).resultStatus).toBe('confirmed');
    // التأكيد لا يُسحب
    expect(applyConfirm({ homeConfirmed: true, awayConfirmed: false }, { home: false, away: false }).homeConfirmed).toBe(true);
  });
});

describe('أغلبية لجنة الانضباط', () => {
  const reject: Remedy = { decision: 'reject' };
  const replay: Remedy = { decision: 'replay' };
  const fix = (h: number, a: number): Remedy => ({ decision: 'correct', homeScore: h, awayScore: a, homePens: null, awayPens: null });
  it('صوتان متطابقان يحسمان، والمختلفة لا تحسم', () => {
    expect(tally([reject])).toBeNull();
    expect(tally([reject, replay])).toBeNull();
    expect(tally([reject, replay, fix(1, 0)])).toBeNull();
    expect(tally([reject, replay, reject])).toEqual(reject);
    expect(tally([replay, replay])).toEqual(replay);
  });
  it('التصحيح يحتاج النتيجة نفسها من صوتين', () => {
    expect(tally([fix(2, 1), fix(1, 2)])).toBeNull();
    expect(tally([fix(2, 1), reject, fix(2, 1)])).toEqual(fix(2, 1));
  });
  it('الحالة بعد القرار', () => {
    expect(statusAfterDecision('reject')).toBe('final');
    expect(statusAfterDecision('correct')).toBe('final');
    expect(statusAfterDecision('replay')).toBe('scheduled');
  });
});
