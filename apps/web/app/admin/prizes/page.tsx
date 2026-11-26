'use client';
import { useEffect, useState } from 'react';
import { PRIZE_CATEGORY_LABELS, PRIZE_STATUS_LABELS, TOURNAMENT_STATUS_LABELS, formatIqd, prizeLabel, type PrizeCategory, type PrizeStatus } from '@saha/shared';
import { ConfirmButton, Field, FilterTabs, Loading, Note, PageHead, num, text, useAction, useLoad, when } from '@/components/admin/kit';
import type { AdminTournament } from '@/components/admin/types';
import { api } from '@/lib/client';

interface P {
  id: number; category: PrizeCategory; rank: number; label: string; titleAr: string | null; amountIqd: number; extraAr: string | null; status: PrizeStatus;
  team: { id: number; nameAr: string } | null; player: { id: number; name: string } | null;
  awardedAt: string | null; deliveredAt: string | null; confirmedAt: string | null; deliveryNote: string | null; hasBeneficiary: boolean;
  tournament?: { id: number; nameAr: string; slug: string };
}
interface Data {
  tournament: { id: number; nameAr: string; slug: string; status: string; prizesAnnouncedAt: string | null };
  totalIqd: number; prizes: P[];
  candidates: { teams: { id: number; nameAr: string }[]; players: { id: number; name: string; team: { id: number; nameAr: string } }[] };
  suggestions: { places: { rank: number; teamId: number }[]; players: { rank: number; playerId: number; teamId: number | null }[] };
}

const BADGE: Record<PrizeStatus, string> = { pending: 's-scheduled', awarded: 's-provisional', delivered: 's-provisional', confirmed: 's-confirmed' };
const CATS: PrizeCategory[] = ['team_place', 'best_player'];

/** الجوائز: قيم المراكز الثلاثة الأولى وأفضل ثلاثة لاعبين، الإعلان، الفائزون، التسليم، والأرشيف */
export default function Prizes() {
  const [tab, setTab] = useState<'manage' | 'archive'>('manage');
  const tours = useLoad<AdminTournament[]>('/admin/tournaments');
  const [tid, setTid] = useState<number | null>(null);
  useEffect(() => {
    const q = Number(new URLSearchParams(location.search).get('t'));
    if (q) setTid(q);
  }, []);
  useEffect(() => {
    if (!tid && tours.data?.length) setTid((tours.data.find((t) => t.status === 'running') ?? tours.data[0]).id);
  }, [tours.data, tid]);

  return (
    <>
      <PageHead title="الجوائز" text="حدّد قيم جوائز المراكز الثلاثة الأولى وأفضل ثلاثة لاعبين، ثم أعلنها للجمهور. بعد الختام اختر الفائزين، وسجّل التسليم، ويؤكد المستفيد الاستلام من حسابه في التطبيق." />
      <FilterTabs label="قسم الجوائز" value={tab} onChange={setTab} options={[['manage', 'إدارة جوائز بطولة'], ['archive', 'الأرشيف']]} />
      {tab === 'manage' ? (
        <>
          <Loading error={tours.error} loading={tours.loading} />
          {tours.data && (
            <Field label="البطولة">
              <select value={tid ?? ''} onChange={(e) => { setTid(Number(e.target.value)); history.replaceState(null, '', `?t=${e.target.value}`); }}>
                {tours.data.map((t) => <option key={t.id} value={t.id}>{t.nameAr} — {TOURNAMENT_STATUS_LABELS[t.status]}</option>)}
              </select>
            </Field>
          )}
          {tid && <TournamentPrizes key={tid} id={tid} />}
        </>
      ) : <Archive />}
    </>
  );
}

