import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { HealthController } from './health/health.controller';
import { TournamentsController } from './tournaments/tournaments.controller';
import { TournamentsService } from './tournaments/tournaments.service';
import { TournamentManageController } from './tournaments/manage.controller';
import { TournamentManageService } from './tournaments/manage.service';
import { MatchesController } from './matches/matches.controller';
import { MatchesService } from './matches/matches.service';
import { MatchManageController, MatchManageService } from './matches/match-manage';
import { TeamsController, TeamsPublicController } from './teams/teams.controller';
import { TeamsService } from './teams/teams.service';
import { AuthModule } from './auth/auth.module';
import { ResultsController, ResultsService } from './matches/results';
import { ResultSweeper } from './matches/result-sweeper';
import { NotificationsController, NotificationsService } from './notifications/notifications';
import { PushController, PushService } from './notifications/push';
import { MediaController, UploadsController, UploadsService } from './uploads/uploads';
import { HeroController, SlidesAdminController, SlidesService } from './content/slides';
import { SponsorLeadsPublicController, SponsorsController, SponsorsService } from './content/sponsors';
import { SponsorRequestsController, SponsorRequestsService } from './content/sponsor-requests';
import { BannersAdminController, BannersPublicController, BannersService } from './content/banners';
import { PostsAdminController, PostsPublicController, PostsService } from './content/posts';
import { PrizesAdminController, PrizesPublicController, PrizesService } from './prizes/prizes';
import { ShowcaseController, ShowcaseService } from './demo/showcase';

@Module({
  imports: [PrismaModule, AuditModule, AuthModule],
  controllers: [
    HealthController,
    TournamentsController, TournamentManageController,
    MatchesController, MatchManageController, ResultsController,
    NotificationsController, PushController, UploadsController, MediaController,
    TeamsPublicController, TeamsController,
    HeroController, SlidesAdminController, SponsorLeadsPublicController, SponsorsController, SponsorRequestsController, PostsPublicController, PostsAdminController,
    BannersPublicController, BannersAdminController,
    PrizesPublicController, PrizesAdminController,
    ShowcaseController,
  ],
  providers: [
    TournamentsService, TournamentManageService, MatchesService, MatchManageService, TeamsService,
    ResultsService, ResultSweeper, NotificationsService, PushService, UploadsService,
    SlidesService, SponsorsService, SponsorRequestsService, PostsService, BannersService, PrizesService, ShowcaseService,
  ],
})
export class AppModule {}
