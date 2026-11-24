import { Body, Controller, Delete, HttpCode, Injectable, OnApplicationBootstrap, OnModuleDestroy, Post, Req, UseGuards } from '@nestjs/common';
import { PUSH_PLATFORMS, isExpoPushToken, type PushPlatform } from '@saha/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/arabic-error.filter';
import { oneOf, str } from '../common/validate';
import { AuthGuard } from '../auth/auth.guard';
import { NotificationsService } from './notifications';
import { clientIp, type AuthedRequest } from '../auth/auth.types';

type B = Record<string, unknown>;

/** الحد الأعلى للأجهزة لكل مستخدم: الأقدم يُحذف عند تجاوزه */
export const MAX_DEVICES_PER_USER = 10;
/** الإشعار الأقدم من هذا لا يُرسل للهاتف (فات وقته)، ويبقى في قائمة الإشعارات داخل التطبيق */
export const PUSH_MAX_AGE_MIN = 30;
/** Expo يقبل حتى 100 رسالة في الطلب الواحد */
export const EXPO_CHUNK = 100;

export interface PendingNotification { id: number; userId: number; titleAr: string; bodyAr: string; data: unknown }
export interface DeviceToken { userId: number; token: string }
export interface ExpoMessage {
  to: string; title: string; body: string; sound: 'default'; badge: number; channelId: 'default'; priority: 'high';
  data: Record<string, unknown>;
}
export interface ExpoTicket { status: 'ok' | 'error'; id?: string; message?: string; details?: { error?: string } }

/** يبني رسالة لكل جهاز من أجهزة صاحب الإشعار، مع عدد غير المقروء شارةً على أيقونة التطبيق (منطق خالص) */
export function buildMessages(items: readonly PendingNotification[], tokens: readonly DeviceToken[], unread: ReadonlyMap<number, number>): ExpoMessage[] {
  const out: ExpoMessage[] = [];
  for (const n of items) {
    const extra = n.data && typeof n.data === 'object' && !Array.isArray(n.data) ? (n.data as Record<string, unknown>) : {};
    for (const t of tokens) {
      if (t.userId !== n.userId) continue;
      out.push({
        to: t.token, title: n.titleAr, body: n.bodyAr, sound: 'default', channelId: 'default', priority: 'high',
        badge: unread.get(n.userId) ?? 1,
        data: { ...extra, notificationId: n.id },
      });
    }
  }
  return out;
}

export function chunk<T>(a: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += size) out.push(a.slice(i, i + size));
  return out;
}

/** الرموز التي يقول Expo إن جهازها لم يعد مسجلاً (حُذف التطبيق أو أُلغي الإذن) — تُعطَّل */
export function deadTokens(messages: readonly ExpoMessage[], tickets: readonly ExpoTicket[]): string[] {
  return tickets.flatMap((t, i) => (t.status === 'error' && t.details?.error === 'DeviceNotRegistered' && messages[i] ? [messages[i].to] : []));
}

/**
 * إشعارات الهاتف عبر Expo Push. كل إشعار يُكتب أولاً في جدول notifications (NotificationsService.notify)
 * ثم ترسله هذه المهمة الخلفية كل PUSH_SWEEP_SECONDS (الافتراضي 5 ثوانٍ؛ 0 يوقفها). الإرسال بعد اكتمال
 * المعاملة دائماً، فلا يصل إشعار عن تغيير أُلغي. يُحجز الإشعار قبل الإرسال (pushed_at) فلا يُرسل مرتين.
 */
