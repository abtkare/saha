/** إعدادات الدخول من متغيرات البيئة. في الإنتاج يرفض الخادم الإقلاع بلا أسرار. */
const DEV_FALLBACK = 'dev-only-secret-change-me-dev-only-secret-change-me';

function secret(name: string): string {
  const v = process.env[name];
  if (v && v.length >= 32) return v;
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_SECRETS !== 'true') {
    throw new Error(`المتغير ${name} مفقود أو أقصر من 32 حرفاً.`);
  }
  return `${DEV_FALLBACK}-${name}`;
}

export const authConfig = {
  get jwtSecret() { return secret('JWT_SECRET'); },
  /** يُشتق منه مفتاح تشفير أسرار TOTP */
  get refreshSecret() { return secret('JWT_REFRESH_SECRET'); },
  accessTtlSec: 15 * 60,
  setupTtlSec: 10 * 60,
  refreshTtlDays: 30,
  otpTtlSec: 5 * 60,
  otpMaxAttempts: 5,
  get otpProvider() { return process.env.OTP_PROVIDER ?? 'dev'; },
};
