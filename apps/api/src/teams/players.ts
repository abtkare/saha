import { ageEligible, isMinor, AGE_CATEGORY_LABELS, type AgeCategory } from '@saha/shared';
import type { Db } from '../audit/write-audit';

/** اسم اللاعب للعرض العام: القاصر بالاسم الأول فقط (docs/PLAN.md — شاشة الفريق) */
export function publicPlayerName(p: { firstName: string; lastName: string | null; birthYear: number }): string {
  return isMinor(p.birthYear) ? p.firstName : `${p.firstName} ${p.lastName ?? ''}`.trim();
}

export const PUBLIC_PLAYER_SELECT = { id: true, firstName: true, lastName: true, birthYear: true } as const;

/**
 * مشكلات أهلية لاعبي فريق في بطولة: الفئة العمرية، واللاعب المسجّل مع فريق آخر معتمد في البطولة نفسها.
 * playerIds: لفحص لاعبين محددين فقط (عند إضافة لاعب لفريق مسجّل). الناتج رسائل عربية؛ فارغ = مؤهل.
 */
export async function eligibilityProblems(
  db: Db,
  tournament: { id: number; ageCategory: AgeCategory },
  teamId: number,
  playerIds?: number[],
): Promise<string[]> {
  const players = playerIds
    ? await db.player.findMany({ where: { id: { in: playerIds } }, select: PUBLIC_PLAYER_SELECT })
    : (await db.teamPlayer.findMany({ where: { teamId }, select: { player: { select: PUBLIC_PLAYER_SELECT } } })).map((tp) => tp.player);
  const problems: string[] = [];
  for (const p of players) {
    if (!ageEligible(p.birthYear, tournament.ageCategory)) {
      problems.push(`اللاعب «${publicPlayerName(p)}» خارج فئة البطولة العمرية (${AGE_CATEGORY_LABELS[tournament.ageCategory]}).`);
    }
  }
  if (players.length) {
    const clashes = await db.teamPlayer.findMany({
      where: {
        playerId: { in: players.map((p) => p.id) },
        teamId: { not: teamId },
        team: { registrations: { some: { tournamentId: tournament.id, status: 'approved' } } },
      },
      select: { player: { select: PUBLIC_PLAYER_SELECT }, team: { select: { nameAr: true } } },
    });
    for (const c of clashes) problems.push(`اللاعب «${publicPlayerName(c.player)}» مسجّل مع فريق «${c.team.nameAr}» في هذه البطولة.`);
  }
  return problems;
}
