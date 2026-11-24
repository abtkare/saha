'use client';
import { useSession } from '@/components/auth';
import { Field, Note, PageHead, useAction } from '@/components/admin/kit';
import { api } from '@/lib/client';

export default function Account() {
  const s = useSession();
  const act = useAction();
  const me = s.me!;
  return (
    <>
      <PageHead title="حسابي" />
      <div className="card form-card">
        <p><b>{me.fullName}</b> <span className="muted" dir="ltr">{me.email ?? me.phone}</span></p>
        <p className="muted">الأدوار: {me.roles.map((r) => r.label).join('، ') || 'لا يوجد'} · الدخول: {me.mfa ? 'بريد + رمز تحقق' : 'رقم الهاتف'}</p>
        <button type="button" className="btn" onClick={() => void s.signOut()}>تسجيل الخروج</button>
      </div>
      {me.mfa && (
        <form className="card form-card" onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (f.get('newPassword') !== f.get('again')) { window.alert('كلمتا السر الجديدتان غير متطابقتين.'); return; }
          void act.run(() => api('/auth/admin/password', { body: { currentPassword: f.get('currentPassword'), newPassword: f.get('newPassword') } }), 'تغيّرت كلمة السر، وأُلغيت الجلسات الأخرى.');
        }}>
          <h3>تغيير كلمة السر</h3>
          <Field label="كلمة السر الحالية"><input name="currentPassword" type="password" required autoComplete="current-password" dir="ltr" /></Field>
          <Field label="الجديدة" hint="12 حرفاً على الأقل"><input name="newPassword" type="password" required minLength={12} autoComplete="new-password" dir="ltr" /></Field>
          <Field label="أعد كتابتها"><input name="again" type="password" required minLength={12} autoComplete="new-password" dir="ltr" /></Field>
          <Note note={act.note} />
          <button className="btn btn-primary" disabled={act.busy}>تغيير</button>
        </form>
      )}
    </>
  );
}
