import { Body, Controller, Get, HttpCode, Injectable, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Response } from 'express';
import {
  SPONSOR_REQUEST_DAYS, SPONSOR_REQUEST_MAX_PENDING, SPONSOR_REQUEST_STATUSES, hasPermission,
} from '@saha/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/arabic-error.filter';
import { idParam, int, nullableStr, str } from '../common/validate';
import { AuthGuard, assertActive, assertCan } from '../auth/auth.guard';
import { clientIp, type AuthContext, type AuthedRequest } from '../auth/auth.types';
import { RateLimitService } from '../auth/rate-limit.service';
import { NotificationsService } from '../notifications/notifications';
import { UploadsService, mediaUrl } from '../uploads/uploads';
import { conflict, linkUrl, raced } from './common';
import { isSuperAdmin } from './slides';

type B = Record<string, unknown>;
type Ctx = { auth: AuthContext; ip: string };

const DAY_MS = 86400_000;

const REQUEST_SELECT = {
  id: true, orgName: true, titleAr: true, subtitleAr: true, imageMediaId: true, linkUrl: true, days: true, message: true,
  status: true, reviewNote: true, handledAt: true, createdAt: true, updatedAt: true,
  tournament: { select: { id: true, nameAr: true, slug: true, status: true } },
  match: {
    select: {
      id: true, kickoffAt: true,
      homeTeam: { select: { id: true, nameAr: true } },
      awayTeam: { select: { id: true, nameAr: true } },
    },
  },
  sponsor: { select: { id: true, nameAr: true } },
  slide: { select: { id: true, status: true, startsAt: true, endsAt: true } },
} as const;

const ADMIN_SELECT = {
  ...REQUEST_SELECT,
  user: { select: { id: true, fullName: true, phone: true } },
  handledBy: { select: { id: true, fullName: true } },
} as const;

/**
 * الجلسة 11 — طلب رعاية حدث:
 * مستخدم مسجّل (بالغ) يختار بطولة أو مباراة ويرفع صورة شريحته وعنوانها ورابطها ومدة العرض ← «قيد المراجعة».
 * مدير الرعاة يقبل (راعٍ موجود أو جديد باسم الجهة) ← تُنشأ شريحة «راعٍ» كاتبها صاحب الطلب، فتُنشر فوراً
 * إن كان القابل يملك content.publish (الاعتماد من شخص غير الكاتب)، ويُمنح صاحب الطلب بوابة الراعي.
 * الصورة خاصة حتى القبول، ثم تصير صورة محتوى عامة.
 */
