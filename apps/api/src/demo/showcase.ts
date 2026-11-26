import { Controller, Delete, Get, HttpCode, Injectable, Post, Req, UseGuards } from '@nestjs/common';
import { Prisma, type ResultStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/arabic-error.filter';
import { AuthGuard, assertActive } from '../auth/auth.guard';
import { clientIp, type AuthContext, type AuthedRequest } from '../auth/auth.types';
import { computeStandings } from '../tournaments/standings';
import { crossQualifiers, drawGroups, knockoutStage, pairUp, roundRobin, seededRandom } from '../tournaments/fixtures';

/**
 * بيانات العرض (الجلسة 17): خمس بطولات وهمية تُظهر كل خصائص المنصة دفعة واحدة —
 * خروج المغلوب منتهٍ بشجرة كاملة وركلات ترجيح، دوري منتهٍ، مجموعات ثم خروج المغلوب جارية بمباراة مباشرة اليوم،
 * دوري جارٍ بنتائج مؤقتة ومعتمدة ومباريات قادمة، وبطولة بالتسجيل؛ مع الهدافين وأفضل اللاعبين والجوائز بكل حالاتها
 * (الأرشيف، بانتظار التأكيد، بانتظار التسليم، لم يُحدَّد الفائز) وخبرين وشريحة «مباراة اليوم».
 *
 * زر في لوحة المؤشرات للمدير العام (بـ TOTP): «إنشاء» و«حذف». كل ما يُنشأ مسجّل بأرقامه في سجل التدقيق
 * (demo.showcase_create)، والحذف يزيل هذه الأرقام وحدها — لا يلمس أي بيانات حقيقية ولا بيانات الزرع الأولى.
 * الهواتف وهمية في النطاق +9647700002000–2099.
 */

const MARK_SLUG = 'demo-abuhaider-cup';
const PHONE = (n: number) => `+964770000${2000 + n}`;

const FIRST = ['علي', 'حسين', 'محمد', 'مصطفى', 'حيدر', 'عباس', 'أحمد', 'كرار', 'سجاد', 'مرتضى', 'يوسف', 'زيد', 'عمار', 'ليث', 'منتظر', 'باقر', 'جعفر', 'حسن', 'أمير', 'رضا'];
const LAST = ['الساعدي', 'الربيعي', 'الموسوي', 'العبيدي', 'الجبوري', 'الخفاجي', 'الزبيدي', 'التميمي', 'الكعبي', 'الشمري', 'الدراجي', 'العامري', 'البديري', 'الحسناوي', 'السوداني', 'الكناني'];

interface TeamSpec { name: string; city: string; owner?: string }

const T1: TeamSpec[] = [ // متابعو أبو حيدر — خروج المغلوب منتهٍ
  { name: 'نسور أبو حيدر', city: 'بغداد', owner: 'حيدر الساعدي' }, { name: 'ذئاب الكوت', city: 'الكوت', owner: 'مرتضى العبيدي' },
  { name: 'فرسان الحلة', city: 'الحلة', owner: 'زيد الخفاجي' }, { name: 'صقور الديوانية', city: 'الديوانية', owner: 'عمار الكعبي' },
  { name: 'أسود النجف', city: 'النجف', owner: 'باقر الموسوي' }, { name: 'نجوم كربلاء', city: 'كربلاء', owner: 'جعفر الحسناوي' },
  { name: 'شباب السماوة', city: 'السماوة', owner: 'ليث الزبيدي' }, { name: 'عقبان العمارة', city: 'العمارة', owner: 'منتظر الدراجي' },
];
const T2: TeamSpec[] = [ // مجموعة شباب الناصرية — دوري منتهٍ
  { name: 'أبطال سوق الشيوخ', city: 'الناصرية' }, { name: 'شباب الشطرة', city: 'الناصرية' },
  { name: 'نسور الرفاعي', city: 'الناصرية' }, { name: 'فتيان الغراف', city: 'الناصرية' },
];
const T3: TeamSpec[] = [ // ساحات البصرة — مجموعات ثم خروج المغلوب، جارية
  { name: 'شباب العشار', city: 'البصرة' }, { name: 'نجوم الزبير', city: 'البصرة' }, { name: 'أسود أبي الخصيب', city: 'البصرة' }, { name: 'صقور القرنة', city: 'البصرة' },
  { name: 'فرسان الهارثة', city: 'البصرة' }, { name: 'نوارس الفاو', city: 'البصرة' }, { name: 'أبطال شط العرب', city: 'البصرة' }, { name: 'ذئاب المدينة', city: 'البصرة' },
];
const T4: TeamSpec[] = [ // متابعو علي كابتن — دوري جارٍ
  { name: 'تحدي الكابتن', city: 'بغداد', owner: 'علي الشمري' }, { name: 'نخبة الكرخ', city: 'بغداد', owner: 'رضا التميمي' },
  { name: 'رجال الرصافة', city: 'بغداد', owner: 'أمير الجبوري' }, { name: 'نمور الشعب', city: 'بغداد', owner: 'حسن البديري' },
  { name: 'برق الحرية', city: 'بغداد', owner: 'كرار العامري' }, { name: 'فهود الأمين', city: 'بغداد', owner: 'يوسف الكناني' },
];
const T5: TeamSpec[] = [ // مجموعة كرة البصرة — التسجيل مفتوح
  { name: 'أصدقاء الكورنيش', city: 'البصرة' }, { name: 'رابطة الجمهورية', city: 'البصرة' }, { name: 'شباب الأصمعي', city: 'البصرة' },
  { name: 'نادي الحيانية الشعبي', city: 'البصرة' }, { name: 'فريق التنومة', city: 'البصرة' },
];

/** تاريخ بتوقيت بغداد بعد/قبل أيام من اليوم */
function at(days: number, hour = 18, minute = 0): Date {
  const d = new Date();
  d.setUTCHours(hour - 3, minute, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

type Tx = Prisma.TransactionClient;
interface Made { users: number[]; teams: number[]; players: number[]; communities: number[]; tournaments: number[]; posts: number[]; slides: number[] }

@Injectable()
export class ShowcaseService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private superAdmin(auth: AuthContext) {
    assertActive(auth);
    if (!auth.mfa || !auth.grants.some((g) => g.role === 'super_admin')) {
      throw new AppError(403, 'FORBIDDEN', 'بيانات العرض للمدير العام فقط (دخول بالبريد ورمز التحقق).');
    }
  }

  /** GET /admin/demo/showcase — هل بيانات العرض موجودة؟ */
  async status(auth: AuthContext) {
    this.superAdmin(auth);
    const t = await this.prisma.tournament.findUnique({ where: { slug: MARK_SLUG }, select: { createdAt: true } });
    const ts = t ? await this.prisma.tournament.count({ where: { slug: { startsWith: 'demo-' } } }) : 0;
    return { exists: !!t, createdAt: t?.createdAt ?? null, tournaments: ts };
  }

  /** POST /admin/demo/showcase — ينشئ بيانات العرض (مرة واحدة) */
  async create(auth: AuthContext, ip: string) {
    this.superAdmin(auth);
    if (await this.prisma.tournament.findUnique({ where: { slug: MARK_SLUG }, select: { id: true } })) {
      throw new AppError(409, 'SHOWCASE_EXISTS', 'بيانات العرض موجودة بالفعل. احذفها أولاً إن أردت إنشاءها من جديد.');
    }
    const clash = await this.prisma.user.count({ where: { phone: { in: Array.from({ length: 100 }, (_, i) => PHONE(i)) } } });
    if (clash) throw new AppError(409, 'SHOWCASE_PHONES_USED', 'أرقام هواتف العرض الوهمية مستخدمة. احذف بيانات العرض السابقة أولاً.');

    const made: Made = { users: [], teams: [], players: [], communities: [], tournaments: [], posts: [], slides: [] };
    const summary = await this.prisma.$transaction(async (tx) => this.build(tx, auth.userId, made), { timeout: 120_000, maxWait: 10_000 });
    await this.audit.record({ actorUserId: auth.userId, action: 'demo.showcase_create', entity: 'system', entityId: 0, payload: { ids: made, summary } as unknown as Prisma.InputJsonValue, ip });
    return { created: true, ...summary };
  }

  /** DELETE /admin/demo/showcase — يحذف ما أنشأه زر العرض وحده */
  async remove(auth: AuthContext, ip: string) {
    this.superAdmin(auth);
    const logs = await this.prisma.auditLog.findMany({ where: { action: 'demo.showcase_create' }, select: { payload: true }, orderBy: { id: 'desc' }, take: 5 });
    if (!logs.length) throw new AppError(404, 'SHOWCASE_NOT_FOUND', 'لا توجد بيانات عرض لحذفها.');
    const ids = (k: keyof Made) => [...new Set(logs.flatMap((l) => {
      const v = (l.payload as { ids?: Partial<Made> } | null)?.ids?.[k];
      return Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x)) : [];
    }))];
    const counts = await this.prisma.$transaction(async (tx) => {
      const slides = await tx.heroSlide.deleteMany({ where: { id: { in: ids('slides') }, tournament: { slug: { startsWith: 'demo-' } } } });
      const posts = await tx.post.deleteMany({ where: { id: { in: ids('posts') }, slug: { startsWith: 'demo-' } } });
      const tours = await tx.tournament.deleteMany({ where: { id: { in: ids('tournaments') }, slug: { startsWith: 'demo-' } } });
      await tx.teamPlayer.deleteMany({ where: { teamId: { in: ids('teams') }, team: { manager: { phone: { startsWith: '+9647700002' } } } } });
      const teams = await tx.team.deleteMany({ where: { id: { in: ids('teams') }, manager: { phone: { startsWith: '+9647700002' } } } });
      await tx.player.deleteMany({ where: { id: { in: ids('players') }, OR: [{ user: { phone: { startsWith: '+9647700002' } } }, { guardian: { phone: { startsWith: '+9647700002' } } }] } });
      const users = await tx.user.deleteMany({ where: { id: { in: ids('users') }, phone: { startsWith: '+9647700002' } } });
      await tx.community.deleteMany({ where: { id: { in: ids('communities') }, tournaments: { none: {} } } });
      return { tournaments: tours.count, teams: teams.count, users: users.count, posts: posts.count, slides: slides.count };
    }, { timeout: 60_000 });
    await this.audit.record({ actorUserId: auth.userId, action: 'demo.showcase_delete', entity: 'system', entityId: 0, payload: counts, ip });
    return { deleted: true, ...counts };
  }

  // ───────────── البناء ─────────────

  private async build(tx: Tx, adminId: number, made: Made) {
    const rnd = seededRandom('saha-showcase-2026');
    const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
    let phoneN = 0;
    let shirt = 0;

    const referee = await tx.user.create({ data: { phone: PHONE(99), fullName: 'الحكم كاظم الربيعي', birthYear: 1982, roles: { create: { role: 'referee' } } } });
    made.users.push(referee.id);

    const community = async (kind: 'influencer' | 'facebook_group', nameAr: string, followersCount: number, platformUrl: string) => {
      const c = await tx.community.create({ data: { kind, nameAr, followersCount, platformUrl, verifiedAt: new Date(), verifyMethod: 'manual' } });
      made.communities.push(c.id);
      return c;
    };

    /** فريق + مديره + 7 لاعبين؛ يعيد الفريق ولاعبيه */
    const team = async (s: TeamSpec, communityId: number | null) => {
      const mgr = await tx.user.create({ data: { phone: PHONE(phoneN++), fullName: s.owner ?? `${pick(FIRST)} ${pick(LAST)}`, birthYear: 1985 + Math.floor(rnd() * 15) } });
      made.users.push(mgr.id);
      const t = await tx.team.create({
        data: { nameAr: s.name, city: s.city, managerId: mgr.id, ownerName: s.owner ?? null, communityId, verifiedAt: new Date(), verifyMethod: 'manual' },
      });
      made.teams.push(t.id);
      await tx.userRole.create({ data: { userId: mgr.id, role: 'team_manager', teamId: t.id } });
      const players: number[] = [];
      shirt = 0;
      for (let i = 0; i < 7; i++) {
        const p = await tx.player.create({
          data: {
            // الأول هو المدير نفسه بحسابه، والبقية تحت إدارته
            userId: i === 0 ? mgr.id : null, guardianId: i === 0 ? null : mgr.id,
            firstName: i === 0 ? mgr.fullName.split(' ')[0] : pick(FIRST), lastName: i === 0 ? mgr.fullName.split(' ').slice(1).join(' ') || pick(LAST) : pick(LAST),
            birthYear: 1994 + Math.floor(rnd() * 12), mediaConsent: true, consentAt: new Date(),
          },
        });
        made.players.push(p.id);
        players.push(p.id);
        await tx.teamPlayer.create({ data: { teamId: t.id, playerId: p.id, shirtNo: [1, 4, 5, 7, 9, 10, 11][shirt++] } });
      }
      return { id: t.id, nameAr: t.nameAr, managerId: mgr.id, players };
    };
    type T = Awaited<ReturnType<typeof team>>;

    const tournament = async (data: Omit<Prisma.TournamentUncheckedCreateInput, 'createdById'>, teams: T[], regStatus?: (i: number) => 'approved' | 'pending') => {
      const t = await tx.tournament.create({ data: { ...data, createdById: adminId } });
      made.tournaments.push(t.id);
      for (let i = 0; i < teams.length; i++) {
        const st = regStatus ? regStatus(i) : 'approved';
        await tx.tournamentRegistration.create({
          data: { tournamentId: t.id, teamId: teams[i].id, status: st, feePaidIqd: st === 'approved' ? data.entryFeeIqd ?? 0 : 0, feeRecordedBy: st === 'approved' ? adminId : null },
        });
      }
      return t;
    };

    /** مباراة بنتيجة وأحداث (أهداف موزعة على اللاعبين، بطاقات، أفضل لاعب) */
    const match = async (tid: number, stage: string, round: number, h: T, a: T, when: Date, venue: string,
      score: [number, number] | null, status: ResultStatus, pens?: [number, number], live?: string) => {
      const counted = status === 'final' || status === 'confirmed';
      const m = await tx.match.create({
        data: {
          tournamentId: tid, stage, round, homeTeamId: h.id, awayTeamId: a.id, kickoffAt: when, venue, refereeId: referee.id,
          homeScore: score?.[0] ?? null, awayScore: score?.[1] ?? null, homePens: pens?.[0] ?? null, awayPens: pens?.[1] ?? null,
          resultStatus: status, homeConfirmed: counted, awayConfirmed: counted,
          resultEnteredAt: score ? (status === 'provisional' || status === 'confirmed' ? new Date() : new Date(when.getTime() + 2 * 3600e3)) : null,
          finalizedAt: status === 'final' ? new Date(when.getTime() + 26 * 3600e3) : null,
          liveText: live ?? null, liveTextAt: live ? new Date() : null,
        },
      });
      if (score) {
        const events: Prisma.MatchEventCreateManyInput[] = [];
        const goals = (side: T, n: number) => {
          for (let g = 0; g < n; g++) {
            // المهاجمون (أرقام 9 و10 و11) يسجلون أكثر
            const p = rnd() < 0.65 ? side.players[4 + Math.floor(rnd() * 3)] : pick(side.players.slice(1));
            events.push({ matchId: m.id, teamId: side.id, playerId: p, type: 'goal', minute: 3 + Math.floor(rnd() * 85), createdById: referee.id });
          }
        };
        goals(h, score[0]);
        goals(a, score[1]);
        if (rnd() < 0.7) events.push({ matchId: m.id, teamId: (rnd() < 0.5 ? h : a).id, playerId: pick(h.players.slice(1)), type: 'yellow_card', minute: 20 + Math.floor(rnd() * 60), createdById: referee.id });
        if (rnd() < 0.15) events.push({ matchId: m.id, teamId: a.id, playerId: pick(a.players.slice(1)), type: 'red_card', minute: 70 + Math.floor(rnd() * 20), createdById: referee.id });
        const winner = score[0] > score[1] || (pens && pens[0] > pens[1]) ? h : a;
        events.push({ matchId: m.id, teamId: winner.id, playerId: winner.players[4 + Math.floor(rnd() * 3)], type: 'mvp', createdById: referee.id });
        // يُصحَّح فريق البطاقة: اللاعب من الفريق صاحب الحدث
        for (const e of events) if (e.type === 'yellow_card') e.playerId = pick((e.teamId === h.id ? h : a).players.slice(1));
        await tx.matchEvent.createMany({ data: events });
      }
      return m;
    };

    const prizes = async (tid: number, rows: { category: 'team_place' | 'best_player'; rank: number; amountIqd: number; extraAr?: string; titleAr?: string; team?: T; playerId?: number; state?: 'awarded' | 'delivered' | 'confirmed'; note?: string; daysAgo?: number }[]) => {
      for (const r of rows) {
        const state = r.team ? (r.state ?? 'awarded') : 'pending';
        const delivered = state === 'delivered' || state === 'confirmed';
        const ago = r.daysAgo ?? 5;
        const beneficiary = r.team?.managerId ?? null;
        await tx.prize.create({
          data: {
            tournamentId: tid, category: r.category, rank: r.rank, amountIqd: r.amountIqd, extraAr: r.extraAr ?? null, titleAr: r.titleAr ?? null,
            teamId: r.team?.id ?? null, playerId: r.category === 'best_player' ? r.playerId ?? null : null, status: state,
            awardedAt: r.team ? at(-ago - 1) : null,
            deliveredAt: delivered ? at(-ago, 20) : null, deliveredById: delivered ? adminId : null, deliveryNote: delivered ? r.note ?? 'سُلّمت في حفل الختام' : null,
            confirmedAt: state === 'confirmed' ? at(-ago + 1, 12) : null, confirmedById: state === 'confirmed' ? beneficiary : null,
            updatedById: adminId,
          },
        });
      }
      await tx.tournament.update({ where: { id: tid }, data: { prizesAnnouncedAt: at(-30, 12) } });
    };

    /** أفضل اللاعبين من الأحداث: الأكثر أهدافاً + جوائز أفضل لاعب */
    const topPlayers = async (tid: number, teams: T[]) => {
      const ev = await tx.matchEvent.findMany({ where: { match: { tournamentId: tid, resultStatus: { in: ['final', 'confirmed'] } }, type: { in: ['goal', 'mvp'] }, playerId: { not: null } }, select: { playerId: true, type: true } });
      const score = new Map<number, number>();
      for (const e of ev) score.set(e.playerId!, (score.get(e.playerId!) ?? 0) + (e.type === 'goal' ? 1 : 2));
      const ranked = [...score.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => id);
      return ranked.slice(0, 3).map((pid) => ({ playerId: pid, team: teams.find((t) => t.players.includes(pid))! }));
    };

    // ───── ١) كأس متابعي أبو حيدر — خروج المغلوب، منتهية، الجوائز في الأرشيف ─────
    const c1 = await community('influencer', 'أبو حيدر الرياضي', 1_250_000, 'https://www.instagram.com/');
    const t1Teams: T[] = [];
    for (const s of T1) t1Teams.push(await team(s, c1.id));
    const t1 = await tournament({
      nameAr: 'كأس متابعي أبو حيدر 2026', slug: MARK_SLUG, kind: 'influencer_followers', communityId: c1.id, communityKind: 'influencer',
      city: 'بغداد', startsOn: at(-45), endsOn: at(-25), format: 'knockout', status: 'finished', maxTeams: 8, entryFeeIqd: 0,
      drawSeed: 'showcase-1', drawnAt: at(-46),
    }, t1Teams);
    {
      let round = 1;
      let alive = [...t1Teams];
      const plan: Record<number, { s: [number, number]; p?: [number, number] }[]> = {
        1: [{ s: [3, 1] }, { s: [2, 2], p: [4, 3] }, { s: [0, 1] }, { s: [4, 2] }],
        2: [{ s: [2, 1] }, { s: [1, 1], p: [3, 5] }],
        3: [{ s: [2, 2], p: [5, 4] }],
      };
      let day = -42;
      let final: { winner: T; loser: T } | null = null;
      const semiLosers: T[] = [];
      while (alive.length > 1) {
        const pairs = pairUp(alive.map((x) => x.id));
        const next: T[] = [];
        for (let i = 0; i < pairs.length; i++) {
          const h = alive.find((x) => x.id === pairs[i].home)!;
          const a = alive.find((x) => x.id === pairs[i].away)!;
          const r = plan[round][i];
          await match(t1.id, knockoutStage(alive.length), round, h, a, at(day + i, 17 + (i % 2) * 2), round === 3 ? 'ملعب الشعب الدولي' : 'ملعب الكشافة', r.s, 'final', r.p);
          const hw = r.s[0] > r.s[1] || (r.s[0] === r.s[1] && r.p![0] > r.p![1]);
          next.push(hw ? h : a);
          if (alive.length === 4) semiLosers.push(hw ? a : h);
          if (alive.length === 2) final = { winner: hw ? h : a, loser: hw ? a : h };
        }
        alive = next;
        round++;
        day += 7;
      }
      const stars = await topPlayers(t1.id, t1Teams);
      await prizes(t1.id, [
        { category: 'team_place', rank: 1, amountIqd: 5_000_000, extraAr: 'كأس البطولة + 15 ميدالية ذهبية', team: final!.winner, state: 'confirmed', daysAgo: 24 },
        { category: 'team_place', rank: 2, amountIqd: 2_500_000, extraAr: 'ميداليات فضية', team: final!.loser, state: 'confirmed', daysAgo: 24 },
        { category: 'team_place', rank: 3, amountIqd: 1_000_000, team: semiLosers[0], state: 'confirmed', daysAgo: 23, note: 'تحويل عبر زين كاش' },
        { category: 'best_player', rank: 1, amountIqd: 750_000, titleAr: 'أفضل لاعب في البطولة', team: stars[0].team, playerId: stars[0].playerId, state: 'confirmed', daysAgo: 24 },
        { category: 'best_player', rank: 2, amountIqd: 400_000, titleAr: 'الهداف', team: stars[1].team, playerId: stars[1].playerId, state: 'confirmed', daysAgo: 22 },
        { category: 'best_player', rank: 3, amountIqd: 250_000, extraAr: 'حذاء كرة احترافي', team: stars[2].team, playerId: stars[2].playerId, state: 'delivered', daysAgo: 3, note: 'سُلّمت في مقر الرابطة' },
      ]);
    }

    // ───── ٢) دوري مجموعة شباب الناصرية — دوري منتهٍ، كل الجوائز مؤكدة ─────
    const c2 = await community('facebook_group', 'دوري شباب الناصرية', 86_000, 'https://www.facebook.com/groups/');
    const t2Teams: T[] = [];
    for (const s of T2) t2Teams.push(await team(s, c2.id));
    const t2 = await tournament({
      nameAr: 'دوري مجموعة شباب الناصرية', slug: 'demo-nasiriyah-league', kind: 'facebook_group', communityId: c2.id, communityKind: 'facebook_group',
      city: 'الناصرية', startsOn: at(-75), endsOn: at(-55), format: 'league', status: 'finished', maxTeams: 4, entryFeeIqd: 25_000,
      drawSeed: 'showcase-2', drawnAt: at(-76),
    }, t2Teams);
    {
      const scores: [number, number][] = [[2, 0], [1, 1], [3, 2], [0, 2], [1, 0], [2, 2]];
      let k = 0;
      const rounds = roundRobin(t2Teams.map((x) => x.id));
      for (let r = 0; r < rounds.length; r++) {
        for (const p of rounds[r]) {
          await match(t2.id, 'league', r + 1, t2Teams.find((x) => x.id === p.home)!, t2Teams.find((x) => x.id === p.away)!, at(-72 + r * 6 + (k % 2), 16), 'ساحة الحبوبي', scores[k++ % scores.length], 'final');
        }
      }
      const ms = await tx.match.findMany({ where: { tournamentId: t2.id } });
      const table = computeStandings(t2Teams.map((x) => ({ id: x.id, nameAr: x.nameAr })), ms);
      const byId = (id: number) => t2Teams.find((x) => x.id === id)!;
      const stars = await topPlayers(t2.id, t2Teams);
      await prizes(t2.id, [
        { category: 'team_place', rank: 1, amountIqd: 1_500_000, extraAr: 'درع الدوري', team: byId(table[0].team.id), state: 'confirmed', daysAgo: 54 },
        { category: 'team_place', rank: 2, amountIqd: 750_000, team: byId(table[1].team.id), state: 'confirmed', daysAgo: 54 },
        { category: 'team_place', rank: 3, amountIqd: 300_000, team: byId(table[2].team.id), state: 'confirmed', daysAgo: 53 },
        { category: 'best_player', rank: 1, amountIqd: 250_000, team: stars[0].team, playerId: stars[0].playerId, state: 'confirmed', daysAgo: 54 },
        { category: 'best_player', rank: 2, amountIqd: 150_000, team: stars[1].team, playerId: stars[1].playerId, state: 'confirmed', daysAgo: 54 },
        { category: 'best_player', rank: 3, amountIqd: 100_000, team: stars[2].team, playerId: stars[2].playerId, state: 'confirmed', daysAgo: 52 },
      ]);
    }

    // ───── ٣) ساحات البصرة الكبرى — مجموعتان ثم خروج المغلوب، جارية، نصف نهائي مباشر اليوم ─────
    const t3Teams: T[] = [];
    for (const s of T3) t3Teams.push(await team(s, null));
    const t3 = await tournament({
      nameAr: 'بطولة ساحات البصرة الكبرى', slug: 'demo-basra-groups', kind: 'popular_teams', city: 'البصرة',
      startsOn: at(-20), endsOn: at(5), format: 'groups_knockout', groupCount: 2, qualifiersPerGroup: 2, status: 'running', maxTeams: 8, entryFeeIqd: 50_000,
      drawSeed: 'showcase-3', drawnAt: at(-21),
    }, t3Teams);
    let liveMatchId = 0;
    {
      const groups = drawGroups(t3Teams.map((x) => x.id), 2, 'showcase-3');
      const byId = (id: number) => t3Teams.find((x) => x.id === id)!;
      const tables: number[][] = [];
      let day = -18;
      for (const g of groups) {
        await tx.tournamentRegistration.updateMany({ where: { tournamentId: t3.id, teamId: { in: g.teamIds } }, data: { groupLabel: g.label } });
        const rounds = roundRobin(g.teamIds);
        for (let r = 0; r < rounds.length; r++) {
          for (const p of rounds[r]) {
            const hs = Math.floor(rnd() * 4);
            const as = Math.floor(rnd() * 3);
            await match(t3.id, 'group', r + 1, byId(p.home), byId(p.away), at(day + r * 3, 16 + Math.floor(rnd() * 4)), pick(['ساحة العشار', 'ملعب الزبير الشعبي', 'ساحة الجمعيات']), [hs, as], 'final');
          }
        }
        day += 1;
        const ms = await tx.match.findMany({ where: { tournamentId: t3.id, stage: 'group', homeTeamId: { in: g.teamIds } } });
        tables.push(computeStandings(g.teamIds.map((id) => ({ id, nameAr: byId(id).nameAr })), ms).map((r) => r.team.id));
      }
      const semis = crossQualifiers(tables, 2);
      await match(t3.id, 'sf', 4, byId(semis[0].home), byId(semis[0].away), at(-1, 19), 'ملعب البصرة الأولمبي', [2, 1], 'final');
      const live = await match(t3.id, 'sf', 4, byId(semis[1].home), byId(semis[1].away), at(0, 20), 'ملعب البصرة الأولمبي', null, 'scheduled', undefined, '1 - 0 · الدقيقة 63');
      liveMatchId = live.id;
      await prizes(t3.id, [
        { category: 'team_place', rank: 1, amountIqd: 3_000_000, extraAr: 'كأس ساحات البصرة' },
        { category: 'team_place', rank: 2, amountIqd: 1_500_000 },
        { category: 'team_place', rank: 3, amountIqd: 500_000 },
        { category: 'best_player', rank: 1, amountIqd: 400_000, titleAr: 'أفضل لاعب' },
        { category: 'best_player', rank: 2, amountIqd: 250_000, titleAr: 'الهداف' },
        { category: 'best_player', rank: 3, amountIqd: 0, extraAr: 'قفازا حارس احترافيان', titleAr: 'أفضل حارس' },
      ]);
    }

    // ───── ٤) كأس تحديات علي كابتن — دوري جارٍ: نهائية ومعتمدة ومؤقتة وقادمة ─────
    const c3 = await community('influencer', 'تحديات علي كابتن', 640_000, 'https://www.tiktok.com/');
    const t4Teams: T[] = [];
    for (const s of T4) t4Teams.push(await team(s, c3.id));
    const t4 = await tournament({
      nameAr: 'كأس تحديات علي كابتن', slug: 'demo-ali-challenge', kind: 'influencer_followers', communityId: c3.id, communityKind: 'influencer',
      city: 'بغداد', startsOn: at(-12), endsOn: at(16), format: 'league', status: 'running', maxTeams: 6, entryFeeIqd: 0,
      drawSeed: 'showcase-4', drawnAt: at(-13),
    }, t4Teams);
    {
      const byId = (id: number) => t4Teams.find((x) => x.id === id)!;
      const rounds = roundRobin(t4Teams.map((x) => x.id));
      for (let r = 0; r < rounds.length; r++) {
        for (let i = 0; i < rounds[r].length; i++) {
          const p = rounds[r][i];
          const day = -10 + r * 4 + i;
          const played = day < 0;
          const status: ResultStatus = !played ? 'scheduled' : r < 2 ? 'final' : i === 0 ? 'confirmed' : 'provisional';
          await match(t4.id, 'league', r + 1, byId(p.home), byId(p.away), at(day, 21), 'ملعب نادي الصيد', played ? [Math.floor(rnd() * 4), Math.floor(rnd() * 3)] : null, status);
        }
      }
      const stars = await topPlayers(t4.id, t4Teams);
      await prizes(t4.id, [
        { category: 'team_place', rank: 1, amountIqd: 2_000_000, extraAr: 'رحلة للفريق إلى أربيل' },
        { category: 'team_place', rank: 2, amountIqd: 1_000_000 },
        { category: 'team_place', rank: 3, amountIqd: 500_000 },
        // جائزة شهرية حُسمت مبكراً: بانتظار التسليم
        { category: 'best_player', rank: 1, amountIqd: 300_000, titleAr: 'نجم الجولات الأولى', team: stars[0]?.team, playerId: stars[0]?.playerId, state: 'awarded', daysAgo: 2 },
        { category: 'best_player', rank: 2, amountIqd: 200_000 },
        { category: 'best_player', rank: 3, amountIqd: 100_000 },
      ]);
    }

    // ───── ٥) بطولة أعضاء مجموعة كرة البصرة — التسجيل مفتوح، الجوائز معلنة مسبقاً ─────
    const c4 = await community('facebook_group', 'مجموعة كرة البصرة', 120_000, 'https://www.facebook.com/groups/');
    const t5Teams: T[] = [];
    for (const s of T5) t5Teams.push(await team(s, c4.id));
    const t5 = await tournament({
      nameAr: 'بطولة أعضاء مجموعة كرة البصرة', slug: 'demo-basra-group-cup', kind: 'facebook_group', communityId: c4.id, communityKind: 'facebook_group',
      city: 'البصرة', startsOn: at(10), endsOn: at(30), format: 'knockout', status: 'registration', maxTeams: 16, entryFeeIqd: 30_000,
    }, t5Teams, (i) => (i < 3 ? 'approved' : 'pending'));
    await prizes(t5.id, [
      { category: 'team_place', rank: 1, amountIqd: 2_500_000, extraAr: 'كأس المجموعة' },
      { category: 'team_place', rank: 2, amountIqd: 1_000_000 },
      { category: 'team_place', rank: 3, amountIqd: 500_000 },
      { category: 'best_player', rank: 1, amountIqd: 300_000 },
      { category: 'best_player', rank: 2, amountIqd: 200_000 },
      { category: 'best_player', rank: 3, amountIqd: 0, extraAr: 'قميص موقّع' },
    ]);

    // ───── الأخبار وشريحة «مباراة اليوم» ─────
    const post = async (slug: string, titleAr: string, bodyAr: string, days: number) => {
      const p = await tx.post.create({ data: { type: 'news', slug, titleAr, bodyAr, status: 'published', publishedAt: at(days, 12), authorId: adminId } });
      made.posts.push(p.id);
    };
    await post('demo-abuhaider-champion', 'نسور البطولة يرفعون كأس متابعي أبو حيدر', 'حُسم النهائي بركلات الترجيح بعد تعادل مثير، وسُلّمت جوائز المراكز الثلاثة الأولى وأفضل اللاعبين في حفل الختام بملعب الشعب. الجوائز وأسماء الفائزين في سجل الجوائز.', -24);
    await post('demo-basra-semis', 'الليلة: نصف نهائي ساحات البصرة الكبرى', 'بعد دور مجموعات قوي تأهل أربعة فرق إلى نصف النهائي. المباراة الثانية الليلة على ملعب البصرة الأولمبي، والفائز يلاقي المتأهل الأول في النهائي على جوائز مجموعها 5,650,000 دينار.', 0);
    await post('demo-basra-group-registration', 'التسجيل مفتوح لبطولة أعضاء مجموعة كرة البصرة', 'سجّل فريقك من التطبيق: البطولة بنظام خروج المغلوب لـ 16 فريقاً، والجوائز معلنة مسبقاً: 2,500,000 دينار للبطل.', -2);
    const slide = await tx.heroSlide.create({
      data: { type: 'match', titleAr: 'مباشر: نصف نهائي ساحات البصرة', subtitleAr: 'الدقيقة 63 — على ملعب البصرة الأولمبي', matchId: liveMatchId, tournamentId: t3.id, status: 'published', priority: 20, approvedById: adminId, approvedAt: new Date(), createdById: adminId },
    });
    made.slides.push(slide.id);

    return {
      tournaments: made.tournaments.length, teams: made.teams.length, players: made.players.length,
      matches: await tx.match.count({ where: { tournamentId: { in: made.tournaments } } }),
      prizes: await tx.prize.count({ where: { tournamentId: { in: made.tournaments } } }),
      slugs: ['demo-abuhaider-cup', 'demo-nasiriyah-league', 'demo-basra-groups', 'demo-ali-challenge', 'demo-basra-group-cup'],
    };
  }
}

@Controller('admin/demo/showcase')
@UseGuards(AuthGuard)
export class ShowcaseController {
  constructor(private readonly svc: ShowcaseService) {}

  @Get()
  status(@Req() req: AuthedRequest) {
    return this.svc.status(req.auth);
  }

  @Post() @HttpCode(201)
  create(@Req() req: AuthedRequest) {
    return this.svc.create(req.auth, clientIp(req));
  }

  @Delete() @HttpCode(200)
  remove(@Req() req: AuthedRequest) {
    return this.svc.remove(req.auth, clientIp(req));
  }
}