@Injectable()
export class PushService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly notifications: NotificationsService) {}

  onApplicationBootstrap() {
    const seconds = Number(process.env.PUSH_SWEEP_SECONDS ?? 5);
    if (process.env.PUSH_PROVIDER === 'off' || !Number.isFinite(seconds) || seconds <= 0) return;
    this.timer = setInterval(() => void this.tick(), seconds * 1000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.queueReminders();
      await this.sendPending();
    } catch (e) {
      console.error('فشل إرسال إشعارات الهاتف', e);
    } finally {
      this.running = false;
    }
  }

  async register(userId: number, token: string, platform: PushPlatform, ip: string) {
    const existing = await this.prisma.pushToken.findUnique({ where: { token } });
    await this.prisma.pushToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform, lastSeenAt: new Date(), disabledAt: null },
    });
    const all = await this.prisma.pushToken.findMany({ where: { userId }, orderBy: [{ lastSeenAt: 'desc' }, { id: 'desc' }], select: { id: true } });
    if (all.length > MAX_DEVICES_PER_USER) await this.prisma.pushToken.deleteMany({ where: { id: { in: all.slice(MAX_DEVICES_PER_USER).map((x) => x.id) } } });
    if (!existing || existing.userId !== userId) {
      await this.audit.record({ actorUserId: userId, action: 'push.register', entity: 'user', entityId: userId, payload: { platform, moved: !!existing }, ip });
    }
    return { ok: true };
  }

  async unregister(userId: number, token: string) {
    const r = await this.prisma.pushToken.deleteMany({ where: { userId, token } });
    return { ok: true, removed: r.count };
  }

  /**
   * تذكير «مباراتك بعد قليل» قبل الانطلاق بساعة: للحكم ومديري الفريقين ولاعبيهما أصحاب الحسابات
   * وأولياء أمور اللاعبين القاصرين. مرة واحدة لكل موعد (reminder_sent_at). يعيد عدد المباريات.
   */
  async queueReminders(): Promise<number> {
    const due = await this.prisma.$queryRaw<{ id: number }[]>`
      UPDATE matches SET reminder_sent_at = now()
      WHERE id IN (
        SELECT m.id FROM matches m JOIN tournaments t ON t.id = m.tournament_id
        WHERE m.reminder_sent_at IS NULL AND m.result_status = 'scheduled' AND t.status = 'running'
          AND m.kickoff_at > now() AND m.kickoff_at <= now() + interval '60 minutes'
        ORDER BY m.id LIMIT 100 FOR UPDATE OF m SKIP LOCKED
      )
      RETURNING id`;
    if (!due.length) return 0;
    const team = { select: { nameAr: true, managerId: true, players: { select: { player: { select: { userId: true, guardianId: true } } } } } } as const;
    const matches = await this.prisma.match.findMany({
      where: { id: { in: due.map((d) => d.id) } },
      select: { id: true, kickoffAt: true, venue: true, refereeId: true, tournament: { select: { nameAr: true } }, homeTeam: team, awayTeam: team },
    });
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baghdad', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    for (const m of matches) {
      const people = [m.refereeId, m.homeTeam.managerId, m.awayTeam.managerId,
        ...[...m.homeTeam.players, ...m.awayTeam.players].flatMap((tp) => [tp.player.userId, tp.player.guardianId])];
      await this.notifications.notify(people, {
        titleAr: 'مباراتك بعد قليل',
        bodyAr: `${m.homeTeam.nameAr} × ${m.awayTeam.nameAr} الساعة ${m.kickoffAt ? time.format(m.kickoffAt) : ''}${m.venue ? ` في ${m.venue}` : ''} — ${m.tournament.nameAr}.`,
        data: { type: 'match.reminder', matchId: m.id },
      });
    }
    return matches.length;
  }

  /** يرسل الإشعارات المنتظرة. يعيد عدد الرسائل المرسلة إلى Expo. */
  async sendPending(fetchImpl: typeof fetch = fetch): Promise<number> {
    // ما فات وقته لا يُرسل (يبقى في قائمة الإشعارات داخل التطبيق)
    // (30 دقيقة = PUSH_MAX_AGE_MIN)
    await this.prisma.$executeRaw`UPDATE notifications SET pushed_at = now()
      WHERE pushed_at IS NULL AND created_at <= now() - interval '30 minutes'`;
    const items = await this.prisma.$queryRaw<{ id: number; user_id: number | null; title_ar: string; body_ar: string; data: unknown }[]>`
      UPDATE notifications SET pushed_at = now()
      WHERE id IN (
        SELECT id FROM notifications WHERE pushed_at IS NULL ORDER BY id LIMIT 300 FOR UPDATE SKIP LOCKED
      )
      RETURNING id, user_id, title_ar, body_ar, data`;
    const pending: PendingNotification[] = items
      .filter((n) => n.user_id !== null)
      .map((n) => ({ id: n.id, userId: n.user_id!, titleAr: n.title_ar, bodyAr: n.body_ar, data: n.data }));
    if (!pending.length) return 0;
    const userIds = [...new Set(pending.map((n) => n.userId))];
    const [tokens, counts] = await Promise.all([
      this.prisma.pushToken.findMany({ where: { userId: { in: userIds }, disabledAt: null }, select: { userId: true, token: true } }),
      this.prisma.notification.groupBy({ by: ['userId'], where: { userId: { in: userIds }, readAt: null }, _count: { _all: true } }),
    ]);
    const unread = new Map(counts.map((c) => [c.userId!, c._count._all]));
    const messages = buildMessages(pending, tokens, unread);
    let sent = 0;
    for (const part of chunk(messages, EXPO_CHUNK)) {
      try {
        const res = await fetchImpl(process.env.EXPO_PUSH_URL || 'https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            accept: 'application/json', 'content-type': 'application/json',
            ...(process.env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
          },
          body: JSON.stringify(part),
        });
        if (!res.ok) { console.error(`Expo Push رد بالرمز ${res.status}`); continue; }
        const json = (await res.json()) as { data?: ExpoTicket[] };
        sent += part.length;
        const dead = deadTokens(part, json.data ?? []);
        if (dead.length) await this.prisma.pushToken.updateMany({ where: { token: { in: dead } }, data: { disabledAt: new Date() } });
      } catch (e) {
        // تعذّر الوصول إلى Expo: الإشعار باقٍ داخل التطبيق، ولا نعيد المحاولة حتى لا يتكرر
        console.error('تعذّر الوصول إلى Expo Push', (e as Error).message);
      }
    }
    return sent;
  }
}

/** تسجيل جهاز المستخدم لإشعارات الهاتف وإلغاؤه (عند الخروج) */
@Controller('me/push-tokens')
@UseGuards(AuthGuard)
export class PushController {
  constructor(private readonly push: PushService) {}

  /** POST /me/push-tokens {token, platform} */
  @Post() @HttpCode(200)
  register(@Body() body: B, @Req() req: AuthedRequest) {
    const token = str(body, 'token', { max: 250, label: 'رمز الجهاز' })!;
    if (!isExpoPushToken(token)) throw new AppError(400, 'INVALID_PUSH_TOKEN', 'رمز الإشعارات غير صالح.');
    const platform = oneOf(body, 'platform', PUSH_PLATFORMS, { label: 'نظام الجهاز' })!;
    return this.push.register(req.auth.userId, token, platform, clientIp(req));
  }

  /** DELETE /me/push-tokens {token} */
  @Delete() @HttpCode(200)
  unregister(@Body() body: B, @Req() req: AuthedRequest) {
    return this.push.unregister(req.auth.userId, str(body, 'token', { max: 250, label: 'رمز الجهاز' })!);
  }
}
