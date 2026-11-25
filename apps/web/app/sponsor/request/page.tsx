'use client';
import { useEffect, useState } from 'react';
import { SPONSOR_REQUEST_DAYS, SPONSOR_REQUEST_STATUS_LABELS, TIMEZONE, type SponsorRequestStatus } from '@saha/shared';
import { LoginCard, useSessionState } from '@/components/auth';
import { api, uploadImage } from '@/lib/client';

interface EventMatch { id: number; kickoffAt: string | null; homeTeam: { nameAr: string }; awayTeam: { nameAr: string } }
interface EventTour { id: number; nameAr: string; status: string; matches: EventMatch[] }
interface Req {
  id: number; orgName: string; titleAr: string; days: number; status: SponsorRequestStatus; reviewNote: string | null;
  tournament: { nameAr: string }; match: { homeTeam: { nameAr: string }; awayTeam: { nameAr: string } } | null;
  slide: { status: string; endsAt: string | null } | null;
}

const fmt = new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { timeZone: TIMEZONE, weekday: 'short', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
const when = (iso: string | null) => (iso ? fmt.format(new Date(iso)) : '');

/** طلب رعاية حدث من الموقع (الجلسة 11) — نفس واجهة التطبيق: POST /sponsor-requests */
export default function SponsorRequestPage() {
  const s = useSessionState();
  const [events, setEvents] = useState<EventTour[] | null>(null);
  const [mine, setMine] = useState<Req[] | null>(null);
  const [tid, setTid] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const loadMine = () => api<Req[]>('/me/sponsor-requests').then(setMine).catch(() => undefined);
  useEffect(() => {
    if (!s.me) return;
    const q = new URLSearchParams(window.location.search);
    if (Number(q.get('tournamentId'))) setTid(Number(q.get('tournamentId')));
    api<EventTour[]>('/sponsor-requests/events').then(setEvents).catch((e) => setError((e as Error).message));
    void loadMine();
  }, [s.me]);

  if (s.loading) return <section className="wrap sec last"><p className="muted">جارٍ التحميل…</p></section>;
  if (!s.me) return <LoginCard title="اطلب رعاية حدث" text="ادخل برقم هاتفك لتطلب ظهور شريحتك خلال بطولة أو مباراة، وتتابع حالة طلبك." modes={['phone']} onDone={() => void s.reload()} />;

  const tour = events?.find((t) => t.id === tid) ?? null;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setError('');
    try {
      const file = f.get('image') as File | null;
      if (!file || file.size === 0) throw new Error('ارفع صورة الشريحة.');
      const img = await uploadImage(file, 'private');
      const matchId = Number(f.get('matchId')) || null;
      const t = (k: string) => String(f.get(k) ?? '').trim() || null;
      await api('/sponsor-requests', {
        body: {
          orgName: t('orgName'), titleAr: t('titleAr'), subtitleAr: t('subtitleAr'), linkUrl: t('linkUrl'), message: t('message'),
          days: Number(f.get('days')), imageMediaId: img.id, ...(matchId ? { matchId } : { tournamentId: tid }),
        },
      });
      setDone(true);
      void loadMine();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="wrap sec split last">
      <div className="split-main">
        <h1>اطلب رعاية حدث</h1>
        <p className="muted">اختر البطولة أو المباراة وارفع صورة شريحتك. بعد قبول الطلب تظهر شريحتك بشارة «برعاية» في الشاشة الرئيسية للتطبيق والموقع طوال مدة العرض، وترى الظهور والنقرات من <a href="/sponsor/portal">بوابة الراعي</a>.</p>
        {done ? (
          <div className="card form-card done" role="status">
            <h3>وصل طلبك ✓</h3>
            <p>يراجعه فريق ساحة ويصلك إشعار بالقبول أو الرفض.</p>
            <button type="button" className="btn" onClick={() => setDone(false)}>طلب آخر</button>
          </div>
        ) : (
          <form className="card form-card" onSubmit={submit}>
            <label className="field"><span>البطولة</span>
              <select required value={tid ?? ''} onChange={(e) => setTid(Number(e.target.value) || null)}>
                <option value="">— اختر —</option>
                {events?.map((t) => <option key={t.id} value={t.id}>{t.nameAr}{t.status === 'running' ? ' (جارية)' : ' (التسجيل مفتوح)'}</option>)}
              </select>
            </label>
            {events?.length === 0 && <p className="muted">لا بطولات متاحة للرعاية الآن.</p>}
            {tour && tour.matches.length > 0 && (
              <label className="field"><span>الرعاية</span>
                <select name="matchId" defaultValue="">
                  <option value="">البطولة كلها</option>
                  {tour.matches.map((m) => <option key={m.id} value={m.id}>{`${m.homeTeam.nameAr} × ${m.awayTeam.nameAr}`}{m.kickoffAt ? ` — ${when(m.kickoffAt)}` : ''}</option>)}
                </select>
              </label>
            )}
            <label className="field"><span>اسم الجهة الراعية</span><input name="orgName" required minLength={2} maxLength={80} autoComplete="organization" /></label>
            <label className="field"><span>عنوان الشريحة</span><input name="titleAr" required minLength={2} maxLength={80} placeholder="مثال: السلطان يرعى نهائي البطولة" /></label>
            <label className="field"><span>نص قصير <i>(اختياري)</i></span><input name="subtitleAr" maxLength={140} /></label>
            <label className="field"><span>صورة الشريحة</span><input name="image" type="file" required accept="image/jpeg,image/png,image/webp" /><small className="muted">عرضية 16:9 — JPEG أو PNG حتى 5MB</small></label>
            <label className="field"><span>رابط عند الضغط <i>(اختياري)</i></span><input name="linkUrl" dir="ltr" maxLength={300} placeholder="https://…" /></label>
            <label className="field"><span>مدة العرض (تبدأ من القبول)</span>
              <select name="days" defaultValue="14">{SPONSOR_REQUEST_DAYS.map((d) => <option key={d} value={d}>{d} يوماً</option>)}</select>
            </label>
            <label className="field"><span>ملاحظات <i>(اختياري)</i></span><textarea name="message" rows={3} maxLength={500} /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="btn btn-primary" disabled={busy || !tid}>{busy ? 'جارٍ الإرسال…' : 'أرسل طلب الرعاية'}</button>
          </form>
        )}
      </div>
      <div className="split-side">
        <h2>طلباتي</h2>
        {mine?.length === 0 && <div className="card empty-card">لا طلبات بعد.</div>}
        <div className="grid">
          {mine?.map((r) => (
            <article key={r.id} className="card form-card">
              <div className="between"><b>{r.titleAr}</b><span className={`badge${r.status === 'accepted' ? ' gold' : ''}`}>{SPONSOR_REQUEST_STATUS_LABELS[r.status]}</span></div>
              <span className="muted">{r.orgName} · {r.match ? `${r.match.homeTeam.nameAr} × ${r.match.awayTeam.nameAr}` : r.tournament.nameAr} · {r.days} يوماً</span>
              {r.status === 'rejected' && r.reviewNote && <span className="form-error">السبب: {r.reviewNote}</span>}
              {r.status === 'accepted' && r.slide && <span>{r.slide.status === 'published' ? `تظهر حتى ${when(r.slide.endsAt)}` : 'تظهر بعد اعتمادها النهائي.'}</span>}
              {r.status === 'pending' && <button type="button" className="btn btn-sm" onClick={() => void api(`/me/sponsor-requests/${r.id}/cancel`, { method: 'POST' }).then(loadMine).catch((e) => setError((e as Error).message))}>ألغِ الطلب</button>}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
