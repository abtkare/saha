import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ROLES, ROLE_LABELS, type Role } from '@saha/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/arabic-error.filter';
import { idParam, int, str } from '../common/validate';
import { AuthGuard, assertCan } from './auth.guard';
import { clientIp, type AuthedRequest } from './auth.types';

type B = Record<string, unknown>;

/** الإدارة: سجل التدقيق، المستخدمون والأدوار */
@Controller('admin')
@UseGuards(AuthGuard)
export class AdminController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /** GET /admin/audit/verify — التحقق من سلسلة البصمات في سجل التدقيق */
  @Get('audit/verify')
  async verifyAudit(@Req() req: AuthedRequest) {
    assertCan(req.auth, 'audit.verify');
    const result = await this.audit.verify();
    await this.audit.record({ actorUserId: req.auth.userId, action: 'audit.verify', entity: 'audit_log', payload: result, ip: clientIp(req) });
    return result;
  }

  @Get('audit')
  async auditList(@Query('limit') limit: string | undefined, @Req() req: AuthedRequest) {
    assertCan(req.auth, 'audit.verify');
    const rows = await this.prisma.auditLog.findMany({ orderBy: { seq: 'desc' }, take: Math.min(Number(limit) || 50, 200) });
    return rows.map((r) => ({ ...r, id: Number(r.id), seq: Number(r.seq) }));
  }

  /** GET /admin/users?q= — بحث بالاسم أو الهاتف أو البريد */
  @Get('users')
  users(@Query('q') q: string | undefined, @Req() req: AuthedRequest) {
    assertCan(req.auth, 'users.manage');
    const term = (q ?? '').trim().slice(0, 60);
    return this.prisma.user.findMany({
      where: term ? { OR: [{ fullName: { contains: term } }, { phone: { contains: term } }, { email: { contains: term.toLowerCase() } }] } : {},
      orderBy: { id: 'desc' },
      take: 50,
      select: { id: true, fullName: true, phone: true, email: true, status: true, birthYear: true, roles: true },
    });
  }

  /** POST /admin/users/:id/roles {role, tournamentId?, teamId?, sponsorId?} */
  @Post('users/:id/roles')
  async grant(@Param('id') id: string, @Body() body: B, @Req() req: AuthedRequest) {
    assertCan(req.auth, 'users.manage');
    const userId = idParam(id, 'المستخدم');
    const role = str(body, 'role', { label: 'الدور' }) as Role;
    if (!(ROLES as readonly string[]).includes(role)) throw new AppError(400, 'INVALID_ROLE', 'الدور غير معروف.');
    const tournamentId = int(body, 'tournamentId', { optional: true, min: 1, label: 'البطولة' }) ?? null;
    const teamId = int(body, 'teamId', { optional: true, min: 1, label: 'الفريق' }) ?? null;
    const sponsorId = int(body, 'sponsorId', { optional: true, min: 1, label: 'الراعي' }) ?? null;
    if (role === 'team_manager' && !teamId) throw new AppError(400, 'SCOPE_REQUIRED', 'دور مدير الفريق يحتاج تحديد الفريق.');
    if (role === 'sponsor_viewer' && !sponsorId) throw new AppError(400, 'SCOPE_REQUIRED', 'دور الراعي يحتاج تحديد الراعي.');
    if (role !== 'sponsor_viewer' && sponsorId) throw new AppError(400, 'SCOPE_NOT_ALLOWED', 'التقييد براعٍ لدور الراعي فقط.');
    if (role === 'sponsor_viewer' && (tournamentId || teamId)) throw new AppError(400, 'SCOPE_NOT_ALLOWED', 'دور الراعي لا يُقيَّد ببطولة أو فريق.');
    if (role === 'super_admin' && (tournamentId || teamId)) throw new AppError(400, 'SCOPE_NOT_ALLOWED', 'المدير العام لا يُقيَّد ببطولة أو فريق.');
    if (sponsorId && !(await this.prisma.sponsor.findUnique({ where: { id: sponsorId } }))) throw new AppError(404, 'SPONSOR_NOT_FOUND', 'الراعي غير موجود.');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status === 'deleted') throw new AppError(404, 'USER_NOT_FOUND', 'المستخدم غير موجود.');
    if (user.status !== 'active') throw new AppError(400, 'USER_NOT_ACTIVE', 'لا يُمنح دور لحساب غير مفعّل.');
    const exists = await this.prisma.userRole.findFirst({ where: { userId, role, tournamentId, teamId, sponsorId } });
    if (exists) return exists;
    const created = await this.prisma.userRole.create({ data: { userId, role, tournamentId, teamId, sponsorId } });
    await this.audit.record({ actorUserId: req.auth.userId, action: 'role.grant', entity: 'user', entityId: userId, payload: { role, tournamentId, teamId, sponsorId, label: ROLE_LABELS[role] }, ip: clientIp(req) });
    return created;
  }

  @Delete('users/:id/roles/:roleId') @HttpCode(200)
  async revoke(@Param('id') id: string, @Param('roleId') roleId: string, @Req() req: AuthedRequest) {
    assertCan(req.auth, 'users.manage');
    const userId = idParam(id, 'المستخدم');
    const rid = idParam(roleId, 'الدور');
    const role = await this.prisma.userRole.findFirst({ where: { id: rid, userId } });
    if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', 'الدور غير موجود.');
    if (role.role === 'super_admin' && (await this.prisma.userRole.count({ where: { role: 'super_admin' } })) <= 1) {
      throw new AppError(400, 'LAST_SUPER_ADMIN', 'لا يمكن سحب دور آخر مدير عام.');
    }
    await this.prisma.userRole.delete({ where: { id: rid } });
    await this.audit.record({ actorUserId: req.auth.userId, action: 'role.revoke', entity: 'user', entityId: userId, payload: { role: role.role, tournamentId: role.tournamentId, teamId: role.teamId, sponsorId: role.sponsorId }, ip: clientIp(req) });
    return { ok: true };
  }
}

/** نقاط محمية بنطاق — تثبت أن الدور المقيّد ببطولة/فريق لا يتجاوز نطاقه */
@Controller()
@UseGuards(AuthGuard)
export class ScopedController {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /teams/:id/players — قائمة لاعبي الفريق الكاملة لمديره */
  @Get('teams/:id/players')
  async teamPlayers(@Param('id') id: string, @Req() req: AuthedRequest) {
    const teamId = idParam(id, 'الفريق');
    assertCan(req.auth, 'team.players.manage', { teamId });
    return this.prisma.teamPlayer.findMany({
      where: { teamId },
      select: { shirtNo: true, player: { select: { id: true, firstName: true, lastName: true, birthYear: true, mediaConsent: true } } },
    });
  }
}
