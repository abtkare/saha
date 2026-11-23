/** ثوابت مشتركة بين الخادم والموقع والتطبيق. القيم تطابق enums في قاعدة البيانات. */

export const TOURNAMENT_KINDS = ['popular_teams', 'influencer_followers', 'facebook_group'] as const;
export type TournamentKind = (typeof TOURNAMENT_KINDS)[number];
export const TOURNAMENT_KIND_LABELS: Record<TournamentKind, string> = {
  popular_teams: 'الفرق الشعبية',
  influencer_followers: 'متابعو المؤثرين',
  facebook_group: 'مجموعات فيسبوك',
};

export const COMMUNITY_KINDS = ['influencer', 'facebook_group'] as const;
export type CommunityKind = (typeof COMMUNITY_KINDS)[number];

/** نوع المجتمع المطلوب لكل نوع بطولة (الفرق الشعبية لا ترتبط بمجتمع). */
export const COMMUNITY_KIND_FOR_TOURNAMENT: Record<TournamentKind, CommunityKind | null> = {
  popular_teams: null,
  influencer_followers: 'influencer',
  facebook_group: 'facebook_group',
};

export const TOURNAMENT_FORMATS = ['league', 'knockout', 'groups_knockout'] as const;
export type TournamentFormat = (typeof TOURNAMENT_FORMATS)[number];
export const TOURNAMENT_FORMAT_LABELS: Record<TournamentFormat, string> = {
  league: 'دوري',
  knockout: 'خروج المغلوب',
  groups_knockout: 'مجموعات ثم خروج المغلوب',
};

export const TOURNAMENT_STATUSES = ['draft', 'registration', 'running', 'finished', 'cancelled'] as const;
export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];
export const TOURNAMENT_STATUS_LABELS: Record<TournamentStatus, string> = {
  draft: 'مسودة',
  registration: 'التسجيل مفتوح',
  running: 'جارية',
  finished: 'منتهية',
  cancelled: 'ملغاة',
};

export const AGE_CATEGORIES = ['open', 'u18', 'u14'] as const;
export type AgeCategory = (typeof AGE_CATEGORIES)[number];
export const AGE_CATEGORY_LABELS: Record<AgeCategory, string> = {
  open: 'مفتوحة',
  u18: 'تحت 18',
  u14: 'تحت 14',
};

export const RESULT_STATUSES = ['scheduled', 'provisional', 'confirmed', 'disputed', 'final'] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];
export const RESULT_STATUS_LABELS: Record<ResultStatus, string> = {
  scheduled: 'لم تبدأ',
  provisional: 'مؤقتة',
  confirmed: 'معتمدة',
  disputed: 'متنازع عليها',
  final: 'نهائية',
};

export const ROLES = [
  'super_admin',
  'content_editor',
  'sponsor_manager',
  'tournament_manager',
  'referee',
  'team_manager',
  'discipline_committee',
  'sponsor_viewer',
] as const;
export type Role = (typeof ROLES)[number];

export const MINOR_AGE = 18;
export const TIMEZONE = 'Asia/Baghdad';

/** هل اللاعب قاصر حسب سنة الميلاد (تقريبي بالسنة، يكفي لفرض ولي الأمر). */
export function isMinor(birthYear: number, now: Date = new Date()): boolean {
  return now.getFullYear() - birthYear < MINOR_AGE;
}
