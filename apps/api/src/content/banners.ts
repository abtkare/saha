import { Body, Controller, Delete, Get, Header, HttpCode, Injectable, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/arabic-error.filter';
import { bool, idParam, int, str } from '../common/validate';
import { AuthGuard, assertActive, assertCan } from '../auth/auth.guard';
import { clientIp, type AuthContext, type AuthedRequest } from '../auth/auth.types';
import { UploadsService } from '../uploads/uploads';
import { linkUrl } from './common';

/**
 * الراعي الدائم (الجلسة 14): لوحة إعلان ثابتة لا تدور مع الهيرو سلايدر، تظهر دائماً
 * في الرئيسية وصفحة البطولة بالموقع والتطبيق. يديرها مدير الرعاة (أو المدير العام) بدخول TOTP.
 */
type B = Record<string, unknown>;
type Ctx = { auth: AuthContext; ip: string };

const MAX_BANNERS = 10;
const SELECT = {
  id: true, labelAr: true, imageUrl: true, linkUrl: true, isActive: true, sortOrder: true, updatedAt: true,
  sponsor: { select: { id: true, nameAr: true } },
} as const;

@Injectable()
export class BannersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly uploads: UploadsService,
  ) {}

  /** GET /home/banners — المفعّلة فقط، بالترتيب */
  async active() {
    const banners = await this.prisma.sponsorBanner.findMany({
      where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: { id: true, labelAr: true, imageUrl: true, linkUrl: true, sponsor: { select: { id: true, nameAr: true } } },
    });
    return { banners };
  }

  list(auth: AuthContext) {
    assertCan(auth, 'sponsors.manage');
    return this.prisma.sponsorBanner.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: SELECT });
  }

  private async fields(body: B, auth: AuthContext, creating: boolean) {
    const data: Prisma.SponsorBannerUncheckedUpdateInput = {};
    const labelAr = str(body, 'labelAr', { optional: !creating, min: 2, max: 60, label: 'الوصف' });
    if (labelAr !== undefined) data.labelAr = labelAr;
    const mediaId = int(body, 'imageMediaId', { optional: !creating, min: 1, label: 'الصورة' });
    if (mediaId !== undefined) data.imageUrl = await this.uploads.publicOwned(mediaId, auth.userId);
    const link = linkUrl(body, 'linkUrl');
    if (link !== undefined) data.linkUrl = link;
    if (body.isActive !== undefined) data.isActive = bool(body, 'isActive', 'الظهور');
    const sortOrder = int(body, 'sortOrder', { optional: true, min: 0, max: 99, label: 'الترتيب' });
    if (sortOrder !== undefined) data.sortOrder = sortOrder;
    if (body.sponsorId === null) data.sponsorId = null;
    else {
      const sponsorId = int(body, 'sponsorId', { optional: true, min: 1, label: 'الراعي' });
      if (sponsorId !== undefined) {
        if (!(await this.prisma.sponsor.findUnique({ where: { id: sponsorId } }))) throw new AppError(404, 'SPONSOR_NOT_FOUND', 'الراعي غير موجود.');
        data.sponsorId = sponsorId;
      }
    }
    return data;
  }

  async create(body: B, { auth, ip }: Ctx) {
    assertActive(auth);
    assertCan(auth, 'sponsors.manage');
    if ((await this.prisma.sponsorBanner.count()) >= MAX_BANNERS) throw new AppError(409, 'BANNER_LIMIT', `الحد الأقصى ${MAX_BANNERS} لوحات. احذف لوحة قديمة أولاً.`);
    const data = await this.fields(body, auth, true);
    return this.prisma.$transaction(async (tx) => {
      const b = await tx.sponsorBanner.create({ data: { ...(data as Prisma.SponsorBannerUncheckedCreateInput), updatedById: auth.userId }, select: SELECT });
      await this.audit.record({ actorUserId: auth.userId, action: 'banner.create', entity: 'sponsor_banner', entityId: b.id, payload: { labelAr: b.labelAr, imageUrl: b.imageUrl }, ip }, tx);
      return b;
    });
  }

  async update(id: number, body: B, { auth, ip }: Ctx) {
    assertActive(auth);
    assertCan(auth, 'sponsors.manage');
    if (!(await this.prisma.sponsorBanner.findUnique({ where: { id } }))) throw new AppError(404, 'BANNER_NOT_FOUND', 'اللوحة غير موجودة.');
    const data = await this.fields(body, auth, false);
    if (!Object.keys(data).length) throw new AppError(400, 'NOTHING_TO_UPDATE', 'لم ترسل أي تعديل.');
    return this.prisma.$transaction(async (tx) => {
      const b = await tx.sponsorBanner.update({ where: { id }, data: { ...data, updatedById: auth.userId }, select: SELECT });
      await this.audit.record({ actorUserId: auth.userId, action: 'banner.update', entity: 'sponsor_banner', entityId: id, payload: { fields: Object.keys(data), imageUrl: data.imageUrl ?? undefined }, ip }, tx);
      return b;
    });
  }

  async remove(id: number, { auth, ip }: Ctx) {
    assertActive(auth);
    assertCan(auth, 'sponsors.manage');
    const cur = await this.prisma.sponsorBanner.findUnique({ where: { id } });
    if (!cur) throw new AppError(404, 'BANNER_NOT_FOUND', 'اللوحة غير موجودة.');
    await this.prisma.$transaction(async (tx) => {
      await tx.sponsorBanner.delete({ where: { id } });
      await this.audit.record({ actorUserId: auth.userId, action: 'banner.delete', entity: 'sponsor_banner', entityId: id, payload: { labelAr: cur.labelAr }, ip }, tx);
    });
    return { id, deleted: true };
  }
}

@Controller()
export class BannersPublicController {
  constructor(private readonly svc: BannersService) {}

  /** GET /home/banners — لوحات الراعي الدائم المفعّلة */
  @Get('home/banners') @Header('cache-control', 'public, max-age=30')
  active() {
    return this.svc.active();
  }
}

@Controller()
@UseGuards(AuthGuard)
export class BannersAdminController {
  constructor(private readonly svc: BannersService) {}

  @Get('admin/banners')
  list(@Req() req: AuthedRequest) {
    return this.svc.list(req.auth);
  }

  @Post('admin/banners')
  create(@Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.create(body ?? {}, { auth: req.auth, ip: clientIp(req) });
  }

  @Patch('admin/banners/:id')
  update(@Param('id') id: string, @Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.update(idParam(id, 'اللوحة'), body ?? {}, { auth: req.auth, ip: clientIp(req) });
  }

  @Delete('admin/banners/:id') @HttpCode(200)
  remove(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.svc.remove(idParam(id, 'اللوحة'), { auth: req.auth, ip: clientIp(req) });
  }
}
