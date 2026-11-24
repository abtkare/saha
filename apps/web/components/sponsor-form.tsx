'use client';
import { useState } from 'react';
import { api } from '@/lib/client';

/** نموذج «كن راعياً» — يرسل إلى POST /sponsor-leads */
export function SponsorForm() {
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState('sending'); setError('');
    try {
      const r = await api<{ message: string }>('/sponsor-leads', {
        auth: false,
        body: { fullName: f.get('fullName'), orgName: f.get('orgName') || undefined, phone: f.get('phone'), message: f.get('message') || undefined },
      });
      setMsg(r.message); setState('done');
    } catch (err) {
      setError((err as Error).message); setState('idle');
    }
  }

  if (state === 'done') {
    return <div className="card form-card done" role="status"><h3>وصل طلبك ✓</h3><p>{msg}</p></div>;
  }
  return (
    <form className="card form-card" onSubmit={submit}>
      <h3>اطلب التواصل</h3>
      <label className="field"><span>الاسم</span><input name="fullName" required minLength={2} maxLength={80} autoComplete="name" /></label>
      <label className="field"><span>الجهة أو الشركة <i>(اختياري)</i></span><input name="orgName" maxLength={120} autoComplete="organization" /></label>
      <label className="field"><span>رقم الهاتف</span><input name="phone" required inputMode="tel" dir="ltr" placeholder="07XXXXXXXXX" maxLength={20} autoComplete="tel" /></label>
      <label className="field"><span>ماذا تريد أن ترعى؟ <i>(اختياري)</i></span><textarea name="message" rows={4} maxLength={1000} placeholder="بطولة معيّنة، شرائح في التطبيق، مدينة…" /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn btn-primary" disabled={state === 'sending'}>{state === 'sending' ? 'جارٍ الإرسال…' : 'أرسل الطلب'}</button>
    </form>
  );
}
