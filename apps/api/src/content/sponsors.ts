import { Body, Controller, Get, HttpCode, Injectable, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { SPONSOR_LEAD_STATUSES, hasPermission, normalizeIraqiPhone } from '@saha/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/arabic-error.filter';
import { idParam, int, nullableStr, oneOf, str } from '../common/validate';
import { AuthGuard, assertActive, assertCan } from '../auth/auth.guard';
import { clientIp, type AuthContext, type AuthedRequest } from '../auth/auth.types';
import { RateLimitService } from '../auth/rate-limit.service';
import { UploadsService } from '../uploads/uploads';
import { baghdadToday } from '../matches/matches.service';
import { addDays, assertAny, dayParam, daysBetween, linkUrl } from './common';
import { REPORT_MAX_DAYS, buildReport, reportCsv } from './report';

type B = Record<string, unknown>;
type Ctx = { auth: AuthContext; ip: string };

const SPONSOR_SELECT = { id: true, nameAr: true, logoUrl: true, website: true, contactName: true, contactPhone: true, createdAt: true } as const;

@Injectable()
export class SponsorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly uploads: UploadsService,
    private readonly rate: RateLimitService,
  ) {}

  // ───────────── الرعاة (الإدارة) ─────────────

  list(auth: AuthContext) {
    // محرر المحتوى يحتاج القائمة لاختيار راعي الشريحة، دون بيانات التواصل
    assertAny(auth, ['sponsors.manage', 'content.draft', 'slides.sponsor']);
    const full = hasPermission(auth.grants, 'sponsors.manage', {}, auth.mfa);
    return this.prisma.sponsor.findMany({ orderBy: { id: 'asc' }, select: full ? SPONSOR_SELECT : { id: true, nameAr: true, logoUrl: true } });
  }

  private async fields(body: B, auth: AuthContext, creating: boolean) {
    const data: Prisma.SponsorUncheckedUpdateInput = {};
    const nameAr = str(body, 'nameAr', { optional: !creating, min: 2, max: 80, label: 'اسم الراعي' });
    if (nameAr !== undefined) data.nameAr = nameAr;
    const website = linkUrl(body, 'website');
    if (website !== undefined) {
      if (website && !website.startsWith('https://')) throw new AppError(400, 'INVALID_LINK', 'موقع الراعي يجب أن يبدأ بـ https://.');
      data.website = website;
    }
    const contactName = nullableStr(body, 'contactName', { max: 80, label: 'اسم المسؤول' });
    if (contactName !== undefined) data.contactName = contactName;
    if (body.contactPhone === null) data.contactPhone = null;
    else if (body.contactPhone !== undefined) {
      const phone = normalizeIraqiPhone(str(body, 'contactPhone', { max: 20, label: 'هاتف المسؤول' })!);
      if (!phone) throw new AppError(400, 'INVALID_PHONE', 'رقم الهاتف غير صحيح. اكتبه مثل 07XXXXXXXXX.');
      data.contactPhone = phone;
    }
    if (body.logoMediaId === null) data.logoUrl = null;
    else {
      const mediaId = int(body, 'logoMediaId', { optional: true, min: 1, label: 'الشعار' });
      if (mediaId !== undefined) data.logoUrl = await this.uploads.publicOwned(mediaId, auth.userId);
    }
    return data;
  }

  async create(body: B, { auth, ip }: Ctx) {
    assertActive(auth);
    assertCan(auth, 'sponsors.manage');
    const data = await this.fields(body, auth, true);
    return this.prisma.$transaction(async (tx) => {
      const s = await tx.sponsor.create({ data: data as Prisma.SponsorUncheckedCreateInput, select: SPONSOR_SELECT });
      await this.audit.record({ actorUserId: auth.userId, action: 'sponsor.create', entity: 'sponsor', entityId: s.id, payload: { nameAr: s.nameAr }, ip }, tx);
      return s;
    });
  }

  async update(id: number, body: B, { auth, ip }: Ctx) {
    assertActive(auth);
    assertCan(auth, 'sponsors.manage');
    if (!(await this.prisma.sponsor.findUnique({ where: { id } }))) throw new AppError(404, 'SPONSOR_NOT_FOUND', 'الراعي غير موجود.');
    const data = await this.fields(body, auth, false);
    if (!Object.keys(data).length) throw new AppError(400, 'NOTHING_TO_UPDATE', 'لم ترسل أي تعديل.');
    return this.prisma.$transaction(async (tx) => {
      const s = await tx.sponsor.update({ where: { id }, data, select: SPONSOR_SELECT });
      await this.audit.record({ actorUserId: auth.userId, action: 'sponsor.update', entity: 'sponsor', entityId: id, payload: { fields: Object.keys(data) }, ip }, tx);
      return s;
    });
  }

  // ───────────── بوابة الراعي ─────────────

  /** الرعاة الذين يرى المستخدم تقاريرهم */
  async mine(auth: AuthContext) {
    if (hasPermission(auth.grants, 'sponsor.reports.view', {}, auth.mfa)) {
      return this.prisma.sponsor.findMany({ orderBy: { id: 'asc' }, select: { id: true, nameAr: true, logoUrl: true } });
    }
    const ids = auth.grants.filter((g) => g.role === 'sponsor_viewer' && g.sponsorId).map((g) => g.sponsorId!);
    return this.prisma.sponsor.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' }, select: { id: true, nameAr: true, logoUrl: true } });
  }

  /** GET /sponsor/report?sponsorId=&from=&to= — الظهور والنقرات لشرائح الراعي، يوماً بيوم بتوقيت بغداد */
  async report(auth: AuthContext, q: { sponsorId?: string; from?: string; to?: string }) {
    assertActive(auth);
    let sponsorId: number;
    if (q.sponsorId !== undefined && q.sponsorId !== '') sponsorId = idParam(q.sponsorId, 'الراعي');
    else {
      const own = [...new Set(auth.grants.filter((g) => g.role === 'sponsor_viewer' && g.sponsorId).map((g) => g.sponsorId!))];
      if (own.length !== 1) throw new AppError(400, 'SPONSOR_REQUIRED', 'حدّد الراعي.');
      sponsorId = own[0];
    }
    assertCan(auth, 'sponsor.reports.view', { sponsorId });
    const sponsor = await this.prisma.sponsor.findUnique({ where: { id: sponsorId }, select: { id: true, nameAr: true, logoUrl: true } });
    if (!sponsor) throw new AppError(404, 'SPONSOR_NOT_FOUND', 'الراعي غير موجود.');

    const to = dayParam(q.to, 'إلى تاريخ') ?? baghdadToday();
    const from = dayParam(q.from, 'من تاريخ') ?? addDays(to, -29);
    if (from > to) throw new AppError(400, 'INVALID_RANGE', 'تاريخ البداية بعد تاريخ النهاية.');
    if (daysBetween(from, to) + 1 > REPORT_MAX_DAYS) throw new AppError(400, 'RANGE_TOO_LONG', `الفترة أطول من ${REPORT_MAX_DAYS} يوماً.`);

    const slides = await this.prisma.heroSlide.findMany({
      where: { sponsorId }, orderBy: { id: 'asc' },
      select: { id: true, titleAr: true, type: true, status: true },
    });
    const ids = slides.map((s) => s.id);
    const rows = ids.length
      ? await this.prisma.$queryRaw<{ slideId: number; day: string; type: string; n: bigint }[]>`
          SELECT slide_id AS "slideId", to_char(day, 'YYYY-MM-DD') AS day, type::text AS type, count(*) AS n
          FROM slide_events
          WHERE slide_id = ANY(${ids}::int[]) AND day BETWEEN ${from}::date AND ${to}::date
          GROUP BY 1, 2, 3`
      : [];
    const r = buildReport(slides, rows.map((x) => ({ ...x, n: Number(x.n) })));
    return { sponsor, from, to, timezone: 'Asia/Baghdad', ...r };
  }

  // ───────────── «كن راعياً» ─────────────

  async lead(body: B, ip: string) {
    const fullName = str(body, 'fullName', { min: 2, max: 80, label: 'الاسم' })!;
    const orgName = str(body, 'orgName', { optional: true, max: 120, label: 'الجهة' }) ?? null;
    const message = str(body, 'message', { optional: true, max: 1000, label: 'الرسالة' }) ?? null;
    const phone = normalizeIraqiPhone(str(body, 'phone', { max: 20, label: 'رقم الهاتف' })!);
    if (!phone) throw new AppError(400, 'INVALID_PHONE', 'رقم الهاتف غير صحيح. اكتبه مثل 07XXXXXXXXX.');
    await this.rate.consume({ key: `lead:ip:${ip}`, max: 5, windowSec: 3600 }, { key: `lead:phone:${phone}`, max: 3, windowSec: 86400 });
    return this.prisma.$transaction(async (tx) => {
      const l = await tx.sponsorLead.create({ data: { fullName, orgName, phone, message, ip } });
      await this.audit.record({ action: 'sponsor_lead.create', entity: 'sponsor_lead', entityId: l.id, payload: { orgName }, ip }, tx);
      return { id: l.id, message: 'وصل طلبك. سيتواصل معك فريق ساحة قريباً.' };
    });
  }

  leads(auth: AuthContext, status?: string) {
    assertCan(auth, 'sponsors.manage');
    if (status !== undefined && !(SPONSOR_LEAD_STATUSES as readonly string[]).includes(status)) throw new AppError(400, 'VALIDATION_ERROR', 'حالة غير معروفة.');
    return this.prisma.sponsorLead.findMany({
      where: status ? { status } : {}, orderBy: { id: 'desc' }, take: 200,
      select: { id: true, fullName: true, orgName: true, phone: true, message: true, status: true, createdAt: true, updatedAt: true, handledBy: { select: { id: true, fullName: true } } },
    });
  }

  async setLead(id: number, body: B, { auth, ip }: Ctx) {
    assertActive(auth);
    assertCan(auth, 'sponsors.manage');
    const status = oneOf(body, 'status', SPONSOR_LEAD_STATUSES, { label: 'الحالة' })!;
    const l = await this.prisma.sponsorLead.findUnique({ where: { id } });
    if (!l) throw new AppError(404, 'LEAD_NOT_FOUND', 'الطلب غير موجود.');
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.sponsorLead.update({ where: { id }, data: { status, handledById: auth.userId }, select: { id: true, status: true, updatedAt: true } });
      await this.audit.record({ actorUserId: auth.userId, action: 'sponsor_lead.status', entity: 'sponsor_lead', entityId: id, payload: { from: l.status, to: status }, ip }, tx);
      return u;
    });
  }
}

