'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CONTENT_STATUS_LABELS, SLIDE_TYPE_LABELS, TIMEZONE, ctr, type ContentStatus, type SlideType } from '@saha/shared';
import { LoginCard, useSessionState } from '@/components/auth';
import { DayChart } from '@/components/day-chart';
import { Mark } from '@/components/mark';
import { api, download } from '@/lib/client';

interface Report {
  sponsor: { id: number; nameAr: string; logoUrl: string | null }; from: string; to: string;
  totals: { impressions: number; clicks: number; ctr: number };
  slides: { id: number; titleAr: string; type: SlideType; status: ContentStatus; impressions: number; clicks: number; ctr: number; days: { day: string; impressions: number; clicks: number }[] }[];
}

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const fmtDay = new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
const pretty = (d: string) => fmtDay.format(new Date(`${d}T00:00:00Z`));
const n = (v: number) => v.toLocaleString('en-US');

function Portal() {
  const s = useSessionState();
  const params = useSearchParams();
  const [sponsors, setSponsors] = useState<{ id: number; nameAr: string }[] | null>(null);
  const [sponsorId, setSponsorId] = useState<number | null>(Number(params.get('sponsorId')) || null);
  const [range, setRange] = useState(() => ({ from: addDays(today(), -29), to: today() }));
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!s.me) return;
    api<{ id: number; nameAr: string }[]>('/sponsor/me').then((list) => {
      setSponsors(list);
      setSponsorId((cur) => (cur && list.some((x) => x.id === cur) ? cur : list[0]?.id ?? null));
    }).catch((e) => setError((e as Error).message));
  }, [s.me]);

  const query = sponsorId ? `sponsorId=${sponsorId}&from=${range.from}&to=${range.to}` : '';
  useEffect(() => {
    if (!query) return;
    setLoading(true); setError('');
    api<Report>(`/sponsor/report?${query}`).then(setReport).catch((e) => { setReport(null); setError((e as Error).message); }).finally(() => setLoading(false));
  }, [query]);

  // مجموع كل الشرائح لكل يوم في الفترة (الأيام بلا أحداث = صفر)
  const daily = useMemo(() => {
    if (!report) return { days: [] as string[], imp: [] as number[], clk: [] as number[] };
    const days: string[] = [];
    for (let d = report.from; d <= report.to; d = addDays(d, 1)) days.push(d);
    const imp = new Map<string, number>(), clk = new Map<string, number>();
    for (const sl of report.slides) for (const d of sl.days) { imp.set(d.day, (imp.get(d.day) ?? 0) + d.impressions); clk.set(d.day, (clk.get(d.day) ?? 0) + d.clicks); }
    return { days, imp: days.map((d) => imp.get(d) ?? 0), clk: days.map((d) => clk.get(d) ?? 0) };
  }, [report]);

  if (s.loading) return <section className="wrap sec last"><p className="muted">جارٍ التحميل…</p></section>;
  if (!s.me) return <LoginCard title="بوابة الراعي" text="ادخل برقم هاتفك المسجّل لدى ساحة لترى ظهور شرائحك ونقراتها. مدير الرعاة يدخل ببريد الإدارة." modes={['phone', 'admin']} onDone={() => void s.reload()} />;

  const preset = (days: number) => setRange({ from: addDays(today(), -(days - 1)), to: today() });
  const activeDays = Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86400_000) + 1;

  return (
    <section className="wrap sec last portal">
      <div className="print-head" aria-hidden="true">
        <span className="brand"><Mark size={40} /><span>ساحة</span></span>
        <span>تقرير الراعي · صدر {pretty(today())} · توقيت بغداد</span>
      </div>
      <div className="admin-head">
        <div>
          <h1>{report?.sponsor.nameAr ?? 'بوابة الراعي'}</h1>
          <p className="muted">{report ? `من ${pretty(report.from)} إلى ${pretty(report.to)}` : 'تقرير الظهور والنقرات'}</p>
        </div>
        <div className="row no-print">
          <button type="button" className="btn btn-primary" disabled={!report} onClick={() => window.print()}>تصدير PDF</button>
          <button type="button" className="btn" disabled={!report} onClick={() => void download(`/sponsor/report.csv?${query}`, `saha-sponsor-${sponsorId}-${range.from}-${range.to}.csv`).catch((e) => setError((e as Error).message))}>تنزيل Excel</button>
          <button type="button" className="btn-link" onClick={() => void s.signOut()}>خروج</button>
        </div>
      </div>

      <div className="card filters no-print">
        {sponsors && sponsors.length > 1 && (
          <label className="field"><span>الراعي</span>
            <select value={sponsorId ?? ''} onChange={(e) => setSponsorId(Number(e.target.value))}>{sponsors.map((x) => <option key={x.id} value={x.id}>{x.nameAr}</option>)}</select>
          </label>
        )}
        <div className="tabs self-start" role="tablist" aria-label="الفترة">
          {[7, 30, 90].map((d) => <button key={d} type="button" role="tab" aria-selected={activeDays === d && range.to === today()} onClick={() => preset(d)}>آخر {d} يوماً</button>)}
        </div>
        <label className="field"><span>من</span><input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} /></label>
        <label className="field"><span>إلى</span><input type="date" value={range.to} min={range.from} max={today()} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} /></label>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {sponsors?.length === 0 && <div className="card empty-card">حسابك غير مربوط براعٍ بعد. تواصل مع فريق ساحة.</div>}
      {loading && !report && <p className="muted">جارٍ تحميل التقرير…</p>}

      {report && (
        <>
          <div className="grid g200 kpis">
            <div className="card stat"><span className="num">{n(report.totals.impressions)}</span><span className="muted">مرات الظهور</span></div>
            <div className="card stat t-gold"><span className="num">{n(report.totals.clicks)}</span><span className="muted">النقرات</span></div>
            <div className="card stat t-info"><span className="num">{report.totals.ctr}%</span><span className="muted">نسبة النقر</span></div>
            <div className="card stat"><span className="num">{report.slides.length}</span><span className="muted">الشرائح</span></div>
          </div>
          <div className="grid g400">
            <div className="card chart-card"><DayChart days={daily.days} values={daily.imp} label="الظهور يومياً" /></div>
            <div className="card chart-card"><DayChart days={daily.days} values={daily.clk} label="النقرات يومياً" tone="gold" /></div>
          </div>
          <h2 className="admin-h2">حسب الشريحة</h2>
          <div className="card flush scroll-x">
            <table className="table admin-table">
              <thead><tr><th>الشريحة</th><th>الحالة</th><th>الظهور</th><th>النقرات</th><th>نسبة النقر</th></tr></thead>
              <tbody>
                {report.slides.length === 0 && <tr><td colSpan={5} className="muted">لا شرائح لهذا الراعي بعد.</td></tr>}
                {report.slides.map((x) => (
                  <tr key={x.id}>
                    <td>{x.titleAr} <span className="muted">· {SLIDE_TYPE_LABELS[x.type]}</span></td>
                    <td>{CONTENT_STATUS_LABELS[x.status]}</td>
                    <td className="num">{n(x.impressions)}</td><td className="num">{n(x.clicks)}</td><td className="num">{x.ctr}%</td>
                  </tr>
                ))}
                <tr className="total"><td>المجموع</td><td /><td className="num">{n(report.totals.impressions)}</td><td className="num">{n(report.totals.clicks)}</td><td className="num">{report.totals.ctr}%</td></tr>
              </tbody>
            </table>
          </div>
          <details className="card panel daily" open={daily.days.length <= 31}>
            <summary>التفاصيل يوماً بيوم</summary>
            <div className="scroll-x">
              <table className="table admin-table">
                <thead><tr><th>التاريخ</th><th>الظهور</th><th>النقرات</th><th>نسبة النقر</th></tr></thead>
                <tbody>
                  {daily.days.map((d, i) => daily.imp[i] || daily.clk[i] ? (
                    <tr key={d}><td>{pretty(d)}</td><td className="num">{n(daily.imp[i])}</td><td className="num">{n(daily.clk[i])}</td><td className="num">{ctr(daily.imp[i], daily.clk[i])}%</td></tr>
                  ) : null)}
                </tbody>
              </table>
            </div>
          </details>
          <p className="muted note-print">يُحسب الظهور مرة واحدة لكل جهاز في اليوم، والنقرة لا تُحسب إلا بعد ظهور مسجّل للجهاز نفسه. الأرقام من سجل الأحداث مباشرة.</p>
        </>
      )}
    </section>
  );
}

/** بوابة الراعي — التقرير بالفترة، تنزيل Excel، وتصدير PDF عبر الطباعة (يعمل في Safari الآيفون: مشاركة ← حفظ PDF) */
export default function SponsorPortal() {
  return <Suspense fallback={<section className="wrap sec last"><p className="muted">جارٍ التحميل…</p></section>}><Portal /></Suspense>;
}
