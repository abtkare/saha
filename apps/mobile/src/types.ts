import type { AgeCategory, MatchEventType, ResultStatus, TournamentFormat, TournamentKind, TournamentStatus } from '@saha/shared';

/** أنواع ردود الـ API — مطابقة لما يستخدمه الموقع (apps/web) */
export interface TournamentSummary {
  id: number; nameAr: string; slug: string; kind: TournamentKind; city: string | null;
  startsOn: string | null; endsOn: string | null; format: TournamentFormat; ageCategory: AgeCategory;
  status: TournamentStatus; maxTeams: number | null;
  community: { id: number; kind: string; nameAr: string; platformUrl: string | null } | null;
  _count: { registrations: number; matches: number };
  progress: { played: number; total: number; currentRound: number; rounds: number };
}

/** الفريق في البطاقات والجداول: الشعار، واسم صاحب الفريق/المؤثر/صاحب الصفحة وصورته (الجلسة 12) */
export interface TeamRef { id: number; nameAr: string; logoUrl?: string | null; ownerName?: string | null; ownerPhotoUrl?: string | null }

export interface MatchItem {
  id: number; round: number | null; stage?: string; kickoffAt: string | null; venue: string | null;
  homeScore: number | null; awayScore: number | null; homePens?: number | null; awayPens?: number | null;
  resultStatus: ResultStatus; liveText?: string | null;
  tournament?: { id: number; nameAr: string; slug: string; kind?: TournamentKind };
  homeTeam: TeamRef; awayTeam: TeamRef;
}

export interface MatchDetail extends MatchItem {
  stage: string; homePens: number | null; awayPens: number | null; liveText: string | null;
  homeConfirmed: boolean; awayConfirmed: boolean; resultEnteredAt: string | null; finalizedAt: string | null;
  disputeDeadline: string | null; hasSheet: boolean;
  tournament: { id: number; nameAr: string; slug: string; kind: TournamentKind };
  disputes: { id: number; status: string; decision: string | null }[];
  events: { id: number; type: MatchEventType; minute: number | null; teamId: number; player: { id: number; name: string } | null }[];
}

export interface StandingRow {
  position: number; team: TeamRef; played: number; won: number; drawn: number; lost: number;
  goalsFor: number; goalsAgainst: number; goalDiff: number; points: number;
}
export interface Standings { tournament: { id: number; nameAr: string; slug: string }; rows: StandingRow[]; groups?: { label: string; rows: StandingRow[] }[] }

export interface TournamentDetail {
  id: number; nameAr: string; slug: string; kind: TournamentKind; status: TournamentStatus; city: string | null;
  format: TournamentFormat; ageCategory: AgeCategory; startsOn: string | null; endsOn: string | null;
  community: { nameAr: string } | null;
  /** رسوم الاشتراك الفعلية: 0 = مجاني (الرسوم معطّلة أو بلا مبلغ) */
  entryFeeIqd?: number; feesNote?: string | null;
  registrations: { groupLabel?: string | null; team: TeamRef & { verifiedAt: string | null } }[];
  matches: MatchItem[];
}

/** «طريق التأهل» — GET /tournaments/:id/road */
export type Zone = 'qualify' | 'leader' | null;
export interface RoadRow extends StandingRow { zone: Zone }
export interface Slot { team: TeamRef | null; label: string | null; projected: boolean }
export interface BracketMatch {
  id: number | null; slot: number; kickoffAt: string | null;
  homeScore: number | null; awayScore: number | null; homePens: number | null; awayPens: number | null;
  resultStatus: ResultStatus | null; winnerId: number | null; home: Slot; away: Slot;
}
export interface Road {
  tournament: { id: number; nameAr: string; slug: string; format: TournamentFormat; status: TournamentStatus; qualifiersPerGroup: number | null };
  groups: { label: string; qualifiers: number | null; rows: RoadRow[] }[];
  league: RoadRow[];
  groupStage: { played: number; total: number; finished: boolean } | null;
  bracket: { stage: string; matches: BracketMatch[] }[];
  champion: TeamRef | null;
}

