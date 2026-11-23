import { Injectable, Logger } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { AppError } from '../common/arabic-error.filter';
import { authConfig } from './config';
import { sha256 } from './crypto';
import { KvService } from './kv';

/**
 * رمز التحقق OTP بمزوّد قابل للتبديل.
 * dev: الرمز دائماً 000000 ويُكتب في السجل. sms: يُربط بمزوّد محلي لاحقاً.
 * الرمز يُخزَّن هاشاً فقط، لمدة 5 دقائق، وبحد 5 محاولات خاطئة.
 */
@Injectable()
export class OtpService {
  private readonly log = new Logger('OTP');
  constructor(private readonly kv: KvService) {}

  async send(phone: string) {
    const provider = authConfig.otpProvider;
    const code = provider === 'dev' ? '000000' : String(randomInt(0, 1_000_000)).padStart(6, '0');
    if (provider === 'dev') {
      this.log.log(`رمز التحقق لـ ${phone.slice(0, 7)}***: ${code} (مزوّد dev)`);
    } else {
      // مزوّد الرسائل الحقيقي يُضاف قبل الإطلاق
      throw new AppError(503, 'OTP_PROVIDER_UNAVAILABLE', 'خدمة الرسائل غير مفعّلة بعد. حاول لاحقاً.');
    }
    await this.kv.set(`otp:${phone}`, JSON.stringify({ h: sha256(`${phone}:${code}`), a: 0 }), authConfig.otpTtlSec);
    return { expiresInSec: authConfig.otpTtlSec, devHint: provider === 'dev' };
  }

  /** يتحقق من الرمز ويستهلكه عند النجاح (consume=false للتحقق فقط دون استهلاك) */
  async verify(phone: string, code: string, consume = true) {
    const raw = await this.kv.get(`otp:${phone}`);
    if (!raw) throw new AppError(400, 'OTP_EXPIRED', 'انتهت صلاحية الرمز أو لم يُطلب. اطلب رمزاً جديداً.');
    const rec = JSON.parse(raw) as { h: string; a: number };
    if (rec.h !== sha256(`${phone}:${code}`)) {
      rec.a += 1;
      if (rec.a >= authConfig.otpMaxAttempts) {
        await this.kv.del(`otp:${phone}`);
        throw new AppError(400, 'OTP_LOCKED', 'أخطأت في الرمز عدة مرات. اطلب رمزاً جديداً.');
      }
      await this.kv.set(`otp:${phone}`, JSON.stringify(rec), authConfig.otpTtlSec);
      throw new AppError(400, 'OTP_INVALID', 'الرمز غير صحيح.');
    }
    if (consume) await this.kv.del(`otp:${phone}`);
  }
}
