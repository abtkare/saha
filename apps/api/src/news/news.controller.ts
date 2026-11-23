import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('news')
export class NewsController {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /api/v1/news?limit=3 — الأخبار المنشورة فقط، الأحدث أولاً */
  @Get()
  list(@Query('limit') limit?: string) {
    const take = Math.min(Math.max(Number(limit) || 12, 1), 50);
    return this.prisma.post.findMany({
      where: { type: 'news', status: 'published' },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take,
      select: { id: true, slug: true, titleAr: true, coverUrl: true, publishedAt: true },
    });
  }
}
