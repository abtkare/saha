import type { TournamentKind, TournamentStatus, TournamentFormat, AgeCategory } from '@saha/shared';

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
  community: { id: number; kind: string; nameAr: string; platformUrl: string | null } | null;
  _count: { registrations: number; matches: number };
}

export async function apiGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API}/api/v1${path}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
