import { Body, Controller, Headers, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { int, str } from '../common/validate';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { clientIp, type AuthedRequest } from './auth.types';

type B = Record<string, unknown>;

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** POST /auth/otp/request {phone} */
  @Post('otp/request') @HttpCode(200)
  requestOtp(@Body() body: B, @Req() req: Request) {
    return this.auth.requestOtp(body?.phone, clientIp(req));
  }

  /** POST /auth/otp/verify {phone, code, fullName?, birthYear?, guardianPhone?} */
  @Post('otp/verify') @HttpCode(200)
  verifyOtp(@Body() body: B, @Req() req: Request) {
    const year = new Date().getFullYear();
    return this.auth.verifyOtp({
      phone: body?.phone,
      code: body?.code,
      fullName: str(body, 'fullName', { optional: true, min: 2, max: 60, label: 'الاسم' }),
      birthYear: int(body, 'birthYear', { optional: true, min: year - 90, max: year - 5, label: 'سنة الميلاد' }),
      guardianPhone: body?.guardianPhone,
      userAgent: req.headers['user-agent'],
      ip: clientIp(req),
    });
  }

  /** POST /auth/refresh {refreshToken} — يُرجع زوجاً جديداً ويُلغي القديم */
  @Post('refresh') @HttpCode(200)
  refresh(@Body() body: B, @Req() req: Request) {
    return this.auth.refresh(body?.refreshToken, req.headers['user-agent']);
  }

  @Post('logout') @HttpCode(200)
  logout(@Body() body: B) {
    return this.auth.logout(body?.refreshToken);
  }

  /** POST /auth/admin/login {email, password, totp?} */
  @Post('admin/login') @HttpCode(200)
  adminLogin(@Body() body: B, @Req() req: Request) {
    return this.auth.adminLogin({
      email: str(body, 'email', { max: 200, label: 'البريد' })!,
      password: str(body, 'password', { max: 200, label: 'كلمة السر' })!,
      totp: str(body, 'totp', { optional: true, max: 6, label: 'رمز التحقق' }),
      ip: clientIp(req),
      userAgent: req.headers['user-agent'],
    });
  }

  /** POST /auth/admin/totp/setup — برمز الإعداد من admin/login. يُرجع السر ورابط otpauth لتطبيق المصادقة */
  @Post('admin/totp/setup') @HttpCode(200)
  totpSetup(@Headers('authorization') authz: string) {
    return this.auth.totpSetup(this.auth.setupUserFrom(authz));
  }

  /** POST /auth/admin/totp/enable {code} — برمز الإعداد. يفعّل TOTP ويُرجع جلسة إدارة */
  @Post('admin/totp/enable') @HttpCode(200)
  totpEnable(@Headers('authorization') authz: string, @Body() body: B, @Req() req: Request) {
    return this.auth.totpEnable(this.auth.setupUserFrom(authz), str(body, 'code', { max: 6, label: 'رمز التحقق' })!, clientIp(req), req.headers['user-agent']);
  }

  /** POST /auth/admin/password {currentPassword, newPassword} — يلغي باقي الجلسات */
  @Post('admin/password') @HttpCode(200) @UseGuards(AuthGuard)
  changePassword(@Body() body: B, @Req() req: AuthedRequest) {
    return this.auth.changePassword(
      req.auth,
      str(body, 'currentPassword', { max: 200, label: 'كلمة السر الحالية' })!,
      str(body, 'newPassword', { max: 200, label: 'كلمة السر الجديدة' })!,
      clientIp(req),
    );
  }
}
