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

/**
 * انتقالات حالة النتيجة (الجلسة 4):
 * لم تبدأ ← مؤقتة (الحكم يدخلها مع صورة الورقة)
 * مؤقتة ← مؤقتة (تصحيح الحكم يصفّر التأكيدات) | معتمدة (تأكيد الفريقين) | متنازع عليها (اعتراض) | نهائية (انتهاء المهلة بلا اعتراض)
 * معتمدة ← نهائية (انتهاء المهلة)
 * متنازع عليها ← نهائية (قرار اللجنة: رفض أو تصحيح) | لم تبدأ (قرار اللجنة: إعادة المباراة)
 */
export const RESULT_TRANSITIONS: Record<ResultStatus, readonly ResultStatus[]> = {
  scheduled: ['provisional'],
  provisional: ['provisional', 'confirmed', 'disputed', 'final'],
  confirmed: ['final'],
  disputed: ['final', 'scheduled'],
  final: [],
};

export const DISPUTE_DECISIONS = ['reject', 'correct', 'replay'] as const;
export type DisputeDecision = (typeof DISPUTE_DECISIONS)[number];
export const DISPUTE_DECISION_LABELS: Record<DisputeDecision, string> = {
  reject: 'رفض الاعتراض وتثبيت النتيجة',
  correct: 'قبول الاعتراض وتصحيح النتيجة',
  replay: 'قبول الاعتراض وإعادة المباراة',
};
/** لجنة الانضباط ثلاثة أعضاء، والقرار بأغلبية صوتين متطابقين */
export const DISPUTE_COMMITTEE_SIZE = 3;
export const DISPUTE_MAJORITY = 2;

export const MATCH_EVENT_TYPES = ['goal', 'own_goal', 'yellow_card', 'red_card', 'mvp'] as const;
export type MatchEventType = (typeof MATCH_EVENT_TYPES)[number];
export const MATCH_EVENT_LABELS: Record<MatchEventType, string> = {
  goal: 'هدف',
  own_goal: 'هدف عكسي',
  yellow_card: 'بطاقة صفراء',
  red_card: 'بطاقة حمراء',
  mvp: 'أفضل لاعب',
};

/** أدوار البطولة (حقل matches.stage) */
export const STAGE_LABELS: Record<string, string> = {
  league: 'الدوري',
  group: 'دور المجموعات',
  r64: 'دور الـ64',
  r32: 'دور الـ32',
  r16: 'دور الـ16',
  qf: 'ربع النهائي',
  sf: 'نصف النهائي',
  final: 'النهائي',
};

/** الحد الأعلى للعمر في كل فئة (null = مفتوحة) */
export const AGE_CATEGORY_MAX: Record<AgeCategory, number | null> = { open: null, u18: 18, u14: 14 };

/** هل يحق للاعب المشاركة في فئة البطولة (بسنة الميلاد، كما في isMinor) */
export function ageEligible(birthYear: number, category: AgeCategory, now: Date = new Date()): boolean {
  const max = AGE_CATEGORY_MAX[category];
  return max === null || now.getFullYear() - birthYear < max;
}

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

// ───────────── مصفوفة الصلاحيات (docs/PLAN.md — مصفوفة الأدوار للمرحلة الأولى) ─────────────

export const PERMISSIONS = [
  'content.draft',          // كتابة مسودة خبر/صفحة/شريحة
  'content.publish',        // مراجعة ونشر المحتوى والشرائح
  'slides.sponsor',         // شرائح الرعاة فقط
  'sponsors.manage',        // الرعاة والمالية والرسوم
  'sponsor.reports.view',   // تقارير الظهور والنقرات
  'tournaments.manage',     // إنشاء البطولة والقرعة والجدولة واعتماد التسجيل
  'results.enter',          // إدخال النتيجة والأحداث وصورة الورقة
  'results.confirm',        // تأكيد النتيجة من مدير الفريق
  'disputes.raise',         // تقديم اعتراض
  'disputes.decide',        // البت في الاعتراضات (لجنة الانضباط)
  'team.page.edit',         // صفحة الفريق وطلب التوثيق
  'team.players.manage',    // لاعبو الفريق
  'users.manage',           // المستخدمون والأدوار
  'audit.verify',           // سجل التدقيق والتحقق من السلسلة
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** ما يمنحه كل دور. النطاق (بطولة/فريق) يُفحص في hasPermission. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  super_admin: PERMISSIONS,
  content_editor: ['content.draft', 'content.publish'],
  sponsor_manager: ['slides.sponsor', 'sponsors.manage', 'sponsor.reports.view'],
  tournament_manager: ['tournaments.manage', 'results.enter'],
  referee: ['results.enter'],
  team_manager: ['team.page.edit', 'team.players.manage', 'results.confirm', 'disputes.raise'],
  discipline_committee: ['disputes.decide'],
  sponsor_viewer: ['sponsor.reports.view'],
};

/** أدوار الإدارة: لا تعمل صلاحياتها إلا بدخول البريد + كلمة السر + TOTP. */
export const MFA_ROLES: readonly Role[] = ['super_admin', 'content_editor', 'sponsor_manager'];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'مدير عام',
  content_editor: 'محرر محتوى',
  sponsor_manager: 'مدير الرعاة',
  tournament_manager: 'مدير البطولة',
  referee: 'حكم',
  team_manager: 'مدير فريق',
  discipline_committee: 'لجنة الانضباط',
  sponsor_viewer: 'راعٍ',
};

