'use client';
import { useState } from 'react';
import { CONTENT_STATUS_LABELS, PAID_SLIDE_TYPES, SLIDE_TYPES, SLIDE_TYPE_LABELS, type ContentStatus, type SlideType } from '@saha/shared';
import { useSession } from '@/components/auth';
import { ConfirmButton, ContentBadge, Field, FilterTabs, Loading, Note, PageHead, isoToLocal, localToIso, num, text, useAction, useLoad, when } from '@/components/admin/kit';
import { api, uploadImage } from '@/lib/client';

interface Slide {
  id: number; type: SlideType; titleAr: string; subtitleAr: string | null; imageUrl: string | null; linkUrl: string | null;
  sponsorId: number | null; tournamentId: number | null; matchId: number | null; status: ContentStatus; priority: number;
  startsAt: string | null; endsAt: string | null; reviewNote: string | null; approvedAt: string | null;
  approvedBy: { id: number; fullName: string } | null; createdBy: { id: number; fullName: string } | null; updatedBy: { id: number; fullName: string } | null;
  sponsor: { id: number; nameAr: string } | null; updatedAt: string;
}

type Filter = ContentStatus | 'all';

/** الهيرو سلايدر: مسودة ← قيد المراجعة ← منشورة ← مؤرشفة. شريحة الراعي يعتمدها شخص غير كاتبها. */
export default function Slides() {
  const s = useSession();
  const [filter, setFilter] = useState<Filter>('all');
  const list = useLoad<Slide[]>(`/admin/slides${filter === 'all' ? '' : `?status=${filter}`}`);
  const sponsors = useLoad<{ id: number; nameAr: string }[]>('/admin/sponsors');
  const act = useAction();
  const [edit, setEdit] = useState<Slide | 'new' | null>(null);
  const [type, setType] = useState<SlideType>('promo');
  const canPublish = s.can('content.publish');
  // المدير العام يعتمد شريحة الراعي التي كتبها بنفسه
  const superAdmin = !!s.me?.mfa && !!s.me?.roles?.some((r) => r.role === 'super_admin');
  const onlySponsor = !s.can('content.draft') && s.can('slides.sponsor');
  const types = onlySponsor ? (['sponsor'] as SlideType[]) : [...SLIDE_TYPES];

  const go = (path: string, msg: string, body: unknown = {}) => act.run(async () => { await api(path, { body }); await list.reload(); }, msg);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const cur = edit === 'new' ? null : edit;
    const t = cur?.type ?? type;
    const ok = await act.run(async () => {
      const file = f.get('image') as File | null;
      const img = file && file.size > 0 ? await uploadImage(file, 'content') : null;
      const v: Record<string, unknown> = {
        titleAr: text(f.get('titleAr')), subtitleAr: text(f.get('subtitleAr')) ?? null, linkUrl: text(f.get('linkUrl')) ?? null,
        priority: num(f.get('priority')) ?? 0, startsAt: localToIso(String(f.get('startsAt') ?? '')), endsAt: localToIso(String(f.get('endsAt') ?? '')),
        sponsorId: t === 'sponsor' ? num(f.get('sponsorId')) ?? null : null,
        matchId: t === 'match' ? num(f.get('matchId')) ?? null : null,
        tournamentId: num(f.get('tournamentId')) ?? null,
      };
      if (img) v.imageMediaId = img.id;
      else if (f.get('removeImage') === 'on') v.imageMediaId = null;
      if (!cur) {
        for (const k of Object.keys(v)) if (v[k] === null) delete v[k];
        await api('/admin/slides', { body: { type: t, ...v } });
      } else {
        // نرسل ما تغيّر فقط: تعديل المحتوى يسحب الاعتماد، والأولوية وحدها لا تسحبه
        const before: Record<string, unknown> = {
          titleAr: cur.titleAr, subtitleAr: cur.subtitleAr, linkUrl: cur.linkUrl, priority: cur.priority, startsAt: cur.startsAt ? localToIso(isoToLocal(cur.startsAt)) : null,
          endsAt: cur.endsAt ? localToIso(isoToLocal(cur.endsAt)) : null, sponsorId: cur.sponsorId, matchId: cur.matchId, tournamentId: cur.tournamentId,
        };
        const diff = Object.fromEntries(Object.entries(v).filter(([k, x]) => k === 'imageMediaId' || x !== before[k]));
        if (!Object.keys(diff).length) return;
        if (cur.status === 'published' && Object.keys(diff).some((k) => k !== 'priority') && !window.confirm('تعديل محتوى شريحة منشورة يسحب اعتمادها فتختفي حتى تُعتمد من جديد. متابعة؟')) return;
        await api(`/admin/slides/${cur.id}`, { method: 'PATCH', body: diff });
      }
      await list.reload();
    }, 'حُفظت الشريحة.');
    if (ok) setEdit(null);
  }

  const cur = edit === 'new' ? null : edit;
  const t = cur?.type ?? type;
  return (
    <>
      <PageHead title="الهيرو سلايدر" text="حتى 8 شرائح حيّة، الأعلى أولوية أولاً. شريحة «مباراة اليوم» تعرض النتيجة المباشرة وتتحدث كل 30 ثانية.">
        <button type="button" className="btn btn-primary" onClick={() => { setEdit(edit ? null : 'new'); setType(types[0]); }}>{edit ? 'إغلاق' : 'شريحة جديدة'}</button>
      </PageHead>
      <Note note={act.note} />
      {edit && (
        <form key={cur?.id ?? 'new'} className="card form-card grid-form" onSubmit={save}>
          <h3 className="wide">{cur ? `تعديل: ${cur.titleAr}` : 'شريحة جديدة'}</h3>
          {cur?.reviewNote && <p className="form-error wide">سبب الإرجاع: {cur.reviewNote}</p>}
          <Field label="النوع">
            <select value={t} disabled={!!cur} onChange={(e) => setType(e.target.value as SlideType)}>
              {types.map((x) => <option key={x} value={x}>{SLIDE_TYPE_LABELS[x]}</option>)}
            </select>
          </Field>
          <Field label="العنوان" wide><input name="titleAr" required minLength={2} maxLength={80} defaultValue={cur?.titleAr} /></Field>
          <Field label="النص الفرعي" wide><input name="subtitleAr" maxLength={140} defaultValue={cur?.subtitleAr ?? ''} /></Field>
          {t === 'sponsor' && (
            <Field label="الراعي"><select name="sponsorId" required defaultValue={cur?.sponsorId ?? ''}>
              <option value="">— اختر —</option>{sponsors.data?.map((x) => <option key={x.id} value={x.id}>{x.nameAr}</option>)}
            </select></Field>
          )}
          {t === 'match' && <Field label="رقم المباراة" hint="من رابط صفحة المباراة /matches/رقم"><input name="matchId" type="number" min={1} required defaultValue={cur?.matchId ?? ''} /></Field>}
          {(t === 'tournament' || t === 'match') && <Field label="رقم البطولة" hint={t === 'match' ? 'اختياري — يؤخذ من المباراة' : ''}><input name="tournamentId" type="number" min={1} required={t === 'tournament'} defaultValue={cur?.tournamentId ?? ''} /></Field>}
          {t !== 'match' && <>
            <Field label="الصورة" hint="16:9 — JPEG أو PNG حتى 5MB"><input name="image" type="file" accept="image/jpeg,image/png,image/webp" /></Field>
            {cur?.imageUrl && <label className="check"><input type="checkbox" name="removeImage" /> إزالة الصورة الحالية</label>}
          </>}
          <Field label="الرابط عند الضغط" hint="https://… أو صفحة في الموقع تبدأ بـ /"><input name="linkUrl" dir="ltr" maxLength={300} defaultValue={cur?.linkUrl ?? ''} /></Field>
          <Field label="الأولوية" hint="0–100، الأعلى أولاً"><input name="priority" type="number" min={0} max={100} defaultValue={cur?.priority ?? 0} /></Field>
          <Field label="بداية العرض (بغداد)"><input name="startsAt" type="datetime-local" defaultValue={isoToLocal(cur?.startsAt)} /></Field>
          <Field label="نهاية العرض (بغداد)"><input name="endsAt" type="datetime-local" defaultValue={isoToLocal(cur?.endsAt)} /></Field>
          <div className="row wide"><button className="btn btn-primary" disabled={act.busy}>حفظ كمسودة</button></div>
        </form>
      )}
      <FilterTabs label="الحالة" value={filter} onChange={setFilter} options={[['all', 'الكل'], ['review', CONTENT_STATUS_LABELS.review], ['published', CONTENT_STATUS_LABELS.published], ['draft', CONTENT_STATUS_LABELS.draft], ['archived', CONTENT_STATUS_LABELS.archived]]} />
      <Loading error={list.error} loading={list.loading} />
      {list.data?.length === 0 && <div className="card empty-card">لا شرائح هنا.</div>}
      <div className="grid g300">
        {list.data?.map((x) => {
          const paid = PAID_SLIDE_TYPES.includes(x.type);
          const mine = x.createdBy?.id === s.me?.id || x.updatedBy?.id === s.me?.id;
          const canEdit = x.status !== 'archived' && (x.type === 'sponsor' ? s.can('content.draft') || s.can('slides.sponsor') : s.can('content.draft'));
          return (
            <article key={x.id} className="card slide-row">
              <span className="slide-thumb">{x.imageUrl ? <img src={x.imageUrl} alt="" /> : <span>{SLIDE_TYPE_LABELS[x.type]}</span>}{paid && <span className="badge gold">برعاية</span>}</span>
              <div className="stack-sm">
                <div className="between"><b>{x.titleAr}</b><ContentBadge status={x.status} /></div>
                <span className="muted">{SLIDE_TYPE_LABELS[x.type]}{x.sponsor ? ` · ${x.sponsor.nameAr}` : ''} · أولوية {x.priority}</span>
                <span className="muted">العرض: {x.startsAt ? when(x.startsAt) : 'فوراً'} ← {x.endsAt ? when(x.endsAt) : 'مفتوح'}</span>
                {x.approvedBy && <span className="muted">اعتمدها {x.approvedBy.fullName} {when(x.approvedAt)}</span>}
                {x.reviewNote && <span className="form-error">أُرجعت: {x.reviewNote}</span>}
                <div className="row">
                  {canEdit && <button type="button" className="btn btn-sm" onClick={() => setEdit(x)}>تعديل</button>}
                  {x.status === 'draft' && canEdit && <button type="button" className="btn btn-sm btn-primary" disabled={act.busy} onClick={() => void go(`/admin/slides/${x.id}/submit`, 'أُرسلت للمراجعة.')}>أرسل للمراجعة</button>}
                  {x.status === 'review' && canPublish && (paid && mine && !superAdmin
                    ? <span className="muted">يعتمدها شخص آخر غير كاتبها.</span>
                    : <>
                        <button type="button" className="btn btn-sm btn-primary" disabled={act.busy} onClick={() => void go(`/admin/slides/${x.id}/approve`, 'اعتُمدت ونُشرت.')}>اعتماد ونشر</button>
                        <button type="button" className="btn btn-sm" disabled={act.busy} onClick={() => { const n = window.prompt('سبب الإرجاع:'); if (n) void go(`/admin/slides/${x.id}/reject`, 'أُرجعت مسودة.', { note: n }); }}>إرجاع</button>
                      </>)}
                  {x.status !== 'archived' && (canPublish || (x.type === 'sponsor' && s.can('sponsors.manage'))) && (
                    <ConfirmButton className="btn btn-sm btn-danger" disabled={act.busy} confirm="إيقاف عرض الشريحة نهائياً؟" onClick={() => void go(`/admin/slides/${x.id}/archive`, 'أُرشفت الشريحة.')}>أرشفة</ConfirmButton>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
