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

  @Get(':id')
  get(@Param('id') id: string) {
    return this.tournaments.get(id);
  }
}
