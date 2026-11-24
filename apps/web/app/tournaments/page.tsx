import type { Metadata } from 'next';
import { TOURNAMENT_KINDS, TOURNAMENT_KIND_LABELS, type TournamentKind } from '@saha/shared';
import { apiGet, type TournamentSummary } from '@/lib/api';
import { EmptyCard, TourCard } from '@/components/cards';
import { PageHero } from '@/components/page-hero';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'البطولات' };

type Props = { searchParams: Promise<{ kind?: string }> };

/** كل البطولات بفلتر الأنواع الثلاثة — من .tabs و.card.tour في المعاينة */
export default async function TournamentsPage({ searchParams }: Props) {
  const { kind: raw } = await searchParams;
  const kind = (TOURNAMENT_KINDS as readonly string[]).includes(raw ?? '') ? (raw as TournamentKind) : undefined;
  const list = await apiGet<TournamentSummary[]>(`/tournaments${kind ? `?kind=${kind}` : ''}`);
  const rank: Record<string, number> = { running: 0, registration: 1, finished: 2, cancelled: 3 };
  const sorted = [...(list ?? [])].sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9));
  const active = sorted.filter((t) => t.status === 'running' || t.status === 'registration');
  const past = sorted.filter((t) => t.status === 'finished' || t.status === 'cancelled');

  return (
    <>
      <PageHero title="البطولات" text="بطولات الفرق الشعبية، ومتابعي المؤثرين وصنّاع المحتوى، وأعضاء مجموعات فيسبوك. اختر النوع وتابع الجدول والترتيب." />
      <section className="wrap sec">
        <nav className="tabs self-start" aria-label="نوع البطولة">
          <a href="/tournaments" aria-current={!kind ? 'page' : undefined}>الكل</a>
          {TOURNAMENT_KINDS.map((k) => <a key={k} href={`/tournaments?kind=${k}`} aria-current={kind === k ? 'page' : undefined}>{TOURNAMENT_KIND_LABELS[k]}</a>)}
        </nav>
        <h2>الجارية والمفتوحة للتسجيل</h2>
        <div className="grid g240">
          {list === null ? <EmptyCard>تعذّر تحميل البطولات الآن. حاول بعد قليل.</EmptyCard>
            : active.length === 0 ? <EmptyCard>لا توجد بطولات جارية من هذا النوع الآن.</EmptyCard>
            : active.map((t) => <TourCard key={t.id} t={t} />)}
        </div>
      </section>
      {past.length > 0 && (
        <section className="wrap sec last">
          <h2>المنتهية</h2>
          <div className="grid g240">{past.map((t) => <TourCard key={t.id} t={t} />)}</div>
        </section>
      )}
      {past.length === 0 && <div className="sec last" />}
    </>
  );
}
