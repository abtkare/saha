'use client';
import { useMemo, useState } from 'react';
import { SLIDE_TYPES, SLIDE_TYPE_LABELS, TOURNAMENT_KINDS, TOURNAMENT_KIND_LABELS, TIMEZONE } from '@saha/shared';
import { Loading, PageHead, useLoad } from '@/components/admin/kit';
import { AreaChart, BarList, Heatmap, Kpi, n0, shortDay, type HeatData } from '@/components/admin/charts';
import { AIcon } from '@/components/admin/icons';

type Metric = 'impressions' | 'clicks' | 'ctr';
interface Analytics {
  from: string; to: string; previous: { from: string; to: string };
  totals: { impressions: number; clicks: number; devices: number; ctr: number };
  previousTotals: { impressions: number; clicks: number; devices: number; ctr: number };
  change: { impressions: number | null; clicks: number | null; devices: number | null; ctr: number | null };
  series: { day: string; impressions: number; clicks: number; ctr: number }[];
  heatmap: HeatData & { metric: Metric; peak: { dow: number; label: string; hour: number; value: number } | null; byHour: number[]; byDay: number[] };
  sponsors: { id: number | null; nameAr: string; impressions: number; clicks: number; ctr: number }[];
  slides: { id: number; titleAr: string; type: string | null; status: string | null; sponsorAr: string | null; impressions: number; clicks: number; ctr: number }[];
  types: { type: string; label: string; impressions: number; clicks: number }[];
  options: { sponsors: { id: number; nameAr: string }[]; tournaments: { id: number; nameAr: string }[]; slides: { id: number; titleAr: string; sponsorId: number | null }[] };
}

const METRIC_LABEL: Record<Metric, string> = { impressions: 'مرات الظهور', clicks: 'النقرات', ctr: 'نسبة النقر' };
const DAYS: [number, string][] = [[6, 'السبت'], [7, 'الأحد'], [1, 'الاثنين'], [2, 'الثلاثاء'], [3, 'الأربعاء'], [4, 'الخميس'], [5, 'الجمعة']];
const PRESETS: [number, string][] = [[7, '7 أيام'], [30, '30 يوماً'], [90, '90 يوماً'], [365, 'سنة']];

const baghdadToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());
const minus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) - n * 86400_000).toISOString().slice(0, 10);

interface F { from: string; to: string; sponsorId: string; slideId: string; slideType: string; tournamentId: string; kind: string; days: number[]; hourFrom: string; hourTo: string }

