import { hasPermission, type Permission } from '@saha/shared';
import { AppError } from '../common/arabic-error.filter';
import { str } from '../common/validate';
import type { AuthContext } from '../auth/auth.types';

type Body = Record<string, unknown> | undefined | null;

/** هل يملك المستخدم أياً من الصلاحيات (بلا نطاق) */
export const canAny = (auth: AuthContext, perms: readonly Permission[]) => perms.some((p) => hasPermission(auth.grants, p, {}, auth.mfa));

export function assertAny(auth: AuthContext, perms: readonly Permission[]) {
  if (!canAny(auth, perms)) throw new AppError(403, 'FORBIDDEN', 'لا تملك صلاحية لهذا الإجراء.');
}

/** وقت بصيغة ISO مع المنطقة الزمنية (مثل 2026-12-01T18:00:00+03:00)، أو null لمسحه */
export function datetime(body: Body, field: string, label: string): Date | null | undefined {
  if (body?.[field] === null) return null;
  const v = str(body, field, { optional: true, max: 40, label });
  if (v === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(v) || Number.isNaN(Date.parse(v))) {
    throw new AppError(400, 'VALIDATION_ERROR', `الحقل «${label}» يجب أن يكون وقتاً مثل 2026-12-01T18:00:00+03:00.`);
  }
  return new Date(v);
}

/** رابط الشريحة: https فقط، أو مسار داخلي في الموقع يبدأ بـ / */
export function linkUrl(body: Body, field = 'linkUrl'): string | null | undefined {
  if (body?.[field] === null) return null;
  const v = str(body, field, { optional: true, max: 300, label: 'الرابط' });
  if (v === undefined) return undefined;
  if (!/^(https:\/\/[^\s<>"']+|\/(?!\/)[^\s<>"']*)$/.test(v)) {
    throw new AppError(400, 'INVALID_LINK', 'الرابط يجب أن يبدأ بـ https:// أو يكون صفحة في الموقع تبدأ بـ /.');
  }
  return v;
}

/** تاريخ YYYY-MM-DD صالح أو undefined */
export function dayParam(v: string | undefined, label: string): string | undefined {
  if (v === undefined || v === '') return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) {
    throw new AppError(400, 'INVALID_DATE', `«${label}» يجب أن يكون تاريخاً مثل 2026-12-01.`);
  }
  return v;
}

export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400_000);

export const conflict = (code: string, message: string) => new AppError(409, code, message);
export const raced = () => new AppError(409, 'STATE_CHANGED', 'تغيّر هذا العنصر الآن. حدّث الصفحة وأعد المحاولة.');
