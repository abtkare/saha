/** التنسيق — منقول من apps/web/lib/format.ts بنفس السلوك: توقيت بغداد، أرقام 0–9 */
import type { MatchItem } from './types';

/**
 * توقيت بغداد ثابت +3 (العراق بلا توقيت صيفي)، ويُحسب يدوياً بدل Intl حتى تكون النتيجة واحدة
 * في كل محركات الجوال (Hermes) وبأرقام 0–9 دائماً.
 */
const OFFSET = 3 * 3600_000;
const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const local = (iso: string | Date) => new Date(new Date(iso).getTime() + OFFSET);
const pad = (n: number) => String(n).padStart(2, '0');

/** تاريخ يوم بتوقيت بغداد بصيغة YYYY-MM-DD، مع إزاحة بالأيام */
export function baghdadDate(offsetDays = 0, now = new Date()): string {
  return local(new Date(now.getTime() + offsetDays * 86400000)).toISOString().slice(0, 10);
}

export const kickoffTime = (iso: string | null) => { if (!iso) return '—'; const d = local(iso); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
export const shortDate = (iso: string | null) => { if (!iso) return ''; const d = local(iso); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
export const kickoffDay = (iso: string | null) => (iso ? `${DAYS[local(iso).getUTCDay()]} ${shortDate(iso)}` : 'الموعد لاحقاً');
export const dateTime = (iso: string | null) => (iso ? `${kickoffDay(iso)} · ${kickoffTime(iso)}` : '');

/** النتيجة كما في التصميم: «2 – 1»، وقبل المباراة «– : –» */
export function scoreText(m: Pick<MatchItem, 'homeScore' | 'awayScore'>): string {
  return m.homeScore === null || m.awayScore === null ? '– : –' : `${m.homeScore} – ${m.awayScore}`;
}

/** فارق الأهداف بعلامة: +5، −2، 0 */
export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

/** الحرف الأول لشعار الفريق المؤقت */
export const initial = (name: string) => name.trim().charAt(0);

/** «منذ ساعتين»، «أمس»… بأرقام 0–9 (بلا Intl.RelativeTimeFormat لأنه غير مضمون في كل محركات الجوال) */
export function relativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return '';
  const diff = Math.round((now - new Date(iso).getTime()) / 1000);
  if (diff < 0) return shortDate(iso);
  if (diff < 60) return 'الآن';
  const min = Math.round(diff / 60);
  if (min < 60) return min === 1 ? 'منذ دقيقة' : min === 2 ? 'منذ دقيقتين' : min <= 10 ? `منذ ${min} دقائق` : `منذ ${min} دقيقة`;
  const h = Math.round(min / 60);
  if (h < 24) return h === 1 ? 'منذ ساعة' : h === 2 ? 'منذ ساعتين' : h <= 10 ? `منذ ${h} ساعات` : `منذ ${h} ساعة`;
  const d = Math.round(h / 24);
  if (d === 1) return 'أمس';
  if (d < 30) return d === 2 ? 'منذ يومين' : d <= 10 ? `منذ ${d} أيام` : `منذ ${d} يوماً`;
  return shortDate(iso);
}

export const KNOCKOUT_STAGES = ['r64', 'r32', 'r16', 'qf', 'sf', 'final'];
export const isKnockout = (stage?: string | null) => !!stage && KNOCKOUT_STAGES.includes(stage);
