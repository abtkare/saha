import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { HealthController } from './health/health.controller';
import { TournamentsController } from './tournaments/tournaments.controller';
import { TournamentsService } from './tournaments/tournaments.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [HealthController, TournamentsController],
  providers: [TournamentsService],
})
export class AppModule {}
