import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { MATCH_EVENT_LABELS, RESULT_STATUS_LABELS, STAGE_LABELS, TOURNAMENT_KIND_LABELS, type MatchEventType, type ResultStatus, type TournamentKind } from '@saha/shared';
import { apiGet, type TeamRef } from '@/lib/api';
import { kickoffDay, kickoffTime, scoreText } from '@/lib/format';
import { Crest, EmptyCard } from '@/components/cards';
import { PitchLines } from '@/components/mark';

export const dynamic = 'force-dynamic';

interface MatchDetail {
  id: number; stage: string; round: number | null; kickoffAt: string | null; venue: string | null;
  homeScore: number | null; awayScore: number | null; homePens: number | null; awayPens: number | null;
  resultStatus: ResultStatus; liveText: string | null; homeConfirmed: boolean; awayConfirmed: boolean;
  resultEnteredAt: string | null; finalizedAt: string | null; disputeDeadline: string | null; hasSheet: boolean;
  tournament: { id: number; nameAr: string; slug: string; kind: TournamentKind };
  homeTeam: TeamRef; awayTeam: TeamRef;
  disputes: { id: number; status: string; decision: string | null }[];
  events: { id: number; type: MatchEventType; minute: number | null; teamId: number; player: { id: number; name: string } | null }[];
}

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const m = /^\d+$/.test(id) ? await apiGet<MatchDetail>(`/matches/${id}`) : null;
  return { title: m ? `${m.homeTeam.nameAr} ${scoreText(m)} ${m.awayTeam.nameAr}` : 'المباراة' };
}

const STATUS_HELP: Record<ResultStatus, string> = {
  scheduled: 'لم تُدخل النتيجة بعد.',
  provisional: 'أدخلها الحكم، وتنتظر تأكيد مديري الفريقين أو انتهاء مهلة الاعتراض.',
  confirmed: 'أكّدها مديرا الفريقين، وتصبح نهائية بانتهاء المهلة.',
  disputed: 'عليها اعتراض أمام لجنة الانضباط، ولا تدخل الترتيب حتى تُحسم.',
  final: 'نتيجة نهائية محسوبة في الترتيب.',
};

/** رمز الحدث: كرة، بطاقة صفراء/حمراء مرسومة، أو نجمة لأفضل لاعب */
function EvIcon({ type }: { type: MatchEventType }) {
  if (type === 'yellow_card' || type === 'red_card') return <span className={`ev-card ${type === 'red_card' ? 'red' : 'yellow'}`} aria-hidden="true" />;
  if (type === 'mvp') return <svg className="ev-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill="#F2B705" /></svg>;
  return (
    <svg className={`ev-svg${type === 'own_goal' ? ' og' : ''}`} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="#fff" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7.5l3.6 2.6-1.4 4.2H9.8l-1.4-4.2z" fill="currentColor" />
    </svg>
  );
}

const minute = (m: number | null) => (m !== null ? `${m}′` : '');

