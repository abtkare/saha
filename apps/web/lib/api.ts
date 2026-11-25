import type { TournamentKind, TournamentStatus, TournamentFormat, AgeCategory, ResultStatus } from '@saha/shared';

/** عنوان الخادم من داخل شبكة Docker (لا يمر عبر المتصفح). */
const API = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

export interface TournamentSummary {
  id: number;
  nameAr: string;
  slug: string;
  kind: TournamentKind;
  city: string | null;
  startsOn: string | null;
  endsOn: string | null;
  format: TournamentFormat;
  ageCategory: AgeCategory;
  status: TournamentStatus;
  maxTeams: number | null;
  community: { id: number; kind: string; nameAr: string; platformUrl: string | null } | null;
  _count: { registrations: number; matches: number };
  progress: { played: number; total: number; currentRound: number; rounds: number };
}

/** الفريق في البطاقات والجداول: الشعار، واسم صاحب الفريق/المؤثر/صاحب الصفحة وصورته (الجلسة 12) */
export interface TeamRef { id: number; nameAr: string; logoUrl?: string | null; ownerName?: string | null; ownerPhotoUrl?: string | null }

export interface MatchItem {
  id: number;
  round: number | null;
  kickoffAt: string | null;
  venue: string | null;
  homeScore: number | null;
  awayScore: number | null;
  resultStatus: ResultStatus;
  liveText?: string | null;
  tournament?: { id: number; nameAr: string; slug: string; kind: TournamentKind };
  homeTeam: TeamRef;
  awayTeam: TeamRef;
}

export interface StandingRow {
  position: number;
  team: TeamRef;
  played: number; won: number; drawn: number; lost: number;
  goalsFor: number; goalsAgainst: number; goalDiff: number; points: number;
}
export interface Standings { tournament: { id: number; nameAr: string; slug: string }; rows: StandingRow[] }

/** «طريق التأهل» — GET /tournaments/:id/road (الجلسة 12) */
export type Zone = 'qualify' | 'leader' | null;
export interface RoadRow extends StandingRow { zone: Zone }
export interface Slot { team: TeamRef | null; label: string | null; projected: boolean }
export interface BracketMatch {
  id: number | null; slot: number; kickoffAt: string | null;
  homeScore: number | null; awayScore: number | null; homePens: number | null; awayPens: number | null;
  resultStatus: string | null; winnerId: number | null; home: Slot; away: Slot;
}
export interface Road {
  tournament: { id: number; nameAr: string; slug: string; format: string; status: string; qualifiersPerGroup: number | null };
  groups: { label: string; qualifiers: number | null; rows: RoadRow[] }[];
  league: RoadRow[];
  groupStage: { played: number; total: number; finished: boolean } | null;
  bracket: { stage: string; matches: BracketMatch[] }[];
  champion: TeamRef | null;
}
export interface StarLine { rank: number; player: { id: number; name: string }; team: TeamRef | null; goals: number; mvp: number; yellow: number; red: number; matches: number }
export interface Stars { topScorers: StarLine[]; bestPlayers: StarLine[] }

export interface NewsItem { id: number; slug: string; titleAr: string; coverUrl: string | null; publishedAt: string | null }

export interface HeroSlide {
  id: number;
  type: 'sponsor' | 'news' | 'match' | 'tournament' | 'promo';
  titleAr: string;
  subtitleAr: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  sponsored: boolean;
  sponsor: { id: number; nameAr: string; logoUrl: string | null; website: string | null } | null;
  tournament: { id: number; nameAr: string; slug: string } | null;
  match: (Omit<MatchItem, 'round' | 'tournament'> & { homePens: number | null; awayPens: number | null; liveTextAt: string | null; tournament: { id: number; nameAr: string; slug: string } }) | null;
}
export interface Hero { refreshSeconds: number; slides: HeroSlide[] }

/** لوحة الراعي الدائم — GET /home/banners */
export interface Banner { id: number; labelAr: string; imageUrl: string; linkUrl: string | null; sponsor: { id: number; nameAr: string } | null }

export async function apiGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API}/api/v1${path}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
