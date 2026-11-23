'use client';
import { useState } from 'react';
import { Loading, PageHead, useAction, useLoad, when } from '@/components/admin/kit';
import { api } from '@/lib/client';

interface Entry { id: number; seq: number; actorUserId: number | null; action: string; entity: string; entityId: string | null; payload: unknown; ip: string | null; occurredAt: string; hash: string }
interface Verify { ok: boolean; checked: number; brokenSeq: number | null; reason: string | null }

/** سجل التدقيق — بصمات SHA-256 متسلسلة، وزر «تحقق من السلسلة» */
export default function Audit() {
  const [limit, setLimit] = useState(50);
  const list = useLoad<Entry[]>(`/admin/audit?limit=${limit}`);
  const act = useAction();
  const [res, setRes] = useState<Verify | null>(null);
  return (
    <>
      <PageHead title="سجل التدقيق" text="كل تغيير في المنصة يُكتب هنا ولا يُعدَّل ولا يُحذف. التحقق يعيد حساب البصمات ويكشف أي تلاعب.">
        <button type="button" className="btn btn-primary" disabled={act.busy} onClick={() => void act.run(async () => { setRes(await api<Verify>('/admin/audit/verify')); await list.reload(); })}>{act.busy ? 'جارٍ التحقق…' : 'تحقق من السلسلة'}</button>
      </PageHead>
      {act.note && !act.note.ok && <p className="form-error">{act.note.text}</p>}
      {res && (
        <div className={`card verify ${res.ok ? 'ok' : 'bad'}`} role="status">
          <b>{res.ok ? 'السلسلة سليمة ✓' : 'تحذير: السلسلة فيها خلل'}</b>
          <span>فُحص <span className="num">{res.checked}</span> سجلاً{res.brokenSeq !== null && <> · أول خلل عند السجل <span className="num">{res.brokenSeq}</span></>}{res.reason && <> · {res.reason}</>}</span>
        </div>
      )}
      <Loading error={list.error} loading={list.loading} />
      <div className="card flush scroll-x">
        <table className="table admin-table">
          <thead><tr><th>#</th><th>الإجراء</th><th>العنصر</th><th>المستخدم</th><th>الوقت</th><th>البصمة</th></tr></thead>
          <tbody>
            {list.data?.map((e) => (
              <tr key={e.seq}>
                <td className="num">{e.seq}</td>
                <td dir="ltr" title={JSON.stringify(e.payload)}>{e.action}</td>
                <td dir="ltr">{e.entity}{e.entityId ? `#${e.entityId}` : ''}</td>
                <td className="num">{e.actorUserId ?? '—'}</td>
                <td>{when(e.occurredAt)}</td>
                <td dir="ltr"><code>{e.hash?.slice(0, 12)}…</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.data && list.data.length >= limit && limit < 200 && <button type="button" className="btn" onClick={() => setLimit(200)}>عرض 200 سجل</button>}
    </>
  );
}
