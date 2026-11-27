'use client';
import { useState } from 'react';
import { TOURNAMENT_KIND_LABELS, TOURNAMENT_STATUS_LABELS, type TournamentKind, type TournamentStatus } from '@saha/shared';
import { FilterTabs, Loading, Note, PageHead, useAction, useLoad, when } from '@/components/admin/kit';
import { Kpi, n0 } from '@/components/admin/charts';
import { api } from '@/lib/client';

interface FeeRow {
  id: number; nameAr: string; slug: string; kind: TournamentKind; status: TournamentStatus; city: string | null;
  entryFeeIqd: number; feesEnabled: boolean; feesChangedAt: string | null; feesNote: string | null;
  teams: number; pending: number; paid: number; collectedIqd: number; expectedIqd: number;
}
interface Overview { canDecide: boolean; tournaments: FeeRow[] }
type Tab = 'all' | 'on' | 'off' | 'waiting';

/** رسوم الاشتراك: المدير العام يفعّلها أو يلغيها لكل بطولة، ويرى المحصَّل والمتبقي */
export default function Fees() {
  const r = useLoad<Overview>('/admin/fees');
  const act = useAction();
  const [tab, setTab] = useState<Tab>('all');
  const [edit, setEdit] = useState<number | null>(null);
  const list = r.data?.tournaments ?? [];
  const open = list.filter((t) => t.status !== 'finished');
  const shown = list.filter((t) => tab === 'all' || (tab === 'on' ? t.feesEnabled : tab === 'off' ? !t.feesEnabled : !t.feesEnabled && t.entryFeeIqd > 0 && t.status !== 'finished'));
  const collected = list.reduce((n, t) => n + t.collectedIqd, 0);
  const expected = list.reduce((n, t) => n + t.expectedIqd, 0);
  const waiting = open.filter((t) => !t.feesEnabled && t.entryFeeIqd > 0).length;

  async function decide(t: FeeRow, enabled: boolean, form?: HTMLFormElement) {
    const f = form ? new FormData(form) : null;
    const fee = f ? Number(f.get('fee') || 0) : t.entryFeeIqd;
    const note = f ? String(f.get('note') ?? '').trim() : '';
    if (!form && !window.confirm(enabled ? `تفعيل رسوم ${n0(t.entryFeeIqd)} دينار لـ«${t.nameAr}»؟` : `إلغاء رسوم «${t.nameAr}» وجعل الاشتراك مجانياً؟ تصل الفرق المسجّلة رسالة بذلك.`)) return;
    const ok = await act.run(async () => {
      await api(`/tournaments/${t.id}/fees`, { body: { enabled, entryFeeIqd: fee, note: note || null } });
      await r.reload();
    }, enabled ? 'فُعّلت الرسوم، ووصل الخبر للفرق المسجّلة.' : 'أُلغيت الرسوم: الاشتراك مجاني الآن.');
    if (ok) setEdit(null);
  }

  return (
    <>
      <PageHead title="رسوم الاشتراك" text="الرسوم تظهر للفرق وتُسجَّل مبالغها فقط بعد أن يفعّلها المدير العام؛ الإلغاء يجعل الاشتراك مجانياً فوراً ويبلغ الفرق المسجّلة." />
      {r.data && !r.data.canDecide && <p className="insight">التفعيل والإلغاء للمدير العام بدخول البريد ورمز التحقق. أنت ترى الحالة والمحصَّل فقط.</p>}
      <Note note={act.note} />
      <Loading error={r.error} loading={r.loading && !r.data} />
      {r.data && (
        <>
          <div className="kpis">
            <Kpi icon="coins" label="المحصَّل" value={`${n0(collected)}`} sub="دينار — كل البطولات" tone="gold" />
            <Kpi icon="chart" label="المتوقع من الرسوم المفعّلة" value={`${n0(expected)}`} sub={`المتبقي ${n0(Math.max(0, expected - list.filter((t) => t.feesEnabled).reduce((n, t) => n + t.collectedIqd, 0)))} دينار`} />
            <Kpi icon="check" label="بطولات برسوم مفعّلة" value={String(list.filter((t) => t.feesEnabled).length)} sub={`من ${list.length} بطولة`} tone="info" />
            <Kpi icon="clock" label="بانتظار قرارك" value={String(waiting)} sub="برسوم مكتوبة وغير مفعّلة" tone={waiting ? 'danger' : undefined} />
          </div>
          <FilterTabs<Tab> label="عرض" value={tab} onChange={setTab} options={[['all', 'الكل'], ['on', 'مفعّلة'], ['off', 'مجانية'], ['waiting', 'بانتظار القرار']]} />
          {shown.length === 0 && <div className="card empty-card">لا بطولات هنا.</div>}
          <div className="fee-grid">
            {shown.map((t) => {
              const closed = t.status === 'finished';
              const pct = t.feesEnabled && t.teams ? Math.round((t.paid / t.teams) * 100) : 0;
              return (
                <article key={t.id} className={`card fee-card${t.feesEnabled ? ' on' : ''}`}>
                  <div className="between">
                    <span className="muted">{TOURNAMENT_KIND_LABELS[t.kind]} · {TOURNAMENT_STATUS_LABELS[t.status]}{t.city ? ` · ${t.city}` : ''}</span>
                    <span className={`badge ${t.feesEnabled ? 's-provisional' : t.entryFeeIqd > 0 && !closed ? 's-disputed' : 's-confirmed'}`}>
                      {t.feesEnabled ? 'الرسوم مفعّلة' : t.entryFeeIqd > 0 && !closed ? 'بانتظار القرار' : 'مجاني'}
                    </span>
                  </div>
                  <a href={`/admin/tournaments/${t.id}`} className="fee-title">{t.nameAr}</a>
                  <div className="fee-amount"><span className="num">{t.entryFeeIqd ? n0(t.entryFeeIqd) : '0'}</span> دينار للفريق</div>
                  {t.feesEnabled && (
                    <div className="fee-progress">
                      <div className="between"><span>دفع <b className="num">{t.paid}</b> من <b className="num">{t.teams}</b> فرق</span><span className="num">{n0(t.collectedIqd)} / {n0(t.expectedIqd)}</span></div>
                      <span className="progress" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
                    </div>
                  )}
                  {!t.feesEnabled && t.teams > 0 && <span className="muted">{t.teams} فرق معتمدة{t.pending ? ` و${t.pending} بانتظار الاعتماد` : ''}</span>}
                  {t.feesNote && <blockquote className="quote">{t.feesNote}</blockquote>}
                  {t.feesChangedAt && <span className="muted">آخر قرار: {when(t.feesChangedAt)}</span>}
                  {r.data!.canDecide && !closed && (
                    edit === t.id ? (
                      <form className="grid-form" onSubmit={(e) => { e.preventDefault(); void decide(t, true, e.currentTarget); }}>
                        <label className="field"><span>المبلغ (دينار)</span><input name="fee" type="number" min={1} max={100000000} required defaultValue={t.entryFeeIqd || ''} inputMode="numeric" /></label>
                        <label className="field"><span>ملاحظة للفرق (اختياري)</span><input name="note" maxLength={300} defaultValue={t.feesNote ?? ''} placeholder="مثلاً: تشمل الحكام والكرات" /></label>
                        <div className="row wide">
                          <button className="btn btn-primary btn-sm" disabled={act.busy}>{t.feesEnabled ? 'حفظ المبلغ' : 'تفعيل الرسوم'}</button>
                          <button type="button" className="btn btn-sm" onClick={() => setEdit(null)}>إلغاء</button>
                        </div>
                      </form>
                    ) : (
                      <div className="row">
                        {t.feesEnabled ? (
                          <>
                            <button type="button" className="btn btn-sm btn-danger" disabled={act.busy} onClick={() => void decide(t, false)}>إلغاء الرسوم</button>
                            <button type="button" className="btn btn-sm" onClick={() => setEdit(t.id)}>تعديل المبلغ</button>
                          </>
                        ) : (
                          <button type="button" className="btn btn-sm btn-primary" disabled={act.busy} onClick={() => setEdit(t.id)}>تفعيل الرسوم</button>
                        )}
                      </div>
                    )
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
