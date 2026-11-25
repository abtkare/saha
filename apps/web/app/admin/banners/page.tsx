'use client';
import { useState } from 'react';
import { ConfirmButton, Field, Loading, Note, PageHead, num, text, useAction, useLoad, when } from '@/components/admin/kit';
import { api, uploadImage } from '@/lib/client';

interface Banner { id: number; labelAr: string; imageUrl: string; linkUrl: string | null; isActive: boolean; sortOrder: number; updatedAt: string; sponsor: { id: number; nameAr: string } | null }
interface Sponsor { id: number; nameAr: string }

/** الراعي الدائم: لوحة ثابتة في الرئيسية وصفحة البطولة (الموقع والتطبيق) — تغيير الصورة والرابط والظهور */
export default function Banners() {
  const list = useLoad<Banner[]>('/admin/banners');
  const sponsors = useLoad<Sponsor[]>('/admin/sponsors');
  const act = useAction();
  const [edit, setEdit] = useState<Banner | 'new' | null>(null);
  const cur = edit === 'new' ? null : edit;

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const ok = await act.run(async () => {
      const file = f.get('image') as File | null;
      if (!cur && !(file && file.size > 0)) throw new Error('اختر صورة اللوحة.');
      const img = file && file.size > 0 ? await uploadImage(file, 'content') : null;
      const sponsorId = num(f.get('sponsorId'));
      const body: Record<string, unknown> = {
        labelAr: text(f.get('labelAr')),
        linkUrl: text(f.get('linkUrl')) ?? null,
        sponsorId: sponsorId ?? null,
        sortOrder: num(f.get('sortOrder')) ?? 0,
        isActive: f.get('isActive') === 'on',
        ...(img ? { imageMediaId: img.id } : {}),
      };
      if (cur) await api(`/admin/banners/${cur.id}`, { method: 'PATCH', body });
      else await api('/admin/banners', { body });
      await list.reload();
    }, 'حُفظت اللوحة. تظهر في الموقع والتطبيق خلال دقيقة.');
    if (ok) setEdit(null);
  }

  async function toggle(b: Banner) {
    await act.run(async () => { await api(`/admin/banners/${b.id}`, { method: 'PATCH', body: { isActive: !b.isActive } }); await list.reload(); }, b.isActive ? 'أُخفيت اللوحة.' : 'تظهر اللوحة الآن.');
  }

  async function remove(b: Banner) {
    await act.run(async () => { await api(`/admin/banners/${b.id}`, { method: 'DELETE' }); await list.reload(); }, 'حُذفت اللوحة.');
  }

  return (
    <>
      <PageHead title="الراعي الدائم" text="لوحة ثابتة تظهر دائماً تحت الهيرو في الرئيسية وفي صفحة كل بطولة، بالموقع والتطبيق. لتغيير الصورة: «تعديل» ← اختر صورة جديدة ← حفظ.">
        <button type="button" className="btn btn-primary" onClick={() => setEdit(edit ? null : 'new')}>{edit ? 'إغلاق' : 'لوحة جديدة'}</button>
      </PageHead>
      <Note note={act.note} />
      {edit && (
        <form key={cur?.id ?? 'new'} className="card form-card grid-form" onSubmit={save}>
          {cur && <div className="wide"><img src={cur.imageUrl} alt={cur.labelAr} className="banner-preview" /></div>}
          <Field label={cur ? 'تغيير الصورة' : 'الصورة'} hint="JPEG أو PNG أو WebP حتى 5MB. المقاس الأنسب 1600×900 (16:9)." wide>
            <input name="image" type="file" accept="image/jpeg,image/png,image/webp" required={!cur} />
          </Field>
          <Field label="الوصف" hint="يقرؤه قارئ الشاشة، مثل: الراعي الماسي — اسم الجهة"><input name="labelAr" required minLength={2} maxLength={60} defaultValue={cur?.labelAr ?? 'الراعي الماسي'} /></Field>
          <Field label="الرابط عند النقر" hint="يبدأ بـ https:// (اتركه فارغاً لصورة بلا رابط)"><input name="linkUrl" dir="ltr" defaultValue={cur?.linkUrl ?? ''} /></Field>
          <Field label="الراعي">
            <select name="sponsorId" defaultValue={cur?.sponsor?.id ?? ''}>
              <option value="">— بلا ربط —</option>
              {sponsors.data?.map((s) => <option key={s.id} value={s.id}>{s.nameAr}</option>)}
            </select>
          </Field>
          <Field label="الترتيب" hint="الأصغر يظهر أولاً"><input name="sortOrder" type="number" min={0} max={99} inputMode="numeric" defaultValue={cur?.sortOrder ?? 0} /></Field>
          <label className="check"><input type="checkbox" name="isActive" defaultChecked={cur?.isActive ?? true} /> تظهر الآن</label>
          <div className="row wide"><button className="btn btn-primary" disabled={act.busy}>{act.busy ? 'جارٍ الحفظ…' : 'حفظ'}</button></div>
        </form>
      )}
      <Loading error={list.error} loading={list.loading} />
      {list.data?.length === 0 && <div className="card empty-card">لا لوحات بعد. أضف «لوحة جديدة».</div>}
      <div className="grid g300">
        {list.data?.map((b) => (
          <article key={b.id} className="card form-card">
            <img src={b.imageUrl} alt={b.labelAr} className="banner-preview" />
            <div className="between"><b>{b.labelAr}</b><span className={`badge ${b.isActive ? 's-confirmed' : 's-final'}`}>{b.isActive ? 'ظاهرة' : 'مخفية'}</span></div>
            {b.sponsor && <span className="muted">الراعي: {b.sponsor.nameAr}</span>}
            {b.linkUrl && <a href={b.linkUrl} dir="ltr" className="muted" target="_blank" rel="noopener noreferrer">{b.linkUrl}</a>}
            <span className="muted">آخر تعديل: {when(b.updatedAt)} · الترتيب <span className="num">{b.sortOrder}</span></span>
            <div className="row">
              <button type="button" className="btn btn-sm btn-primary" onClick={() => { setEdit(b); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>تعديل / تغيير الصورة</button>
              <button type="button" className="btn btn-sm" disabled={act.busy} onClick={() => void toggle(b)}>{b.isActive ? 'إخفاء' : 'إظهار'}</button>
              <ConfirmButton disabled={act.busy} confirm="حذف هذه اللوحة نهائياً؟ (للإيقاف المؤقت استخدم «إخفاء»)" onClick={() => void remove(b)}>حذف</ConfirmButton>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
