import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, assertCan } from '../auth/auth.guard';
import { clientIp, type AuthedRequest } from '../auth/auth.types';
import { idParam } from '../common/validate';
import { TournamentManageService } from './manage.service';

type B = Record<string, unknown>;
const ctx = (req: AuthedRequest) => ({ auth: req.auth, ip: clientIp(req) });

/** إدارة البطولات (مدير البطولة بنطاقها، أو المدير العام بدخول TOTP) وتسجيل الفرق (مدير الفريق) */
@Controller()
@UseGuards(AuthGuard)
export class TournamentManageController {
  constructor(private readonly svc: TournamentManageService) {}

  @Get('admin/tournaments')
  adminList(@Req() req: AuthedRequest) {
    return this.svc.adminList(req.auth);
  }

  /** POST /tournaments {nameAr, kind, format, ageCategory?, communityId?, slug?, city?, startsOn?, endsOn?, maxTeams?, entryFeeIqd?, disputeWindowHrs?, groupCount?, qualifiersPerGroup?, doubleRound?} */
  @Post('tournaments')
  create(@Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.create(body, ctx(req));
  }

  @Patch('tournaments/:id')
  update(@Param('id') id: string, @Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.update(idParam(id, 'البطولة'), body, ctx(req));
  }

  /** POST /tournaments/:id/status {status} — مسودة ← التسجيل ← جارية ← منتهية، أو ملغاة */
  @Post('tournaments/:id/status') @HttpCode(200)
  status(@Param('id') id: string, @Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.setStatus(idParam(id, 'البطولة'), body, ctx(req));
  }

  @Get('tournaments/:id/registrations')
  registrations(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.svc.listRegistrations(idParam(id, 'البطولة'), req.auth);
  }

  /** POST /tournaments/:id/registrations {teamId} — مدير الفريق */
  @Post('tournaments/:id/registrations')
  register(@Param('id') id: string, @Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.register(idParam(id, 'البطولة'), body, ctx(req));
  }

  @Post('tournaments/:id/registrations/:regId/withdraw') @HttpCode(200)
  withdraw(@Param('id') id: string, @Param('regId') regId: string, @Req() req: AuthedRequest) {
    return this.svc.withdraw(idParam(id, 'البطولة'), idParam(regId, 'طلب التسجيل'), ctx(req));
  }

  /** POST /tournaments/:id/registrations/:regId/decision {approve, note?} */
  @Post('tournaments/:id/registrations/:regId/decision') @HttpCode(200)
  decide(@Param('id') id: string, @Param('regId') regId: string, @Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.decide(idParam(id, 'البطولة'), idParam(regId, 'طلب التسجيل'), body, ctx(req));
  }

  /** PATCH /tournaments/:id/registrations/:regId/fee {feePaidIqd} */
  @Patch('tournaments/:id/registrations/:regId/fee')
  fee(@Param('id') id: string, @Param('regId') regId: string, @Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.recordFee(idParam(id, 'البطولة'), idParam(regId, 'طلب التسجيل'), body, ctx(req));
  }

  /** GET /admin/fees — رسوم الاشتراك لكل بطولة والمحصَّل منها */
  @Get('admin/fees')
  fees(@Req() req: AuthedRequest) {
    return this.svc.feesOverview(req.auth);
  }

  /** POST /tournaments/:id/fees {enabled, entryFeeIqd?, note?} — قرار المدير العام */
  @Post('tournaments/:id/fees') @HttpCode(200)
  setFees(@Param('id') id: string, @Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.setFees(idParam(id, 'البطولة'), body ?? {}, ctx(req));
  }

  @Post('tournaments/:id/draw') @HttpCode(200)
  draw(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.svc.draw(idParam(id, 'البطولة'), ctx(req));
  }

  /** GET /tournaments/:id/fixtures — كل المباريات ومنها غير المجدولة (للإدارة، والمسودات أيضاً) */
  @Get('tournaments/:id/fixtures')
  fixtures(@Param('id') id: string, @Req() req: AuthedRequest) {
    const tid = idParam(id, 'البطولة');
    assertCan(req.auth, 'tournaments.manage', { tournamentId: tid });
    return this.svc.fixtures(tid);
  }

  /** POST /tournaments/:id/schedule {startDate, weekdays:[5,6], times:["16:00"], venues:["ملعب"], restDays?, fromRound?} */
  @Post('tournaments/:id/schedule') @HttpCode(200)
  schedule(@Param('id') id: string, @Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.schedule(idParam(id, 'البطولة'), body, ctx(req));
  }

  @Post('tournaments/:id/next-round') @HttpCode(200)
  nextRound(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.svc.nextRound(idParam(id, 'البطولة'), ctx(req));
  }
}
