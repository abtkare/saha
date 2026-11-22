import { notFound } from 'next/navigation';
import { TOURNAMENT_KIND_LABELS, TOURNAMENT_STATUS_LABELS, RESULT_STATUS_LABELS, TIMEZONE, type TournamentKind, type TournamentStatus, type ResultStatus } from '@saha/shared';
import { apiGet } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface TournamentDetail {
  id: number; nameAr: string; kind: TournamentKind; status: TournamentStatus; city: string | null;
  community: { nameAr: string } | null;
  registrations: { team: { id: number; nameAr: string; verifiedAt: string | null } }[];
  matches: {
    id: number; kickoffAt: string | null; venue: string | null; homeScore: number | null; awayScore: number | null;
    resultStatus: ResultStatus; homeTeam: { nameAr: string }; awayTeam: { nameAr: string };
  }[];
}

const fmt = new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { timeZone: TIMEZONE, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default async function TournamentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await apiGet<TournamentDetail>(`/tournaments/${encodeURIComponent(slug)}`);
  if (!t) notFound();

  return (
    <>
      <span className={`badge k-${t.kind}`}>{TOURNAMENT_KIND_LABELS[t.kind]}</span>
      <h1 style={{ marginTop: 12 }}>{t.nameAr}</h1>
      <p className="muted">
        {TOURNAMENT_STATUS_LABELS[t.status]}{t.city ? ` · ${t.city}` : ''}{t.community ? ` · يستضيفها: ${t.community.nameAr}` : ''}
      </p>

      <div className="section-head"><h2>المباريات</h2></div>
      {t.matches.length === 0 ? (
        <div className="empty">لم يُعلن جدول المباريات بعد.</div>
      ) : (
        <div className="list">
          {t.matches.map((m) => (
            <div key={m.id} className="match">
              <span className="team">{m.homeTeam.nameAr}</span>
              <span className="score num">{m.homeScore ?? '-'} : {m.awayScore ?? '-'}</span>
              <span className="team away">{m.awayTeam.nameAr}</span>
              <div className="sub">
                <span>{m.kickoffAt ? fmt.format(new Date(m.kickoffAt)) : 'الموعد لاحقاً'}{m.venue ? ` · ${m.venue}` : ''}</span>
                <span className={`badge s-${m.resultStatus}`}>{RESULT_STATUS_LABELS[m.resultStatus]}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="section-head"><h2>الفرق</h2></div>
      {t.registrations.length === 0 ? (
        <div className="empty">التسجيل مفتوح — لم تُعتمد فرق بعد.</div>
      ) : (
        <div className="grid">
          {t.registrations.map(({ team }) => (
            <div key={team.id} className="card">
              <h3>{team.nameAr}</h3>
              {team.verifiedAt && <span className="badge">موثّق</span>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
