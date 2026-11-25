/** «طريق التأهل» وأفضل اللاعبين في صفحة البطولة (الجلسة 12) — نفس بيانات شاشة التطبيق */
import { STAGE_LABELS } from '@saha/shared';
import type { BracketMatch, Road, Slot, StarLine, Stars, TeamRef } from '@/lib/api';
import { Crest, StandingsTable } from './cards';
import { Trophy } from './mark';

export function RoadTables({ road }: { road: Road }) {
  const gs = road.groupStage;
  return (
    <>
      {gs && !gs.finished && gs.total > 0 && (
        <div className="card stage-progress">
          <div className="between"><b>دور المجموعات</b><span className="num muted">{gs.played}/{gs.total} مباراة</span></div>
          <span className="progress"><i style={{ width: `${(gs.played / gs.total) * 100}%` }} /></span>
        </div>
      )}
      {road.groups.length ? (
        <>
          <p className="zone-legend"><i className="q" /> منطقة التأهل للدور التالي</p>
          {road.groups.map((g) => (
            <div key={g.label} className="stack">
              <div className="between"><h3>المجموعة {g.label}</h3>{g.qualifiers ? <span className="kind">{g.qualifiers === 1 ? 'يتأهل الأول' : `يتأهل أول ${g.qualifiers}`}</span> : null}</div>
              <StandingsTable rows={g.rows} full />
            </div>
          ))}
        </>
      ) : <StandingsTable rows={road.league} full />}
    </>
  );
}

export function Champion({ team }: { team: TeamRef }) {
  return (
    <div className="champion">
      <Trophy />
      <span className="muted-gold">بطل البطولة</span>
      <div className="row">
        <Crest team={team} size="lg" />
        {team.ownerPhotoUrl && <img className="owner-photo" src={team.ownerPhotoUrl} alt={team.ownerName ?? ''} />}
      </div>
      <b>{team.nameAr}</b>
      {team.ownerName && <small>{team.ownerName}</small>}
    </div>
  );
}

function SlotRow({ s, m, score, pens }: { s: Slot; m: BracketMatch; score: number | null; pens: number | null }) {
  const won = m.winnerId !== null && s.team?.id === m.winnerId;
  const lost = m.winnerId !== null && !won;
  return (
    <div className={`slot${won ? ' won' : ''}${lost ? ' lost' : ''}`}>
      {s.team ? <Crest team={s.team} size="sm" /> : <span className="crest sm empty" />}
      <span className="slot-name">
        <b className={s.team ? undefined : 'muted'}>{s.team?.nameAr ?? s.label ?? '—'}</b>
        {s.team && s.label && <small className="muted">{s.label}{s.projected ? ' · متوقع' : ''}</small>}
      </span>
      {score !== null && <span className="num">{score}{pens !== null ? ` (${pens})` : ''}</span>}
    </div>
  );
}

/** الشجرة: عمود لكل دور (الأول يميناً) والمباريات موزعة لتلتقي أزواجها في الدور التالي */
export function Bracket({ road }: { road: Road }) {
  const first = road.bracket[0]?.matches.length ?? 0;
  return (
    <div className="bracket scroll-x" style={{ '--rows': first } as React.CSSProperties}>
      {road.bracket.map((r) => (
        <div key={r.stage} className={`b-col${r.stage === 'final' ? ' final' : ''}`}>
          <span className="kind">{STAGE_LABELS[r.stage] ?? r.stage}</span>
          <div className="b-matches">
            {r.matches.map((m) => {
              const body = (
                <>
                  <SlotRow s={m.home} m={m} score={m.homeScore} pens={m.homePens} />
                  <SlotRow s={m.away} m={m} score={m.awayScore} pens={m.awayPens} />
                </>
              );
              return m.id ? <a key={m.slot} href={`/matches/${m.id}`} className="card b-match">{body}</a> : <div key={m.slot} className="card b-match">{body}</div>;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const goalsText = (n: number) => `${n} ${n === 1 ? 'هدف' : n === 2 ? 'هدفان' : 'أهداف'}`;

export function StarsBlock({ stars }: { stars: Stars }) {
  const top = stars.topScorers.slice(0, 3);
  const order = top.length === 3 ? [top[1], top[0], top[2]] : top.length === 2 ? [top[1], top[0]] : top;
  return (
    <>
      <div className="card podium-card">
        <h3>ترشيح أفضل هدّاف</h3>
        {order.length === 0 ? <p className="muted">لا أهداف محسوبة بعد.</p> : (
          <div className="podium">
            {order.map((l) => (
              <div key={l.player.id} className={`step r${Math.min(l.rank, 3)}`}>
                <span className="p-name"><b>{l.player.name}</b>{l.team && <small className="muted">{l.team.nameAr}</small>}</span>
                {l.team && <Crest team={l.team} />}
                <span className="block"><span className="num">{l.rank}</span><small>{goalsText(l.goals)}</small></span>
              </div>
            ))}
          </div>
        )}
      </div>
      <h3>قائمة أفضل اللاعبين</h3>
      <p className="muted small-note">الترتيب بعدد مرات «أفضل لاعب في المباراة» ثم الأهداف، من المباريات المعتمدة والنهائية.</p>
      <BestTable lines={stars.bestPlayers} />
    </>
  );
}

function BestTable({ lines }: { lines: StarLine[] }) {
  return (
    <div className="card flush scroll-x">
      <table className="table">
        <thead><tr><th>#</th><th>اللاعب</th><th>الفريق</th><th>أفضل لاعب</th><th>الأهداف</th><th>المباريات</th></tr></thead>
        <tbody>
          {lines.length === 0 && <tr><td colSpan={6} className="muted">لم يُختر أفضل لاعب في أي مباراة بعد.</td></tr>}
          {lines.map((l) => (
            <tr key={l.player.id} className={l.rank === 1 ? 'first' : undefined}>
              <td className="num">{l.rank}</td><td>{l.player.name}</td>
              <td className="muted">{l.team ? <a href={`/teams/${l.team.id}`} className="plain">{l.team.nameAr}</a> : '—'}</td>
              <td className="num pts">{l.mvp}</td><td className="num">{l.goals}</td><td className="num">{l.matches}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
