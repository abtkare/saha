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

export interface TeamRef { id: number; nameAr: string; logoUrl?: string | null }

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

export interface NewsItem { id: number; slug: string; titleAr: string; coverUrl: string | null; publishedAt: string | null }

export async function apiGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API}/api/v1${path}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