export interface RoleGrant { role: Role; tournamentId?: number | null; teamId?: number | null; sponsorId?: number | null }
export interface PermissionScope { tournamentId?: number | null; teamId?: number | null; sponsorId?: number | null }

/**
 * هل تمنح أدوار المستخدم الصلاحية في هذا النطاق؟
 * - الدور بلا نطاق يعمل في كل البطولات/الفرق.
 * - الدور المقيّد ببطولة أو فريق أو راعٍ لا يعمل إلا إن طابق النطاق المطلوب.
 * - أدوار الإدارة (MFA_ROLES) تُهمل إن لم يكن الدخول بـ TOTP.
 */
export function hasPermission(grants: readonly RoleGrant[], permission: Permission, scope: PermissionScope = {}, mfa = false): boolean {
  return grants.some((g) => {
    if (MFA_ROLES.includes(g.role) && !mfa) return false;
    if (!ROLE_PERMISSIONS[g.role]?.includes(permission)) return false;
    if (g.tournamentId != null && g.tournamentId !== scope.tournamentId) return false;
    if (g.teamId != null && g.teamId !== scope.teamId) return false;
    if (g.sponsorId != null && g.sponsorId !== scope.sponsorId) return false;
    return true;
  });
}

/** قائمة الصلاحيات الفعلية (للعرض في التطبيق واللوحة). */
export function permissionsOf(grants: readonly RoleGrant[], mfa = false): Permission[] {
  return PERMISSIONS.filter((p) => grants.some((g) => (!MFA_ROLES.includes(g.role) || mfa) && ROLE_PERMISSIONS[g.role]?.includes(p)));
}

/** رقم هاتف عراقي بصيغة موحّدة +9647XXXXXXXXX، أو null إن كان غير صالح. */
export function normalizeIraqiPhone(input: string): string | null {
  const digits = String(input).replace(/[\s\-()]/g, '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const m = digits.match(/^(?:\+964|00964|964)?0?(7\d{9})$/);
  return m ? `+964${m[1]}` : null;
}

// ───────────── المحتوى والرعاة (الجلسة 5) ─────────────

export const CONTENT_STATUSES = ['draft', 'review', 'published', 'archived'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];
export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  draft: 'مسودة',
  review: 'قيد المراجعة',
  published: 'منشور',
  archived: 'مؤرشف',
};

export const SLIDE_TYPES = ['sponsor', 'news', 'match', 'tournament', 'promo'] as const;
export type SlideType = (typeof SLIDE_TYPES)[number];
export const SLIDE_TYPE_LABELS: Record<SlideType, string> = {
  sponsor: 'شريحة راعٍ (مدفوعة)',
  news: 'خبر',
  match: 'مباراة اليوم',
  tournament: 'بطولة',
  promo: 'إعلان من ساحة',
};
/** الشرائح المدفوعة: تحتاج اعتماداً من شخص غير الذي أنشأها أو عدّلها */
export const PAID_SLIDE_TYPES: readonly SlideType[] = ['sponsor'];

export const SLIDE_EVENT_TYPES = ['impression', 'click'] as const;
export type SlideEventType = (typeof SLIDE_EVENT_TYPES)[number];

/** التطبيق والموقع يعيدان طلب السلايدر كل 30 ثانية (النتيجة النصية لشريحة «مباراة اليوم») */
export const HERO_REFRESH_SECONDS = 30;
export const HERO_MAX_SLIDES = 8;
export const LIVE_TEXT_MAX = 80;

export const POST_TYPES = ['news', 'page'] as const;
export type PostType = (typeof POST_TYPES)[number];
export const POST_TYPE_LABELS: Record<PostType, string> = { news: 'خبر', page: 'صفحة' };

export const SPONSOR_LEAD_STATUSES = ['new', 'contacted', 'closed'] as const;
export type SponsorLeadStatus = (typeof SPONSOR_LEAD_STATUSES)[number];
export const SPONSOR_LEAD_STATUS_LABELS: Record<SponsorLeadStatus, string> = {
  new: 'جديد',
  contacted: 'تم التواصل',
  closed: 'مغلق',
};

/** نسبة النقر إلى الظهور بنسبة مئوية بمنزلتين (0 إن لم يكن ظهور) */
export function ctr(impressions: number, clicks: number): number {
  return impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0;
}

// ───────────── التطبيق وإشعارات الهاتف (الجلسة 7) ─────────────

export const PUSH_PLATFORMS = ['ios', 'android'] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

/** رمز Expo Push كما يصدره expo-notifications: ExponentPushToken[...] */
export function isExpoPushToken(token: unknown): token is string {
  return typeof token === 'string' && /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{8,200}\]$/.test(token);
}

/**
 * وجهة الإشعار داخل التطبيق (حقل data في الإشعار). يقرأها التطبيق ليفتح الشاشة المناسبة عند الضغط.
 * matchId ← شاشة المباراة، tournamentId ← البطولة، teamId ← الفريق، disputeId ← المباراة المعنية.
 */
export interface NotificationTarget { matchId?: number; tournamentId?: number; teamId?: number; disputeId?: number }