@Injectable()
export class SponsorRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly uploads: UploadsService,
    private readonly rate: RateLimitService,
    private readonly notifications: NotificationsService,
  ) {}

  // ───────────── صاحب الطلب ─────────────

  /** الأحداث المتاحة للرعاية: البطولات المفتوحة للتسجيل أو الجارية، ومبارياتها القادمة */
  async events() {
    const now = new Date();
    return this.prisma.tournament.findMany({
      where: { status: { in: ['registration', 'running'] } },
      orderBy: [{ status: 'desc' }, { id: 'desc' }],
      take: 50,
      select: {
        id: true, nameAr: true, slug: true, status: true, kind: true,
        matches: {
          where: { kickoffAt: { gte: new Date(now.getTime() - 2 * 3600_000) }, resultStatus: 'scheduled' },
          orderBy: { kickoffAt: 'asc' },
          take: 20,
          select: { id: true, kickoffAt: true, homeTeam: { select: { id: true, nameAr: true } }, awayTeam: { select: { id: true, nameAr: true } } },
        },
      },
    });
  }

  async create(body: B, { auth, ip }: Ctx) {
    assertActive(auth);
    const user = await this.prisma.user.findUnique({ where: { id: auth.userId }, select: { birthYear: true } });
    if (user?.birthYear && new Date().getFullYear() - user.birthYear < 18) {
      throw new AppError(403, 'ADULTS_ONLY', 'طلب الرعاية للبالغين فقط (18 سنة فأكثر).');
    }
    const orgName = str(body, 'orgName', { min: 2, max: 80, label: 'اسم الجهة الراعية' })!;
    const titleAr = str(body, 'titleAr', { min: 2, max: 80, label: 'عنوان الشريحة' })!;
    const subtitleAr = nullableStr(body, 'subtitleAr', { max: 140, label: 'النص الفرعي' }) ?? null;
    const message = nullableStr(body, 'message', { max: 500, label: 'ملاحظات' }) ?? null;
    const link = linkUrl(body) ?? null;
    const days = int(body, 'days', { label: 'مدة العرض' })!;
    if (!(SPONSOR_REQUEST_DAYS as readonly number[]).includes(days)) throw new AppError(400, 'VALIDATION_ERROR', 'مدة العرض: 7 أو 14 أو 30 يوماً.');
    const imageMediaId = int(body, 'imageMediaId', { min: 1, label: 'صورة الشريحة' })!;
    const media = await this.prisma.mediaAsset.findUnique({ where: { id: imageMediaId }, select: { uploadedById: true } });
    if (!media || media.uploadedById !== auth.userId) throw new AppError(400, 'MEDIA_INVALID', 'الصورة غير موجودة أو لم ترفعها أنت.');

    const matchId = int(body, 'matchId', { optional: true, min: 1, label: 'المباراة' }) ?? null;
    let tournamentId = int(body, 'tournamentId', { optional: true, min: 1, label: 'البطولة' }) ?? null;
    if (matchId) {
      const m = await this.prisma.match.findUnique({ where: { id: matchId }, select: { tournamentId: true } });
      if (!m) throw new AppError(404, 'MATCH_NOT_FOUND', 'المباراة غير موجودة.');
      if (tournamentId && tournamentId !== m.tournamentId) throw new AppError(400, 'MATCH_NOT_IN_TOURNAMENT', 'المباراة ليست من هذه البطولة.');
      tournamentId = m.tournamentId;
    }
    if (!tournamentId) throw new AppError(400, 'EVENT_REQUIRED', 'اختر البطولة أو المباراة التي تريد رعايتها.');
    const t = await this.prisma.tournament.findUnique({ where: { id: tournamentId }, select: { status: true } });
    if (!t) throw new AppError(404, 'TOURNAMENT_NOT_FOUND', 'البطولة غير موجودة.');
    if (t.status !== 'registration' && t.status !== 'running') throw conflict('EVENT_CLOSED', 'هذه البطولة غير متاحة للرعاية الآن.');

    await this.rate.consume({ key: `sponsor-req:user:${auth.userId}`, max: 10, windowSec: 86400 }, { key: `sponsor-req:ip:${ip}`, max: 20, windowSec: 3600 });
    const pending = await this.prisma.sponsorRequest.count({ where: { userId: auth.userId, status: 'pending' } });
    if (pending >= SPONSOR_REQUEST_MAX_PENDING) throw conflict('TOO_MANY_PENDING', `لديك ${pending} طلبات قيد المراجعة. انتظر الرد عليها أو ألغِ أحدها.`);

    const r = await this.prisma.$transaction(async (tx) => {
      const created = await tx.sponsorRequest.create({
        data: { userId: auth.userId, orgName, tournamentId: tournamentId!, matchId, titleAr, subtitleAr, imageMediaId, linkUrl: link, days, message },
        select: REQUEST_SELECT,
      });
      await this.audit.record({ actorUserId: auth.userId, action: 'sponsor_request.create', entity: 'sponsor_request', entityId: created.id, payload: { orgName, tournamentId, matchId, days }, ip }, tx);
      await this.notifications.notify(await this.managers(tx), {
        titleAr: 'طلب رعاية جديد',
        bodyAr: `«${orgName}» تطلب رعاية ${created.match ? `مباراة ${created.match.homeTeam.nameAr} × ${created.match.awayTeam.nameAr}` : `بطولة ${created.tournament.nameAr}`} لمدة ${days} يوماً.`,
        data: { type: 'sponsor_request', sponsorRequestId: created.id },
      }, tx);
      return created;
    });
    return r;
  }

  /** مديرو الرعاة والمدير العام — يُشعَرون بكل طلب جديد */
  private async managers(db: Prisma.TransactionClient) {
    const rows = await db.userRole.findMany({ where: { role: { in: ['super_admin', 'sponsor_manager'] }, user: { status: 'active' } }, select: { userId: true } });
    return rows.map((r) => r.userId);
  }

  mine(auth: AuthContext) {
    return this.prisma.sponsorRequest.findMany({ where: { userId: auth.userId }, orderBy: { id: 'desc' }, take: 50, select: REQUEST_SELECT });
  }

  async cancel(id: number, { auth, ip }: Ctx) {
    const r = await this.prisma.sponsorRequest.findUnique({ where: { id }, select: { userId: true, status: true } });
    if (!r || r.userId !== auth.userId) throw new AppError(404, 'REQUEST_NOT_FOUND', 'الطلب غير موجود.');
    if (r.status !== 'pending') throw conflict('NOT_PENDING', 'يُلغى الطلب وهو قيد المراجعة فقط.');
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.sponsorRequest.updateMany({ where: { id, status: 'pending' }, data: { status: 'cancelled' } });
      if (u.count !== 1) throw raced();
      await this.audit.record({ actorUserId: auth.userId, action: 'sponsor_request.cancel', entity: 'sponsor_request', entityId: id, ip }, tx);
      return tx.sponsorRequest.findUniqueOrThrow({ where: { id }, select: REQUEST_SELECT });
    });
  }

  /** صورة الطلب: لصاحبه ولمدير الرعاة (تبقى خاصة حتى القبول) */
  async image(id: number, auth: AuthContext) {
    const r = await this.prisma.sponsorRequest.findUnique({ where: { id }, select: { userId: true, imageMediaId: true } });
    if (!r || (r.userId !== auth.userId && !hasPermission(auth.grants, 'sponsors.manage', {}, auth.mfa))) throw new AppError(404, 'REQUEST_NOT_FOUND', 'الطلب غير موجود.');
    if (!r.imageMediaId) throw new AppError(404, 'MEDIA_NOT_FOUND', 'لا صورة لهذا الطلب.');
    return this.uploads.read(r.imageMediaId);
  }

  // ───────────── مدير الرعاة ─────────────

  list(auth: AuthContext, status?: string) {
    assertCan(auth, 'sponsors.manage');
    if (status !== undefined && status !== '' && !(SPONSOR_REQUEST_STATUSES as readonly string[]).includes(status)) throw new AppError(400, 'VALIDATION_ERROR', 'حالة غير معروفة.');
    return this.prisma.sponsorRequest.findMany({ where: status ? { status } : {}, orderBy: { id: 'desc' }, take: 200, select: ADMIN_SELECT });
  }

  /**
   * POST /admin/sponsor-requests/:id/accept {sponsorId?, priority?}
   * بلا sponsorId يُنشأ راعٍ جديد باسم الجهة وبيانات صاحب الطلب.
   */
  async accept(id: number, body: B, { auth, ip }: Ctx) {
    assertActive(auth);
    assertCan(auth, 'sponsors.manage');
    const req = await this.prisma.sponsorRequest.findUnique({
      where: { id },
      include: { user: { select: { id: true, fullName: true, phone: true, status: true } }, tournament: { select: { slug: true, status: true } } },
    });
    if (!req) throw new AppError(404, 'REQUEST_NOT_FOUND', 'الطلب غير موجود.');
    if (req.status !== 'pending') throw conflict('NOT_PENDING', 'يُقبل الطلب وهو قيد المراجعة فقط.');
    if (req.user.status !== 'active') throw conflict('REQUESTER_INACTIVE', 'حساب صاحب الطلب غير فعّال.');
    const sponsorId = int(body, 'sponsorId', { optional: true, min: 1, label: 'الراعي' });
    if (sponsorId && !(await this.prisma.sponsor.findUnique({ where: { id: sponsorId } }))) throw new AppError(404, 'SPONSOR_NOT_FOUND', 'الراعي غير موجود.');
    const priority = int(body, 'priority', { optional: true, min: 0, max: 100, label: 'الأولوية' }) ?? 10;
    // الاعتماد من القابل (غير كاتب الشريحة) إن كان يملك النشر؛ وإلا تنتظر الشريحة «قيد المراجعة»
    // (ولا يعتمد صاحب الطلب شريحته بنفسه إلا المدير العام)
    const canPublish = hasPermission(auth.grants, 'content.publish', {}, auth.mfa) && (req.userId !== auth.userId || isSuperAdmin(auth));
    const now = new Date();

    const out = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.sponsorRequest.updateMany({ where: { id, status: 'pending', updatedAt: req.updatedAt }, data: { status: 'accepted', handledById: auth.userId, handledAt: now, reviewNote: null } });
      if (claimed.count !== 1) throw raced();

      let sid = sponsorId;
      if (!sid) {
        const s = await tx.sponsor.create({ data: { nameAr: req.orgName, contactName: req.user.fullName, contactPhone: req.user.phone } });
        sid = s.id;
        await this.audit.record({ actorUserId: auth.userId, action: 'sponsor.create', entity: 'sponsor', entityId: s.id, payload: { nameAr: s.nameAr, fromRequest: id }, ip }, tx);
      }
      let imageUrl: string | null = null;
      if (req.imageMediaId) {
        await tx.mediaAsset.update({ where: { id: req.imageMediaId }, data: { isPublic: true } });
        imageUrl = mediaUrl(req.imageMediaId);
      }
      const slide = await tx.heroSlide.create({
        data: {
          type: 'sponsor', titleAr: req.titleAr, subtitleAr: req.subtitleAr, imageUrl,
          linkUrl: req.linkUrl ?? (req.matchId ? `/matches/${req.matchId}` : `/tournaments/${req.tournament.slug}`),
          sponsorId: sid, tournamentId: req.tournamentId, priority,
          startsAt: now, endsAt: new Date(now.getTime() + req.days * DAY_MS),
          createdById: req.userId, updatedById: req.userId,
          ...(canPublish ? { status: 'published' as const, approvedById: auth.userId, approvedAt: now } : { status: 'review' as const }),
        },
        select: { id: true, status: true, startsAt: true, endsAt: true },
      });
      await tx.sponsorRequest.update({ where: { id }, data: { sponsorId: sid, slideId: slide.id } });
      const hasRole = await tx.userRole.findFirst({ where: { userId: req.userId, role: 'sponsor_viewer', sponsorId: sid } });
      if (!hasRole) await tx.userRole.create({ data: { userId: req.userId, role: 'sponsor_viewer', sponsorId: sid } });
      await this.audit.record({
        actorUserId: auth.userId, action: 'sponsor_request.accept', entity: 'sponsor_request', entityId: id,
        payload: { sponsorId: sid, slideId: slide.id, slideStatus: slide.status, newSponsor: !sponsorId, roleGranted: !hasRole }, ip,
      }, tx);
      await this.audit.record({ actorUserId: auth.userId, action: canPublish ? 'slide.approve' : 'slide.create', entity: 'hero_slide', entityId: slide.id, payload: { fromRequest: id, paid: true, sponsorId: sid }, ip }, tx);
      await this.notifications.notify([req.userId], {
        titleAr: 'قُبل طلب رعايتك 🎉',
        bodyAr: slide.status === 'published'
          ? `شريحة «${req.titleAr}» تظهر الآن في ساحة لمدة ${req.days} يوماً. تابع الظهور والنقرات من «بوابة الراعي».`
          : `قُبل طلب «${req.titleAr}» وتظهر الشريحة بعد اعتمادها النهائي.`,
        data: { type: 'sponsor_request', sponsorRequestId: id },
      }, tx);
      return { id, status: 'accepted', sponsorId: sid, slide };
    });
    return out;
  }

  async reject(id: number, body: B, { auth, ip }: Ctx) {
    assertActive(auth);
    assertCan(auth, 'sponsors.manage');
    const note = str(body, 'note', { min: 3, max: 300, label: 'سبب الرفض' })!;
    const req = await this.prisma.sponsorRequest.findUnique({ where: { id }, select: { status: true, userId: true, titleAr: true } });
    if (!req) throw new AppError(404, 'REQUEST_NOT_FOUND', 'الطلب غير موجود.');
    if (req.status !== 'pending') throw conflict('NOT_PENDING', 'يُرفض الطلب وهو قيد المراجعة فقط.');
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.sponsorRequest.updateMany({ where: { id, status: 'pending' }, data: { status: 'rejected', reviewNote: note, handledById: auth.userId, handledAt: new Date() } });
      if (u.count !== 1) throw raced();
      await this.audit.record({ actorUserId: auth.userId, action: 'sponsor_request.reject', entity: 'sponsor_request', entityId: id, payload: { note }, ip }, tx);
      await this.notifications.notify([req.userId], {
        titleAr: 'طلب الرعاية لم يُقبل',
        bodyAr: `طلب «${req.titleAr}»: ${note}`,
        data: { type: 'sponsor_request', sponsorRequestId: id },
      }, tx);
      return tx.sponsorRequest.findUniqueOrThrow({ where: { id }, select: ADMIN_SELECT });
    });
  }
}

