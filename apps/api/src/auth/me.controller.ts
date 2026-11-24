import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { isMinor, ROLE_LABELS } from '@saha/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/arabic-error.filter';
import { bool, idParam, int, str } from '../common/validate';
import { AuthGuard, assertActive } from './auth.guard';
import { AuthService } from './auth.service';
import { clientIp, type AuthedRequest } from './auth.types';

type B = Record<string, unknown>;

/** الحساب: البيانات، الأبناء (لولي الأمر)، موافقة الصور، حذف الحساب */
@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly auth: AuthService) {}

  @Get()
  async me(@Req() req: AuthedRequest) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: req.auth.userId },
      select: { id: true, phone: true, email: true, fullName: true, birthYear: true, status: true, guardianId: true, totpEnabled: true },
    });
    return {
      ...u,
      roles: req.auth.grants.map((g) => ({ ...g, label: ROLE_LABELS[g.role] })),
      permissions: this.auth.permissions(req.auth),
      mfa: req.auth.mfa,
    };
  }

  @Patch()
  async update(@Body() body: B, @Req() req: AuthedRequest) {
    const fullName = str(body, 'fullName', { min: 2, max: 60, label: 'الاسم' })!;
    const year = new Date().getFullYear();
    const birthYear = int(body, 'birthYear', { optional: true, min: year - 90, max: year - 5, label: 'سنة الميلاد' });
    const current = await this.prisma.user.findUniqueOrThrow({ where: { id: req.auth.userId } });
    // سنة الميلاد تُكتب مرة واحدة فقط (لا يتحول القاصر إلى بالغ بتعديلها)
    if (birthYear !== undefined && current.birthYear !== null && current.birthYear !== birthYear) {
      throw new AppError(400, 'BIRTH_YEAR_LOCKED', 'لا يمكن تعديل سنة الميلاد. تواصل مع الإدارة إن كانت خاطئة.');
    }
    if (birthYear !== undefined && current.birthYear === null && isMinor(birthYear) && (await this.prisma.user.count({ where: { guardianId: current.id } })) > 0) {
      throw new AppError(400, 'GUARDIAN_MINOR', 'ولي الأمر يجب أن يكون بالغاً.');
    }
    await this.prisma.user.update({ where: { id: req.auth.userId }, data: { fullName, ...(current.birthYear === null && birthYear ? { birthYear } : {}) } });
    await this.audit.record({ actorUserId: req.auth.userId, action: 'user.update', entity: 'user', entityId: req.auth.userId, ip: clientIp(req) });
    return this.me(req);
  }

  /** حذف الحساب: تُمحى البيانات الشخصية وتُلغى الجلسات، ويبقى السجل للتدقيق */
  @Delete() @HttpCode(200)
  async remove(@Req() req: AuthedRequest) {
    const id = req.auth.userId;
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { status: 'deleted', phone: null, email: null, fullName: 'حساب محذوف', passwordHash: null, totpSecret: null, totpEnabled: false } }),
      this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
      this.prisma.userRole.deleteMany({ where: { userId: id } }),
      this.prisma.pushToken.deleteMany({ where: { userId: id } }),
    ]);
    await this.audit.record({ actorUserId: id, action: 'user.delete', entity: 'user', entityId: id, ip: clientIp(req) });
    return { ok: true };
  }

  // ───── ولي الأمر ─────

  /** القاصرون المسجّلون برقم ولي الأمر هذا */
  @Get('wards')
  wards(@Req() req: AuthedRequest) {
    return this.prisma.user.findMany({
      where: { guardianId: req.auth.userId, status: { in: ['pending_guardian', 'active'] } },
      select: { id: true, fullName: true, birthYear: true, status: true, createdAt: true },
    });
  }

  @Post('wards/:id/approve') @HttpCode(200)
  async approveWard(@Param('id') id: string, @Req() req: AuthedRequest) {
    assertActive(req.auth);
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: req.auth.userId } });
    if (!me.birthYear || isMinor(me.birthYear)) {
      throw new AppError(403, 'GUARDIAN_PROFILE_REQUIRED', 'أكمل اسمك وسنة ميلادك أولاً لتتمكن من الموافقة.');
    }
    const wardId = idParam(id, 'الحساب');
    const res = await this.prisma.user.updateMany({ where: { id: wardId, guardianId: req.auth.userId, status: 'pending_guardian' }, data: { status: 'active' } });
    if (res.count !== 1) throw new AppError(404, 'WARD_NOT_FOUND', 'لا يوجد حساب بانتظار موافقتك بهذا الرقم.');
    await this.audit.record({ actorUserId: req.auth.userId, action: 'guardian.approve', entity: 'user', entityId: wardId, ip: clientIp(req) });
    return { ok: true };
  }

  /** POST /me/guardian/children {firstName, birthYear, mediaConsent?} — لاعب قاصر بلا حساب يديره ولي أمره */
  @Post('guardian/children')
  async addChild(@Body() body: B, @Req() req: AuthedRequest) {
    assertActive(req.auth);
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: req.auth.userId } });
    if (!me.birthYear || isMinor(me.birthYear)) throw new AppError(403, 'GUARDIAN_PROFILE_REQUIRED', 'ولي الأمر يجب أن يكون بالغاً وأن يكمل سنة ميلاده.');
    const year = new Date().getFullYear();
    const birthYear = int(body, 'birthYear', { min: year - 18, max: year - 5, label: 'سنة ميلاد الابن' })!;
    if (!isMinor(birthYear)) throw new AppError(400, 'NOT_A_MINOR', 'هذا القسم للأبناء دون 18 سنة فقط.');
    const mediaConsent = body?.mediaConsent === undefined ? false : bool(body, 'mediaConsent', 'موافقة الصور');
    const player = await this.prisma.player.create({
      data: { guardianId: me.id, firstName: str(body, 'firstName', { min: 2, max: 30, label: 'الاسم الأول' })!, birthYear, mediaConsent, consentAt: mediaConsent ? new Date() : null },
      select: { id: true, firstName: true, birthYear: true, mediaConsent: true, consentAt: true },
    });
    await this.audit.record({ actorUserId: me.id, action: 'guardian.add_child', entity: 'player', entityId: player.id, payload: { mediaConsent }, ip: clientIp(req) });
    return player;
  }

  @Get('children')
  children(@Req() req: AuthedRequest) {
    return this.prisma.player.findMany({
      where: { guardianId: req.auth.userId },
      select: { id: true, firstName: true, birthYear: true, mediaConsent: true, consentAt: true, teams: { select: { team: { select: { id: true, nameAr: true } } } } },
    });
  }

  /** PATCH /me/children/:id/consent {mediaConsent} — نص الموافقة يشمل الصور والبث مستقبلاً */
  @Patch('children/:id/consent')
  async consent(@Param('id') id: string, @Body() body: B, @Req() req: AuthedRequest) {
    assertActive(req.auth);
    const playerId = idParam(id, 'اللاعب');
    const mediaConsent = bool(body, 'mediaConsent', 'موافقة الصور');
    const res = await this.prisma.player.updateMany({
      where: { id: playerId, guardianId: req.auth.userId },
      data: { mediaConsent, consentAt: mediaConsent ? new Date() : null },
    });
    if (res.count !== 1) throw new AppError(404, 'PLAYER_NOT_FOUND', 'اللاعب غير موجود ضمن أبنائك.');
    await this.audit.record({ actorUserId: req.auth.userId, action: 'guardian.consent', entity: 'player', entityId: playerId, payload: { mediaConsent }, ip: clientIp(req) });
    return { ok: true, mediaConsent };
  }
}
