import { TIMEZONE, TOURNAMENT_STATUS_LABELS, type ResultStatus } from '@saha/shared';
import type { MatchItem, TournamentSummary } from './api';

const time = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dayMonth = new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { timeZone: TIMEZONE, day: 'numeric', month: 'long' });
const weekday = new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { timeZone: TIMEZONE, weekday: 'long', day: 'numeric', month: 'long' });
const rel = new Intl.RelativeTimeFormat('ar-u-nu-latn', { numeric: 'auto' });

/** تاريخ يوم بتوقيت بغداد بصيغة YYYY-MM-DD، مع إزاحة بالأيام */
export function baghdadDate(offsetDays = 0, now = new Date()): string {
  const d = new Date(now.getTime() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export const kickoffTime = (iso: string | null) => (iso ? time.format(new Date(iso)) : '—');
export const kickoffDay = (iso: string | null) => (iso ? weekday.format(new Date(iso)) : 'الموعد لاحقاً');
export const shortDate = (iso: string | null) => (iso ? dayMonth.format(new Date(iso)) : '');

/** النتيجة كما في التصميم: «2 – 1»، وقبل المباراة «– : –» */
export function scoreText(m: Pick<MatchItem, 'homeScore' | 'awayScore'>): string {
  return m.homeScore === null || m.awayScore === null ? '– : –' : `${m.homeScore} – ${m.awayScore}`;
}

/** فارق الأهداف بعلامة كما في التصميم: +5، −2، 0 */
export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

/** الحرف الأول لشعار الفريق المؤقت */
export const initial = (name: string) => name.trim().charAt(0);

export function relativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return '';
  const diff = (new Date(iso).getTime() - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 3600) return rel.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rel.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rel.format(Math.round(diff / 86400), 'day');
  return shortDate(iso);
}

/** شريط التقدّم ونصّه في بطاقة البطولة */
export function tournamentProgress(t: TournamentSummary): { pct: number; label: string } {
  const p = t.progress;
  if (t.status === 'registration') {
    const max = t.maxTeams ?? 0;
    const pct = max ? Math.round((t._count.registrations / max) * 100) : 0;
    const starts = t.startsOn ? ` · تبدأ ${shortDate(t.startsOn)}` : '';
    return { pct, label: `${TOURNAMENT_STATUS_LABELS.registration}${starts}` };
  }
  if (t.status === 'finished') return { pct: 100, label: TOURNAMENT_STATUS_LABELS.finished };
  const pct = p.total ? Math.round((p.played / p.total) * 100) : 0;
  if (p.rounds > 0) return { pct, label: `الجولة ${Math.max(p.currentRound, 1)} من ${p.rounds}` };
  return { pct, label: TOURNAMENT_STATUS_LABELS[t.status] };
}

/** اختيار «مباراة اليوم» للهيرو: مباراة اليوم الجارية/المؤقتة أولاً، ثم أقرب مباراة قادمة، ثم آخر نتيجة */
export function pickFeatured(yesterday: MatchItem[], today: MatchItem[], tomorrow: MatchItem[]): { match: MatchItem; label: string } | null {
  const order: ResultStatus[] = ['provisional', 'disputed', 'scheduled', 'confirmed', 'final'];
  const todaySorted = [...today].sort((a, b) => order.indexOf(a.resultStatus) - order.indexOf(b.resultStatus));
  if (todaySorted[0]) return { match: todaySorted[0], label: 'مباراة اليوم' };
  if (tomorrow[0]) return { match: tomorrow[0], label: 'مباراة الغد' };
  if (yesterday.length) return { match: yesterday[yesterday.length - 1], label: 'مباراة الأمس' };
  return null;
}