function TournamentPrizes({ id }: { id: number }) {
  const d = useLoad<Data>(`/admin/tournaments/${id}/prizes`);
  const act = useAction();
  const data = d.data;

  async function announce(announced: boolean, notify = true) {
    await act.run(async () => {
      const r = await api<{ notified: number }>(`/admin/tournaments/${id}/prizes/announce`, { body: { announced, notify } });
      await d.reload();
      return r;
    }, announced ? 'أُعلنت الجوائز: تظهر الآن في صفحة البطولة بالموقع والتطبيق.' : 'أُخفيت الجوائز عن الجمهور.');
  }

  if (!data) return <Loading error={d.error} loading={d.loading} />;
  const t = data.tournament;
  const announced = !!t.prizesAnnouncedAt;
  return (
    <div className="prize-admin">
      <Note note={act.note} />
      <div className="card form-card">
        <div className="between wrap-row">
          <div>
            <b>{t.nameAr}</b>
            <div className="muted">مجموع الجوائز: <span className="num">{formatIqd(data.totalIqd)}</span> · {data.prizes.length} من 6 جوائز</div>
          </div>
          <span className={`badge ${announced ? 's-confirmed' : 's-scheduled'}`}>{announced ? `معلنة منذ ${when(t.prizesAnnouncedAt)}` : 'غير معلنة — لا يراها الجمهور'}</span>
        </div>
        <div className="row">
          {!announced && <ConfirmButton className="btn btn-gold" disabled={act.busy || !data.prizes.length} confirm="إعلان الجوائز للجمهور وإرسال إشعار لمديري الفرق ولاعبيها؟" onClick={() => void announce(true)}>أعلن الجوائز</ConfirmButton>}
          {announced && <ConfirmButton className="btn btn-sm" disabled={act.busy} confirm="إرسال إشعار «تحديث الجوائز» لمديري الفرق ولاعبيها؟" onClick={() => void announce(true)}>أعد الإعلان مع إشعار</ConfirmButton>}
          {announced && <ConfirmButton className="btn btn-sm" disabled={act.busy} confirm="إخفاء الجوائز من الموقع والتطبيق؟" onClick={() => void announce(false)}>إخفاء الإعلان</ConfirmButton>}
          <a className="btn btn-sm" href={`/tournaments/${t.slug}#prizes`} target="_blank" rel="noopener noreferrer">صفحة البطولة</a>
        </div>
        {announced && <small className="muted">تعديل القيم بعد الإعلان يظهر للجمهور مباشرة. لإشعار الفرق بالتعديل اضغط «أعد الإعلان مع إشعار».</small>}
      </div>
      {CATS.map((cat) => (
        <section key={cat} className="prize-admin">
          <h2>{PRIZE_CATEGORY_LABELS[cat]}</h2>
          <div className="grid g300">
            {[1, 2, 3].map((rank) => (
              <PrizeSlot key={`${cat}${rank}`} tid={id} cat={cat} rank={rank} data={data} p={data.prizes.find((x) => x.category === cat && x.rank === rank)} reload={d.reload} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function PrizeSlot({ tid, cat, rank, p, data, reload }: { tid: number; cat: PrizeCategory; rank: number; p?: P; data: Data; reload: () => Promise<void> }) {
  const act = useAction();
  const frozen = p?.status === 'delivered' || p?.status === 'confirmed';
  const teamName = (id: number | null | undefined) => data.candidates.teams.find((t) => t.id === id)?.nameAr;
  const sugId = cat === 'team_place'
    ? data.suggestions.places.find((s) => s.rank === rank)?.teamId ?? null
    : data.suggestions.players.find((s) => s.rank === rank)?.playerId ?? null;
  const sugName = sugId == null ? null : cat === 'team_place' ? teamName(sugId) : data.candidates.players.find((x) => x.id === sugId)?.name;
  const curWinner = cat === 'team_place' ? p?.team?.id : p?.player?.id;

  async function saveValue(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = { amountIqd: num(f.get('amountIqd')) ?? 0, extraAr: text(f.get('extraAr')) ?? null, titleAr: text(f.get('titleAr')) ?? null };
    await act.run(async () => {
      if (p) await api(`/admin/prizes/${p.id}`, { method: 'PATCH', body: frozen ? { titleAr: body.titleAr } : body });
      else await api('/admin/prizes', { body: { tournamentId: tid, category: cat, rank, ...body } });
      await reload();
    }, 'حُفظت الجائزة.');
  }

  async function setWinner(v: string) {
    if (!p) return;
    const key = cat === 'team_place' ? 'teamId' : 'playerId';
    await act.run(async () => { await api(`/admin/prizes/${p.id}`, { method: 'PATCH', body: { [key]: v ? Number(v) : null } }); await reload(); }, v ? 'حُدّد الفائز.' : 'أُلغي اختيار الفائز.');
  }

  async function deliver() {
    if (!p) return;
    const note = window.prompt('ملاحظة التسليم (اختيارية) — مثل: نقداً في حفل الختام', '');
    if (note === null) return;
    await act.run(async () => { await api(`/admin/prizes/${p.id}/deliver`, { body: note.trim() ? { note: note.trim() } : {} }); await reload(); }, 'سُجّل التسليم، ووصل للمستفيد إشعار ليؤكد الاستلام.');
  }

  return (
    <article className="card form-card">
      <div className="between">
        <b>{p?.label ?? prizeLabel(cat, rank)}</b>
        {p ? <span className={`badge ${BADGE[p.status]}`}>{PRIZE_STATUS_LABELS[p.status]}</span> : <span className="badge s-scheduled">لم تُحدَّد قيمتها</span>}
      </div>
      <form className="prize-admin" onSubmit={saveValue}>
        <Field label="المبلغ (دينار)"><input name="amountIqd" type="number" min={0} step={1000} inputMode="numeric" defaultValue={p?.amountIqd ?? ''} disabled={frozen} /></Field>
        <Field label="جائزة عينية" hint="اختياري، مثل: كأس + ميداليات"><input name="extraAr" maxLength={120} defaultValue={p?.extraAr ?? ''} disabled={frozen} /></Field>
        <Field label="اسم مخصص" hint={`اختياري؛ الافتراضي «${prizeLabel(cat, rank)}»`}><input name="titleAr" maxLength={40} defaultValue={p?.titleAr ?? ''} disabled={p?.status === 'confirmed'} /></Field>
        {p?.status !== 'confirmed' && <button className="btn btn-sm btn-primary" disabled={act.busy}>{p ? 'حفظ التعديل' : 'إضافة الجائزة'}</button>}
      </form>
      {p && (
        <>
          <Field label={cat === 'team_place' ? 'الفريق الفائز' : 'اللاعب الفائز'}>
            <select value={curWinner ?? ''} disabled={frozen || act.busy} onChange={(e) => void setWinner(e.target.value)}>
              <option value="">— لم يُحدَّد —</option>
              {cat === 'team_place'
                ? data.candidates.teams.map((t) => <option key={t.id} value={t.id}>{t.nameAr}</option>)
                : data.candidates.players.map((x) => <option key={x.id} value={x.id}>{x.name} — {x.team.nameAr}</option>)}
            </select>
          </Field>
          {!frozen && sugName && sugId !== curWinner && (
            <button type="button" className="btn-link suggest" disabled={act.busy} onClick={() => void setWinner(String(sugId))}>المقترح من النتائج: {sugName} — اختره</button>
          )}
          {p.status !== 'pending' && !p.hasBeneficiary && <small className="form-error">لا حساب للمستفيد في المنصة، فلن يستطيع تأكيد الاستلام.</small>}
          {p.deliveredAt && <small className="muted">سُلّمت {when(p.deliveredAt)}{p.deliveryNote ? ` — ${p.deliveryNote}` : ''}</small>}
          {p.confirmedAt && <small className="muted">أكّد المستفيد الاستلام {when(p.confirmedAt)}</small>}
          <div className="row">
            {p.status === 'awarded' && <button type="button" className="btn btn-sm btn-gold" disabled={act.busy} onClick={() => void deliver()}>سُلّمت</button>}
            {p.status === 'delivered' && <ConfirmButton disabled={act.busy} confirm="التراجع عن تسجيل التسليم؟" onClick={() => void act.run(async () => { await api(`/admin/prizes/${p.id}/undeliver`, { method: 'POST' }); await reload(); }, 'أُلغي تسجيل التسليم.')}>تراجع عن التسليم</ConfirmButton>}
            {!frozen && <ConfirmButton disabled={act.busy} confirm="حذف هذه الجائزة؟" onClick={() => void act.run(async () => { await api(`/admin/prizes/${p.id}`, { method: 'DELETE' }); await reload(); }, 'حُذفت الجائزة.')}>حذف</ConfirmButton>}
          </div>
        </>
      )}
      <Note note={act.note} />
    </article>
  );
}

function Archive() {
  const [status, setStatus] = useState<'all' | PrizeStatus>('all');
  const list = useLoad<P[]>(`/admin/prizes${status === 'all' ? '' : `?status=${status}`}`);
  const groups = new Map<number, P[]>();
  for (const p of list.data ?? []) groups.set(p.tournament!.id, [...(groups.get(p.tournament!.id) ?? []), p]);
  return (
    <>
      <FilterTabs label="حالة الجائزة" value={status} onChange={setStatus}
        options={[['all', 'الكل'], ['pending', 'بلا فائز'], ['awarded', 'بانتظار التسليم'], ['delivered', 'بانتظار التأكيد'], ['confirmed', 'مؤكَّدة']]} />
      <Loading error={list.error} loading={list.loading} />
      {list.data?.length === 0 && <div className="card empty-card">لا جوائز بهذه الحالة.</div>}
      {[...groups.values()].map((ps) => (
        <div key={ps[0].tournament!.id} className="card flush scroll-x">
          <table className="table">
            <thead><tr><th colSpan={5}><a className="plain" href={`/admin/prizes?t=${ps[0].tournament!.id}`}>{ps[0].tournament!.nameAr}</a> · <span className="num">{formatIqd(ps.reduce((s, p) => s + p.amountIqd, 0))}</span></th></tr></thead>
            <tbody>
              {ps.map((p) => (
                <tr key={p.id}>
                  <td>{p.label}</td>
                  <td>{p.category === 'best_player' ? (p.player?.name ?? '—') : (p.team?.nameAr ?? '—')}</td>
                  <td className="num">{p.amountIqd ? formatIqd(p.amountIqd) : ''}{p.extraAr ? ` ${p.extraAr}` : ''}</td>
                  <td><span className={`badge ${BADGE[p.status]}`}>{PRIZE_STATUS_LABELS[p.status]}</span></td>
                  <td className="muted">{p.confirmedAt ? `أُكّدت ${when(p.confirmedAt)}` : p.deliveredAt ? `سُلّمت ${when(p.deliveredAt)}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}
