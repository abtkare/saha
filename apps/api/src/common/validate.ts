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

/** تاريخ بصيغة YYYY-MM-DD (يُخزَّن منتصف الليل UTC لأعمدة DATE) */
export function date(body: Body, field: string, opts: { optional?: boolean; label?: string } = {}): string | undefined {
  const v = str(body, field, { optional: opts.optional, label: opts.label });
  if (v === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) {
    throw bad(field, `الحقل «${opts.label ?? field}» يجب أن يكون تاريخاً مثل 2026-12-01.`);
  }
  return v;
}

/** قيمة من قائمة محددة */
export function oneOf<T extends string>(body: Body, field: string, values: readonly T[], opts: { optional?: boolean; label?: string } = {}): T | undefined {
  const v = str(body, field, { optional: opts.optional, label: opts.label });
  if (v === undefined) return undefined;
  if (!(values as readonly string[]).includes(v)) throw bad(field, `قيمة الحقل «${opts.label ?? field}» غير معروفة.`);
  return v as T;
}

/** مصفوفة نصوص أو أرقام صحيحة */
export function list<T extends 'string' | 'int'>(body: Body, field: string, kind: T, opts: { min?: number; max?: number; label?: string; each?: (v: never) => boolean } = {}): (T extends 'int' ? number : string)[] {
  const v = body?.[field];
  const label = opts.label ?? field;
  if (!Array.isArray(v)) throw bad(field, `الحقل «${label}» يجب أن يكون قائمة.`);
  if (opts.min !== undefined && v.length < opts.min) throw bad(field, `الحقل «${label}» يحتاج ${opts.min} عناصر على الأقل.`);
  if (opts.max !== undefined && v.length > opts.max) throw bad(field, `الحقل «${label}» فيه عناصر أكثر من المسموح.`);
  const out = v.map((x) => (kind === 'int' ? x : typeof x === 'string' ? x.trim() : x));
  for (const x of out) {
    const okType = kind === 'int' ? Number.isInteger(x) : typeof x === 'string' && x.length > 0 && x.length <= 80;
    if (!okType || (opts.each && !opts.each(x as never))) throw bad(field, `قيمة غير صحيحة في الحقل «${label}».`);
  }
  return [...new Set(out)] as never;
}

/** نص اختياري يمكن مسحه بإرسال null */
export function nullableStr(body: Body, field: string, opts: { max?: number; label?: string } = {}): string | null | undefined {
  if (body?.[field] === null) return null;
  return str(body, field, { ...opts, optional: true });
}
