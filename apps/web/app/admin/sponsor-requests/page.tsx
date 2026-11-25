'use client';
import { useEffect, useState } from 'react';
import { SPONSOR_REQUEST_STATUSES, SPONSOR_REQUEST_STATUS_LABELS, type SponsorRequestStatus } from '@saha/shared';
import { useSession } from '@/components/auth';
import { FilterTabs, Loading, Note, PageHead, useAction, useLoad, when } from '@/components/admin/kit';
import { api, protectedImage } from '@/lib/client';

interface Req {
  id: number; orgName: string; titleAr: string; subtitleAr: string | null; linkUrl: string | null; days: number; message: string | null;
  status: SponsorRequestStatus; reviewNote: string | null; createdAt: string; handledAt: string | null; imageMediaId: number | null;
  tournament: { id: number; nameAr: string; slug: string }; match: { id: number; kickoffAt: string | null; homeTeam: { nameAr: string }; awayTeam: { nameAr: string } } | null;
  sponsor: { id: number; nameAr: string } | null; slide: { id: number; status: string; startsAt: string | null; endsAt: string | null } | null;
  user: { id: number; fullName: string; phone: string | null }; handledBy: { fullName: string } | null;
}

function Thumb({ id }: { id: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url = '';
    protectedImage(`/sponsor-requests/${id}/image`).then((u) => { url = u; setSrc(u); }).catch(() => setSrc(null));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [id]);
  return <span className="slide-thumb">{src ? <img src={src} alt="" /> : <span>بلا صورة</span>}<span className="badge gold">برعاية</span></span>;
}

/** طلبات رعاية الأحداث: القبول يُنشئ الراعي (أو يربطه) وشريحة «راعٍ» ويمنح صاحب الطلب بوابة الراعي */
export default function SponsorRequests() {
  const s = useSession();
  const [status, setStatus] = useState<SponsorRequestStatus>('pending');
  const list = useLoad<Req[]>(`/admin/sponsor-requests?status=${status}`);
  const sponsors = useLoad<{ id: number; nameAr: string }[]>('/admin/sponsors');
  const act = useAction();
  const [pick, setPick] = useState<Record<number, string>>({});
  const canPublish = s.can('content.publish');

  const accept = (r: Req) => act.run(async () => {
    const sid = Number(pick[r.id]) || undefined;
    await api(`/admin/sponsor-requests/${r.id}/accept`, { body: sid ? { sponsorId: sid } : {} });
    await Promise.all([list.reload(), sponsors.reload()]);
  }, canPublish ? 'قُبل الطلب والشريحة تظهر الآن في التطبيق والموقع.' : 'قُبل الطلب. الشريحة «قيد المراجعة» في «الهيرو سلايدر» حتى يعتمدها من يملك النشر.');

  return (
    <>
      <PageHead title="طلبات الرعاية" text={`طلبات الرعاة لبطولة أو مباراة من التطبيق والموقع. القبول يُنشئ شريحة «راعٍ» لمدة الطلب${canPublish ? ' وتُنشر فوراً' : ' وتنتظر اعتماد من يملك النشر'}، ويمنح صاحب الطلب «بوابة الراعي».`} />
      <Note note={act.note} />
      <FilterTabs label="حالة الطلب" value={status} onChange={setStatus} options={SPONSOR_REQUEST_STATUSES.map((x) => [x, SPONSOR_REQUEST_STATUS_LABELS[x]] as [SponsorRequestStatus, string])} />
      <Loading error={list.error} loading={list.loading} />
      {list.data?.length === 0 && <div className="card empty-card">لا طلبات هنا.</div>}
      <div className="grid g300">
        {list.data?.map((r) => (
          <article key={r.id} className="card slide-row">
            {r.imageMediaId ? <Thumb id={r.id} /> : <span className="slide-thumb"><span>بلا صورة</span></span>}
            <div className="stack-sm">
              <div className="between"><b>{r.titleAr}</b><span className="muted">{when(r.createdAt)}</span></div>
              {r.subtitleAr && <span>{r.subtitleAr}</span>}
              <span className="muted">الجهة: {r.orgName} · {r.days} يوماً</span>
              <span className="muted">الحدث: {r.match ? <a href={`/matches/${r.match.id}`}>{`${r.match.homeTeam.nameAr} × ${r.match.awayTeam.nameAr}`}</a> : <a href={`/tournaments/${r.tournament.slug}`}>{r.tournament.nameAr}</a>}</span>
              <span className="muted">صاحب الطلب: {r.user.fullName} {r.user.phone && <a href={`tel:${r.user.phone}`} dir="ltr">{r.user.phone}</a>}</span>
              {r.linkUrl && <span className="muted">الرابط: <a href={r.linkUrl} dir="ltr" target="_blank" rel="noopener noreferrer nofollow">{r.linkUrl}</a></span>}
              {r.message && <blockquote className="quote">{r.message}</blockquote>}
              {r.reviewNote && <span className="form-error">سبب الرفض: {r.reviewNote}</span>}
              {r.status === 'accepted' && <span className="muted">الراعي: {r.sponsor?.nameAr ?? '—'} · الشريحة: {r.slide ? `${r.slide.status === 'published' ? 'منشورة' : 'قيد المراجعة'} حتى ${when(r.slide.endsAt)}` : '—'}</span>}
              {r.handledBy && <span className="muted">عالجه: {r.handledBy.fullName} {when(r.handledAt)}</span>}
              {r.status === 'pending' && (
                <>
                  <label className="field"><span>الراعي</span>
                    <select value={pick[r.id] ?? ''} onChange={(e) => setPick({ ...pick, [r.id]: e.target.value })}>
                      <option value="">راعٍ جديد باسم «{r.orgName}»</option>
                      {sponsors.data?.map((x) => <option key={x.id} value={x.id}>{x.nameAr}</option>)}
                    </select>
                  </label>
                  <div className="row">
                    <button type="button" className="btn btn-sm btn-primary" disabled={act.busy} onClick={() => void accept(r)}>{canPublish ? 'قبول ونشر' : 'قبول'}</button>
                    <button type="button" className="btn btn-sm btn-danger" disabled={act.busy} onClick={() => { const n = window.prompt('سبب الرفض (يصل لصاحب الطلب):'); if (n) void act.run(async () => { await api(`/admin/sponsor-requests/${r.id}/reject`, { body: { note: n } }); await list.reload(); }, 'رُفض الطلب وأُبلغ صاحبه.'); }}>رفض</button>
                  </div>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
