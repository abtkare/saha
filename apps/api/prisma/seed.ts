/**
 * البيانات الأولية: أول مدير عام (من .env) + بيانات تجريبية للعرض (إن كان SEED_DEMO=true والقاعدة فارغة).
 * آمن للتشغيل عند كل إقلاع: لا يكرر شيئاً موجوداً.
 * كل الأسماء هنا خيالية للعرض فقط.
 */
import { PrismaClient, Prisma, ResultStatus } from '@prisma/client';
import { randomBytes, scryptSync } from 'node:crypto';
import { writeAudit } from '../src/audit/write-audit';

const prisma = new PrismaClient();

/** صيغة كلمة السر: scrypt$<salt hex>$<hash hex> (تُستخدم نفسها في الجلسة 2) */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_INITIAL_PASSWORD;
  if (!email || !password) return null;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const admin = await prisma.user.create({
    data: {
      email,
      fullName: 'المدير العام',
      passwordHash: hashPassword(password),
      roles: { create: { role: 'super_admin' } },
    },
  });
  await writeAudit(prisma, { action: 'user.create_admin', entity: 'user', entityId: admin.id, payload: { email } });
  console.log(`أُنشئ حساب المدير العام: ${email}`);
  return admin;
}

const TEAMS = ['شباب الكرادة', 'نجوم الأعظمية', 'أسود الكاظمية', 'صقور المنصور', 'فرسان الشعلة', 'أبطال الدورة'];