/** صفحة المباراة: لوحة نتيجة بشعارات الفريقين والهدافين، مجريات على خط زمني بجهتين، مقارنة إحصائية، وحالة النتيجة */
export default async function MatchPage({ params }: Props) {
  const { id } = await params;
  const m = /^\d+$/.test(id) ? await apiGet<MatchDetail>(`/matches/${id}`) : null;
  if (!m) notFound();
  const live = m.resultStatus === 'scheduled' && !!m.liveText;
  const stage = m.round ? `الجولة ${m.round}` : STAGE_LABELS[m.stage] ?? '';
  const deadline = m.disputeDeadline ? `${kickoffDay(m.disputeDeadline)} ${kickoffTime(m.disputeDeadline)}` : null;
  const status = live ? 'مباشر' : m.resultStatus === 'scheduled' ? RESULT_STATUS_LABELS.scheduled : `نتيجة ${RESULT_STATUS_LABELS[m.resultStatus]}`;

  const events = [...m.events].sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999) || a.id - b.id);
  const side = (teamId: number) => (teamId === m.homeTeam.id ? 'home' : 'away');
  // هدف عكسي يُحسب للخصم في قائمة الهدافين
  const scorers = (s: 'home' | 'away') => events.filter((e) => (e.type === 'goal' && side(e.teamId) === s) || (e.type === 'own_goal' && side(e.teamId) !== s));
  const count = (s: 'home' | 'away', t: MatchEventType) => events.filter((e) => e.type === t && side(e.teamId) === s).length;
  const stats: [string, number, number][] = [
    ['الأهداف', m.homeScore ?? scorers('home').length, m.awayScore ?? scorers('away').length],
    ['البطاقات الصفراء', count('home', 'yellow_card'), count('away', 'yellow_card')],
    ['البطاقات الحمراء', count('home', 'red_card'), count('away', 'red_card')],
  ];
  const mvp = events.find((e) => e.type === 'mvp');

  const ScorerList = ({ s }: { s: 'home' | 'away' }) => {
    const list = scorers(s);
    if (!list.length) return null;
    return (
      <ul className="sb-scorers">
        {list.map((e) => <li key={e.id}>{e.player?.name ?? 'هدف'}{e.type === 'own_goal' && ' (عكسي)'} <span className="num">{minute(e.minute)}</span></li>)}
      </ul>
    );
  };

  return (
    <>
      <section className="hero page match-hero">
        <PitchLines variant="hero" />
        <div className="wrap hero-in center">
          <nav className="crumbs" aria-label="مسار الصفحة">
            <a href="/tournaments">البطولات</a>
            <a href={`/tournaments/${m.tournament.slug}`}>{m.tournament.nameAr}</a>
          </nav>
          <article className="scoreboard" aria-label={`${m.homeTeam.nameAr} ${scoreText(m)} ${m.awayTeam.nameAr}`}>
            <div className="sb-top">
              <span>{[TOURNAMENT_KIND_LABELS[m.tournament.kind], stage].filter(Boolean).join(' · ')}</span>
              <span className={`badge ${live ? 'b-live' : `s-${m.resultStatus}`}`}>{status}</span>
            </div>
            <div className="sb-main">
              <a href={`/teams/${m.homeTeam.id}`} className="sb-team plain">
                <Crest team={m.homeTeam} size="xl" />
                <b>{m.homeTeam.nameAr}</b>
                {m.homeTeam.ownerName && <span className="sb-owner">{m.homeTeam.ownerName}</span>}
                {m.resultStatus !== 'scheduled' && m.homeConfirmed && <span className="sb-ok">أكّد النتيجة</span>}
              </a>
              <div className="sb-score">
                <span className="num">{m.homeScore ?? '–'}</span>
                <span className="sb-sep" aria-hidden="true">:</span>
                <span className="num">{m.awayScore ?? '–'}</span>
                {m.homePens !== null && m.awayPens !== null && <span className="sb-pens">ركلات الترجيح <b className="num">{m.homePens} – {m.awayPens}</b></span>}
              </div>
              <a href={`/teams/${m.awayTeam.id}`} className="sb-team plain">
                <Crest team={m.awayTeam} size="xl" />
                <b>{m.awayTeam.nameAr}</b>
                {m.awayTeam.ownerName && <span className="sb-owner">{m.awayTeam.ownerName}</span>}
                {m.resultStatus !== 'scheduled' && m.awayConfirmed && <span className="sb-ok">أكّد النتيجة</span>}
              </a>
            </div>
            <div className="sb-scorers-row">
              <ScorerList s="home" />
              <ScorerList s="away" />
            </div>
            {live && <p className="live-text">{m.liveText}</p>}
            <div className="sb-meta">
              <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v14H4zM4 10h16M9 3v5M15 3v5" /></svg>{kickoffDay(m.kickoffAt) || 'الموعد لاحقاً'}</span>
              {m.kickoffAt && <span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg><span className="num">{kickoffTime(m.kickoffAt)}</span></span>}
              {m.venue && <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>{m.venue}</span>}
            </div>
          </article>
        </div>
      </section>

      <section className="wrap sec split last">
        <div className="split-main">
          <h2>مجريات المباراة</h2>
          {events.length === 0 ? <EmptyCard>لا توجد أحداث مسجّلة بعد.</EmptyCard> : (
            <ol className="card timeline">
              <li className="tl-head" aria-hidden="true">
                <span className="tl-team"><Crest team={m.homeTeam} size="sm" />{m.homeTeam.nameAr}</span>
                <span />
                <span className="tl-team away"><Crest team={m.awayTeam} size="sm" />{m.awayTeam.nameAr}</span>
              </li>
              {events.map((e) => {
                const s = side(e.teamId);
                const body = (
                  <span className="tl-ev">
                    <EvIcon type={e.type} />
                    <span><b>{e.player?.name ?? MATCH_EVENT_LABELS[e.type]}</b><small>{MATCH_EVENT_LABELS[e.type]}</small></span>
                  </span>
                );
                return (
                  <li key={e.id} className={`tl-row ${s}`} aria-label={`${minute(e.minute)} ${MATCH_EVENT_LABELS[e.type]}${e.player ? ` — ${e.player.name}` : ''} · ${s === 'home' ? m.homeTeam.nameAr : m.awayTeam.nameAr}`}>
                    <span className="tl-side">{s === 'home' && body}</span>
                    <span className="tl-min num">{minute(e.minute) || '—'}</span>
                    <span className="tl-side away">{s === 'away' && body}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
        <div className="split-side">
          <h2>إحصائيات</h2>
          <div className="card stat-compare">
            <div className="sc-head"><Crest team={m.homeTeam} size="sm" /><span className="muted">مقارنة</span><Crest team={m.awayTeam} size="sm" /></div>
            {stats.map(([label, h, a]) => {
              const total = h + a || 1;
              return (
                <div key={label} className="sc-row">
                  <div className="between"><b className="num">{h}</b><span>{label}</span><b className="num">{a}</b></div>
                  <div className="sc-bars" aria-hidden="true"><i className="h" style={{ width: `${(h / total) * 100}%` }} /><i className="a" style={{ width: `${(a / total) * 100}%` }} /></div>
                </div>
              );
            })}
            {mvp && <p className="sc-mvp"><EvIcon type="mvp" /> أفضل لاعب: <b>{mvp.player?.name ?? '—'}</b> <span className="muted">· {side(mvp.teamId) === 'home' ? m.homeTeam.nameAr : m.awayTeam.nameAr}</span></p>}
          </div>

          <h2>حالة النتيجة</h2>
          <div className="card info-list">
            <p><span className={`badge s-${m.resultStatus}`}>{RESULT_STATUS_LABELS[m.resultStatus]}</span> {STATUS_HELP[m.resultStatus]}</p>
            <dl>
              <div><dt>البطولة</dt><dd><a href={`/tournaments/${m.tournament.slug}`}>{m.tournament.nameAr}</a></dd></div>
              {stage && <div><dt>المرحلة</dt><dd>{stage}</dd></div>}
              {m.resultStatus !== 'scheduled' && <>
                <div><dt>{m.homeTeam.nameAr}</dt><dd>{m.homeConfirmed ? 'أكّد النتيجة' : 'لم يؤكد بعد'}</dd></div>
                <div><dt>{m.awayTeam.nameAr}</dt><dd>{m.awayConfirmed ? 'أكّد النتيجة' : 'لم يؤكد بعد'}</dd></div>
                {deadline && <div><dt>آخر موعد للاعتراض</dt><dd>{deadline}</dd></div>}
                <div><dt>ورقة المباراة</dt><dd>{m.hasSheet ? 'مرفوعة (تظهر لأطراف المباراة)' : 'غير مرفوعة'}</dd></div>
                {m.disputes.length > 0 && <div><dt>الاعتراضات</dt><dd>{m.disputes.length}</dd></div>}
              </>}
            </dl>
          </div>
        </div>
      </section>
    </>
  );
}
