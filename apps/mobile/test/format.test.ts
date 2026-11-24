import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baghdadDate, kickoffDay, kickoffTime, relativeTime, scoreText, signed } from '../src/format.ts';

test('توقيت بغداد +3 وأرقام 0–9', () => {
  assert.equal(kickoffTime('2026-12-04T13:00:00Z'), '16:00');
  assert.equal(kickoffTime('2026-12-04T22:30:00Z'), '01:30');
  assert.equal(kickoffDay('2026-12-04T13:00:00Z'), 'الجمعة 4 كانون الأول');
  assert.equal(baghdadDate(0, new Date('2026-12-04T22:30:00Z')), '2026-12-05');
  assert.equal(baghdadDate(-1, new Date('2026-12-04T10:00:00Z')), '2026-12-03');
});

test('النتيجة والفارق والوقت النسبي', () => {
  assert.equal(scoreText({ homeScore: 2, awayScore: 1 }), '2 – 1');
  assert.equal(scoreText({ homeScore: null, awayScore: null }), '– : –');
  assert.equal(signed(5), '+5');
  assert.equal(signed(-2), '−2');
  const now = Date.parse('2026-12-04T12:00:00Z');
  assert.equal(relativeTime('2026-12-04T10:00:00Z', now), 'منذ ساعتين');
  assert.equal(relativeTime('2026-12-03T11:00:00Z', now), 'أمس');
  assert.equal(relativeTime('2026-12-04T11:55:00Z', now), 'منذ 5 دقائق');
});
