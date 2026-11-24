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

export interface TeamRef { id: number; nameAr: string; logoUrl?: string | null }

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
  registrations: { team: { id: number; nameAr: string; verifiedAt: string | null } }[];
  matches: MatchItem[];
}

export interface Scorer { player: { id: number; name: string }; team: { id: number; nameAr: string }; goals: number }

export interface NewsItem { id: number; slug: string; titleAr: string; coverUrl: string | null; publishedAt: string | null }
export interface Post extends NewsItem { bodyAr: string; updatedAt: string }

export interface TeamDetail {
  id: number; nameAr: string; logoUrl: string | null; city: string | null; fbPageUrl: string | null; verified: boolean;
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

export interface Me {
  id: number; fullName: string; phone: string | null; email: string | null; birthYear: number | null; status: string;
  guardianId: number | null; mfa: boolean; totpEnabled: boolean;
  roles: { role: string; label: string; tournamentId?: number | null; teamId?: number | null; sponsorId?: number | null }[];
  permissions: string[];
}

export interface Notification { id: number; titleAr: string; bodyAr: string; data: Record<string, unknown> | null; readAt: string | null; createdAt: string }

export interface MyTeam { id: number; nameAr: string; city: string | null; joinCode: string; verifiedAt: string | null; fbPageUrl: string | null; _count: { players: number } }

export interface MyMatch extends MatchItem {
  stage: string; homeConfirmed: boolean; awayConfirmed: boolean; disputeDeadline: string | null; hasSheet: boolean;
}

export interface Verification { id: number; code: string; status: string; postUrl: string | null; note: string | null; createdAt: string; reviewedAt: string | null; instructions?: string }

export interface Child { id: number; firstName: string; birthYear: number; mediaConsent: boolean; consentAt: string | null; teams: { team: { id: number; nameAr: string } }[] }
export interface Ward { id: number; fullName: string; birthYear: number | null; status: string; createdAt: string }