@Controller()
export class SponsorLeadsPublicController {
  constructor(private readonly svc: SponsorsService) {}

  /** POST /sponsor-leads — نموذج «كن راعياً» في الموقع */
  @Post('sponsor-leads')
  create(@Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.lead(body ?? {}, clientIp(req));
  }
}

@Controller()
@UseGuards(AuthGuard)
export class SponsorsController {
  constructor(private readonly svc: SponsorsService) {}

  @Get('admin/sponsors')
  list(@Req() req: AuthedRequest) {
    return this.svc.list(req.auth);
  }

  @Post('admin/sponsors')
  create(@Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.create(body ?? {}, { auth: req.auth, ip: clientIp(req) });
  }

  @Patch('admin/sponsors/:id')
  update(@Param('id') id: string, @Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.update(idParam(id, 'الراعي'), body ?? {}, { auth: req.auth, ip: clientIp(req) });
  }

  @Get('admin/sponsor-leads')
  leads(@Req() req: AuthedRequest, @Query('status') status?: string) {
    return this.svc.leads(req.auth, status);
  }

  @Patch('admin/sponsor-leads/:id') @HttpCode(200)
  setLead(@Param('id') id: string, @Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.setLead(idParam(id, 'الطلب'), body ?? {}, { auth: req.auth, ip: clientIp(req) });
  }

  @Get('sponsor/me')
  mine(@Req() req: AuthedRequest) {
    return this.svc.mine(req.auth);
  }

  @Get('sponsor/report')
  report(@Req() req: AuthedRequest, @Query() q: { sponsorId?: string; from?: string; to?: string }) {
    return this.svc.report(req.auth, q);
  }

  /** نفس التقرير بملف CSV يفتح في Excel (PDF مع واجهة البوابة في الجلسة 6) */
  @Get('sponsor/report.csv')
  async csv(@Req() req: AuthedRequest, @Query() q: { sponsorId?: string; from?: string; to?: string }, @Res() res: Response) {
    const r = await this.svc.report(req.auth, q);
    res.set({
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="saha-sponsor-${r.sponsor.id}-${r.from}-${r.to}.csv"`,
      'cache-control': 'private, no-store',
    }).send(reportCsv(r));
  }
}
