import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { MATCH_EVENT_LABELS, RESULT_STATUS_LABELS, STAGE_LABELS, TOURNAMENT_KIND_LABELS, type MatchEventType, type ResultStatus, type TournamentKind } from '@saha/shared';
import { apiGet } from '@/lib/api';
import { initial, kickoffDay, kickoffTime, scoreText } from '@/lib/format';
import { EmptyCard } from '@/components/cards';
import { PitchLines } from '@/components/mark';

export const dynamic = 'force-dynamic';

interface MatchDetail {
  id: number; stage: string; round: number | null; kickoffAt: string | null; venue: string | null;
  homeScore: number | null; awayScore: number | null; homePens: number | null; awayPens: number | null;
  resultStatus: ResultStatus; liveText: string | null; homeConfirmed: boolean; awayConfirmed: boolean;
  resultEnteredAt: string | null; finalizedAt: string | null; disputeDeadline: string | null; hasSheet: boolean;
  tournament: { id: number; nameAr: string; slug: string; kind: TournamentKind };
  homeTeam: { id: number; nameAr: string }; awayTeam: { id: number; nameAr: string };
  disputes: { id: number; status: string; decision: string | null }[];
  events: { id: number; type: MatchEventType; minute: number | null; teamId: number; player: { id: number; name: string } | null }[];
}

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const m = /^\d+$/.test(id) ? await apiGet<MatchDetail>(`/matches/${id}`) : null;
  return { title: m ? `${m.homeTeam.nameAr} × ${m.awayTeam.nameAr}` : 'المباراة' };
}

const STATUS_HELP: Record<ResultStatus, string> = {
  scheduled: 'لم تُدخل النتيجة بعد.',
  provisional: 'أدخلها الحكم، وتنتظر تأكيد مديري الفريقين أو انتهاء مهلة الاعتراض.',
  confirmed: 'أكّدها مديرا الفريقين، وتصبح نهائية بانتهاء المهلة.',
  disputed: 'عليها اعتراض أمام لجنة الانضباط، ولا تدخل الترتيب حتى تُحسم.',
  final: 'نتيجة نهائية محسوبة في الترتيب.',
};

const EVENT_ICON: Record<MatchEventType, string> = { goal: '⚽', own_goal: '⚽', yellow_card: '🟨', red_card: '🟥', mvp: '★' };

/** صفحة المباراة — بطاقة .card.live من المعاينة بعرض أكبر، والأحداث في بطاقة */
export default async function MatchPage({ params }: Props) {
  const { id } = await params;
  const m = /^\d+$/.test(id) ? await apiGet<MatchDetail>(`/matches/${id}`) : null;
  if (!m) notFound();
  const live = m.resultStatus === 'scheduled' && !!m.liveText;
  const stage = m.round ? `الجولة ${m.round}` : STAGE_LABELS[m.stage] ?? '';
  const deadline = m.disputeDeadline ? `${kickoffDay(m.disputeDeadline)} ${kickoffTime(m.disputeDeadline)}` : null;

  return (
    <>
      <section className="hero page">
        <PitchLines variant="hero" />
        <div className="wrap hero-in center">
          <nav className="crumbs" aria-label="مسار الصفحة">
            <a href="/tournaments">البطولات</a>
            <a href={`/tournaments/${m.tournament.slug}`}>{m.tournament.nameAr}</a>
          </nav>
          <article className="card live wide">
            <div className="between">
              <span className="muted">{[TOURNAMENT_KIND_LABELS[m.tournament.kind], stage].filter(Boolean).join(' · ')}</span>
              <span className={`badge ${live ? 'b-live' : `s-${m.resultStatus}`}`}>{live ? 'مباشر' : m.resultStatus === 'scheduled' ? RESULT_STATUS_LABELS.scheduled : `نتيجة ${RESULT_STATUS_LABELS[m.resultStatus]}`}</span>
            </div>
            <div className="vs">
              <a href={`/teams/${m.homeTeam.id}`} className="team plain"><span className="crest lg">{initial(m.homeTeam.nameAr)}</span><b>{m.homeTeam.nameAr}</b></a>
              <span className="num score-lg">{scoreText(m)}</span>
              <a href={`/teams/${m.awayTeam.id}`} className="team plain"><span className="crest lg">{initial(m.awayTeam.nameAr)}</span><b>{m.awayTeam.nameAr}</b></a>
            </div>
            {live && <p className="live-text">{m.liveText}</p>}
            {m.homePens !== null && m.awayPens !== null && <p className="live-text">ركلات الترجيح <span className="num">{m.homePens} – {m.awayPens}</span></p>}
            <div className="meta"><span>{kickoffDay(m.kickoffAt)}</span><span className="num">{kickoffTime(m.kickoffAt)}</span>{m.venue && <span>{m.venue}</span>}</div>
          </article>
        </div>
      </section>

      <section className="wrap sec split last">
        <div className="split-main">
          <h2>أحداث المباراة</h2>
          {m.events.length === 0 ? <EmptyCard>لا توجد أحداث مسجّلة بعد.</EmptyCard> : (
            <ol className="card events">
              {m.events.map((e) => (
                <li key={e.id} className={e.teamId === m.homeTeam.id ? 'home' : 'away'}>
                  <span className="num min">{e.minute !== null ? `${e.minute}′` : '—'}</span>
                  <span className="ev-ico" aria-hidden="true">{EVENT_ICON[e.type]}</span>
                  <span><b>{MATCH_EVENT_LABELS[e.type]}</b>{e.player && <> — {e.player.name}</>}<span className="muted"> · {e.teamId === m.homeTeam.id ? m.homeTeam.nameAr : m.awayTeam.nameAr}</span></span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="split-side">
          <h2>حالة النتيجة</h2>
          <div className="card info-list">
            <p><span className={`badge s-${m.resultStatus}`}>{RESULT_STATUS_LABELS[m.resultStatus]}</span> {STATUS_HELP[m.resultStatus]}</p>
            {m.resultStatus !== 'scheduled' && (
              <dl>
                <div><dt>{m.homeTeam.nameAr}</dt><dd>{m.homeConfirmed ? 'أكّد النتيجة' : 'لم يؤكد بعد'}</dd></div>
                <div><dt>{m.awayTeam.nameAr}</dt><dd>{m.awayConfirmed ? 'أكّد النتيجة' : 'لم يؤكد بعد'}</dd></div>
                {deadline && <div><dt>آخر موعد للاعتراض</dt><dd>{deadline}</dd></div>}
                <div><dt>ورقة المباراة</dt><dd>{m.hasSheet ? 'مرفوعة (تظهر لأطراف المباراة)' : 'غير مرفوعة'}</dd></div>
                {m.disputes.length > 0 && <div><dt>الاعتراضات</dt><dd>{m.disputes.length}</dd></div>}
              </dl>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
