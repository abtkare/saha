import { Controller, Get, HttpCode, Injectable, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { Db } from '../audit/write-audit';
import { idParam } from '../common/validate';
import { AppError } from '../common/arabic-error.filter';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthedRequest } from '../auth/auth.types';

export interface NotificationInput { titleAr: string; bodyAr: string; data?: Prisma.InputJsonValue }

/**
 * الإشعارات داخل المنصة (جدول notifications). إرسال Expo Push للهاتف يُضاف مع التطبيق (الجلسة 7)
 * ويقرأ من الجدول نفسه، فلا يتغير من يستدعي notify.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** إشعار لعدة مستخدمين (بلا تكرار، ويُهمل الفارغ) */
  async notify(userIds: readonly (number | null | undefined)[], n: NotificationInput, db: Db = this.prisma) {
    const ids = [...new Set(userIds.filter((x): x is number => typeof x === 'number'))];
    if (!ids.length) return 0;
    const r = await db.notification.createMany({ data: ids.map((userId) => ({ userId, titleAr: n.titleAr, bodyAr: n.bodyAr, data: n.data ?? {} })) });
    return r.count;
  }

  async list(userId: number, unreadOnly: boolean, limit: number) {
    const where: Prisma.NotificationWhereInput = { userId, ...(unreadOnly ? { readAt: null } : {}) };
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit, select: { id: true, titleAr: true, bodyAr: true, data: true, readAt: true, createdAt: true } }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { unread, items };
  }

  async markRead(userId: number, id: number) {
    const r = await this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
    if (!r.count && !(await this.prisma.notification.count({ where: { id, userId } }))) throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'الإشعار غير موجود.');
    return { ok: true };
  }

  async markAllRead(userId: number) {
    const r = await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { ok: true, updated: r.count };
  }
}

@Controller('me/notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  /** GET /me/notifications?unread=true&limit=30 */
  @Get()
  list(@Req() req: AuthedRequest, @Query('unread') unread?: string, @Query('limit') limit?: string) {
    const n = Math.min(Math.max(Number(limit) || 30, 1), 100);
    return this.svc.list(req.auth.userId, unread === 'true', n);
  }

  @Post('read-all') @HttpCode(200)
  readAll(@Req() req: AuthedRequest) {
    return this.svc.markAllRead(req.auth.userId);
  }

  @Post(':id/read') @HttpCode(200)
  read(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.svc.markRead(req.auth.userId, idParam(id, 'الإشعار'));
  }
}
