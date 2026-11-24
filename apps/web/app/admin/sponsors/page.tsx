'use client';
import { useState } from 'react';
import { SPONSOR_LEAD_STATUSES, SPONSOR_LEAD_STATUS_LABELS, type SponsorLeadStatus } from '@saha/shared';
import { Field, FilterTabs, Loading, Note, PageHead, text, useAction, useLoad, when } from '@/components/admin/kit';
import { api, uploadImage } from '@/lib/client';

interface Sponsor { id: number; nameAr: string; logoUrl: string | null; website: string | null; contactName: string | null; contactPhone: string | null; createdAt: string }
interface Lead { id: number; fullName: string; orgName: string | null; phone: string; message: string | null; status: SponsorLeadStatus; createdAt: string; handledBy: { fullName: string } | null }

/** الرعاة وطلبات «كن راعياً» وتقاريرهم */
export default function Sponsors() {
  const list = useLoad<Sponsor[]>('/admin/sponsors');
  const [leadStatus, setLeadStatus] = useState<SponsorLeadStatus>('new');
  const leads = useLoad<Lead[]>(`/admin/sponsor-leads?status=${leadStatus}`);
  const act = useAction();
  const [edit, setEdit] = useState<Sponsor | 'new' | null>(null);
  const cur = edit === 'new' ? null : edit;

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const ok = await act.run(async () => {
      const file = f.get('logo') as File | null;
      const img = file && file.size > 0 ? await uploadImage(file, 'content') : null;
      const body: Record<string, unknown> = {
        nameAr: text(f.get('nameAr')), website: text(f.get('website')) ?? null, contactName: text(f.get('contactName')) ?? null, contactPhone: text(f.get('contactPhone')) ?? null,
        ...(img ? { logoMediaId: img.id } : {}),
      };
      if (cur) await api(`/admin/sponsors/${cur.id}`, { method: 'PATCH', body });
      else { for (const k of Object.keys(body)) if (body[k] === null) delete body[k]; await api('/admin/sponsors', { body }); }
      await list.reload();
    }, 'حُفظ الراعي.');
    if (ok) setEdit(null);
  }

  return (
    <>
      <PageHead title="الرعاة" text="لمنح راعٍ دخول بوابته: من «المستخدمون والأدوار» امنح رقمه دور «راعٍ» مقيّداً بهذا الراعي.">
        <button type="button" className="btn btn-primary" onClick={() => setEdit(edit ? null : 'new')}>{edit ? 'إغلاق' : 'راعٍ جديد'}</button>
      </PageHead>
      <Note note={act.note} />
      {edit && (
        <form key={cur?.id ?? 'new'} className="card form-card grid-form" onSubmit={save}>
          <Field label="اسم الراعي" wide><input name="nameAr" required minLength={2} maxLength={80} defaultValue={cur?.nameAr} /></Field>
          <Field label="الموقع" hint="يبدأ بـ https://"><input name="website" dir="ltr" defaultValue={cur?.website ?? ''} /></Field>
          <Field label="اسم المسؤول"><input name="contactName" maxLength={80} defaultValue={cur?.contactName ?? ''} /></Field>
          <Field label="هاتف المسؤول"><input name="contactPhone" dir="ltr" inputMode="tel" defaultValue={cur?.contactPhone ?? ''} /></Field>
          <Field label="الشعار"><input name="logo" type="file" accept="image/jpeg,image/png,image/webp" /></Field>
          <div className="row wide"><button className="btn btn-primary" disabled={act.busy}>حفظ</button></div>
        </form>
      )}
      <Loading error={list.error} loading={list.loading} />
      <div className="card flush scroll-x">
        <table className="table admin-table">
          <thead><tr><th>#</th><th>الراعي</th><th>المسؤول</th><th>الهاتف</th><th>إجراء</th></tr></thead>
          <tbody>
            {list.data?.length === 0 && <tr><td colSpan={5} className="muted">لا رعاة بعد.</td></tr>}
            {list.data?.map((x) => (
              <tr key={x.id}>
                <td className="num">{x.id}</td>
                <td>{x.nameAr}</td>
                <td>{x.contactName ?? '—'}</td>
                <td dir="ltr">{x.contactPhone ?? '—'}</td>
                <td className="row"><button type="button" className="btn btn-sm" onClick={() => setEdit(x)}>تعديل</button><a className="btn btn-sm btn-primary" href={`/sponsor/portal?sponsorId=${x.id}`}>التقرير</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="admin-h2">طلبات «كن راعياً»</h2>
      <FilterTabs label="حالة الطلب" value={leadStatus} onChange={setLeadStatus} options={SPONSOR_LEAD_STATUSES.map((x) => [x, SPONSOR_LEAD_STATUS_LABELS[x]] as [SponsorLeadStatus, string])} />
      <Loading error={leads.error} loading={leads.loading} />
      {leads.data?.length === 0 && <div className="card empty-card">لا طلبات هنا.</div>}
      <div className="grid g300">
        {leads.data?.map((l) => (
          <article key={l.id} className="card form-card">
            <div className="between"><b>{l.fullName}</b><span className="muted">{when(l.createdAt)}</span></div>
            {l.orgName && <span>{l.orgName}</span>}
            <a href={`tel:${l.phone}`} dir="ltr" className="phone">{l.phone}</a>
            {l.message && <blockquote className="quote">{l.message}</blockquote>}
            {l.handledBy && <span className="muted">تابعه: {l.handledBy.fullName}</span>}
            <div className="row">
              {SPONSOR_LEAD_STATUSES.filter((x) => x !== l.status).map((x) => (
                <button key={x} type="button" className="btn btn-sm" disabled={act.busy} onClick={() => void act.run(async () => { await api(`/admin/sponsor-leads/${l.id}`, { method: 'PATCH', body: { status: x } }); await leads.reload(); }, 'تغيّرت الحالة.')}>
                  {SPONSOR_LEAD_STATUS_LABELS[x]}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
