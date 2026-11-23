import { Body, Controller, Get, HttpCode, Injectable, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { CONTENT_STATUSES, POST_TYPES, type ContentStatus, type PostType } from '@saha/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/arabic-error.filter';
import { idParam, int, oneOf, str } from '../common/validate';
import { AuthGuard, assertActive, assertCan } from '../auth/auth.guard';
import { clientIp, type AuthContext, type AuthedRequest } from '../auth/auth.types';
import { UploadsService } from '../uploads/uploads';
import { assertAny, conflict, raced } from './common';

type B = Record<string, unknown>;
type Ctx = { auth: AuthContext; ip: string };

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const BODY_MAX = 20000;

const PUBLIC_SELECT = { id: true, type: true, slug: true, titleAr: true, bodyAr: true, coverUrl: true, publishedAt: true, updatedAt: true } as const;
const ADMIN_SELECT = {
  id: true, type: true, slug: true, titleAr: true, bodyAr: true, coverUrl: true, status: true, reviewNote: true, publishedAt: true,
  author: { select: { id: true, fullName: true } }, updatedBy: { select: { id: true, fullName: true } }, createdAt: true, updatedAt: true,
} as const;

const autoSlug = (type: PostType) => `${type}-${Date.now().toString(36)}${randomBytes(2).toString('hex')}`;

/**
 * الجلسة 5 — الأخبار والصفحات الثابتة: مسودة ← قيد المراجعة ← منشور ← مؤرشف.
 * المحرر يكتب المسودة ويرسلها للمراجعة؛ من يملك content.publish ينشر أو يُرجع بسبب أو يؤرشف.
 * تعديل المنشور لمن يملك النشر فقط (تصحيح خبر)، ويُسجَّل في سجل التدقيق.
 * النص عادي (بلا HTML)؛ الموقع والتطبيق يعرضانه فقرات كما هو.
 */
@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly uploads: UploadsService) {}

  // ───────────── العامة ─────────────

  news(limit?: string) {
    const take = Math.min(Math.max(Number(limit) || 12, 1), 50);
    return this.prisma.post.findMany({
      where: { type: 'news', status: 'published' },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take,
      select: { id: true, slug: true, titleAr: true, coverUrl: true, publishedAt: true },
    });
  }

  async published(type: PostType, slug: string) {
    const p = SLUG_RE.test(slug) ? await this.prisma.post.findFirst({ where: { type, slug, status: 'published' }, select: PUBLIC_SELECT }) : null;
    if (!p) throw new AppError(404, type === 'news' ? 'NEWS_NOT_FOUND' : 'PAGE_NOT_FOUND', type === 'news' ? 'الخبر غير موجود.' : 'الصفحة غير موجودة.');
    return p;
  }

  // ───────────── الإدارة ─────────────

  private async load(id: number) {
    const p = await this.prisma.post.findUnique({ where: { id } });
    if (!p) throw new AppError(404, 'POST_NOT_FOUND', 'الخبر أو الصفحة غير موجودة.');
    return p;
  }

  list(auth: AuthContext, q: { type?: string; status?: string }) {
    assertAny(auth, ['content.draft', 'content.publish']);
    if (q.type !== undefined && !(POST_TYPES as readonly string[]).includes(q.type)) throw new AppError(400, 'VALIDATION_ERROR', 'نوع غير معروف.');
    if (q.status !== undefined && !(CONTENT_STATUSES as readonly string[]).includes(q.status)) throw new AppError(400, 'VALIDATION_ERROR', 'حالة غير معروفة.');
    return this.prisma.post.findMany({
      where: { ...(q.type ? { type: q.type as PostType } : {}), ...(q.status ? { status: q.status as ContentStatus } : {}) },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 200,
      select: { id: true, type: true, slug: true, titleAr: true, status: true, publishedAt: true, updatedAt: true, reviewNote: true },
    });
  }

  async get(id: number, auth: AuthContext) {
    assertAny(auth, ['content.draft', 'content.publish']);
    const p = await this.prisma.post.findUnique({ where: { id }, select: ADMIN_SELECT });
    if (!p) throw new AppError(404, 'POST_NOT_FOUND', 'الخبر أو الصفحة غير موجودة.');
    return p;
  }

  private async fields(body: B, auth: AuthContext, creating: boolean) {
    const data: Prisma.PostUncheckedUpdateInput = {};
    const titleAr = str(body, 'titleAr', { optional: !creating, min: 3, max: 140, label: 'العنوان' });
    if (titleAr !== undefined) data.titleAr = titleAr;
    const bodyAr = str(body, 'bodyAr', { optional: !creating, min: 1, max: BODY_MAX, label: 'النص' });
    if (bodyAr !== undefined) data.bodyAr = bodyAr;
    const slug = str(body, 'slug', { optional: true, min: 3, max: 80, label: 'الرابط المختصر' });
    if (slug !== undefined) {
      if (!SLUG_RE.test(slug)) throw new AppError(400, 'INVALID_SLUG', 'الرابط المختصر بأحرف إنجليزية صغيرة وأرقام وشرطات فقط، مثل terms أو cup-final.');
      data.slug = slug;
    }
    if (body.coverMediaId === null) data.coverUrl = null;
    else {
      const mediaId = int(body, 'coverMediaId', { optional: true, min: 1, label: 'صورة الغلاف' });
      if (mediaId !== undefined) data.coverUrl = await this.uploads.publicOwned(mediaId, auth.userId);
    }
    return data;
  }

  private async slugFree(slug: string, exceptId?: number) {
    const other = await this.prisma.post.findUnique({ where: { slug }, select: { id: true } });
    if (other && other.id !== exceptId) throw conflict('SLUG_TAKEN', 'الرابط المختصر مستخدم لخبر أو صفحة أخرى.');
  }

  async create(body: B, { auth, ip }: Ctx) {
    assertActive(auth);
    assertCan(auth, 'content.draft');
    const type = oneOf(body, 'type', POST_TYPES, { optional: true, label: 'النوع' }) ?? 'news';
    const data = await this.fields(body, auth, true);
    const slug = (data.slug as string | undefined) ?? autoSlug(type);
    await this.slugFree(slug);
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.post.create({
        data: { ...(data as Prisma.PostUncheckedCreateInput), type, slug, status: 'draft', authorId: auth.userId, updatedById: auth.userId },
        select: ADMIN_SELECT,
      });
      await this.audit.record({ actorUserId: auth.userId, action: 'post.create', entity: 'post', entityId: p.id, payload: { type, slug, titleAr: p.titleAr }, ip }, tx);
      return p;
    });
  }

  async update(id: number, body: B, { auth, ip }: Ctx) {
    assertActive(auth);
    const cur = await this.load(id);
    if (cur.status === 'archived') throw conflict('POST_ARCHIVED', 'المحتوى مؤرشف ولا يُعدَّل.');
    assertCan(auth, cur.status === 'published' ? 'content.publish' : 'content.draft');
    if (body.type !== undefined && body.type !== cur.type) throw new AppError(400, 'TYPE_LOCKED', 'النوع لا يتغير بعد الإنشاء.');
    const data = await this.fields(body, auth, false);
    if (!Object.keys(data).length) throw new AppError(400, 'NOTHING_TO_UPDATE', 'لم ترسل أي تعديل.');
    if (data.slug !== undefined && data.slug !== cur.slug) {
      if (cur.publishedAt) throw conflict('SLUG_LOCKED', 'لا يتغير الرابط المختصر بعد النشر حتى لا تنكسر الروابط المنشورة.');
      await this.slugFree(data.slug as string, id);
    }
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.post.updateMany({ where: { id, updatedAt: cur.updatedAt, status: cur.status }, data: { ...(data as Prisma.PostUncheckedUpdateManyInput), updatedById: auth.userId } });
      if (r.count !== 1) throw raced();
      const p = await tx.post.findUniqueOrThrow({ where: { id }, select: ADMIN_SELECT });
      await this.audit.record({
        actorUserId: auth.userId, action: 'post.update', entity: 'post', entityId: id,
        payload: { fields: Object.keys(data), status: cur.status, ...(data.titleAr !== undefined && cur.status === 'published' ? { titleBefore: cur.titleAr, titleAfter: p.titleAr } : {}) },
        ip,
      }, tx);
      return p;
    });
  }

  private async transition(id: number, cur: { status: ContentStatus; updatedAt: Date }, data: Prisma.PostUncheckedUpdateManyInput, action: string, { auth, ip }: Ctx, payload: Prisma.InputJsonObject = {}) {
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.post.updateMany({ where: { id, status: cur.status, updatedAt: cur.updatedAt }, data });
      if (r.count !== 1) throw raced();
      const p = await tx.post.findUniqueOrThrow({ where: { id }, select: ADMIN_SELECT });
      await this.audit.record({ actorUserId: auth.userId, action, entity: 'post', entityId: id, payload: { from: cur.status, to: p.status, ...payload }, ip }, tx);
      return p;
    });
  }

  async submit(id: number, ctx: Ctx) {
    assertActive(ctx.auth);
    assertCan(ctx.auth, 'content.draft');
    const cur = await this.load(id);
    if (cur.status !== 'draft') throw conflict('NOT_DRAFT', 'تُرسل للمراجعة المسودات فقط.');
    return this.transition(id, cur, { status: 'review', reviewNote: null }, 'post.submit', ctx);
  }

  async publish(id: number, ctx: Ctx) {
    assertActive(ctx.auth);
    assertCan(ctx.auth, 'content.publish');
    const cur = await this.load(id);
    if (cur.status !== 'draft' && cur.status !== 'review') throw conflict(cur.status === 'published' ? 'ALREADY_PUBLISHED' : 'POST_ARCHIVED', cur.status === 'published' ? 'منشور مسبقاً.' : 'المحتوى مؤرشف.');
    return this.transition(id, cur, { status: 'published', publishedAt: cur.publishedAt ?? new Date(), reviewNote: null }, 'post.publish', ctx);
  }

  async reject(id: number, body: B, ctx: Ctx) {
    assertActive(ctx.auth);
    assertCan(ctx.auth, 'content.publish');
    const note = str(body, 'note', { min: 3, max: 300, label: 'سبب الإرجاع' })!;
    const cur = await this.load(id);
    if (cur.status !== 'review') throw conflict('NOT_IN_REVIEW', 'يُرجع المحتوى وهو «قيد المراجعة» فقط.');
    return this.transition(id, cur, { status: 'draft', reviewNote: note }, 'post.reject', ctx, { note });
  }

  async archive(id: number, ctx: Ctx) {
    assertActive(ctx.auth);
    assertCan(ctx.auth, 'content.publish');
    const cur = await this.load(id);
    if (cur.status === 'archived') throw conflict('POST_ARCHIVED', 'مؤرشف مسبقاً.');
    // المسودة التي لم تُنشر لا تؤرشف (القيد: المؤرشف نُشر يوماً)؛ تبقى مسودة
    if (!cur.publishedAt) throw conflict('NEVER_PUBLISHED', 'لم يُنشر هذا المحتوى؛ اتركه مسودة.');
    return this.transition(id, cur, { status: 'archived' }, 'post.archive', ctx);
  }
}

