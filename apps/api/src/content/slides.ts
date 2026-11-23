import { Body, Controller, Get, Header, HttpCode, Injectable, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CONTENT_STATUSES, HERO_MAX_SLIDES, HERO_REFRESH_SECONDS, LIVE_TEXT_MAX, PAID_SLIDE_TYPES, SLIDE_EVENT_TYPES, SLIDE_TYPES,
  hasPermission, type ContentStatus, type SlideType,
} from '@saha/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/arabic-error.filter';
import { idParam, int, nullableStr, oneOf, str } from '../common/validate';
import { AuthGuard, assertActive, assertCan } from '../auth/auth.guard';
import { clientIp, type AuthContext, type AuthedRequest } from '../auth/auth.types';
import { RateLimitService } from '../auth/rate-limit.service';
import { UploadsService } from '../uploads/uploads';
import { baghdadToday } from '../matches/matches.service';
import { assertAny, canAny, conflict, datetime, linkUrl, raced } from './common';

type B = Record<string, unknown>;
type Ctx = { auth: AuthContext; ip: string };

/** الشريحة «حيّة» الآن: منشورة (أي معتمدة) وداخل فترة عرضها */
export const liveSlideWhere = (now: Date): Prisma.HeroSlideWhereInput => ({
  status: 'published',
  approvedAt: { not: null },
  AND: [
    { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
    { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    { OR: [{ type: { not: 'match' } }, { match: { tournament: { status: { not: 'draft' } } } }] },
  ],
});

const HERO_SELECT = {
  id: true, type: true, titleAr: true, subtitleAr: true, imageUrl: true, linkUrl: true,
  sponsor: { select: { id: true, nameAr: true, logoUrl: true, website: true } },
  tournament: { select: { id: true, nameAr: true, slug: true } },
  match: {
    select: {
      id: true, kickoffAt: true, venue: true, resultStatus: true, homeScore: true, awayScore: true, homePens: true, awayPens: true,
      liveText: true, liveTextAt: true,
      tournament: { select: { id: true, nameAr: true, slug: true } },
      homeTeam: { select: { id: true, nameAr: true, logoUrl: true } },
      awayTeam: { select: { id: true, nameAr: true, logoUrl: true } },
    },
  },
} as const;
type HeroRow = Prisma.HeroSlideGetPayload<{ select: typeof HERO_SELECT }>;

function heroSlide(s: HeroRow) {
  const m = s.match;
  return {
    id: s.id, type: s.type, titleAr: s.titleAr, subtitleAr: s.subtitleAr, imageUrl: s.imageUrl, linkUrl: s.linkUrl,
    sponsored: PAID_SLIDE_TYPES.includes(s.type as SlideType),
    sponsor: s.type === 'sponsor' ? s.sponsor : null,
    tournament: s.tournament,
    match: s.type === 'match' && m
      ? {
          ...m,
          // النتيجة النصية للمباراة الجارية فقط؛ بعد إدخال الحكم للنتيجة تُعرض النتيجة الرسمية وحالتها
          liveText: m.resultStatus === 'scheduled' ? m.liveText : null,
          liveTextAt: m.resultStatus === 'scheduled' ? m.liveTextAt : null,
        }
      : null,
  };
}

const ADMIN_SELECT = {
  id: true, type: true, titleAr: true, subtitleAr: true, imageUrl: true, linkUrl: true, sponsorId: true, tournamentId: true, matchId: true,
  status: true, priority: true, startsAt: true, endsAt: true, reviewNote: true,
  approvedAt: true, approvedBy: { select: { id: true, fullName: true } },
  createdBy: { select: { id: true, fullName: true } }, updatedBy: { select: { id: true, fullName: true } },
  createdAt: true, updatedAt: true,
  sponsor: { select: { id: true, nameAr: true } },
} as const;

/** من يكتب شريحة من هذا النوع: محرر المحتوى لكل الأنواع، ومدير الرعاة لشرائح الرعاة فقط */
const draftPerms = (type: SlideType) => (type === 'sponsor' ? (['content.draft', 'slides.sponsor'] as const) : (['content.draft'] as const));

/**
 * الجلسة 5 — الهيرو سلايدر:
 * مسودة ← قيد المراجعة ← منشورة (اعتماد من يملك content.publish) ← مؤرشفة.
 * الشريحة المدفوعة (راعٍ) لا يعتمدها من أنشأها أو آخر من عدّلها. أي تعديل لمحتوى شريحة معتمدة يسحب اعتمادها
 * (Trigger في القاعدة) فتعود «قيد المراجعة» وتختفي حتى تُعتمد من جديد.
 */
@Injectable()
export class SlidesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly uploads: UploadsService,
    private readonly rate: RateLimitService,
  ) {}

  // ───────────── العامة ─────────────

  async hero(now = new Date()) {
    const rows = await this.prisma.heroSlide.findMany({
      where: liveSlideWhere(now),
      orderBy: [{ priority: 'desc' }, { id: 'asc' }],
      take: HERO_MAX_SLIDES,
      select: HERO_SELECT,
    });
    return { refreshSeconds: HERO_REFRESH_SECONDS, slides: rows.map(heroSlide) };
  }

  /**
   * POST /hero/:id/events {type, deviceId}
   * صف واحد لكل (شريحة، نوع، جهاز، يوم بتوقيت بغداد) — التكرار لا يُحسب. النقرة لا تُحسب إلا بعد ظهور
   * مسجّل للجهاز نفسه في اليوم نفسه، والشريحة يجب أن تكون حيّة لحظة الحدث.
   */
  async event(id: number, body: B, ip: string) {
    const type = oneOf(body, 'type', SLIDE_EVENT_TYPES, { label: 'نوع الحدث' })!;
    const deviceId = str(body, 'deviceId', { min: 8, max: 64, label: 'معرّف الجهاز' })!;
    if (!/^[A-Za-z0-9_-]+$/.test(deviceId)) throw new AppError(400, 'VALIDATION_ERROR', 'معرّف الجهاز غير صحيح.');
    await this.rate.consume({ key: `hero:ip:${ip}`, max: 600, windowSec: 3600 });
    const now = new Date();
    const live = await this.prisma.heroSlide.findFirst({ where: { id, ...liveSlideWhere(now) }, select: { id: true } });
    if (!live) throw new AppError(404, 'SLIDE_NOT_LIVE', 'الشريحة غير معروضة الآن.');
    const day = baghdadToday(now);
    const n = type === 'impression'
      ? await this.prisma.$executeRaw`
          INSERT INTO slide_events (slide_id, type, device_id, day) VALUES (${id}, 'impression', ${deviceId}, ${day}::date)
          ON CONFLICT DO NOTHING`
      : await this.prisma.$executeRaw`
          INSERT INTO slide_events (slide_id, type, device_id, day)
          SELECT ${id}, 'click', ${deviceId}, ${day}::date
          WHERE EXISTS (SELECT 1 FROM slide_events WHERE slide_id = ${id} AND type = 'impression' AND device_id = ${deviceId} AND day = ${day}::date)
          ON CONFLICT DO NOTHING`;
    return { counted: n > 0 };
  }

  // ───────────── الإدارة ─────────────

  private async load(id: number) {
    const s = await this.prisma.heroSlide.findUnique({ where: { id } });
    if (!s) throw new AppError(404, 'SLIDE_NOT_FOUND', 'الشريحة غير موجودة.');
    return s;
  }

  private canDraft(auth: AuthContext, type: SlideType) {
    return canAny(auth, draftPerms(type));
  }

  async list(auth: AuthContext, status?: string) {
    assertAny(auth, ['content.draft', 'slides.sponsor', 'content.publish']);
    if (status !== undefined && !(CONTENT_STATUSES as readonly string[]).includes(status)) throw new AppError(400, 'VALIDATION_ERROR', 'حالة غير معروفة.');
    const onlySponsor = !canAny(auth, ['content.draft', 'content.publish']);
    return this.prisma.heroSlide.findMany({
      where: { ...(status ? { status: status as ContentStatus } : {}), ...(onlySponsor ? { type: 'sponsor' } : {}) },
      orderBy: [{ status: 'asc' }, { priority: 'desc' }, { id: 'desc' }],
      select: ADMIN_SELECT,
    });
  }

  async get(id: number, auth: AuthContext) {
    const s = await this.prisma.heroSlide.findUnique({ where: { id }, select: ADMIN_SELECT });
    if (!s) throw new AppError(404, 'SLIDE_NOT_FOUND', 'الشريحة غير موجودة.');
    if (!this.canDraft(auth, s.type) && !canAny(auth, ['content.publish'])) throw new AppError(403, 'FORBIDDEN', 'لا تملك صلاحية لهذا الإجراء.');
    return s;
  }

  /** يقرأ حقول المحتوى من الطلب ويتحقق من ارتباطاتها حسب نوع الشريحة */
  private async fields(body: B, type: SlideType, auth: AuthContext, current?: { sponsorId: number | null; matchId: number | null; tournamentId: number | null; startsAt: Date | null; endsAt: Date | null }) {
    const data: Prisma.HeroSlideUncheckedUpdateInput = {};
    const titleAr = str(body, 'titleAr', { optional: !!current, min: 2, max: 80, label: 'العنوان' });
    if (titleAr !== undefined) data.titleAr = titleAr;
    const subtitleAr = nullableStr(body, 'subtitleAr', { max: 140, label: 'النص الفرعي' });
    if (subtitleAr !== undefined) data.subtitleAr = subtitleAr;
    const link = linkUrl(body);
    if (link !== undefined) data.linkUrl = link;
    if (body.imageMediaId === null) data.imageUrl = null;
    else {
      const mediaId = int(body, 'imageMediaId', { optional: true, min: 1, label: 'الصورة' });
      if (mediaId !== undefined) data.imageUrl = await this.uploads.publicOwned(mediaId, auth.userId);
    }
    const priority = int(body, 'priority', { optional: true, min: 0, max: 100, label: 'الأولوية' });
    if (priority !== undefined) data.priority = priority;
    const startsAt = datetime(body, 'startsAt', 'بداية العرض');
    if (startsAt !== undefined) data.startsAt = startsAt;
    const endsAt = datetime(body, 'endsAt', 'نهاية العرض');
    if (endsAt !== undefined) data.endsAt = endsAt;
    const s = startsAt !== undefined ? startsAt : current?.startsAt ?? null;
    const e = endsAt !== undefined ? endsAt : current?.endsAt ?? null;
    if (s && e && e <= s) throw new AppError(400, 'INVALID_WINDOW', 'نهاية العرض يجب أن تكون بعد بدايته.');

    for (const [field, label] of [['sponsorId', 'الراعي'], ['matchId', 'المباراة'], ['tournamentId', 'البطولة']] as const) {
      if (body[field] === null) data[field] = null;
      else {
        const v = int(body, field, { optional: true, min: 1, label });
        if (v !== undefined) data[field] = v;
      }
    }
    const sponsorId = data.sponsorId !== undefined ? (data.sponsorId as number | null) : current?.sponsorId ?? null;
    const matchId = data.matchId !== undefined ? (data.matchId as number | null) : current?.matchId ?? null;
    const tournamentId = data.tournamentId !== undefined ? (data.tournamentId as number | null) : current?.tournamentId ?? null;
    if (type === 'sponsor' && !sponsorId) throw new AppError(400, 'SPONSOR_REQUIRED', 'شريحة الراعي تحتاج تحديد الراعي.');
    if (type !== 'sponsor' && sponsorId) throw new AppError(400, 'SPONSOR_NOT_ALLOWED', 'الراعي يُحدَّد لشرائح الرعاة فقط.');
    if (type === 'match' && !matchId) throw new AppError(400, 'MATCH_REQUIRED', 'شريحة «مباراة اليوم» تحتاج تحديد المباراة.');
    if (type !== 'match' && matchId) throw new AppError(400, 'MATCH_NOT_ALLOWED', 'المباراة تُحدَّد لشرائح «مباراة اليوم» فقط.');
    if (type === 'tournament' && !tournamentId) throw new AppError(400, 'TOURNAMENT_REQUIRED', 'شريحة البطولة تحتاج تحديد البطولة.');
    if (data.sponsorId && !(await this.prisma.sponsor.findUnique({ where: { id: data.sponsorId as number } }))) throw new AppError(404, 'SPONSOR_NOT_FOUND', 'الراعي غير موجود.');
    if (data.tournamentId && !(await this.prisma.tournament.findUnique({ where: { id: data.tournamentId as number } }))) throw new AppError(404, 'TOURNAMENT_NOT_FOUND', 'البطولة غير موجودة.');
    if (data.matchId) {
      const m = await this.prisma.match.findUnique({ where: { id: data.matchId as number }, select: { tournamentId: true } });
      if (!m) throw new AppError(404, 'MATCH_NOT_FOUND', 'المباراة غير موجودة.');
      if (data.tournamentId === undefined && !current) data.tournamentId = m.tournamentId;
    }
    return data;
  }

  async create(body: B, { auth, ip }: Ctx) {
    assertActive(auth);
    const type = oneOf(body, 'type', SLIDE_TYPES, { label: 'نوع الشريحة' })!;
    if (!this.canDraft(auth, type)) {
      throw new AppError(403, 'FORBIDDEN', canAny(auth, ['slides.sponsor']) ? 'مدير الرعاة يكتب شرائح الرعاة فقط.' : 'لا تملك صلاحية لهذا الإجراء.');
    }
    const data = await this.fields(body, type, auth);
    const s = await this.prisma.$transaction(async (tx) => {
      const created = await tx.heroSlide.create({
        data: { ...(data as Prisma.HeroSlideUncheckedCreateInput), type, status: 'draft', createdById: auth.userId, updatedById: auth.userId },
        select: ADMIN_SELECT,
      });
      await this.audit.record({ actorUserId: auth.userId, action: 'slide.create', entity: 'hero_slide', entityId: created.id, payload: { type, titleAr: created.titleAr, sponsorId: created.sponsorId }, ip }, tx);
      return created;
    });
    return s;
  }

  async update(id: number, body: B, { auth, ip }: Ctx) {
    assertActive(auth);
    const cur = await this.load(id);
    if (!this.canDraft(auth, cur.type)) throw new AppError(403, 'FORBIDDEN', 'لا تملك صلاحية لهذا الإجراء.');
    if (cur.status === 'archived') throw conflict('SLIDE_ARCHIVED', 'الشريحة مؤرشفة ولا تُعدَّل. أنشئ شريحة جديدة.');
    if (body.type !== undefined && body.type !== cur.type) throw new AppError(400, 'TYPE_LOCKED', 'نوع الشريحة لا يتغير بعد إنشائها.');
    const data = await this.fields(body, cur.type, auth, cur);
    if (!Object.keys(data).length) throw new AppError(400, 'NOTHING_TO_UPDATE', 'لم ترسل أي تعديل.');
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.heroSlide.updateMany({ where: { id, updatedAt: cur.updatedAt }, data: { ...(data as Prisma.HeroSlideUncheckedUpdateManyInput), updatedById: auth.userId } });
      if (r.count !== 1) throw raced();
      const after = await tx.heroSlide.findUniqueOrThrow({ where: { id }, select: ADMIN_SELECT });
      await this.audit.record({
        actorUserId: auth.userId, action: 'slide.update', entity: 'hero_slide', entityId: id,
        payload: { fields: Object.keys(data), statusBefore: cur.status, statusAfter: after.status, approvalRevoked: cur.approvedAt !== null && after.approvedAt === null },
        ip,
      }, tx);
      return after;
    });
  }

  /** تغيير الحالة بشرط أن الشريحة لم تتغير منذ قراءتها */
  private async transition(id: number, cur: { status: ContentStatus; updatedAt: Date }, data: Prisma.HeroSlideUncheckedUpdateManyInput, action: string, { auth, ip }: Ctx, payload: Prisma.InputJsonObject = {}) {
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.heroSlide.updateMany({ where: { id, status: cur.status, updatedAt: cur.updatedAt }, data });
      if (r.count !== 1) throw raced();
      const after = await tx.heroSlide.findUniqueOrThrow({ where: { id }, select: ADMIN_SELECT });
      await this.audit.record({ actorUserId: auth.userId, action, entity: 'hero_slide', entityId: id, payload: { from: cur.status, to: after.status, ...payload }, ip }, tx);
      return after;
    });
  }

  async submit(id: number, ctx: Ctx) {
    assertActive(ctx.auth);
    const cur = await this.load(id);
    if (!this.canDraft(ctx.auth, cur.type)) throw new AppError(403, 'FORBIDDEN', 'لا تملك صلاحية لهذا الإجراء.');
    if (cur.status !== 'draft') throw conflict('NOT_DRAFT', 'تُرسل للمراجعة المسودات فقط.');
    return this.transition(id, cur, { status: 'review', reviewNote: null }, 'slide.submit', ctx);
  }

  async approve(id: number, ctx: Ctx) {
    assertActive(ctx.auth);
    assertCan(ctx.auth, 'content.publish');
    const cur = await this.load(id);
    if (cur.status !== 'review') throw conflict('NOT_IN_REVIEW', 'تُعتمد الشريحة وهي «قيد المراجعة» فقط.');
    const paid = PAID_SLIDE_TYPES.includes(cur.type);
    if (paid && (cur.createdById === ctx.auth.userId || cur.updatedById === ctx.auth.userId)) {
      throw conflict('SELF_APPROVAL', 'الشريحة المدفوعة يعتمدها شخص غير الذي أنشأها أو عدّلها.');
    }
    if (cur.endsAt && cur.endsAt <= new Date()) throw conflict('WINDOW_ENDED', 'انتهت فترة عرض الشريحة. عدّلها قبل الاعتماد.');
    return this.transition(id, cur, { status: 'published', approvedById: ctx.auth.userId, approvedAt: new Date(), reviewNote: null }, 'slide.approve', ctx, { paid });
  }

  async reject(id: number, body: B, ctx: Ctx) {
    assertActive(ctx.auth);
    assertCan(ctx.auth, 'content.publish');
    const note = str(body, 'note', { min: 3, max: 300, label: 'سبب الإرجاع' })!;
    const cur = await this.load(id);
    if (cur.status !== 'review') throw conflict('NOT_IN_REVIEW', 'تُرجع الشريحة وهي «قيد المراجعة» فقط.');
    return this.transition(id, cur, { status: 'draft', reviewNote: note }, 'slide.reject', ctx, { note });
  }

  /** إيقاف العرض: الناشر، أو مدير الرعاة لشرائح الرعاة */
  async archive(id: number, ctx: Ctx) {
    assertActive(ctx.auth);
    const cur = await this.load(id);
    const allowed = canAny(ctx.auth, ['content.publish']) || (cur.type === 'sponsor' && canAny(ctx.auth, ['sponsors.manage']));
    if (!allowed) throw new AppError(403, 'FORBIDDEN', 'لا تملك صلاحية لهذا الإجراء.');
    if (cur.status === 'archived') throw conflict('SLIDE_ARCHIVED', 'الشريحة مؤرشفة مسبقاً.');
    return this.transition(id, cur, { status: 'archived' }, 'slide.archive', ctx);
  }

  // ───────────── النتيجة النصية (شريحة «مباراة اليوم») ─────────────

  /** PATCH /matches/:id/live {text} — حكم المباراة أو إدارة البطولة، أثناء المباراة وقبل إدخال النتيجة */
  async liveText(matchId: number, body: B, { auth, ip }: Ctx) {
    assertActive(auth);
    const m = await this.prisma.match.findUnique({ where: { id: matchId }, select: { id: true, tournamentId: true, refereeId: true, kickoffAt: true, resultStatus: true, liveText: true, tournament: { select: { status: true } } } });
    if (!m) throw new AppError(404, 'MATCH_NOT_FOUND', 'المباراة غير موجودة.');
    assertCan(auth, 'results.enter', { tournamentId: m.tournamentId });
    if (m.refereeId !== auth.userId && !hasPermission(auth.grants, 'tournaments.manage', { tournamentId: m.tournamentId }, auth.mfa)) {
      throw new AppError(403, 'NOT_MATCH_REFEREE', 'النتيجة المباشرة يكتبها حكم المباراة المعيَّن أو إدارة البطولة.');
    }
    if (m.tournament.status !== 'running') throw conflict('TOURNAMENT_NOT_RUNNING', 'البطولة ليست جارية.');
    if (m.resultStatus !== 'scheduled') throw conflict('RESULT_ENTERED', 'أُدخلت نتيجة المباراة؛ تظهر النتيجة الرسمية بدل النتيجة المباشرة.');
    const now = Date.now();
    if (!m.kickoffAt || now < m.kickoffAt.getTime() - 2 * 3600_000 || now > m.kickoffAt.getTime() + 6 * 3600_000) {
      throw conflict('NOT_LIVE_WINDOW', 'النتيجة المباشرة تُكتب يوم المباراة: من ساعتين قبل الانطلاق حتى 6 ساعات بعده.');
    }
    const text = body?.text === null ? null : str(body, 'text', { min: 1, max: LIVE_TEXT_MAX, label: 'النتيجة المباشرة' })!;
    const at = text === null ? null : new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.match.update({ where: { id: matchId }, data: { liveText: text, liveTextAt: at } });
      await this.audit.record({ actorUserId: auth.userId, action: 'match.live_text', entity: 'match', entityId: matchId, payload: { text }, ip }, tx);
    });
    return { id: matchId, liveText: text, liveTextAt: at };
  }
}

