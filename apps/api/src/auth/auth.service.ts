import { Injectable } from '@nestjs/common';
import type { Role } from '@saha/shared';
import { isMinor, normalizeIraqiPhone, permissionsOf } from '@saha/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/arabic-error.filter';
import { authConfig } from './config';
import {
  decryptSecret, encryptSecret, hashPassword, newTotpSecret, otpauthUri, randomToken, sha256,
  signJwt, verifyJwt, verifyPassword, verifyTotp,
} from './crypto';
import { OtpService } from './otp.service';
import { RateLimitService } from './rate-limit.service';
import type { AuthContext } from './auth.types';

export interface TokenPair { accessToken: string; refreshToken: string; expiresInSec: number }

const UNAUTHORIZED = () => new AppError(401, 'UNAUTHORIZED', 'سجّل الدخول أولاً.');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly otp: OtpService,
    private readonly limits: RateLimitService,
  ) {}

  phoneOrThrow(input: unknown): string {
    const phone = typeof input === 'string' ? normalizeIraqiPhone(input) : null;
    if (!phone) throw new AppError(400, 'INVALID_PHONE', 'رقم الهاتف غير صحيح. اكتبه مثل 07701234567.');
    return phone;
  }

  // ───────────── OTP ─────────────

  async requestOtp(phoneInput: unknown, ip: string) {
    const phone = this.phoneOrThrow(phoneInput);
    await this.limits.consume(
      { key: `otp-phone:${phone}`, max: 3, windowSec: 10 * 60 },
      { key: `otp-phone-day:${phone}`, max: 10, windowSec: 24 * 3600 },
      { key: `otp-ip:${ip}`, max: 20, windowSec: 60 * 60 },
    );
    return this.otp.send(phone);
  }

  /**
   * التحقق من الرمز. المستخدم الجديد يُرسل الاسم وسنة الميلاد مع الرمز نفسه؛
   * إن لم يرسلهما يُرجَع profile_required دون استهلاك الرمز.
   * دون 18 سنة: رقم ولي الأمر إلزامي، والحساب ينتظر موافقته.
   */
  async verifyOtp(input: { phone: unknown; code: unknown; fullName?: string; birthYear?: number; guardianPhone?: unknown; userAgent?: string; ip: string }) {
    const phone = this.phoneOrThrow(input.phone);
    const code = typeof input.code === 'string' ? input.code.trim() : '';
    if (!/^\d{6}$/.test(code)) throw new AppError(400, 'OTP_INVALID', 'الرمز يتكون من 6 أرقام.');
    await this.limits.consume({ key: `otp-verify-ip:${input.ip}`, max: 30, windowSec: 15 * 60 });

    let user = await this.prisma.user.findUnique({ where: { phone } });
    if (user?.status === 'suspended') throw new AppError(403, 'ACCOUNT_SUSPENDED', 'هذا الحساب موقوف. تواصل مع إدارة ساحة.');

    if (!user && (!input.fullName || !input.birthYear)) {
      await this.otp.verify(phone, code, false);
      return { status: 'profile_required' as const };
    }

    // تحقق من بيانات الحساب الجديد قبل استهلاك الرمز، حتى لا يضطر المستخدم لطلب رمز جديد بسبب خطأ في الحقول
    const minor = !user && isMinor(input.birthYear!);
    let gPhone: string | null = null;
    if (minor) {
      gPhone = input.guardianPhone ? normalizeIraqiPhone(String(input.guardianPhone)) : null;
      if (!gPhone) throw new AppError(400, 'GUARDIAN_REQUIRED', 'عمرك أقل من 18 سنة: اكتب رقم هاتف ولي أمرك.');
      if (gPhone === phone) throw new AppError(400, 'GUARDIAN_SAME_PHONE', 'رقم ولي الأمر يجب أن يختلف عن رقمك.');
      const existing = await this.prisma.user.findUnique({ where: { phone: gPhone } });
      if (existing?.birthYear && isMinor(existing.birthYear)) throw new AppError(400, 'GUARDIAN_MINOR', 'ولي الأمر يجب أن يكون بالغاً.');
    }

    await this.otp.verify(phone, code, true);

    if (!user) {
      let guardianId: number | null = null;
      if (gPhone) {
        // ولي الأمر يدخل لاحقاً برقمه نفسه بـ OTP ويكمل اسمه ثم يوافق
        const guardian = await this.prisma.user.upsert({
          where: { phone: gPhone },
          update: {},
          create: { phone: gPhone, fullName: 'ولي أمر (لم يكمل التسجيل)' },
        });
        guardianId = guardian.id;
      }
      user = await this.prisma.user.create({
        data: { phone, fullName: input.fullName!, birthYear: input.birthYear!, guardianId, status: minor ? 'pending_guardian' : 'active' },
      });
      await this.audit.record({ actorUserId: user.id, action: 'user.register', entity: 'user', entityId: user.id, payload: { minor, guardianId }, ip: input.ip });
    }
    const tokens = await this.issueSession(user.id, false, input.userAgent);
    return { status: user.status === 'pending_guardian' ? ('pending_guardian' as const) : ('ok' as const), ...tokens };
  }

  // ───────────── الجلسات ─────────────

  async issueSession(userId: number, mfa: boolean, userAgent?: string): Promise<TokenPair> {
    const refreshToken = randomToken(32);
    const session = await this.prisma.session.create({
      data: {
        userId, mfa, tokenHash: sha256(refreshToken), userAgent: userAgent?.slice(0, 200),
        expiresAt: new Date(Date.now() + authConfig.refreshTtlDays * 86400_000),
      },
    });
    const accessToken = signJwt({ sub: userId, typ: 'access', sid: session.id, mfa }, authConfig.jwtSecret, authConfig.accessTtlSec);
    return { accessToken, refreshToken, expiresInSec: authConfig.accessTtlSec };
  }

  /** تدوير الرمز: كل استخدام يُلغي القديم. إعادة استخدام رمز ملغى = سرقة محتملة ← إلغاء كل جلسات المستخدم. */
  async refresh(refreshToken: unknown, userAgent?: string): Promise<TokenPair> {
    if (typeof refreshToken !== 'string' || refreshToken.length < 20) throw UNAUTHORIZED();
    const s = await this.prisma.session.findUnique({ where: { tokenHash: sha256(refreshToken) }, include: { user: true } });
    if (!s) throw UNAUTHORIZED();
    if (s.revokedAt) {
      await this.prisma.session.updateMany({ where: { userId: s.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.record({ actorUserId: s.userId, action: 'auth.refresh_reuse', entity: 'session', entityId: s.id });
      throw UNAUTHORIZED();
    }
    if (s.expiresAt < new Date() || s.user.status === 'suspended' || s.user.status === 'deleted') throw UNAUTHORIZED();
    const revoked = await this.prisma.session.updateMany({ where: { id: s.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (revoked.count !== 1) throw UNAUTHORIZED();
    return this.issueSession(s.userId, s.mfa, userAgent);
  }

  async logout(refreshToken: unknown) {
    if (typeof refreshToken === 'string') {
      await this.prisma.session.updateMany({ where: { tokenHash: sha256(refreshToken), revokedAt: null }, data: { revokedAt: new Date() } });
    }
    return { ok: true };
  }

  /** يقرأ رمز الدخول ويعيد سياق المستخدم (يُستخدم في الحارس و Swagger) */
  async authenticate(header: string | undefined): Promise<AuthContext> {
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    const p = token ? verifyJwt(token, authConfig.jwtSecret) : null;
    if (!p || p.typ !== 'access' || !p.sid) throw UNAUTHORIZED();
    const s = await this.prisma.session.findUnique({
      where: { id: p.sid },
      select: { revokedAt: true, expiresAt: true, user: { select: { id: true, status: true, roles: { select: { role: true, tournamentId: true, teamId: true } } } } },
    });
    if (!s || s.revokedAt || s.expiresAt < new Date() || s.user.id !== p.sub) throw UNAUTHORIZED();
    if (s.user.status === 'suspended' || s.user.status === 'deleted') throw new AppError(403, 'ACCOUNT_SUSPENDED', 'هذا الحساب موقوف.');
    // حساب القاصر قبل موافقة ولي الأمر لا يحمل أي صلاحية
    const grants = s.user.status === 'active' ? s.user.roles.map((r) => ({ role: r.role as Role, tournamentId: r.tournamentId, teamId: r.teamId })) : [];
    return { userId: s.user.id, sessionId: p.sid, mfa: !!p.mfa, status: s.user.status, grants };
  }

  // ───────────── دخول الإدارة: بريد + كلمة سر + TOTP ─────────────

  async adminLogin(input: { email: string; password: string; totp?: string; ip: string; userAgent?: string }) {
    const email = input.email.toLowerCase();
    await this.limits.consume(
      { key: `admin-email:${email}`, max: 5, windowSec: 15 * 60 },
      { key: `admin-ip:${input.ip}`, max: 20, windowSec: 15 * 60 },
    );
    const user = await this.prisma.user.findUnique({ where: { email }, include: { roles: true } });
    if (!user || user.status !== 'active' || user.roles.length === 0 || !verifyPassword(input.password, user.passwordHash)) {
      await this.audit.record({ action: 'auth.admin_login_failed', entity: 'user', entityId: user?.id ?? null, payload: { email }, ip: input.ip });
      throw new AppError(401, 'INVALID_CREDENTIALS', 'البريد أو كلمة السر غير صحيحة.');
    }
    if (!user.totpEnabled || !user.totpSecret) {
      const setupToken = signJwt({ sub: user.id, typ: 'setup' }, authConfig.jwtSecret, authConfig.setupTtlSec);
      return { status: 'totp_setup_required' as const, setupToken };
    }
    if (!input.totp) throw new AppError(401, 'TOTP_REQUIRED', 'اكتب رمز التحقق من تطبيق المصادقة.');
    await this.checkTotp(user.id, user.totpSecret, input.totp, user.totpLastStep);
    await this.limits.reset(`admin-email:${email}`);
    await this.audit.record({ actorUserId: user.id, action: 'auth.admin_login', entity: 'user', entityId: user.id, ip: input.ip });
    return { status: 'ok' as const, ...(await this.issueSession(user.id, true, input.userAgent)) };
  }

  private async checkTotp(userId: number, encSecret: string, code: string, lastStep: number | null) {
    const step = verifyTotp(decryptSecret(encSecret, authConfig.refreshSecret), code.trim());
    if (step === null || (lastStep !== null && step <= lastStep)) {
      throw new AppError(401, 'TOTP_INVALID', 'رمز التحقق غير صحيح أو مستخدم سابقاً.');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { totpLastStep: step } });
  }

  setupUserFrom(header: string | undefined): number {
    const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
    const p = verifyJwt(token, authConfig.jwtSecret);
    if (!p || p.typ !== 'setup') throw new AppError(401, 'SETUP_EXPIRED', 'انتهت مهلة الإعداد. سجّل الدخول من جديد.');
    return p.sub;
  }

  async totpSetup(userId: number) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.totpEnabled) throw new AppError(409, 'TOTP_ALREADY_ENABLED', 'التحقق الثنائي مفعّل مسبقاً.');
    const secret = newTotpSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { totpSecret: encryptSecret(secret, authConfig.refreshSecret) } });
    return { secret, otpauthUri: otpauthUri(secret, user.email ?? `user-${userId}`) };
  }

  async totpEnable(userId: number, code: string, ip: string, userAgent?: string) {
    await this.limits.consume({ key: `totp-enable:${userId}`, max: 5, windowSec: 15 * 60 });
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.totpEnabled) throw new AppError(409, 'TOTP_ALREADY_ENABLED', 'التحقق الثنائي مفعّل مسبقاً.');
    if (!user.totpSecret) throw new AppError(400, 'TOTP_NOT_SETUP', 'ابدأ إعداد التحقق الثنائي أولاً.');
    await this.checkTotp(userId, user.totpSecret, code, null);
    await this.prisma.user.update({ where: { id: userId }, data: { totpEnabled: true } });
    await this.audit.record({ actorUserId: userId, action: 'auth.totp_enable', entity: 'user', entityId: userId, ip });
    return { status: 'ok' as const, ...(await this.issueSession(userId, true, userAgent)) };
  }

  async changePassword(auth: AuthContext, current: string, next: string, ip: string) {
    if (!auth.mfa) throw new AppError(403, 'MFA_REQUIRED', 'سجّل الدخول ببريد الإدارة ورمز التحقق أولاً.');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (!verifyPassword(current, user.passwordHash)) throw new AppError(400, 'INVALID_PASSWORD', 'كلمة السر الحالية غير صحيحة.');
    if (next.length < 12) throw new AppError(400, 'WEAK_PASSWORD', 'كلمة السر الجديدة يجب أن تكون 12 حرفاً على الأقل.');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: auth.userId }, data: { passwordHash: hashPassword(next) } }),
      this.prisma.session.updateMany({ where: { userId: auth.userId, revokedAt: null, NOT: { id: auth.sessionId ?? 0 } }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.record({ actorUserId: auth.userId, action: 'auth.password_change', entity: 'user', entityId: auth.userId, ip });
    return { ok: true };
  }

  permissions(auth: AuthContext) {
    return permissionsOf(auth.grants, auth.mfa);
  }
}