@Controller()
@UseGuards(AuthGuard)
export class SponsorRequestsController {
  constructor(private readonly svc: SponsorRequestsService) {}

  /** GET /sponsor-requests/events — البطولات والمباريات المتاحة للرعاية */
  @Get('sponsor-requests/events')
  events() {
    return this.svc.events();
  }

  /** POST /sponsor-requests {orgName, tournamentId|matchId, titleAr, subtitleAr?, imageMediaId, linkUrl?, days, message?} */
  @Post('sponsor-requests')
  create(@Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.create(body ?? {}, { auth: req.auth, ip: clientIp(req) });
  }

  @Get('me/sponsor-requests')
  mine(@Req() req: AuthedRequest) {
    return this.svc.mine(req.auth);
  }

  @Post('me/sponsor-requests/:id/cancel') @HttpCode(200)
  cancel(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.svc.cancel(idParam(id, 'الطلب'), { auth: req.auth, ip: clientIp(req) });
  }

  @Get('sponsor-requests/:id/image')
  async image(@Param('id') id: string, @Req() req: AuthedRequest, @Res() res: Response) {
    const f = await this.svc.image(idParam(id, 'الطلب'), req.auth);
    res.set({ 'content-type': f.mime, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' }).send(f.data);
  }

  @Get('admin/sponsor-requests')
  list(@Req() req: AuthedRequest, @Query('status') status?: string) {
    return this.svc.list(req.auth, status);
  }

  @Post('admin/sponsor-requests/:id/accept') @HttpCode(200)
  accept(@Param('id') id: string, @Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.accept(idParam(id, 'الطلب'), body ?? {}, { auth: req.auth, ip: clientIp(req) });
  }

  @Post('admin/sponsor-requests/:id/reject') @HttpCode(200)
  reject(@Param('id') id: string, @Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.reject(idParam(id, 'الطلب'), body ?? {}, { auth: req.auth, ip: clientIp(req) });
  }
}