@Controller()
export class PostsPublicController {
  constructor(private readonly svc: PostsService) {}

  /** GET /news?limit=3 — الأخبار المنشورة فقط، الأحدث أولاً */
  @Get('news')
  news(@Query('limit') limit?: string) {
    return this.svc.news(limit);
  }

  @Get('news/:slug')
  newsItem(@Param('slug') slug: string) {
    return this.svc.published('news', slug);
  }

  /** GET /pages/:slug — الصفحات الثابتة (الشروط، الخصوصية، عن ساحة…) */
  @Get('pages/:slug')
  page(@Param('slug') slug: string) {
    return this.svc.published('page', slug);
  }
}

@Controller('admin/posts')
@UseGuards(AuthGuard)
export class PostsAdminController {
  constructor(private readonly svc: PostsService) {}

  @Get()
  list(@Req() req: AuthedRequest, @Query() q: { type?: string; status?: string }) {
    return this.svc.list(req.auth, q);
  }

  @Get(':id')
  get(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.svc.get(idParam(id, 'المحتوى'), req.auth);
  }

  @Post()
  create(@Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.create(body ?? {}, { auth: req.auth, ip: clientIp(req) });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.update(idParam(id, 'المحتوى'), body ?? {}, { auth: req.auth, ip: clientIp(req) });
  }

  @Post(':id/submit') @HttpCode(200)
  submit(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.svc.submit(idParam(id, 'المحتوى'), { auth: req.auth, ip: clientIp(req) });
  }

  @Post(':id/publish') @HttpCode(200)
  publish(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.svc.publish(idParam(id, 'المحتوى'), { auth: req.auth, ip: clientIp(req) });
  }

  @Post(':id/reject') @HttpCode(200)
  reject(@Param('id') id: string, @Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.reject(idParam(id, 'المحتوى'), body ?? {}, { auth: req.auth, ip: clientIp(req) });
  }

  @Post(':id/archive') @HttpCode(200)
  archive(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.svc.archive(idParam(id, 'المحتوى'), { auth: req.auth, ip: clientIp(req) });
  }
}
