'use client';
import { RESULT_STATUS_LABELS } from '@saha/shared';
import { useSession } from '@/components/auth';
import { Loading, PageHead, useLoad, when } from '@/components/admin/kit';
import type { ResultView } from '@/components/admin/types';

/** مباريات الحكم: التي تنتظر نتيجته أو ما زالت مؤقتة (من GET /me/matches) */
export default function AdminMatches() {
  const s = useSession();
  const mine = useLoad<{ refereeing: ResultView[] }>('/me/matches');
  return (
    <>
      <PageHead title="المباريات والنتائج" text="أدخل النتيجة بعد صافرة النهاية مع صورة ورقة المباراة، وسجّل الأهداف والبطاقات." />
      {s.canSome('tournaments.manage') && <p className="muted">مدير البطولة: افتح البطولة من قسم «البطولات» ثم اضغط «النتيجة والأحداث» عند أي مباراة.</p>}
      <h2 className="admin-h2">مبارياتي كحكم</h2>
      <Loading error={mine.error} loading={mine.loading} />
      <div className="grid g300">
        {mine.data?.refereeing.length === 0 && <div className="card empty-card">لا مباريات معيّنة لك الآن.</div>}
        {mine.data?.refereeing.map((m) => (
          <a key={m.id} href={`/admin/matches/${m.id}`} className="card match">
            <div className="between"><span className="muted">{m.tournament.nameAr}</span><span className={`badge s-${m.resultStatus}`}>{RESULT_STATUS_LABELS[m.resultStatus]}</span></div>
            <div className="vs"><b>{m.homeTeam.nameAr}</b><span className="num score">{m.homeScore === null ? '– : –' : `${m.homeScore} – ${m.awayScore}`}</span><b>{m.awayTeam.nameAr}</b></div>
            <div className="meta"><span>{when(m.kickoffAt)}</span>{m.venue && <span>{m.venue}</span>}</div>
          </a>
        ))}
      </div>
    </>
  );
}
