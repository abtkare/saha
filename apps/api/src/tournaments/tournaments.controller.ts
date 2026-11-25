import { Controller, Get, Param, Query } from '@nestjs/common';
import { TournamentsService } from './tournaments.service';

@Controller('tournaments')
export class TournamentsController {
  constructor(private readonly tournaments: TournamentsService) {}

  /** GET /api/v1/tournaments?kind=popular_teams|influencer_followers|facebook_group */
  @Get()
  list(@Query('kind') kind?: string) {
    return this.tournaments.list(kind);
  }

  @Get(':id/standings')
  standings(@Param('id') id: string) {
    return this.tournaments.standings(id);
  }

  @Get(':id/road')
  road(@Param('id') id: string) {
    return this.tournaments.road(id);
  }

  @Get(':id/stars')
  stars(@Param('id') id: string) {
    return this.tournaments.stars(id);
  }

  @Get(':id/scorers')
  scorers(@Param('id') id: string) {
    return this.tournaments.scorers(id);
  }

  @Get(':id/draw')
  drawInfo(@Param('id') id: string) {
    return this.tournaments.drawInfo(id);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.tournaments.get(id);
  }
}
