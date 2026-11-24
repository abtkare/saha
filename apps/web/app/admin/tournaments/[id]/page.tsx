'use client';
import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { RESULT_STATUS_LABELS, STAGE_LABELS, TOURNAMENT_FORMAT_LABELS, TOURNAMENT_KIND_LABELS, TOURNAMENT_STATUS_LABELS, type TournamentStatus } from '@saha/shared';
import { useSession } from '@/components/auth';
import { ConfirmButton, Field, Loading, Note, PageHead, isoToLocal, localToIso, num, text, useAction, useLoad, when } from '@/components/admin/kit';
import type { AdminTournament, AdminUser, Fixtures, Registration } from '@/components/admin/types';
import { api } from '@/lib/client';

const NEXT: Record<TournamentStatus, [TournamentStatus, string][]> = {
  draft: [['registration', 'افتح التسجيل']],
  registration: [['running', 'ابدأ البطولة'], ['draft', 'أعدها مسودة']],
  running: [['finished', 'أنهِ البطولة']],
  finished: [],
  cancelled: [],
};
const REG_LABELS = { pending: 'بانتظار القرار', approved: 'معتمد', rejected: 'مرفوض', withdrawn: 'منسحب' } as const;
const REG_BADGE = { pending: 's-provisional', approved: 's-confirmed', rejected: 's-disputed', withdrawn: 's-final' } as const;
const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export default function AdminTournament() {
  const { id } = useParams<{ id: string }>();
  const s = useSession();
  const all = useLoad<AdminTournament[]>('/admin/tournaments');
  const regs = useLoad<Registration[]>(`/tournaments/${id}/registrations`);
  const fx = useLoad<Fixtures>(`/tournaments/${id}/fixtures`);
  const refs = useLoad<AdminUser[]>(s.can('users.manage') ? '/admin/users' : null);
  const act = useAction();
  const t = all.data?.find((x) => String(x.id) === id) ?? null;
  const referees = useMemo(() => (refs.data ?? []).filter((u) => u.roles.some((r) => r.role === 'referee' && (r.tournamentId === null || String(r.tournamentId) === id))), [refs.data, id]);

  const refresh = () => Promise.all([all.reload(), regs.reload(), fx.reload()]);
  const post = (path: string, body: unknown, msg: string, method = 'POST') => act.run(async () => { await api(path, { method, body }); await refresh(); }, msg);

  if (!t) return <><PageHead title="البطولة" /><Loading error={all.error || (all.data ? 'البطولة غير موجودة أو خارج صلاحيتك.' : '')} loading={all.loading} /></>;

  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void post(`/tournaments/${id}`, {
      nameAr: text(f.get('nameAr')), city: text(f.get('city')) ?? null, startsOn: text(f.get('startsOn')), endsOn: text(f.get('endsOn')),
      maxTeams: num(f.get('maxTeams')), entryFeeIqd: num(f.get('entryFeeIqd')), disputeWindowHrs: num(f.get('disputeWindowHrs')),
    }, 'حُفظت البيانات.', 'PATCH');
  }

  function schedule(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void post(`/tournaments/${id}/schedule`, {
      startDate: text(f.get('startDate')),
      weekdays: f.getAll('weekdays').map(Number),
      times: String(f.get('times') ?? '').split(/[،,\s]+/).filter(Boolean),
      venues: String(f.get('venues') ?? '').split('\n').map((v) => v.trim()).filter(Boolean),
      restDays: num(f.get('restDays')), fromRound: num(f.get('fromRound')),
    }, 'جُدولت المباريات.');
  }

  const matches = fx.data?.matches ?? [];
  return (
    <>
      <PageHead title={t.nameAr} text={`${TOURNAMENT_KIND_LABELS[t.kind]} · ${TOURNAMENT_FORMAT_LABELS[t.format]} · ${TOURNAMENT_STATUS_LABELS[t.status]}`}>
        {t.status !== 'draft' && <a className="btn btn-sm" href={`/tournaments/${t.slug}`} target="_blank" rel="noopener">الصفحة العامة</a>}
        {NEXT[t.status].map(([to, label]) => (
          <ConfirmButton key={to} className="btn btn-sm btn-primary" disabled={act.busy} confirm={`${label}؟`} onClick={() => void post(`/tournaments/${id}/status`, { status: to }, 'تغيّرت الحالة.')}>{label}</ConfirmButton>
        ))}
        {t.status !== 'finished' && t.status !== 'cancelled' && (
          <ConfirmButton className="btn btn-sm btn-danger" disabled={act.busy} confirm="إلغاء البطولة نهائياً؟" onClick={() => void post(`/tournaments/${id}/status`, { status: 'cancelled' }, 'أُلغيت البطولة.')}>إلغاء</ConfirmButton>
        )}
      </PageHead>
      <Note note={act.note} />

      <details className="card panel">
        <summary>بيانات البطولة</summary>
        <form className="grid-form" onSubmit={save}>
          <Field label="الاسم" wide><input name="nameAr" defaultValue={t.nameAr} minLength={3} maxLength={80} /></Field>
          <Field label="المدينة"><input name="city" defaultValue={t.city ?? ''} maxLength={40} /></Field>
          <Field label="تاريخ البداية"><input name="startsOn" type="date" defaultValue={t.startsOn?.slice(0, 10) ?? ''} /></Field>
          <Field label="تاريخ النهاية"><input name="endsOn" type="date" defaultValue={t.endsOn?.slice(0, 10) ?? ''} /></Field>
          <Field label="الحد الأعلى للفرق"><input name="maxTeams" type="number" min={2} max={64} defaultValue={t.maxTeams ?? ''} /></Field>
          <Field label="رسوم الاشتراك (دينار)"><input name="entryFeeIqd" type="number" min={0} defaultValue={t.entryFeeIqd} /></Field>
          <Field label="نافذة الاعتراض (ساعات)"><input name="disputeWindowHrs" type="number" min={1} max={168} defaultValue={t.disputeWindowHrs} /></Field>
          <div className="row wide"><button className="btn btn-primary" disabled={act.busy}>حفظ</button></div>
        </form>
      </details>

      <section className="admin-sec">
        <h2 className="admin-h2">الفرق المسجّلة</h2>
        <Loading error={regs.error} loading={regs.loading} />
        <div className="card flush scroll-x">
          <table className="table admin-table">
            <thead><tr><th>الفريق</th><th>المدينة</th><th>اللاعبون</th><th>الحالة</th><th>المدفوع</th><th>إجراء</th></tr></thead>
            <tbody>
              {(regs.data ?? []).length === 0 && <tr><td colSpan={6} className="muted">لا تسجيلات بعد.</td></tr>}
              {(regs.data ?? []).map((r) => (
                <tr key={r.id}>
                  <td><a href={`/teams/${r.team.id}`} target="_blank" rel="noopener">{r.team.nameAr}</a>{r.team.verifiedAt && ' ✓'}{r.groupLabel && <span className="muted"> · {r.groupLabel}</span>}</td>
                  <td>{r.team.city ?? '—'}</td>
                  <td className="num">{r.team._count.players}</td>
                  <td><span className={`badge ${REG_BADGE[r.status]}`}>{REG_LABELS[r.status]}</span></td>
                  <td>
                    {r.status === 'approved' || r.status === 'pending' ? (
                      <form className="inline-form" onSubmit={(e) => { e.preventDefault(); const v = num(new FormData(e.currentTarget).get('fee')); void post(`/tournaments/${id}/registrations/${r.id}/fee`, { feePaidIqd: v ?? 0 }, 'سُجّل المبلغ.', 'PATCH'); }}>
                        <input name="fee" type="number" min={0} defaultValue={r.feePaidIqd ?? 0} aria-label="المبلغ المدفوع" />
                        <button className="btn btn-sm">حفظ</button>
                      </form>
                    ) : <span className="num">{r.feePaidIqd ?? 0}</span>}
                  </td>
                  <td className="row">
                    {r.status === 'pending' && <>
                      <button type="button" className="btn btn-sm btn-primary" disabled={act.busy} onClick={() => void post(`/tournaments/${id}/registrations/${r.id}/decision`, { approve: true }, 'اعتُمد الفريق.')}>اعتماد</button>
                      <ConfirmButton className="btn btn-sm btn-danger" disabled={act.busy} confirm="رفض تسجيل الفريق؟" onClick={() => void post(`/tournaments/${id}/registrations/${r.id}/decision`, { approve: false }, 'رُفض التسجيل.')}>رفض</ConfirmButton>
                    </>}
                    {(r.status === 'approved' || r.status === 'pending') && !t.drawnAt && (
                      <ConfirmButton className="btn btn-sm" disabled={act.busy} confirm="سحب الفريق من البطولة؟" onClick={() => void post(`/tournaments/${id}/registrations/${r.id}/withdraw`, {}, 'سُحب الفريق.')}>سحب</ConfirmButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-sec">
        <h2 className="admin-h2">القرعة والجدولة</h2>
        <div className="grid g300">
          <div className="card form-card">
            <h3>القرعة</h3>
            <p className="muted">{t.drawnAt ? `أُجريت ${when(t.drawnAt)}. البذرة محفوظة ويمكن لأي شخص التحقق منها من الصفحة العامة.` : 'تُجرى بعد اعتماد الفرق. تُعاد فقط إن لم تُسجَّل أي نتيجة.'}</p>
            {fx.data?.groups.map((g) => <p key={g.label}><b>المجموعة {g.label}:</b> {g.teams.map((x) => x.nameAr).join('، ')}</p>)}
            <ConfirmButton className="btn btn-primary" disabled={act.busy} confirm={t.drawnAt ? 'إعادة القرعة تحذف المباريات الحالية. متابعة؟' : 'إجراء القرعة الآن؟'} onClick={() => void post(`/tournaments/${id}/draw`, {}, 'تمت القرعة.')}>{t.drawnAt ? 'إعادة القرعة' : 'إجراء القرعة'}</ConfirmButton>
            {t.format !== 'league' && t.drawnAt && (
              <ConfirmButton className="btn" disabled={act.busy} confirm="توليد الدور التالي من النتائج المعتمدة؟" onClick={() => void post(`/tournaments/${id}/next-round`, {}, 'وُلّد الدور التالي.')}>الدور التالي</ConfirmButton>
            )}
          </div>
          <form className="card form-card" onSubmit={schedule}>
            <h3>الجدولة التلقائية</h3>
            <Field label="تاريخ أول مباراة"><input name="startDate" type="date" required /></Field>
            <fieldset className="days"><legend>أيام اللعب</legend>
              {DAYS.map((d, i) => <label key={d} className="check"><input type="checkbox" name="weekdays" value={i} defaultChecked={i === 5 || i === 6} /> {d}</label>)}
            </fieldset>
            <Field label="أوقات الانطلاق" hint="مثل: 16:00، 18:00"><input name="times" defaultValue="16:00، 18:00" dir="ltr" required /></Field>
            <Field label="الملاعب" hint="ملعب في كل سطر"><textarea name="venues" rows={2} required /></Field>
            <Field label="أيام راحة بين الجولات"><input name="restDays" type="number" min={0} max={30} defaultValue={0} /></Field>
            <Field label="من الجولة" hint="لجدولة دور جديد وحده"><input name="fromRound" type="number" min={1} defaultValue={1} /></Field>
            <button className="btn btn-primary" disabled={act.busy}>جدولة المباريات</button>
          </form>
        </div>
      </section>

      <section className="admin-sec">
        <h2 className="admin-h2">المباريات</h2>
        <Loading error={fx.error} loading={fx.loading} />
        {matches.length === 0 && !fx.loading && <p className="muted">لا مباريات قبل القرعة.</p>}
        <div className="stack">
          {matches.map((m) => (
            <details key={m.id} className="card panel">
              <summary>
                <span className="muted">{m.round ? `ج${m.round}` : STAGE_LABELS[m.stage] ?? ''}</span>
                <b>{m.homeTeam.nameAr} × {m.awayTeam.nameAr}</b>
                {m.homeScore !== null && <span className="num">{m.homeScore} – {m.awayScore}</span>}
                <span className={`badge s-${m.resultStatus}`}>{RESULT_STATUS_LABELS[m.resultStatus]}</span>
                <span className="muted">{when(m.kickoffAt)}{m.venue ? ` · ${m.venue}` : ''}{m.referee ? ` · الحكم: ${m.referee.fullName}` : ''}</span>
              </summary>
              <form className="grid-form" onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const ref = text(f.get('refereeId'));
                void post(`/matches/${m.id}`, {
                  ...(m.resultStatus === 'scheduled' && text(f.get('kickoffAt')) ? { kickoffAt: localToIso(String(f.get('kickoffAt'))) } : {}),
                  venue: text(f.get('venue')) ?? null,
                  ...(ref !== undefined ? { refereeId: ref === '0' ? null : Number(ref) } : {}),
                }, 'حُفظت المباراة.', 'PATCH');
              }}>
                <Field label="الموعد (بغداد)"><input name="kickoffAt" type="datetime-local" defaultValue={isoToLocal(m.kickoffAt)} disabled={m.resultStatus !== 'scheduled'} /></Field>
                <Field label="الملعب"><input name="venue" defaultValue={m.venue ?? ''} maxLength={80} /></Field>
                {refs.data ? (
                  <Field label="الحكم"><select name="refereeId" defaultValue={m.referee?.id ?? ''}>
                    <option value="">— بلا تغيير —</option><option value="0">بلا حكم</option>
                    {referees.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                  </select></Field>
                ) : (
                  <Field label="رقم الحكم" hint="معرّف المستخدم"><input name="refereeId" type="number" min={0} defaultValue={m.referee?.id ?? ''} /></Field>
                )}
                <div className="row wide"><button className="btn btn-primary btn-sm" disabled={act.busy}>حفظ</button><a className="btn btn-sm" href={`/admin/matches/${m.id}`}>النتيجة والأحداث</a></div>
              </form>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
