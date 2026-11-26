'use client';
import { useEffect, useState } from 'react';
import { PRIZE_STATUS_LABELS, formatIqd } from '@saha/shared';
import { LoginCard, useSessionState } from '@/components/auth';
import { api } from '@/lib/client';
import type { Prize } from '@/lib/api';

type Mine = Prize & { tournament: { id: number; nameAr: string; slug: string }; deliveryNote: string | null; canConfirm: boolean };
const BADGE: Record<Prize['status'], string> = { pending: 's-scheduled', awarded: 's-scheduled', delivered: 's-provisional', confirmed: 's-confirmed' };
const dt = new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { timeZone: 'Asia/Baghdad', day: 'numeric', month: 'long', year: 'numeric' });

/** جوائزي: المستفيد (مدير الفريق، اللاعب، أو ولي أمر اللاعب القاصر) يرى جوائزه ويؤكد استلامها */
export default function MyPrizes() {
  const s = useSessionState();
  const [list, setList] = useState<Mine[] | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(0);

  const load = () => api<Mine[]>('/me/prizes').then(setList).catch((e) => setNote({ ok: false, text: (e as Error).message }));
  useEffect(() => { if (s.me) void load(); }, [s.me]);

  async function confirm(p: Mine) {
    if (!window.confirm(`تؤكد أنك استلمت «${p.label}» في ${p.tournament.nameAr}؟ التأكيد نهائي.`)) return;
    setBusy(p.id); setNote(null);
    try {
      await api(`/me/prizes/${p.id}/confirm`, { method: 'POST' });
      setNote({ ok: true, text: 'شكراً! سُجّل تأكيد الاستلام.' });
      await load();
    } catch (e) { setNote({ ok: false, text: (e as Error).message }); } finally { setBusy(0); }
  }

  if (s.loading) return <section className="wrap sec last"><p className="muted">جارٍ التحميل…</p></section>;
  if (!s.me) return <LoginCard title="جوائزي" text="ادخل برقم هاتفك المسجّل في ساحة لترى جوائزك وتؤكد استلامها." modes={['phone']} onDone={() => void s.reload()} />;
  return (
    <section className="wrap sec last">
      <div className="between wrap-row"><h1>جوائزي</h1><a className="btn btn-sm" href="/prizes">سجل الجوائز</a></div>
      {note && <p className={note.ok ? 'form-ok' : 'form-error'} role={note.ok ? 'status' : 'alert'}>{note.text}</p>}
      {list === null ? <p className="muted">جارٍ التحميل…</p> : list.length === 0 ? <div className="card empty-card">لا جوائز باسمك أو باسم فريقك بعد.</div> : (
        <div className="grid g300">
          {list.map((p) => (
            <article key={p.id} className="card form-card">
              <div className="between"><b>{p.label}</b><span className={`badge ${BADGE[p.status]}`}>{PRIZE_STATUS_LABELS[p.status]}</span></div>
              <a className="plain muted" href={`/tournaments/${p.tournament.slug}#prizes`}>{p.tournament.nameAr}</a>
              <span>{p.category === 'best_player' ? p.player?.name : p.team?.nameAr}</span>
              {p.amountIqd > 0 && <b className="num">{formatIqd(p.amountIqd)}</b>}
              {p.extraAr && <span>{p.extraAr}</span>}
              {p.deliveredAt && <small className="muted">سُلّمت {dt.format(new Date(p.deliveredAt))}{p.deliveryNote ? ` — ${p.deliveryNote}` : ''}</small>}
              {p.confirmedAt && <small className="muted">أكّدت الاستلام {dt.format(new Date(p.confirmedAt))}</small>}
              {p.canConfirm && <button type="button" className="btn btn-primary" disabled={busy === p.id} onClick={() => void confirm(p)}>{busy === p.id ? 'جارٍ التأكيد…' : 'أؤكد استلام الجائزة'}</button>}
              {p.status === 'awarded' && <small className="muted">بعد تسليمك الجائزة يظهر هنا زر تأكيد الاستلام.</small>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