function at(daysFromToday: number, hour: number): Date {
  // توقيت بغداد UTC+3
  const d = new Date();
  d.setUTCHours(hour - 3, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d;
}

async function seedDemo(adminId: number | null) {
  if ((await prisma.tournament.count()) > 0) {
    console.log('البيانات التجريبية موجودة مسبقاً — تخطّي.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    const audit = (action: string, entity: string, entityId: number, payload: Prisma.InputJsonValue = {}) =>
      writeAudit(tx, { actorUserId: adminId, action, entity, entityId, payload: { ...(payload as object), demo: true } });

    // مدراء الفرق والحكم (أرقام وهمية)
    const referee = await tx.user.create({
      data: { phone: '+9647700000100', fullName: 'الحكم سامر', birthYear: 1985, roles: { create: { role: 'referee' } } },
    });

    const teams = [];
    for (let i = 0; i < TEAMS.length; i++) {
      const manager = await tx.user.create({
        data: { phone: `+96477000001${10 + i}`, fullName: `مدير ${TEAMS[i]}`, birthYear: 1990 + i },
      });
      const team = await tx.team.create({
        data: {
          nameAr: TEAMS[i],
          city: 'بغداد',
          managerId: manager.id,
          verifiedAt: i < 4 ? new Date() : null,
          verifyMethod: i < 4 ? 'manual' : null,
        },
      });
      await tx.userRole.create({ data: { userId: manager.id, role: 'team_manager', teamId: team.id } });
      // لاعبان بالغان لكل فريق
      for (let p = 1; p <= 2; p++) {
        const player = await tx.player.create({
          data: { userId: p === 1 ? manager.id : null, guardianId: p === 1 ? null : manager.id, firstName: `لاعب ${p}`, birthYear: p === 1 ? 1995 : 2010, mediaConsent: true, consentAt: new Date() },
        });
        await tx.teamPlayer.create({ data: { teamId: team.id, playerId: player.id, shirtNo: p * 7 } });
      }
      await audit('team.create', 'team', team.id, { nameAr: team.nameAr });
      teams.push(team);
    }

    // ١) بطولة فرق شعبية — جارية
    const popular = await tx.tournament.create({
      data: {
        nameAr: 'بطولة ساحات بغداد الشعبية', slug: 'baghdad-sahat-2026', kind: 'popular_teams', city: 'بغداد',
        startsOn: at(-10, 12), endsOn: at(20, 12), format: 'league', status: 'running', entryFeeIqd: 50000, feesEnabled: true,
        maxTeams: 6, createdById: adminId,
      },
    });
    await audit('tournament.create', 'tournament', popular.id, { kind: 'popular_teams' });
    for (const team of teams) {
      await tx.tournamentRegistration.create({
        data: { tournamentId: popular.id, teamId: team.id, status: 'approved', feePaidIqd: 50000, feeRecordedBy: adminId },
      });
    }

    const fixtures: [number, number, number, number | null, number | null, ResultStatus][] = [
      // [home, away, day, homeScore, awayScore, status]
      [0, 1, -7, 2, 1, 'final'], [2, 3, -7, 0, 0, 'final'], [4, 5, -7, 3, 2, 'final'],
      [0, 2, -3, 1, 1, 'confirmed'], [1, 4, -3, 2, 0, 'provisional'], [3, 5, -3, 1, 2, 'disputed'],
      [0, 3, 0, null, null, 'scheduled'], [1, 5, 0, null, null, 'scheduled'], [2, 4, 1, null, null, 'scheduled'],
    ];
    let todayMatchId = 0;
    for (const [h, a, day, hs, as, status] of fixtures) {
      const m = await tx.match.create({
        data: {
          tournamentId: popular.id, round: day < -5 ? 1 : day < 0 ? 2 : 3,
          homeTeamId: teams[h].id, awayTeamId: teams[a].id, kickoffAt: at(day, 18), venue: 'ساحة الكرادة',
          refereeId: referee.id, homeScore: hs, awayScore: as, resultStatus: status,
          homeConfirmed: status === 'final' || status === 'confirmed', awayConfirmed: status === 'final' || status === 'confirmed',
          // النتائج المفتوحة (مؤقتة/معتمدة) تبدأ مهلتها الآن حتى لا تُنهيها المهمة الخلفية فور الإقلاع
          resultEnteredAt: hs === null ? null : status === 'provisional' || status === 'confirmed' ? new Date() : at(day, 20), finalizedAt: status === 'final' ? at(day + 1, 20) : null,
        },
      });
      if (day === 0 && !todayMatchId) todayMatchId = m.id;
      if (hs) {
        await tx.matchEvent.create({ data: { matchId: m.id, teamId: teams[h].id, type: 'goal', minute: 23, createdById: referee.id } });
      }
      if (status === 'disputed') {
        const manager = await tx.user.findFirstOrThrow({ where: { managedTeams: { some: { id: teams[a].id } } } });
        const d = await tx.dispute.create({ data: { matchId: m.id, raisedById: manager.id, teamId: teams[a].id, reason: 'لاعب غير مسجّل شارك في الشوط الثاني.' } });
        await audit('dispute.open', 'dispute', d.id, { matchId: m.id });
      }
      await audit('match.create', 'match', m.id, { status });
    }

    // ٢) بطولة متابعي مؤثر — التسجيل مفتوح
    const influencer = await tx.community.create({
      data: { kind: 'influencer', nameAr: 'قناة تحديات الكرة (تجريبي)', followersCount: 250000, verifiedAt: new Date(), verifyMethod: 'manual' },
    });
    const infT = await tx.tournament.create({
      data: {
        nameAr: 'كأس متابعي تحديات الكرة', slug: 'challenge-fans-cup', kind: 'influencer_followers',
        communityId: influencer.id, communityKind: 'influencer', city: 'بغداد',
        startsOn: at(14, 12), endsOn: at(30, 12), format: 'knockout', status: 'registration', maxTeams: 16, createdById: adminId,
      },
    });
    await audit('tournament.create', 'tournament', infT.id, { kind: 'influencer_followers', communityId: influencer.id });

    // ٣) بطولة أعضاء مجموعة فيسبوك — التسجيل مفتوح
    const group = await tx.community.create({
      data: { kind: 'facebook_group', nameAr: 'مجموعة شباب الحلة الرياضية (تجريبي)', followersCount: 42000 },
    });
    const grpT = await tx.tournament.create({
      data: {
        nameAr: 'بطولة أعضاء مجموعة شباب الحلة', slug: 'hilla-group-cup', kind: 'facebook_group',
        communityId: group.id, communityKind: 'facebook_group', city: 'الحلة',
        startsOn: at(21, 12), endsOn: at(35, 12), format: 'groups_knockout', ageCategory: 'u18', status: 'registration',
        maxTeams: 8, createdById: adminId,
      },
    });
    await audit('tournament.create', 'tournament', grpT.id, { kind: 'facebook_group', communityId: group.id });

    // الرعاة والشرائح والأخبار
    const sponsor = await tx.sponsor.create({ data: { nameAr: 'راعٍ تجريبي', website: null } });
    await tx.heroSlide.createMany({
      data: [
        { type: 'match', titleAr: 'مباراة اليوم', subtitleAr: 'شباب الكرادة × صقور المنصور — 6 مساءً', matchId: todayMatchId, tournamentId: popular.id, status: 'published', priority: 10, approvedById: adminId, approvedAt: new Date(), createdById: adminId },
        { type: 'sponsor', titleAr: 'برعاية راعٍ تجريبي', subtitleAr: 'شريكنا في بطولات الحارة', sponsorId: sponsor.id, status: 'published', priority: 5, approvedById: adminId, approvedAt: new Date(), createdById: adminId },
        { type: 'tournament', titleAr: 'سجّل فريقك في كأس متابعي تحديات الكرة', tournamentId: infT.id, status: 'draft', createdById: adminId },
      ],
    });
    await tx.post.createMany({
      data: [
        { type: 'news', slug: 'saha-launch', titleAr: 'ساحة: كل جمهور يستحق بطولته', bodyAr: 'منصة لتنظيم بطولات الفرق الشعبية ومتابعي المؤثرين وأعضاء مجموعات فيسبوك.', status: 'published', publishedAt: new Date(), authorId: adminId },
        { type: 'page', slug: 'terms', titleAr: 'الشروط والأحكام', bodyAr: 'مسودة — تُراجع من محامٍ قبل الإطلاق.', status: 'draft', authorId: adminId },
      ],
    });
    await audit('seed.demo', 'system', 0, { tournaments: 3, teams: TEAMS.length });
  }, { timeout: 60000 });

  console.log('زُرعت البيانات التجريبية: 3 بطولات (شعبية، مؤثر، مجموعة فيسبوك) و6 فرق.');
}

async function main() {
  const admin = await seedAdmin();
  if (process.env.SEED_DEMO === 'true') await seedDemo(admin?.id ?? null);
}

main()
  .catch((e) => {
    console.error('فشل زرع البيانات:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
