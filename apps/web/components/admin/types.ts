import type { AgeCategory, ResultStatus, TournamentFormat, TournamentKind, TournamentStatus } from '@saha/shared';

export interface AdminTournament {
  id: number; nameAr: string; slug: string; kind: TournamentKind; format: TournamentFormat; status: TournamentStatus; ageCategory: AgeCategory;
  startsOn: string | null; endsOn: string | null; maxTeams: number | null; drawnAt: string | null; city: string | null;
  entryFeeIqd: number; feesEnabled: boolean; feesChangedAt: string | null; feesNote: string | null; disputeWindowHrs: number; groupCount: number | null; qualifiersPerGroup: number | null; doubleRound: boolean;
  community: { id: number; nameAr: string } | null;
  _count: { registrations: number; matches: number };
}

export interface TeamRef { id: number; nameAr: string }

export interface FixtureMatch {
  id: number; stage: string; round: number | null; kickoffAt: string | null; venue: string | null; resultStatus: ResultStatus;
  homeScore: number | null; awayScore: number | null; referee: { id: number; fullName: string } | null; homeTeam: TeamRef; awayTeam: TeamRef;
}

export interface Fixtures {
  tournament: { id: number; nameAr: string; format: TournamentFormat; drawnAt: string | null; drawSeed: string | null };
  groups: { label: string; teams: TeamRef[] }[];
  matches: FixtureMatch[];
}

export interface Registration {
  id: number; status: 'pending' | 'approved' | 'rejected' | 'withdrawn'; groupLabel: string | null; feePaidIqd: number | null; createdAt: string;
  team: { id: number; nameAr: string; city: string | null; verifiedAt: string | null; _count: { players: number } };
}

export interface ResultView {
  id: number; resultStatus: ResultStatus; homeScore: number | null; awayScore: number | null; homePens: number | null; awayPens: number | null;
  homeConfirmed: boolean; awayConfirmed: boolean; resultEnteredAt: string | null; finalizedAt: string | null; disputeDeadline: string | null; hasSheet: boolean;
  kickoffAt: string | null; venue?: string | null; stage: string; round?: number | null;
  tournament: { id: number; nameAr: string; status?: string }; homeTeam: TeamRef; awayTeam: TeamRef;
}

export interface AdminUser {
  id: number; fullName: string; phone: string | null; email: string | null; status: string; birthYear: number | null;
  roles: { id: number; role: string; tournamentId: number | null; teamId: number | null; sponsorId: number | null }[];
}
