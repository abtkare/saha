'use client';
import { useState } from 'react';
import { CONTENT_STATUS_LABELS, POST_TYPE_LABELS, type ContentStatus, type PostType } from '@saha/shared';
import { useSession } from '@/components/auth';
import { ConfirmButton, ContentBadge, Field, FilterTabs, Loading, Note, PageHead, text, useAction, useLoad, when } from '@/components/admin/kit';
import { api, uploadImage } from '@/lib/client';

interface Row { id: number; type: PostType; slug: string; titleAr: string; status: ContentStatus; publishedAt: string | null; updatedAt: string; reviewNote: string | null }
interface Full extends Row { bodyAr: string; coverUrl: string | null }

/** الأخبار والصفحات الثابتة (الشروط، الخصوصية، تواصل معنا) — نص عادي، الفقرات بسطر فارغ */
export default function Posts() {
  const s = useSession();
  const [type, setType] = useState<PostType>('news');
  const [status, setStatus] = useState<ContentStatus | 'all'>('all');
  const list = useLoad<Row[]>(`/admin/posts?type=${type}${status === 'all' ? '' : `&status=${status}`}`);
  const act = useAction();
  const [edit, setEdit] = useState<Full | 'new' | null>(null);
  const canPublish = s.can('content.publish');
  const canDraft = s.can('content.draft');

  const go = (path: string, msg: string, body: unknown = {}) => act.run(async () => { await api(path, { body }); await list.reload(); }, msg);
  const open = (id: number) => act.run(async () => setEdit(await api<Full>(`/admin/posts/${id}`)));

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const cur = edit === 'new' ? null : edit;
    const ok = await act.run(async () => {
      const file = f.get('cover') as File | null;
      const img = file && file.size > 0 ? await uploadImage(file, 'content') : null;
      const body: Record<string, unknown> = { titleAr: text(f.get('titleAr')), bodyAr: String(f.get('bodyAr') ?? '').trim() };
      const slug = text(f.get('slug'));
      if (slug && slug !== cur?.slug) body.slug = slug;
      if (img) body.coverMediaId = img.id;
      else if (f.get('removeCover') === 'on') body.coverMediaId = null;
      if (cur) {
        if (body.titleAr === cur.titleAr) delete body.titleAr;
        if (body.bodyAr === cur.bodyAr) delete body.bodyAr;
        if (!Object.keys(body).length) return;
        await api(`/admin/posts/${cur.id}`, { method: 'PATCH', body });
      } else await api('/admin/posts', { body: { type, ...body } });
      await list.reload();
    }, 'حُفظ.');
    if (ok) setEdit(null);
  }

  const cur = edit === 'new' ? null : edit;
  return (
    <>
      <PageHead title="الأخبار والصفحات" text="الصفحات الثابتة بروابطها المختصرة: terms للشروط، privacy للخصوصية، contact لتواصل معنا.">
        {canDraft && <button type="button" className="btn btn-primary" onClick={() => setEdit(edit ? null : 'new')}>{edit ? 'إغلاق' : type === 'news' ? 'خبر جديد' : 'صفحة جديدة'}</button>}
      </PageHead>
      <FilterTabs label="النوع" value={type} onChange={(v) => { setType(v); setEdit(null); }} options={[['news', 'الأخبار'], ['page', 'الصفحات']]} />
      <Note note={act.note} />
      {edit && (
        <form key={cur?.id ?? 'new'} className="card form-card grid-form" onSubmit={save}>
          <h3 className="wide">{cur ? `تعديل: ${cur.titleAr}` : `${POST_TYPE_LABELS[type]} جديد`}</h3>
          {cur?.status === 'published' && <p className="muted wide">المحتوى منشور: التعديل يظهر فوراً ويُسجَّل في سجل التدقيق.</p>}
          {cur?.reviewNote && <p className="form-error wide">سبب الإرجاع: {cur.reviewNote}</p>}
          <Field label="العنوان" wide><input name="titleAr" required minLength={3} maxLength={140} defaultValue={cur?.titleAr} /></Field>
          <Field label="الرابط المختصر" hint={cur?.publishedAt ? 'لا يتغير بعد النشر' : 'إنجليزي صغير وشرطات، اختياري'}><input name="slug" dir="ltr" pattern="[a-z0-9]+(-[a-z0-9]+)*" defaultValue={cur?.slug ?? ''} disabled={!!cur?.publishedAt} /></Field>
          <Field label="صورة الغلاف"><input name="cover" type="file" accept="image/jpeg,image/png,image/webp" /></Field>
          {cur?.coverUrl && <label className="check"><input type="checkbox" name="removeCover" /> إزالة الغلاف</label>}
          <Field label="النص" hint="نص عادي؛ افصل الفقرات بسطر فارغ" wide><textarea name="bodyAr" required rows={12} maxLength={20000} defaultValue={cur?.bodyAr ?? ''} /></Field>
          <div className="row wide"><button className="btn btn-primary" disabled={act.busy}>حفظ</button></div>
        </form>
      )}
      <FilterTabs label="الحالة" value={status} onChange={setStatus} options={[['all', 'الكل'], ['review', CONTENT_STATUS_LABELS.review], ['published', CONTENT_STATUS_LABELS.published], ['draft', CONTENT_STATUS_LABELS.draft], ['archived', CONTENT_STATUS_LABELS.archived]]} />
      <Loading error={list.error} loading={list.loading} />
      <div className="card flush scroll-x">
        <table className="table admin-table">
          <thead><tr><th>العنوان</th><th>الرابط</th><th>الحالة</th><th>آخر تعديل</th><th>إجراء</th></tr></thead>
          <tbody>
            {list.data?.length === 0 && <tr><td colSpan={5} className="muted">لا شيء هنا.</td></tr>}
            {list.data?.map((p) => (
              <tr key={p.id}>
                <td>{p.titleAr}{p.reviewNote && <div className="form-error">أُرجع: {p.reviewNote}</div>}</td>
                <td dir="ltr">{p.status === 'published' ? <a href={p.type === 'news' ? `/news/${p.slug}` : `/${p.slug}`} target="_blank" rel="noopener">{p.slug}</a> : p.slug}</td>
                <td><ContentBadge status={p.status} /></td>
                <td>{when(p.updatedAt)}</td>
                <td className="row">
                  {p.status !== 'archived' && (p.status === 'published' ? canPublish : canDraft) && <button type="button" className="btn btn-sm" onClick={() => void open(p.id)}>تعديل</button>}
                  {p.status === 'draft' && canDraft && <button type="button" className="btn btn-sm btn-primary" disabled={act.busy} onClick={() => void go(`/admin/posts/${p.id}/submit`, 'أُرسل للمراجعة.')}>للمراجعة</button>}
                  {p.status === 'review' && canPublish && <>
                    <button type="button" className="btn btn-sm btn-primary" disabled={act.busy} onClick={() => void go(`/admin/posts/${p.id}/publish`, 'نُشر.')}>نشر</button>
                    <button type="button" className="btn btn-sm" disabled={act.busy} onClick={() => { const n = window.prompt('سبب الإرجاع:'); if (n) void go(`/admin/posts/${p.id}/reject`, 'أُرجع مسودة.', { note: n }); }}>إرجاع</button>
                  </>}
                  {p.status === 'published' && canPublish && <ConfirmButton className="btn btn-sm btn-danger" disabled={act.busy} confirm="أرشفة المحتوى؟ يختفي من الموقع." onClick={() => void go(`/admin/posts/${p.id}/archive`, 'أُرشف.')}>أرشفة</ConfirmButton>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
