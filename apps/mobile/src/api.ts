/**
 * عميل الـ API في التطبيق — نفس منطق apps/web/lib/client.ts: رمز وصول قصير + رمز تجديد يُدوَّر،
 * والتجديد مرة واحدة تلقائياً عند 401. الرموز في SecureStore.
 */
import { API_URL } from './config';
import { store } from './storage';

export interface Tokens { accessToken: string; refreshToken: string }

let memory: Tokens | null = null;
let loaded = false;
const listeners = new Set<(t: Tokens | null) => void>();

export async function getTokens(): Promise<Tokens | null> {
  if (loaded) return memory;
  const raw = await store.get('auth');
  try { memory = raw ? (JSON.parse(raw) as Tokens) : null; } catch { memory = null; }
  loaded = true;
  return memory;
}

export async function setTokens(t: Tokens | null) {
  memory = t ? { accessToken: t.accessToken, refreshToken: t.refreshToken } : null;
  loaded = true;
  await store.set('auth', memory ? JSON.stringify(memory) : null);
  listeners.forEach((l) => l(memory));
}

export function onTokens(l: (t: Tokens | null) => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  const t = await getTokens();
  if (!t) return false;
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: t.refreshToken }) });
      if (!res.ok) {
        if (res.status === 401 || res.status === 400) await setTokens(null);
        return false;
      }
      await setTokens((await res.json()) as Tokens);
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
  const headers: Record<string, string> = { accept: 'application/json' };
  const token = o.token ?? (o.auth === false ? undefined : (await getTokens())?.accessToken);
  if (token) headers.authorization = `Bearer ${token}`;
  let body: FormData | string | undefined;
  if (o.form) body = o.form;
  else if (o.body !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(o.body); }
  return fetch(`${API_URL}${path}`, { method: o.method ?? (body ? 'POST' : 'GET'), headers, body });
}

/** طلب إلى الـ API. يرمي ApiError برسالة عربية جاهزة للعرض. */
export async function api<T = unknown>(path: string, o: Opts = {}): Promise<T> {
  let res: Response;
  try {
    res = await raw(path, o);
    if (res.status === 401 && !o.token && o.auth !== false && (await getTokens()) && (await refresh())) res = await raw(path, o);
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

/** رفع صورة من الكاميرا أو المعرض (صورة ورقة المباراة) */
export async function uploadImage(uri: string, purpose: 'private' | 'content' = 'private') {
  const form = new FormData();
  form.append('purpose', purpose);
  const name = uri.split('/').pop() || 'sheet.jpg';
  const type = /\.png$/i.test(name) ? 'image/png' : 'image/jpeg';
  form.append('file', { uri, name, type } as unknown as Blob);
  return api<{ id: number; url: string | null }>('/uploads', { method: 'POST', form });
}

export async function logoutTokens() {
  const t = await getTokens();
  await setTokens(null);
  if (t) await fetch(`${API_URL}/auth/logout`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: t.refreshToken }) }).catch(() => undefined);
}

/** معرّف ثابت للجهاز لقياس ظهور الشرائح (لا يحمل معلومة شخصية) */
let device: string | null = null;
export async function deviceId(): Promise<string> {
  if (device) return device;
  let id = await store.get('device');
  if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
    id = Array.from({ length: 24 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
    await store.set('device', id);
  }
  device = id;
  return id;
}
