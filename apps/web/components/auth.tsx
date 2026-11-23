'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { hasPermission, type Permission, type PermissionScope, type Role } from '@saha/shared';
import { api, getTokens, logout, setTokens, type Me, type Tokens } from '@/lib/client';
import { Mark } from './mark';

// ───────────── الجلسة ─────────────

export interface Session {
  me: Me | null;
  loading: boolean;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
  /** هل يملك الصلاحية (في النطاق إن حُدد) — نفس دالة الخادم من @saha/shared */
  can: (p: Permission, scope?: PermissionScope) => boolean;
  /** هل يملكها في أي نطاق (لإظهار القسم) */
  canSome: (p: Permission) => boolean;
}

export function useSessionState(): Session {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    if (!getTokens()) { setMe(null); setLoading(false); return; }
    try { setMe(await api<Me>('/me')); } catch { setMe(null); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  const grants = (me?.roles ?? []).map((r) => ({ ...r, role: r.role as Role }));
  return {
    me, loading, reload,
    signOut: async () => { await logout(); setMe(null); },
    can: (p, scope = {}) => hasPermission(grants, p, scope, !!me?.mfa),
    canSome: (p) => !!me?.permissions.includes(p),
  };
}

export const SessionContext = createContext<Session | null>(null);
export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('SessionContext');
  return s;
}

// ───────────── عناصر النماذج ─────────────

export function ErrorText({ error }: { error: string }) {
  return error ? <p className="form-error" role="alert">{error}</p> : null;
}

// ───────────── الدخول برقم الهاتف (OTP) ─────────────

/** الحكام ومديرو البطولات ولجنة الانضباط والرعاة: رقم الهاتف ← رمز من 6 أرقام */
export function PhoneLogin({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<'phone' | 'code' | 'profile'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const request = () => run(async () => {
    const r = await api<{ expiresInSec: number; devHint?: boolean }>('/auth/otp/request', { auth: false, body: { phone } });
    setHint(r.devHint ? 'وضع التجربة: الرمز هو 000000 (قبل ربط مزوّد الرسائل).' : `أرسلنا رمزاً من 6 أرقام إلى رقمك، صالحاً ${Math.round(r.expiresInSec / 60)} دقائق.`);
    setStep('code');
  });

  const verify = (extra: Record<string, unknown> = {}) => run(async () => {
    const r = await api<{ status: string } & Partial<Tokens>>('/auth/otp/verify', { auth: false, body: { phone, code, ...extra } });
    if (r.status === 'profile_required') { setStep('profile'); return; }
    if (r.status === 'pending_guardian') throw new Error('حسابك بانتظار موافقة ولي أمرك، ولا يفتح اللوحة.');
    setTokens({ accessToken: r.accessToken!, refreshToken: r.refreshToken! });
    onDone();
  });

  if (step === 'phone') {
    return (
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void request(); }}>
        <label className="field"><span>رقم الهاتف</span><input value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" dir="ltr" placeholder="07XXXXXXXXX" autoComplete="tel" /></label>
        <ErrorText error={error} />
        <button className="btn btn-primary" disabled={busy}>{busy ? 'جارٍ الإرسال…' : 'أرسل الرمز'}</button>
      </form>
    );
  }
  if (step === 'code') {
    return (
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void verify(); }}>
        <p className="muted">{hint}</p>
        <label className="field"><span>الرمز</span><input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} required inputMode="numeric" dir="ltr" autoComplete="one-time-code" placeholder="000000" className="code-input" /></label>
        <ErrorText error={error} />
        <button className="btn btn-primary" disabled={busy || code.length !== 6}>{busy ? 'جارٍ التحقق…' : 'دخول'}</button>
        <button type="button" className="btn-link" onClick={() => { setStep('phone'); setCode(''); setError(''); }}>تغيير الرقم</button>
      </form>
    );
  }
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); void verify({ fullName: f.get('fullName'), birthYear: Number(f.get('birthYear')) }); }}>
      <p className="muted">رقم جديد: اكتب اسمك وسنة ميلادك لإنشاء الحساب.</p>
      <label className="field"><span>الاسم الكامل</span><input name="fullName" required minLength={2} maxLength={60} autoComplete="name" /></label>
      <label className="field"><span>سنة الميلاد</span><input name="birthYear" required inputMode="numeric" dir="ltr" pattern="\d{4}" placeholder="1995" /></label>
      <ErrorText error={error} />
      <button className="btn btn-primary" disabled={busy}>إنشاء الحساب والدخول</button>
    </form>
  );
}

