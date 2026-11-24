'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { LIVE_TEXT_MAX, MATCH_EVENT_LABELS, MATCH_EVENT_TYPES, RESULT_STATUS_LABELS, STAGE_LABELS, type MatchEventType, type ResultStatus } from '@saha/shared';
import { ConfirmButton, Field, Loading, Note, PageHead, num, text, useAction, useLoad, when } from '@/components/admin/kit';
import { api, uploadImage } from '@/lib/client';

interface Detail {
  id: number; stage: string; round: number | null; kickoffAt: string | null; venue: string | null; liveText: string | null;
  homeScore: number | null; awayScore: number | null; homePens: number | null; awayPens: number | null; resultStatus: ResultStatus;
  homeConfirmed: boolean; awayConfirmed: boolean; disputeDeadline: string | null; hasSheet: boolean;
  tournament: { id: number; nameAr: string; slug: string };
  homeTeam: { id: number; nameAr: string }; awayTeam: { id: number; nameAr: string };
  events: { id: number; type: MatchEventType; minute: number | null; teamId: number; player: { id: number; name: string } | null }[];
}
interface Team { id: number; players: { id: number; name: string; shirtNo: number | null }[] }

/** إدخال النتيجة (الحكم أو إدارة البطولة)، النتيجة المباشرة، والأحداث */
export default function MatchResult() {
  const { id } = useParams<{ id: string }>();
  const m = useLoad<Detail>(`/matches/${id}`);
  const home = useLoad<Team>(m.data ? `/teams/${m.data.homeTeam.id}` : null);
  const away = useLoad<Team>(m.data ? `/teams/${m.data.awayTeam.id}` : null);
  const act = useAction();
  const [teamId, setTeamId] = useState<number | null>(null);

  if (!m.data) return <><PageHead title="المباراة" /><Loading error={m.error} loading={m.loading} /></>;
  const d = m.data;
  const editable = d.resultStatus === 'scheduled' || d.resultStatus === 'provisional';
  const knockout = !d.round;
  const players = (teamId ?? d.homeTeam.id) === d.homeTeam.id ? home.data?.players ?? [] : away.data?.players ?? [];

  async function result(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const file = f.get('sheet') as File | null;
    await act.run(async () => {
      const sheet = file && file.size > 0 ? await uploadImage(file, 'private') : null;
      await api(`/matches/${id}/result`, {
        body: { homeScore: num(f.get('homeScore')), awayScore: num(f.get('awayScore')), homePens: num(f.get('homePens')), awayPens: num(f.get('awayPens')), sheetMediaId: sheet?.id },
      });
      await m.reload();
    }, 'أُدخلت النتيجة كمؤقتة، وأُشعر مديرا الفريقين.');
  }

  return (
    <>
      <PageHead title={`${d.homeTeam.nameAr} × ${d.awayTeam.nameAr}`} text={`${d.tournament.nameAr} · ${d.round ? `الجولة ${d.round}` : STAGE_LABELS[d.stage] ?? ''} · ${when(d.kickoffAt)}${d.venue ? ` · ${d.venue}` : ''}`}>
        <a className="btn btn-sm" href={`/matches/${d.id}`} target="_blank" rel="noopener">الصفحة العامة</a>
      </PageHead>
      <Note note={act.note} />
      <div className="card form-card">
        <div className="between"><h3>النتيجة</h3><span className={`badge s-${d.resultStatus}`}>{RESULT_STATUS_LABELS[d.resultStatus]}</span></div>
        {d.resultStatus !== 'scheduled' && (
          <p className="muted">
            <span className="num">{d.homeScore} – {d.awayScore}</span>{d.homePens !== null && ` (ترجيح ${d.homePens} – ${d.awayPens})`}
            {' · '}{d.homeTeam.nameAr}: {d.homeConfirmed ? 'أكّد' : 'لم يؤكد'} · {d.awayTeam.nameAr}: {d.awayConfirmed ? 'أكّد' : 'لم يؤكد'}
            {d.disputeDeadline && ` · مهلة الاعتراض حتى ${when(d.disputeDeadline)}`}
          </p>
        )}
        {editable ? (
          <form className="grid-form" onSubmit={result}>
            <Field label={`أهداف ${d.homeTeam.nameAr}`}><input name="homeScore" type="number" min={0} max={99} required inputMode="numeric" defaultValue={d.homeScore ?? ''} /></Field>
            <Field label={`أهداف ${d.awayTeam.nameAr}`}><input name="awayScore" type="number" min={0} max={99} required inputMode="numeric" defaultValue={d.awayScore ?? ''} /></Field>
            {knockout && <>
              <Field label="ترجيح صاحب الأرض" hint="عند التعادل في الإقصائيات فقط"><input name="homePens" type="number" min={0} max={99} inputMode="numeric" defaultValue={d.homePens ?? ''} /></Field>
              <Field label="ترجيح الضيف"><input name="awayPens" type="number" min={0} max={99} inputMode="numeric" defaultValue={d.awayPens ?? ''} /></Field>
            </>}
            <Field label="صورة ورقة المباراة" hint={d.hasSheet ? 'مرفوعة سابقاً — ارفع جديدة لتبديلها' : 'إلزامية — JPEG أو PNG حتى 5MB'} wide>
              <input name="sheet" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required={!d.hasSheet} />
            </Field>
            <div className="row wide"><button className="btn btn-primary" disabled={act.busy}>{d.resultStatus === 'provisional' ? 'تصحيح النتيجة' : 'إدخال النتيجة'}</button></div>
          </form>
        ) : <p className="muted">النتيجة مقفلة في هذه الحالة.</p>}
      </div>

      {d.resultStatus === 'scheduled' && (
        <form className="card form-card" onSubmit={(e) => { e.preventDefault(); const v = text(new FormData(e.currentTarget).get('live')); void act.run(async () => { await api(`/matches/${id}/live`, { method: 'PATCH', body: { text: v ?? null } }); await m.reload(); }, 'حُدّثت النتيجة المباشرة في السلايدر.'); }}>
          <h3>النتيجة المباشرة</h3>
          <p className="muted">تظهر في شريحة «مباراة اليوم» وتتحدث كل 30 ثانية، من ساعتين قبل الانطلاق حتى إدخال النتيجة.</p>
          <Field label="النص" hint={`حتى ${LIVE_TEXT_MAX} حرفاً، مثل: الشوط الثاني — 1 : 0`}><input name="live" maxLength={LIVE_TEXT_MAX} defaultValue={d.liveText ?? ''} /></Field>
          <button className="btn btn-primary" disabled={act.busy}>تحديث</button>
        </form>
      )}

      <div className="card form-card">
        <h3>الأحداث</h3>
        {d.events.length === 0 && <p className="muted">لا أحداث بعد.</p>}
        <ul className="plain-list">
          {d.events.map((e) => (
            <li key={e.id} className="between">
              <span><span className="num">{e.minute ?? '—'}′</span> {MATCH_EVENT_LABELS[e.type]} — {e.player?.name ?? 'بلا لاعب'} <span className="muted">({e.teamId === d.homeTeam.id ? d.homeTeam.nameAr : d.awayTeam.nameAr})</span></span>
              <ConfirmButton className="btn btn-sm btn-danger" confirm="حذف الحدث؟" disabled={act.busy} onClick={() => void act.run(async () => { await api(`/matches/${id}/events/${e.id}`, { method: 'DELETE' }); await m.reload(); }, 'حُذف الحدث.')}>حذف</ConfirmButton>
            </li>
          ))}
        </ul>
        <form className="grid-form" onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void act.run(async () => {
            await api(`/matches/${id}/events`, { body: { type: f.get('type'), teamId: Number(f.get('teamId')), minute: num(f.get('minute')), playerId: num(f.get('playerId')) } });
            await m.reload();
          }, 'أُضيف الحدث.');
        }}>
          <Field label="النوع"><select name="type">{MATCH_EVENT_TYPES.map((t) => <option key={t} value={t}>{MATCH_EVENT_LABELS[t]}</option>)}</select></Field>
          <Field label="الفريق"><select name="teamId" onChange={(e) => setTeamId(Number(e.target.value))}>
            <option value={d.homeTeam.id}>{d.homeTeam.nameAr}</option><option value={d.awayTeam.id}>{d.awayTeam.nameAr}</option>
          </select></Field>
          <Field label="اللاعب"><select name="playerId"><option value="">—</option>{players.map((p) => <option key={p.id} value={p.id}>{p.shirtNo ? `${p.shirtNo} · ` : ''}{p.name}</option>)}</select></Field>
          <Field label="الدقيقة"><input name="minute" type="number" min={0} max={150} inputMode="numeric" /></Field>
          <div className="row wide"><button className="btn btn-primary btn-sm" disabled={act.busy}>إضافة الحدث</button></div>
        </form>
      </div>
    </>
  );
}
