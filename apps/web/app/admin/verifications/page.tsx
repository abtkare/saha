'use client';
import { useState } from 'react';
import { ConfirmButton, FilterTabs, Loading, Note, PageHead, useAction, useLoad, when } from '@/components/admin/kit';
import { api } from '@/lib/client';

interface Req {
  id: number; code: string; postUrl: string | null; status: string; note: string | null; createdAt: string; reviewedAt: string | null;
  team: { id: number; nameAr: string; fbPageUrl: string | null; manager: { id: number; fullName: string; phone: string | null } | null };
}

/** التوثيق اليدوي: مدير الفريق ينشر الرمز على صفحة فيسبوك، والإدارة تتحقق وتعتمد */
export default function Verifications() {
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const list = useLoad<Req[]>(`/admin/verifications?status=${status}`);
  const act = useAction();
  const decide = (id: number, approve: boolean, note?: string) => act.run(async () => { await api(`/admin/verifications/${id}/decide`, { body: { approve, note } }); await list.reload(); }, approve ? 'وُثّق الفريق.' : 'رُفض الطلب.');
  return (
    <>
      <PageHead title="توثيق الفرق" text="افتح منشور الفريق وتأكد أن الرمز منشور على صفحته الرسمية في فيسبوك، ثم اعتمد." />
      <FilterTabs label="الحالة" value={status} onChange={setStatus} options={[['pending', 'بانتظار المراجعة'], ['approved', 'الموثّقة'], ['rejected', 'المرفوضة']]} />
      <Note note={act.note} />
      <Loading error={list.error} loading={list.loading} />
      {list.data?.length === 0 && <div className="card empty-card">لا طلبات هنا.</div>}
      <div className="grid g300">
        {list.data?.map((r) => (
          <article key={r.id} className="card form-card">
            <h3><a href={`/teams/${r.team.id}`} target="_blank" rel="noopener">{r.team.nameAr}</a></h3>
            <p className="muted">المدير: {r.team.manager?.fullName ?? '—'} <span dir="ltr">{r.team.manager?.phone}</span> · {when(r.createdAt)}</p>
            <p>الرمز المطلوب: <code className="secret" dir="ltr">{r.code}</code></p>
            <div className="row">
              {r.team.fbPageUrl && <a className="btn btn-sm" href={r.team.fbPageUrl} target="_blank" rel="noopener noreferrer">صفحة الفريق</a>}
              {r.postUrl && <a className="btn btn-sm" href={r.postUrl} target="_blank" rel="noopener noreferrer">المنشور</a>}
            </div>
            {r.status === 'pending' ? (
              <div className="row">
                <ConfirmButton className="btn btn-sm btn-primary" disabled={act.busy} confirm="هل تأكدت من وجود الرمز على الصفحة الرسمية؟" onClick={() => void decide(r.id, true)}>توثيق</ConfirmButton>
                <button type="button" className="btn btn-sm btn-danger" disabled={act.busy} onClick={() => { const n = window.prompt('سبب الرفض (يظهر لمدير الفريق):'); if (n !== null) void decide(r.id, false, n || undefined); }}>رفض</button>
              </div>
            ) : <p className="muted">{r.note ?? ''} {when(r.reviewedAt)}</p>}
          </article>
        ))}
      </div>
    </>
  );
}
