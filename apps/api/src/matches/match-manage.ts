import { Body, Controller, Delete, HttpCode, Injectable, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { MatchEventType, Prisma } from '@prisma/client';
import { MATCH_EVENT_TYPES, hasPermission } from '@saha/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/arabic-error.filter';
import { idParam, int, nullableStr, oneOf, str } from '../common/validate';
import { AuthGuard, assertActive, assertCan } from '../auth/auth.guard';
import { clientIp, type AuthContext, type AuthedRequest } from '../auth/auth.types';

type B = Record<string, unknown>;
type Ctx = { auth: AuthContext; ip: string };

/**
 * إدارة المباراة: تعديل الموعد والملعب والحكم (مدير البطولة)، وأحداث المباراة (الحكم المعيَّن أو مدير البطولة).
 * إدخال النتيجة وتأكيدها والاعتراض في الجلسة 4.
 */
@Injectable()
export class MatchManageService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async load(id: number) {
    const m = await this.prisma.match.findUnique({ where: { id }, include: { tournament: { select: { id: true, status: true } } } });
    if (!m) throw new AppError(404, 'MATCH_NOT_FOUND', 'المباراة غير موجودة.');
    return m;
  }

  /** PATCH /matches/:id {kickoffAt?, venue?, refereeId?} */
  async update(id: number, body: B, { auth, ip }: Ctx) {
    const m = await this.load(id);
    assertCan(auth, 'tournaments.manage', { tournamentId: m.tournamentId });
    const data: Prisma.MatchUncheckedUpdateInput = {};
    if (body?.kickoffAt !== undefined) {
      if (m.resultStatus !== 'scheduled') throw new AppError(409, 'MATCH_PLAYED', 'لا يتغير موعد مباراة سُجّلت نتيجتها.');
      const v = str(body, 'kickoffAt', { label: 'موعد المباراة' })!;
      const d = new Date(v);
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) || Number.isNaN(d.getTime())) {
        throw new AppError(400, 'VALIDATION_ERROR', 'الموعد بصيغة 2026-12-04T16:00:00+03:00.');
      }
      data.kickoffAt = d;
    }
    const venue = nullableStr(body, 'venue', { max: 80, label: 'الملعب' });
    if (venue !== undefined) data.venue = venue;
    if (body?.refereeId !== undefined) {
      if (body.refereeId === null) data.refereeId = null;
      else {
        const refereeId = int(body, 'refereeId', { min: 1, label: 'الحكم' })!;
        const ok = await this.prisma.userRole.findFirst({ where: { userId: refereeId, role: 'referee', user: { status: 'active' }, OR: [{ tournamentId: null }, { tournamentId: m.tournamentId }] } });
        if (!ok) throw new AppError(400, 'NOT_A_REFEREE', 'المستخدم المختار ليس حكماً معتمداً لهذه البطولة.');
        data.refereeId = refereeId;
      }
    }
    const updated = await this.prisma.match.update({ where: { id }, data });
    await this.audit.record({ actorUserId: auth.userId, action: 'match.update', entity: 'match', entityId: id, payload: { fields: Object.keys(data) }, ip });
    return updated;
  }

  /** الحكم المعيَّن للمباراة، أو من يدير البطولة */
  private assertCanRecord(auth: AuthContext, m: { tournamentId: number; refereeId: number | null }) {
    assertActive(auth);
    assertCan(auth, 'results.enter', { tournamentId: m.tournamentId });
    if (m.refereeId !== auth.userId && !hasPermission(auth.grants, 'tournaments.manage', { tournamentId: m.tournamentId }, auth.mfa)) {
      throw new AppError(403, 'NOT_MATCH_REFEREE', 'أحداث المباراة يسجلها حكمها المعيَّن أو إدارة البطولة.');
    }
  }

  /** POST /matches/:id/events {teamId, playerId?, type, minute?} */
  async addEvent(id: number, body: B, { auth, ip }: Ctx) {
    const m = await this.load(id);
    this.assertCanRecord(auth, m);
    if (m.resultStatus === 'final') throw new AppError(409, 'MATCH_FINAL', 'نتيجة المباراة نهائية؛ لا تُضاف أحداث.');
    const type = oneOf(body, 'type', MATCH_EVENT_TYPES, { label: 'نوع الحدث' })! as MatchEventType;
    const teamId = int(body, 'teamId', { min: 1, label: 'الفريق' })!;
    if (teamId !== m.homeTeamId && teamId !== m.awayTeamId) throw new AppError(400, 'TEAM_NOT_IN_MATCH', 'الفريق ليس طرفاً في هذه المباراة.');
    const minute = int(body, 'minute', { optional: true, min: 0, max: 150, label: 'الدقيقة' }) ?? null;
    const playerId = int(body, 'playerId', { optional: true, min: 1, label: 'اللاعب' }) ?? null;
    if (type !== 'own_goal' && type !== 'goal' && playerId === null) throw new AppError(400, 'PLAYER_REQUIRED', 'حدد اللاعب.');
    if (playerId !== null) {
      // الهدف العكسي: الفريق المستفيد في teamId، واللاعب من الفريق المنافس
      const playerTeam = type === 'own_goal' ? (teamId === m.homeTeamId ? m.awayTeamId : m.homeTeamId) : teamId;
      if (!(await this.prisma.teamPlayer.findUnique({ where: { teamId_playerId: { teamId: playerTeam, playerId } } }))) {
        throw new AppError(400, 'PLAYER_NOT_IN_TEAM', 'اللاعب ليس ضمن قائمة الفريق.');
      }
    }
    if (type === 'mvp' && (await this.prisma.matchEvent.count({ where: { matchId: id, type: 'mvp' } }))) {
      throw new AppError(409, 'MVP_EXISTS', 'أفضل لاعب محدد مسبقاً لهذه المباراة.');
    }
    const ev = await this.prisma.matchEvent.create({ data: { matchId: id, teamId, playerId, type, minute, createdById: auth.userId } });
    await this.audit.record({ actorUserId: auth.userId, action: 'match_event.create', entity: 'match', entityId: id, payload: { eventId: ev.id, type, teamId, playerId, minute }, ip });
    return ev;
  }

  /** DELETE /matches/:id/events/:eventId */
  async removeEvent(id: number, eventId: number, { auth, ip }: Ctx) {
    const m = await this.load(id);
    this.assertCanRecord(auth, m);
    if (m.resultStatus === 'final') throw new AppError(409, 'MATCH_FINAL', 'نتيجة المباراة نهائية؛ لا تُحذف أحداث.');
    const ev = await this.prisma.matchEvent.findFirst({ where: { id: eventId, matchId: id } });
    if (!ev) throw new AppError(404, 'EVENT_NOT_FOUND', 'الحدث غير موجود.');
    await this.prisma.matchEvent.delete({ where: { id: eventId } });
    await this.audit.record({ actorUserId: auth.userId, action: 'match_event.delete', entity: 'match', entityId: id, payload: { eventId, type: ev.type, teamId: ev.teamId, playerId: ev.playerId, minute: ev.minute }, ip });
    return { ok: true };
  }
}

@Controller('matches')
@UseGuards(AuthGuard)
export class MatchManageController {
  constructor(private readonly svc: MatchManageService) {}

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.update(idParam(id, 'المباراة'), body, { auth: req.auth, ip: clientIp(req) });
  }

  @Post(':id/events')
  addEvent(@Param('id') id: string, @Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.addEvent(idParam(id, 'المباراة'), body, { auth: req.auth, ip: clientIp(req) });
  }

  @Delete(':id/events/:eventId') @HttpCode(200)
  removeEvent(@Param('id') id: string, @Param('eventId') eventId: string, @Req() req: AuthedRequest) {
    return this.svc.removeEvent(idParam(id, 'المباراة'), idParam(eventId, 'الحدث'), { auth: req.auth, ip: clientIp(req) });
  }
}
