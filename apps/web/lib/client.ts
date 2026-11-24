'use client';
/**
 * عميل الـ API في المتصفح: يمر عبر /api/v1 في الموقع نفسه (منفذ واحد).
 * رموز الدخول تُحفظ في localStorage (داخل try/catch لأنه قد يكون غير متاح)، وعند انتهاء رمز الوصول
 * يُجدَّد مرة واحدة تلقائياً برمز التجديد (الخادم يدوّره ويلغي القديم).
 */

const KEY = 'saha_auth';

export interface Tokens { accessToken: string; refreshToken: string }

let memory: Tokens | null = null;

export function getTokens(): Tokens | null {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    memory = raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    memory = null;
  }
  return memory;
}

export function setTokens(t: Tokens | null) {
  memory = t;
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify({ accessToken: t.accessToken, refreshToken: t.refreshToken }));
    else localStorage.removeItem(KEY);
  } catch { /* التخزين غير متاح: تبقى الجلسة في الذاكرة حتى إغلاق الصفحة */ }
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;

async function refresh(): Promise<boolean> {
  const t = getTokens();
  if (!t) return false;
  refreshing ??= (async () => {
    try {
      const res = await fetch('/api/v1/auth/refresh', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: t.refreshToken }),
      });
      if (!res.ok) { setTokens(null); return false; }
      setTokens((await res.json()) as Tokens);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => { refreshing = null; }, 0);
    }
  })();
  return refreshing;
}

type Opts = { method?: string; body?: unknown; form?: FormData; auth?: boolean; token?: string };

async function raw(path: string, o: Opts): Promise<Response> {
  const headers: Record<string, string> = {};
  const token = o.token ?? (o.auth === false ? undefined : getTokens()?.accessToken);
  if (token) headers.authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (o.form) body = o.form;
  else if (o.body !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(o.body); }
  return fetch(`/api/v1${path}`, { method: o.method ?? (body ? 'POST' : 'GET'), headers, body, cache: 'no-store' });
}

/** طلب إلى الـ API. يرمي ApiError برسالة عربية جاهزة للعرض. */
export async function api<T = unknown>(path: string, o: Opts = {}): Promise<T> {
  let res: Response;
  try {
    res = await raw(path, o);
    if (res.status === 401 && !o.token && o.auth !== false && getTokens() && (await refresh())) res = await raw(path, o);
  } catch {
    throw new ApiError(0, 'NETWORK', 'تعذّر الاتصال. تحقق من الإنترنت وحاول مرة أخرى.');
  }
  if (!res.ok) {
    let msg = 'حدث خطأ غير متوقع. حاول بعد قليل.';
    let code = 'ERROR';
    try {
      const j = (await res.json()) as { message?: string | string[]; code?: string };
      if (j.message) msg = Array.isArray(j.message) ? j.message.join('، ') : j.message;
      if (j.code) code = j.code;
    } catch { /* ليس JSON */ }
    throw new ApiError(res.status, code, msg);
  }
  const type = res.headers.get('content-type') ?? '';
  return (type.includes('application/json') ? await res.json() : await res.text()) as T;
}

/** تحميل ملف محمي (مثل CSV) بالرمز ثم فتحه للتنزيل */
export async function download(path: string, filename: string) {
  let res = await raw(path, {});
  if (res.status === 401 && (await refresh())) res = await raw(path, {});
  if (!res.ok) throw new ApiError(res.status, 'DOWNLOAD', 'تعذّر تنزيل الملف.');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function uploadImage(file: File, purpose: 'content' | 'private') {
  const form = new FormData();
  form.append('purpose', purpose);
  form.append('file', file);
  return api<{ id: number; url: string | null }>('/uploads', { method: 'POST', form });
}

export async function logout() {
  const t = getTokens();
  setTokens(null);
  if (t) await fetch('/api/v1/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: t.refreshToken }) }).catch(() => undefined);
}

/** معرّف ثابت للجهاز لقياس ظهور الشرائح (لا يحمل أي معلومة شخصية) */
export function deviceId(): string {
  const make = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
  try {
    let id = localStorage.getItem('saha_device');
    if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) { id = make(); localStorage.setItem('saha_device', id); }
    return id;
  } catch {
    return (memoryDevice ??= make());
  }
}
let memoryDevice: string | undefined;

export interface Me {
  id: number; fullName: string; phone: string | null; email: string | null; status: string; mfa: boolean; totpEnabled: boolean;
  roles: { role: string; label: string; tournamentId?: number | null; teamId?: number | null; sponsorId?: number | null }[];
  permissions: string[];
}
