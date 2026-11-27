import { RESULT_STATUS_LABELS, TOURNAMENT_KIND_LABELS, TOURNAMENT_FORMAT_LABELS } from '@saha/shared';
import type { MatchItem, StandingRow, TeamRef, TournamentSummary, NewsItem, Zone } from '@/lib/api';
import { initial, kickoffDay, kickoffTime, relativeTime, scoreText, signed, tournamentProgress } from '@/lib/format';
import { Mark, Trophy } from './mark';

/** بطاقة المباراة — .card.match من المعاينة */
export function MatchCard({ m, tournamentName, withDay = false }: { m: MatchItem; tournamentName?: string; withDay?: boolean }) {
  const href = `/matches/${m.id}`;
  const body = (
    <>
      <div className="between">
        <span className="muted">{tournamentName ?? m.tournament?.nameAr}</span>
        <span className={`badge s-${m.resultStatus}`}>{RESULT_STATUS_LABELS[m.resultStatus]}</span>
      </div>
      <div className="vs"><b>{m.homeTeam.nameAr}</b><span className="num score">{scoreText(m)}</span><b>{m.awayTeam.nameAr}</b></div>
      <div className="meta">{withDay && <span>{kickoffDay(m.kickoffAt)}</span>}<span className="num">{kickoffTime(m.kickoffAt)}</span>{m.venue && <span>{m.venue}</span>}</div>
    </>
  );
  return <a href={href} className="card match">{body}</a>;
}

/** بطاقة «مباراة اليوم» في الهيرو — .card.live من المعاينة */
export function LiveCard({ m, label }: { m: MatchItem; label: string }) {
  const status = m.resultStatus === 'scheduled' ? RESULT_STATUS_LABELS.scheduled : `نتيجة ${RESULT_STATUS_LABELS[m.resultStatus]}`;
  return (
    <article className="card live">
      <div className="between"><span className="muted">{label} · {m.tournament?.nameAr}</span><span className={`badge s-${m.resultStatus}`}>{status}</span></div>
      <div className="vs">
        <div className="team"><Crest team={m.homeTeam} size="lg" /><b>{m.homeTeam.nameAr}</b></div>
        <span className="num score-lg">{scoreText(m)}</span>
        <div className="team"><Crest team={m.awayTeam} size="lg" /><b>{m.awayTeam.nameAr}</b></div>
      </div>
      <div className="meta">{m.venue && <span>{m.venue}</span>}<span className="num">{kickoffTime(m.kickoffAt)}</span></div>
      <a href={`/matches/${m.id}`} className="more">تفاصيل المباراة</a>
    </article>
  );
}

/** بطاقة البطولة — .card.tour من المعاينة */
export function TourCard({ t }: { t: TournamentSummary }) {
  const { pct, label } = tournamentProgress(t);
  const teams = t.status === 'registration' && t.maxTeams ? t.maxTeams : t._count.registrations;
  return (
    <a href={`/tournaments/${t.slug}`} className="card tour">
      <span className="ico"><Trophy /></span>
      <span className="kind">{TOURNAMENT_KIND_LABELS[t.kind]}</span>
      <h3>{t.nameAr}</h3>
      <span className="muted">{[t.city, `${teams} فرق`, TOURNAMENT_FORMAT_LABELS[t.format]].filter(Boolean).join(' · ')}</span>
      <span className="progress"><i style={{ width: `${pct}%` }} /></span>
      <span className="muted">{label}</span>
    </a>
  );
}

/** شعار الفريق: صورته إن رفعها منشئ الفريق، وإلا الحرف الأول (.crest) */
export function Crest({ team, size }: { team: TeamRef; size?: 'sm' | 'lg' | 'xl' }) {
  const cls = `crest${size ? ` ${size}` : ''}`;
  return team.logoUrl
    ? <span className={`${cls} has-img`}><img src={team.logoUrl} alt={`شعار ${team.nameAr}`} loading="lazy" /></span>
    : <span className={cls}>{initial(team.nameAr)}</span>;
}

/** الفريق في صف الجدول: الشعار وعليه صورة صاحب الفريق/المؤثر بحد ذهبي، ثم الاسم واسم صاحبه */
export function TeamCell({ team }: { team: TeamRef }) {
  return (
    <a href={`/teams/${team.id}`} className="plain team-cell">
      <span className="crest-wrap">
        <Crest team={team} size="sm" />
        {team.ownerPhotoUrl && <img className="owner-badge" src={team.ownerPhotoUrl} alt={team.ownerName ? `صورة ${team.ownerName}` : ''} loading="lazy" />}
      </span>
      <span className="team-cell-name"><b>{team.nameAr}</b>{team.ownerName && <small className="muted">{team.ownerName}</small>}</span>
    </a>
  );
}

/** جدول الترتيب — .table من المعاينة. full = كل الأعمدة (صفحة البطولة). zone: منطقة التأهل (الجلسة 12) */
export function StandingsTable({ rows, full = false }: { rows: (StandingRow & { zone?: Zone })[]; full?: boolean }) {
  return (
    <div className="card flush scroll-x">
      <table className="table">
        <thead>
          <tr>
            <th>#</th><th>الفريق</th><th>لعب</th>
            {full && <><th>فاز</th><th>تعادل</th><th>خسر</th></>}
            <th>الفارق</th><th>النقاط</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={full ? 8 : 5} className="muted">لم تُعتمد فرق بعد.</td></tr>}
          {rows.map((r, i) => {
            const zone = r.zone !== undefined ? r.zone : i === 0 && r.points > 0 ? 'leader' : null;
            return (
              <tr key={r.team.id} className={zone === 'leader' ? 'first' : zone === 'qualify' ? 'qualify' : undefined}>
                <td className="num">{r.position}</td>
                <td><TeamCell team={r.team} /></td>
                <td className="num">{r.played}</td>
                {full && <><td className="num">{r.won}</td><td className="num">{r.drawn}</td><td className="num">{r.lost}</td></>}
                <td className="num">{signed(r.goalDiff)}</td>
                <td className="num pts">{r.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** بطاقة الخبر — .card.news من المعاينة */
export function NewsCard({ n }: { n: NewsItem }) {
  return (
    <a href={`/news/${n.slug}`} className="card news">
      <span className="thumb">{n.coverUrl ? <img src={n.coverUrl} alt="" /> : <Mark size={64} />}</span>
      <span className="body"><b>{n.titleAr}</b><span className="muted">{relativeTime(n.publishedAt)}</span></span>
    </a>
  );
}

export function EmptyCard({ children }: { children: React.ReactNode }) {
  return <div className="card empty-card">{children}</div>;
}
