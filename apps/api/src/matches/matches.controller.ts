import { Controller, Get, Param, Query } from '@nestjs/common';
import { MatchesService } from './matches.service';

@Controller('matches')
export class MatchesController {
  constructor(private readonly matches: MatchesService) {}

  /** GET /api/v1/matches?date=YYYY-MM-DD — مباريات يوم واحد بتوقيت بغداد (الافتراضي اليوم) */
  @Get()
  list(@Query('date') date?: string) {
    return this.matches.byDate(date);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.matches.get(id);
  }
}