/** أفضل اللاعبين — GET /tournaments/:id/stars */
export interface StarLine {
  rank: number; player: { id: number; name: string }; team: TeamRef | null;
  goals: number; mvp: number; yellow: number; red: number; matches: number;
}
export interface Stars { topScorers: StarLine[]; bestPlayers: StarLine[] }

export interface Scorer { player: { id: number; name: string }; team: TeamRef; goals: number }

export interface NewsItem { id: number; slug: string; titleAr: string; coverUrl: string | null; publishedAt: string | null }
export interface Post extends NewsItem { bodyAr: string; updatedAt: string }

export interface TeamDetail {
  id: number; nameAr: string; logoUrl: string | null; ownerName: string | null; ownerPhotoUrl: string | null; city: string | null; fbPageUrl: string | null; verified: boolean;
  community: { id: number; kind: string; nameAr: string } | null;
  players: { id: number; name: string; shirtNo: number | null }[];
  tournaments: { id: number; nameAr: string; slug: string; status: TournamentStatus; kind: TournamentKind; groupLabel: string | null }[];
  matches: MatchItem[];
}

export interface HeroSlide {
  id: number; type: 'sponsor' | 'news' | 'match' | 'tournament' | 'promo';
  titleAr: string; subtitleAr: string | null; imageUrl: string | null; linkUrl: string | null; sponsored: boolean;
  sponsor: { id: number; nameAr: string; logoUrl: string | null; website: string | null } | null;
  tournament: { id: number; nameAr: string; slug: string } | null;
  match: (MatchItem & { homePens: number | null; awayPens: number | null; liveTextAt: string | null }) | null;
}
export interface Hero { refreshSeconds: number; slides: HeroSlide[] }

/** لوحة الراعي الدائم — GET /home/banners (الجلسة 14) */
export interface Banner { id: number; labelAr: string; imageUrl: string; linkUrl: string | null; sponsor: { id: number; nameAr: string } | null }

export interface Me {
  id: number; fullName: string; phone: string | null; email: string | null; birthYear: number | null; status: string;
  guardianId: number | null; mfa: boolean; totpEnabled: boolean;
  roles: { role: string; label: string; tournamentId?: number | null; teamId?: number | null; sponsorId?: number | null }[];
  permissions: string[];
}

export interface Notification { id: number; titleAr: string; bodyAr: string; data: Record<string, unknown> | null; readAt: string | null; createdAt: string }

export interface MyTeam { id: number; nameAr: string; city: string | null; joinCode: string; verifiedAt: string | null; fbPageUrl: string | null; logoUrl?: string | null; ownerName?: string | null; ownerPhotoUrl?: string | null; _count: { players: number } }

export interface MyMatch extends MatchItem {
  stage: string; homeConfirmed: boolean; awayConfirmed: boolean; disputeDeadline: string | null; hasSheet: boolean;
}

export interface Verification { id: number; code: string; status: string; postUrl: string | null; note: string | null; createdAt: string; reviewedAt: string | null; instructions?: string }

export interface Child { id: number; firstName: string; birthYear: number; mediaConsent: boolean; consentAt: string | null; teams: { team: { id: number; nameAr: string } }[] }
export interface Ward { id: number; fullName: string; birthYear: number | null; status: string; createdAt: string }

/** الجوائز (الجلسة 16) */
export interface Prize {
  id: number; category: 'team_place' | 'best_player'; rank: number; label: string; titleAr: string | null;
  amountIqd: number; extraAr: string | null; status: 'pending' | 'awarded' | 'delivered' | 'confirmed';
  team: TeamRef | null; player: { id: number; name: string } | null;
  awardedAt: string | null; deliveredAt: string | null; confirmedAt: string | null;
}
export interface TournamentPrizes { announcedAt: string | null; totalIqd: number; prizes: Prize[] }
export type MyPrize = Prize & { tournament: { id: number; nameAr: string; slug: string }; deliveryNote: string | null; canConfirm: boolean };
export interface PrizeArchive {
  totals: { tournaments: number; prizes: number; amountIqd: number; confirmed: number };
  tournaments: { tournament: { id: number; nameAr: string; slug: string; endsOn: string | null }; totalIqd: number; delivered: number; confirmed: number; prizes: Prize[] }[];
  next: string | null;
}
