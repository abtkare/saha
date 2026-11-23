'use client';
import { useState } from 'react';
import { DISPUTE_DECISIONS, DISPUTE_DECISION_LABELS, DISPUTE_MAJORITY, RESULT_STATUS_LABELS, type DisputeDecision } from '@saha/shared';
import { Field, FilterTabs, Loading, Note, PageHead, num, text, useAction, useLoad, when } from '@/components/admin/kit';
import type { ResultView } from '@/components/admin/types';
import { api } from '@/lib/client';

interface Dispute {
  id: number; status: 'open' | 'upheld' | 'rejected'; decision: DisputeDecision | null; decisionNote: string | null; reason: string;
  createdAt: string; decidedAt: string | null; team: { id: number; nameAr: string }; raisedBy: { id: number; fullName: string };
  match: ResultView; votes: number; myVote: { decision: DisputeDecision; homeScore: number | null; awayScore: number | null } | null;
}
const STATUS = { open: 'مفتوح', upheld: 'مقبول', rejected: 'مرفوض' } as const;

/** لجنة الانضباط: كل عضو يصوّت، والقرار بصوتين متطابقين */
export default function Disputes() {
  const [status, setStatus] = useState<'open' | 'upheld' | 'rejected'>('open');
  const list = useLoad<Dispute[]>(`/admin/disputes?status=${status}`);
  const act = useAction();
  const [decision, setDecision] = useState<Record<number, DisputeDecision>>({});

  return (
    <>
      <PageHead title="الاعتراضات" text={`صوّت بـ رفض أو تصحيح أو إعادة. يُحسم الاعتراض بـ ${DISPUTE_MAJORITY} أصوات متطابقة، ويمكنك تغيير صوتك قبل الحسم.`} />
      <FilterTabs label="حالة الاعتراض" value={status} onChange={setStatus} options={[['open', 'المفتوحة'], ['upheld', 'المقبولة'], ['rejected', 'المرفوضة']]} />
      <Note note={act.note} />
      <Loading error={list.error} loading={list.loading} />
      {list.data?.length === 0 && <div className="card empty-card">لا اعتراضات هنا.</div>}
      <div className="stack">
        {list.data?.map((d) => {
          const m = d.match;
          const dec = decision[d.id] ?? d.myVote?.decision ?? 'reject';
          return (
            <article key={d.id} className="card form-card">
              <div className="between wrapflex">
                <b>{m.homeTeam.nameAr} <span className="num">{m.homeScore} – {m.awayScore}</span> {m.awayTeam.nameAr}</b>
                <span className="row"><span className={`badge s-${m.resultStatus}`}>{RESULT_STATUS_LABELS[m.resultStatus]}</span><span className="badge s-scheduled">{STATUS[d.status]}</span></span>
              </div>
              <p className="muted">{m.tournament.nameAr} · {when(m.kickoffAt)} · اعترض {d.team.nameAr} ({d.raisedBy.fullName}) {when(d.createdAt)}</p>
              <blockquote className="quote">{d.reason}</blockquote>
              {d.status === 'open' ? (
                <form className="grid-form" onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void act.run(async () => {
                    await api(`/admin/disputes/${d.id}/vote`, {
                      body: { decision: dec, note: text(f.get('note')), ...(dec === 'correct' ? { homeScore: num(f.get('homeScore')), awayScore: num(f.get('awayScore')), homePens: num(f.get('homePens')), awayPens: num(f.get('awayPens')) } : {}) },
                    });
                    await list.reload();
                  }, 'سُجّل صوتك.');
                }}>
                  <p className="wide muted">الأصوات حتى الآن: <span className="num">{d.votes}</span>{d.myVote && ` · صوتك: ${DISPUTE_DECISION_LABELS[d.myVote.decision]}`}</p>
                  <Field label="قرارك"><select value={dec} onChange={(e) => setDecision({ ...decision, [d.id]: e.target.value as DisputeDecision })}>
                    {DISPUTE_DECISIONS.map((x) => <option key={x} value={x}>{DISPUTE_DECISION_LABELS[x]}</option>)}
                  </select></Field>
                  {dec === 'correct' && <>
                    <Field label={`أهداف ${m.homeTeam.nameAr}`}><input name="homeScore" type="number" min={0} max={99} required defaultValue={d.myVote?.homeScore ?? m.homeScore ?? ''} /></Field>
                    <Field label={`أهداف ${m.awayTeam.nameAr}`}><input name="awayScore" type="number" min={0} max={99} required defaultValue={d.myVote?.awayScore ?? m.awayScore ?? ''} /></Field>
                    <Field label="ترجيح صاحب الأرض"><input name="homePens" type="number" min={0} max={99} /></Field>
                    <Field label="ترجيح الضيف"><input name="awayPens" type="number" min={0} max={99} /></Field>
                  </>}
                  <Field label="ملاحظة" wide><input name="note" maxLength={500} /></Field>
                  <div className="row wide"><button className="btn btn-primary" disabled={act.busy}>{d.myVote ? 'تغيير صوتي' : 'صوّت'}</button></div>
                </form>
              ) : (
                <p>القرار: <b>{d.decision ? DISPUTE_DECISION_LABELS[d.decision] : '—'}</b> {when(d.decidedAt)}{d.decisionNote && ` — ${d.decisionNote}`}</p>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}
