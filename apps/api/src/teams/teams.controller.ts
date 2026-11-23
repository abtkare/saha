import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { clientIp, type AuthedRequest } from '../auth/auth.types';
import { idParam } from '../common/validate';
import { TeamsService } from './teams.service';

type B = Record<string, unknown>;
const ctx = (req: AuthedRequest) => ({ auth: req.auth, ip: clientIp(req) });

/** الصفحة العامة للفريق (بلا دخول) */
@Controller('teams')
export class TeamsPublicController {
  constructor(private readonly svc: TeamsService) {}

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.publicTeam(idParam(id, 'الفريق'));
  }
}

/** إدارة الفريق ولاعبيه وتوثيقه */
@Controller()
@UseGuards(AuthGuard)
export class TeamsController {
  constructor(private readonly svc: TeamsService) {}

  /** POST /teams {nameAr, city?, fbPageUrl?, communityId?} */
  @Post('teams')
  create(@Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.create(body, ctx(req));
  }

  /** POST /teams/join {code, shirtNo?} */
  @Post('teams/join') @HttpCode(200)
  join(@Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.joinSelf(body, ctx(req));
  }

  @Patch('teams/:id')
  update(@Param('id') id: string, @Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.update(idParam(id, 'الفريق'), body, ctx(req));
  }

  @Post('teams/:id/join-code') @HttpCode(200)
  joinCode(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.svc.regenerateJoinCode(idParam(id, 'الفريق'), ctx(req));
  }

  /** POST /teams/:id/players {phone, shirtNo?} */
  @Post('teams/:id/players')
  addPlayer(@Param('id') id: string, @Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.addByPhone(idParam(id, 'الفريق'), body, ctx(req));
  }

  @Patch('teams/:id/players/:playerId')
  shirt(@Param('id') id: string, @Param('playerId') playerId: string, @Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.setShirt(idParam(id, 'الفريق'), idParam(playerId, 'اللاعب'), body, ctx(req));
  }

  @Delete('teams/:id/players/:playerId') @HttpCode(200)
  removePlayer(@Param('id') id: string, @Param('playerId') playerId: string, @Req() req: AuthedRequest) {
    return this.svc.removePlayer(idParam(id, 'الفريق'), idParam(playerId, 'اللاعب'), ctx(req));
  }

  @Get('teams/:id/verification')
  verification(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.svc.verificationStatus(idParam(id, 'الفريق'), req.auth);
  }

  @Post('teams/:id/verification')
  requestVerification(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.svc.requestVerification(idParam(id, 'الفريق'), ctx(req));
  }

  /** PATCH /teams/:id/verification {postUrl} */
  @Patch('teams/:id/verification')
  submitPost(@Param('id') id: string, @Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.submitPost(idParam(id, 'الفريق'), body, ctx(req));
  }

  @Get('me/teams')
  mine(@Req() req: AuthedRequest) {
    return this.svc.myTeams(req.auth);
  }

  /** POST /me/children/:id/teams {code, shirtNo?} */
  @Post('me/children/:id/teams') @HttpCode(200)
  joinChild(@Param('id') id: string, @Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.joinChild(idParam(id, 'اللاعب'), body, ctx(req));
  }

  @Get('admin/verifications')
  adminList(@Query('status') status: string | undefined, @Req() req: AuthedRequest) {
    return this.svc.adminList(status, req.auth);
  }

  /** POST /admin/verifications/:id/decide {approve, note?} */
  @Post('admin/verifications/:id/decide') @HttpCode(200)
  decide(@Param('id') id: string, @Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.decide(idParam(id, 'طلب التوثيق'), body, ctx(req));
  }
}
