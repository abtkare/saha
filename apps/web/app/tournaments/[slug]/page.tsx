import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  TOURNAMENT_KIND_LABELS, TOURNAMENT_STATUS_LABELS, TOURNAMENT_FORMAT_LABELS, AGE_CATEGORY_LABELS,
  type TournamentKind, type TournamentStatus, type TournamentFormat, type AgeCategory,
} from '@saha/shared';
import { apiGet, type MatchItem, type Standings } from '@/lib/api';
import { initial, shortDate } from '@/lib/format';
import { EmptyCard, MatchCard, StandingsTable } from '@/components/cards';
import { PitchLines } from '@/components/mark';
import { AppBand } from '@/components/app-band';

export const dynamic = 'force-dynamic';

interface TournamentDetail {
  id: number; nameAr: string; slug: string; kind: TournamentKind; status: TournamentStatus; city: string | null;
  format: TournamentFormat; ageCategory: AgeCategory; startsOn: string | null; endsOn: string | null;
  community: { nameAr: string } | null;
  registrations: { team: { id: number; nameAr: string; verifiedAt: string | null } }[];
  matches: MatchItem[];
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const t = await apiGet<TournamentDetail>(`/tournaments/${encodeURIComponent(slug)}`);
  return { title: t?.nameAr ?? 'البطولة' };
}

/** صفحة البطولة — غير موجودة في المعاينة، مبنية من مكوناتها نفسها (الهيرو، بطاقة المباراة، الجدول، البطاقات) */
export default async function TournamentPage({ params }: Props) {
  const { slug } = await params;
  const [t, standings] = await Promise.all([
    apiGet<TournamentDetail>(`/tournaments/${encodeURIComponent(slug)}`),
    apiGet<Standings>(`/tournaments/${encodeURIComponent(slug)}/standings`),
  ]);
  if (!t) notFound();

  const dates = [shortDate(t.startsOn), shortDate(t.endsOn)].filter(Boolean).join(' – ');
  const details = [t.city, dates, t.community ? `يستضيفها: ${t.community.nameAr}` : null].filter(Boolean).join(' · ');

  return (
    <>
      <section className="hero page">
        <PitchLines variant="hero" />
        <div className="wrap hero-in">
          <div className="hero-text">
            <div className="chips"><span>{TOURNAMENT_KIND_LABELS[t.kind]}</span><span>{TOURNAMENT_STATUS_LABELS[t.status]}</span></div>
            <h1>{t.nameAr}</h1>
            {details && <p>{details}</p>}
            <div className="chips">
              <span>{TOURNAMENT_FORMAT_LABELS[t.format]}</span>
              <span>الفئة: {AGE_CATEGORY_LABELS[t.ageCategory]}</span>
              <span>{t.registrations.length} فرق</span>
            </div>
            {t.status === 'registration' && <div className="row"><a href="#app" className="btn btn-gold">سجّل فريقك</a></div>}
          </div>
        </div>
      </section>

      <section className="wrap sec split">
        <div className="split-main">
          <h2>المباريات</h2>
          <div className="grid g320">
            {t.matches.length === 0 ? <EmptyCard>لم يُعلن جدول المباريات بعد.</EmptyCard>
              : t.matches.map((m) => <MatchCard key={m.id} m={m} tournamentName={m.round ? `الجولة ${m.round}` : t.nameAr} withDay />)}
          </div>
        </div>
        <div className="split-side">
          <h2>الترتيب</h2>
          <StandingsTable rows={standings?.rows ?? []} full />
        </div>
      </section>

      <section className="wrap sec">
        <h2>الفرق</h2>
        <div className="grid g240">
          {t.registrations.length === 0 ? <EmptyCard>التسجيل مفتوح — لم تُعتمد فرق بعد.</EmptyCard>
            : t.registrations.map(({ team }) => (
              <div key={team.id} className="card tour">
                <span className="crest">{initial(team.nameAr)}</span>
                <h3>{team.nameAr}</h3>
                {team.verifiedAt ? <span className="kind">موثّق</span> : <span className="muted">غير موثّق بعد</span>}
              </div>
            ))}
        </div>
      </section>

      <AppBand />
    </>
  );
}
