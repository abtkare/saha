import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { HealthController } from './health/health.controller';
import { TournamentsController } from './tournaments/tournaments.controller';
import { TournamentsService } from './tournaments/tournaments.service';
import { MatchesController } from './matches/matches.controller';
import { MatchesService } from './matches/matches.service';
import { NewsController } from './news/news.controller';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [PrismaModule, AuditModule, AuthModule],
  controllers: [HealthController, TournamentsController, MatchesController, NewsController],
  providers: [TournamentsService, MatchesService],
})
export class AppModule {}