// ───────────── دخول الإدارة: بريد + كلمة سر + TOTP ─────────────

/** المدير العام ومحرر المحتوى ومدير الرعاة: صلاحياتهم لا تعمل إلا بهذا الدخول */
export function AdminLogin({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<'login' | 'totp' | 'setup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const done = (r: Partial<Tokens>) => { setTokens({ accessToken: r.accessToken!, refreshToken: r.refreshToken! }); onDone(); };

  const login = () => run(async () => {
    try {
      const r = await api<{ status: string; setupToken?: string } & Partial<Tokens>>('/auth/admin/login', { auth: false, body: { email, password, ...(totp ? { totp } : {}) } });
      if (r.status === 'totp_setup_required') {
        setSetupToken(r.setupToken!);
        setSetup(await api<{ secret: string; otpauthUri: string }>('/auth/admin/totp/setup', { method: 'POST', token: r.setupToken! }));
        setStep('setup'); setTotp('');
        return;
      }
      done(r);
    } catch (e) {
      if ((e as { code?: string }).code === 'TOTP_REQUIRED') { setStep('totp'); return; }
      throw e;
    }
  });

  const enable = () => run(async () => done(await api<Partial<Tokens>>('/auth/admin/totp/enable', { token: setupToken, body: { code: totp } })));

  if (step === 'setup' && setup) {
    return (
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void enable(); }}>
        <p>أول دخول: فعّل التحقق الثنائي بتطبيق المصادقة (Google Authenticator أو مثله).</p>
        <ol className="steps">
          <li>اضغط الزر التالي من جوالك ليُضاف الحساب للتطبيق مباشرة، أو انسخ المفتاح وأضفه يدوياً.<br />
            <a className="btn btn-gold" href={setup.otpauthUri}>أضف إلى تطبيق المصادقة</a></li>
          <li>المفتاح: <code className="secret" dir="ltr">{setup.secret}</code></li>
          <li>اكتب الرمز المكوّن من 6 أرقام الذي يظهر في التطبيق.</li>
        </ol>
        <label className="field"><span>رمز التحقق</span><input value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" dir="ltr" autoComplete="one-time-code" className="code-input" required /></label>
        <ErrorText error={error} />
        <button className="btn btn-primary" disabled={busy || totp.length !== 6}>تفعيل والدخول</button>
      </form>
    );
  }
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); void login(); }}>
      <label className="field"><span>البريد</span><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required dir="ltr" autoComplete="username" /></label>
      <label className="field"><span>كلمة السر</span><input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required dir="ltr" autoComplete="current-password" /></label>
      {step === 'totp' && (
        <label className="field"><span>رمز التحقق من تطبيق المصادقة</span><input value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" dir="ltr" autoComplete="one-time-code" className="code-input" autoFocus required /></label>
      )}
      <ErrorText error={error} />
      <button className="btn btn-primary" disabled={busy}>{busy ? 'جارٍ الدخول…' : 'دخول'}</button>
    </form>
  );
}

/** بطاقة الدخول — بطاقة بيضاء بالشعار، بتبويبين اختياريين */
export function LoginCard({ title, text, modes, onDone }: { title: string; text: string; modes: ('admin' | 'phone')[]; onDone: () => void }) {
  const [mode, setMode] = useState(modes[0]);
  return (
    <section className="wrap sec last">
      <div className="card login-card">
        <span className="appicon sm"><Mark size={52} style={{ color: '#fff' }} /></span>
        <h1>{title}</h1>
        <p className="muted">{text}</p>
        {modes.length > 1 && (
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'admin'} onClick={() => setMode('admin')}>بريد الإدارة</button>
            <button type="button" role="tab" aria-selected={mode === 'phone'} onClick={() => setMode('phone')}>رقم الهاتف</button>
          </div>
        )}
        {mode === 'admin' ? <AdminLogin onDone={onDone} /> : <PhoneLogin onDone={onDone} />}
      </div>
    </section>
  );
}
