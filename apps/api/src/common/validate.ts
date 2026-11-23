import { AppError } from './arabic-error.filter';

/** تحقق بسيط من مدخلات الطلب برسائل عربية (بلا حزم إضافية). */
type Body = Record<string, unknown> | undefined | null;

const bad = (field: string, message: string) => new AppError(400, 'VALIDATION_ERROR', message || `الحقل ${field} غير صحيح.`);

export function str(body: Body, field: string, opts: { min?: number; max?: number; optional?: boolean; label?: string } = {}): string | undefined {
  const v = body?.[field];
  const label = opts.label ?? field;
  if (v === undefined || v === null || v === '') {
    if (opts.optional) return undefined;
    throw bad(field, `الحقل «${label}» مطلوب.`);
  }
  if (typeof v !== 'string') throw bad(field, `الحقل «${label}» يجب أن يكون نصاً.`);
  const t = v.trim();
  if (opts.min && t.length < opts.min) throw bad(field, `الحقل «${label}» قصير جداً (${opts.min} أحرف على الأقل).`);
  if (opts.max && t.length > opts.max) throw bad(field, `الحقل «${label}» طويل جداً (${opts.max} حرفاً كحد أقصى).`);
  return t;
}

export function int(body: Body, field: string, opts: { min?: number; max?: number; optional?: boolean; label?: string } = {}): number | undefined {
  const v = body?.[field];
  const label = opts.label ?? field;
  if (v === undefined || v === null || v === '') {
    if (opts.optional) return undefined;
    throw bad(field, `الحقل «${label}» مطلوب.`);
  }
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : NaN;
  if (!Number.isInteger(n)) throw bad(field, `الحقل «${label}» يجب أن يكون رقماً صحيحاً.`);
  if (opts.min !== undefined && n < opts.min) throw bad(field, `الحقل «${label}» أصغر من المسموح.`);
  if (opts.max !== undefined && n > opts.max) throw bad(field, `الحقل «${label}» أكبر من المسموح.`);
  return n;
}

export function bool(body: Body, field: string, label = field): boolean {
  const v = body?.[field];
  if (typeof v !== 'boolean') throw bad(field, `الحقل «${label}» يجب أن يكون نعم أو لا.`);
  return v;
}

export function idParam(v: string, what = 'العنصر'): number {
  if (!/^\d{1,9}$/.test(v)) throw new AppError(404, 'NOT_FOUND', `${what} غير موجود.`);
  return Number(v);
}