/** تحليلات الرعاة: مؤشرات بمقارنة الفترة السابقة، منحنى يومي، خريطة حرارية بالأيام والساعات، وترتيب الرعاة والشرائح */
export default function SponsorAnalytics() {
  const t = baghdadToday();
  const blank: F = { from: minus(t, 29), to: t, sponsorId: '', slideId: '', slideType: '', tournamentId: '', kind: '', days: [], hourFrom: '', hourTo: '' };
  const [f, setF] = useState<F>(blank);
  const [metric, setMetric] = useState<Metric>('impressions');
  const [showAdv, setShowAdv] = useState(false);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ from: f.from, to: f.to, metric });
    for (const k of ['sponsorId', 'slideId', 'slideType', 'tournamentId', 'kind', 'hourFrom', 'hourTo'] as const) if (f[k]) p.set(k, f[k]);
    if (f.days.length) p.set('days', f.days.join(','));
    return p.toString();
  }, [f, metric]);
  const r = useLoad<Analytics>(`/admin/analytics/sponsors?${qs}`);
  const a = r.data;
  const set = <K extends keyof F>(k: K, v: F[K]) => setF((x) => ({ ...x, [k]: v }));
  const preset = (n: number) => setF((x) => ({ ...x, to: t, from: minus(t, n - 1) }));
  const activePreset = f.to === t ? PRESETS.find(([n]) => f.from === minus(t, n - 1))?.[0] : undefined;
  const advCount = [f.slideId, f.slideType, f.tournamentId, f.kind, f.hourFrom, f.hourTo].filter(Boolean).length + (f.days.length ? 1 : 0);
  const slideOpts = a?.options.slides.filter((s) => !f.sponsorId || String(s.sponsorId) === f.sponsorId) ?? [];
  const unit = metric === 'ctr' ? '%' : '';
  const series = a?.series.map((p) => ({ x: p.day, y: p[metric] })) ?? [];
  const best = a?.series.reduce<{ day: string; v: number } | null>((b, p) => (p[metric] > (b?.v ?? 0) ? { day: p.day, v: p[metric] } : b), null);
  const peakHour = a ? a.heatmap.byHour.indexOf(Math.max(...a.heatmap.byHour)) : -1;
  const peakDay = a ? a.heatmap.byDay.indexOf(Math.max(...a.heatmap.byDay)) : -1;

  return (
    <>
      <PageHead title="تحليلات الرعاة" text="ظهور شرائح الرعاة ونقراتها بتوقيت بغداد — كل جهاز يُحسب مرة في اليوم لكل شريحة.">
        <button type="button" className="btn btn-sm no-print" onClick={() => window.print()}><AIcon name="print" size={18} /> طباعة / PDF</button>
      </PageHead>

      <section className="card an-filters" aria-label="الفلاتر">
        <div className="row">
          <div className="seg" role="group" aria-label="الفترة">
            {PRESETS.map(([n, l]) => <button key={n} type="button" aria-pressed={activePreset === n} onClick={() => preset(n)}>{l}</button>)}
          </div>
          <label className="field"><span>من</span><input type="date" value={f.from} max={f.to} onChange={(e) => e.target.value && set('from', e.target.value)} /></label>
          <label className="field"><span>إلى</span><input type="date" value={f.to} min={f.from} max={t} onChange={(e) => e.target.value && set('to', e.target.value)} /></label>
          <label className="field"><span>الراعي</span>
            <select value={f.sponsorId} onChange={(e) => setF((x) => ({ ...x, sponsorId: e.target.value, slideId: '' }))}>
              <option value="">كل الرعاة</option>
              {a?.options.sponsors.map((s) => <option key={s.id} value={s.id}>{s.nameAr}</option>)}
            </select>
          </label>
          <button type="button" className="btn btn-sm" aria-expanded={showAdv} onClick={() => setShowAdv(!showAdv)}>
            <AIcon name="filter" size={18} /> فلاتر متقدمة{advCount ? ` (${advCount})` : ''}
          </button>
          {(advCount > 0 || f.sponsorId) && <button type="button" className="btn-link" onClick={() => setF({ ...blank, from: f.from, to: f.to })}>مسح الفلاتر</button>}
        </div>
        {showAdv && (
          <>
            <div className="row">
              <label className="field"><span>الشريحة</span>
                <select value={f.slideId} onChange={(e) => set('slideId', e.target.value)}>
                  <option value="">كل الشرائح</option>
                  {slideOpts.map((s) => <option key={s.id} value={s.id}>{s.titleAr}</option>)}
                </select>
              </label>
              <label className="field"><span>نوع الشريحة</span>
                <select value={f.slideType} onChange={(e) => set('slideType', e.target.value)}>
                  <option value="">كل الأنواع</option>
                  {SLIDE_TYPES.map((x) => <option key={x} value={x}>{SLIDE_TYPE_LABELS[x]}</option>)}
                </select>
              </label>
              <label className="field"><span>البطولة</span>
                <select value={f.tournamentId} onChange={(e) => set('tournamentId', e.target.value)}>
                  <option value="">كل البطولات</option>
                  {a?.options.tournaments.map((x) => <option key={x.id} value={x.id}>{x.nameAr}</option>)}
                </select>
              </label>
              <label className="field"><span>نوع البطولة</span>
                <select value={f.kind} onChange={(e) => set('kind', e.target.value)}>
                  <option value="">كل الأنواع</option>
                  {TOURNAMENT_KINDS.map((x) => <option key={x} value={x}>{TOURNAMENT_KIND_LABELS[x]}</option>)}
                </select>
              </label>
              <label className="field"><span>من الساعة</span>
                <select value={f.hourFrom} onChange={(e) => set('hourFrom', e.target.value)}>
                  <option value="">—</option>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{`${String(h).padStart(2, '0')}:00`}</option>)}
                </select>
              </label>
              <label className="field"><span>إلى الساعة</span>
                <select value={f.hourTo} onChange={(e) => set('hourTo', e.target.value)}>
                  <option value="">—</option>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{`${String(h).padStart(2, '0')}:59`}</option>)}
                </select>
              </label>
            </div>
            <div className="chips-select" role="group" aria-label="أيام الأسبوع">
              {DAYS.map(([d, l]) => (
                <button key={d} type="button" aria-pressed={f.days.includes(d)}
                  onClick={() => set('days', f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d])}>{l}</button>
              ))}
            </div>
          </>
        )}
      </section>

      <Loading error={r.error} loading={r.loading && !a} />
      {a && (
        <>
          <div className="kpis" aria-busy={r.loading}>
            <Kpi icon="eye" label="مرات الظهور" value={n0(a.totals.impressions)} delta={a.change.impressions} sub={`السابقة: ${n0(a.previousTotals.impressions)}`} />
            <Kpi icon="click" label="النقرات" value={n0(a.totals.clicks)} delta={a.change.clicks} sub={`السابقة: ${n0(a.previousTotals.clicks)}`} tone="gold" />
            <Kpi icon="percent" label="نسبة النقر" value={`${a.totals.ctr}%`} delta={a.change.ctr} sub={`السابقة: ${a.previousTotals.ctr}%`} tone="info" />
            <Kpi icon="device" label="أجهزة وصلتها الشرائح" value={n0(a.totals.devices)} delta={a.change.devices} sub="أجهزة مختلفة في الفترة" />
          </div>

          {a.totals.impressions > 0 && a.heatmap.peak && (
            <p className="insight"><AIcon name="star" />
              <span>أعلى {METRIC_LABEL[metric]} يوم <b>{a.heatmap.peak.label}</b> الساعة <b className="num">{String(a.heatmap.peak.hour).padStart(2, '0')}:00</b>
                {peakDay >= 0 && <> · أنشط يوم عموماً: <b>{a.heatmap.days[peakDay].label}</b></>}
                {peakHour >= 0 && <> · أنشط ساعة: <b className="num">{String(peakHour).padStart(2, '0')}:00</b></>}
                {best && <> · أعلى يوم في الفترة: <b>{shortDay(best.day)}</b></>}.
              </span>
            </p>
          )}

          <section className="card an-card">
            <div className="between">
              <h2>{METRIC_LABEL[metric]} يوماً بيوم</h2>
              <div className="seg" role="group" aria-label="المقياس">
                {(Object.keys(METRIC_LABEL) as Metric[]).map((m) => <button key={m} type="button" aria-pressed={metric === m} onClick={() => setMetric(m)}>{METRIC_LABEL[m]}</button>)}
              </div>
            </div>
            {a.totals.impressions === 0 ? <p className="muted">لا بيانات في هذه الفترة بهذه الفلاتر.</p> : <AreaChart points={series} label={METRIC_LABEL[metric]} unit={unit} color={metric === 'clicks' ? '#8A6A00' : metric === 'ctr' ? '#1F5FC4' : '#0B6E4F'} />}
          </section>

          <section className="card an-card">
            <div className="between">
              <h2>الخريطة الحرارية — {METRIC_LABEL[metric]}</h2>
              <span className="muted">الأيام × الساعات بتوقيت بغداد</span>
            </div>
            <Heatmap data={a.heatmap} unit={unit} onPick={(dow, h) => { setShowAdv(true); setF((x) => ({ ...x, days: [dow], hourFrom: String(h), hourTo: String(h) })); }} />
          </section>

          <div className="an-grid">
            <section className="card an-card">
              <h2>الرعاة</h2>
              {a.sponsors.length === 0 ? <p className="muted">لا بيانات.</p> : (
                <div className="scroll-x">
                  <table className="table admin-table">
                    <thead><tr><th>الراعي</th><th>الظهور</th><th>النقرات</th><th>نسبة النقر</th><th className="no-print">التقرير</th></tr></thead>
                    <tbody>
                      {a.sponsors.map((s) => (
                        <tr key={s.id ?? 'none'}>
                          <td>{s.nameAr}</td><td className="num">{n0(s.impressions)}</td><td className="num">{n0(s.clicks)}</td><td className="num">{s.ctr}%</td>
                          <td className="no-print">{s.id !== null && <a className="btn btn-sm" href={`/sponsor/portal?sponsorId=${s.id}&from=${a.from}&to=${a.to}`}>تقرير الراعي</a>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section className="card an-card">
              <h2>حسب نوع الشريحة</h2>
              {a.types.length === 0 ? <p className="muted">لا بيانات.</p> : <BarList rows={a.types.map((x) => ({ key: x.type, label: x.label, value: metric === 'clicks' ? x.clicks : x.impressions }))} />}
            </section>
          </div>

          <section className="card an-card">
            <h2>أفضل الشرائح</h2>
            {a.slides.length === 0 ? <p className="muted">لا بيانات.</p> : (
              <div className="scroll-x">
                <table className="table admin-table">
                  <thead><tr><th>#</th><th>الشريحة</th><th>الراعي</th><th>النوع</th><th>الظهور</th><th>النقرات</th><th>نسبة النقر</th></tr></thead>
                  <tbody>
                    {a.slides.map((s, i) => (
                      <tr key={s.id}>
                        <td className="num">{i + 1}</td><td>{s.titleAr}</td><td>{s.sponsorAr ?? '—'}</td>
                        <td>{s.type ? SLIDE_TYPE_LABELS[s.type as keyof typeof SLIDE_TYPE_LABELS] ?? s.type : '—'}</td>
                        <td className="num">{n0(s.impressions)}</td><td className="num">{n0(s.clicks)}</td><td className="num">{s.ctr}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <details className="card panel">
            <summary>الأرقام اليومية بجدول</summary>
            <div className="scroll-x">
              <table className="table admin-table">
                <thead><tr><th>اليوم</th><th>الظهور</th><th>النقرات</th><th>نسبة النقر</th></tr></thead>
                <tbody>
                  {[...a.series].reverse().map((p) => <tr key={p.day}><td className="num" dir="ltr">{p.day}</td><td className="num">{n0(p.impressions)}</td><td className="num">{n0(p.clicks)}</td><td className="num">{p.ctr}%</td></tr>)}
                  <tr className="total"><td>المجموع</td><td className="num">{n0(a.totals.impressions)}</td><td className="num">{n0(a.totals.clicks)}</td><td className="num">{a.totals.ctr}%</td></tr>
                </tbody>
              </table>
            </div>
          </details>
          <p className="muted">الفترة: <span className="num" dir="ltr">{a.from} → {a.to}</span> · المقارنة مع: <span className="num" dir="ltr">{a.previous.from} → {a.previous.to}</span></p>
        </>
      )}
    </>
  );
}