@Controller()
export class HeroController {
  constructor(private readonly svc: SlidesService) {}

  /** GET /home/hero — الشرائح المعتمدة المعروضة الآن، الأعلى أولوية أولاً */
  @Get('home/hero') @Header('cache-control', 'public, max-age=10')
  hero() {
    return this.svc.hero();
  }

  @Post('hero/:id/events') @HttpCode(202)
  event(@Param('id') id: string, @Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.event(idParam(id, 'الشريحة'), body ?? {}, clientIp(req));
  }
}

@Controller()
@UseGuards(AuthGuard)
export class SlidesAdminController {
  constructor(private readonly svc: SlidesService) {}

  @Get('admin/slides')
  list(@Req() req: AuthedRequest, @Query('status') status?: string) {
    return this.svc.list(req.auth, status);
  }

  @Get('admin/slides/:id')
  get(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.svc.get(idParam(id, 'الشريحة'), req.auth);
  }

  @Post('admin/slides')
  create(@Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.create(body ?? {}, { auth: req.auth, ip: clientIp(req) });
  }

  @Patch('admin/slides/:id')
  update(@Param('id') id: string, @Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.update(idParam(id, 'الشريحة'), body ?? {}, { auth: req.auth, ip: clientIp(req) });
  }

  @Post('admin/slides/:id/submit') @HttpCode(200)
  submit(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.svc.submit(idParam(id, 'الشريحة'), { auth: req.auth, ip: clientIp(req) });
  }

  @Post('admin/slides/:id/approve') @HttpCode(200)
  approve(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.svc.approve(idParam(id, 'الشريحة'), { auth: req.auth, ip: clientIp(req) });
  }

  @Post('admin/slides/:id/reject') @HttpCode(200)
  reject(@Param('id') id: string, @Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.reject(idParam(id, 'الشريحة'), body ?? {}, { auth: req.auth, ip: clientIp(req) });
  }

  @Post('admin/slides/:id/archive') @HttpCode(200)
  archive(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.svc.archive(idParam(id, 'الشريحة'), { auth: req.auth, ip: clientIp(req) });
  }

  @Patch('matches/:id/live')
  live(@Param('id') id: string, @Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.liveText(idParam(id, 'المباراة'), body ?? {}, { auth: req.auth, ip: clientIp(req) });
  }
}
