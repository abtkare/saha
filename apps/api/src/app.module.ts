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
import { NewsController } from './news/news.controller';
import { AuthModule } from './auth/auth.module';
import { ResultsController, ResultsService } from './matches/results';
import { ResultSweeper } from './matches/result-sweeper';
import { NotificationsController, NotificationsService } from './notifications/notifications';
import { UploadsController, UploadsService } from './uploads/uploads';

@Module({
  imports: [PrismaModule, AuditModule, AuthModule],
  controllers: [
    HealthController,
    TournamentsController, TournamentManageController,
    MatchesController, MatchManageController, ResultsController,
    NotificationsController, UploadsController,
    TeamsPublicController, TeamsController,
    NewsController,
  ],
  providers: [
    TournamentsService, TournamentManageService, MatchesService, MatchManageService, TeamsService,
    ResultsService, ResultSweeper, NotificationsService, UploadsService,
  ],
})
export class AppModule {}
