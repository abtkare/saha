import { TOURNAMENT_KINDS, TOURNAMENT_KIND_LABELS } from '@saha/shared';
import { apiGet, type MatchItem, type NewsItem, type Standings, type TournamentSummary } from '@/lib/api';
import { baghdadDate, pickFeatured } from '@/lib/format';
import { EmptyCard, LiveCard, NewsCard, StandingsTable, TourCard } from '@/components/cards';
import { MatchTabs } from '@/components/match-tabs';
import { PitchLines } from '@/components/mark';
import { AppBand } from '@/components/app-band';

export const dynamic = 'force-dynamic';

/** الرئيسية — نقل حرفي لـ apps/preview/public/index.html مع بيانات الـ API */
export default async function Home() {
  const [yesterday, today, tomorrow, tournaments, news] = await Promise.all([
    apiGet<MatchItem[]>(`/matches?date=${baghdadDate(-1)}`),
    apiGet<MatchItem[]>(`/matches?date=${baghdadDate(0)}`),
    apiGet<MatchItem[]>(`/matches?date=${baghdadDate(1)}`),
    apiGet<TournamentSummary[]>('/tournaments'),
    apiGet<NewsItem[]>('/news?limit=3'),
  ]);
  const days = [yesterday ?? [], today ?? [], tomorrow ?? []];
  const featured = pickFeatured(days[0], days[1], days[2]);
  const active = (tournaments ?? []).filter((t) => t.status === 'running' || t.status === 'registration');
  const leading = active.find((t) => t.status === 'running');
  const standings = leading ? await apiGet<Standings>(`/tournaments/${leading.slug}/standings`) : null;

  return (
    <>
      <section className="hero">
        <PitchLines variant="hero" />
        <div className="wrap hero-in">
          <div className="hero-text">
            <h1>كل جمهور<br />يستحق بطولته</h1>
            <p>بطولات للفرق الشعبية، ولمتابعي المؤثرين وصنّاع المحتوى، ولأعضاء مجموعات فيسبوك. سجّل فريقك وتابع النتائج والترتيب لحظة بلحظة، بنتائج يعتمدها الحكم ويؤكدها مديرا الفريقين.</p>
            <div className="chips">{TOURNAMENT_KINDS.map((k) => <span key={k}>{TOURNAMENT_KIND_LABELS[k]}</span>)}</div>
            <div className="row"><a href="#app" className="btn btn-gold">سجّل فريقك</a><a href="#tournaments" className="btn btn-ghost">تصفّح البطولات</a></div>
          </div>
          {featured && <LiveCard m={featured.match} label={featured.label} />}
        </div>
      </section>

      <MatchTabs days={days} failed={today === null} />

      <section id="tournaments" className="wrap sec split">
        <div className="split-main">
          <h2>البطولات الجارية</h2>
          <div className="grid g240">
            {tournaments === null ? <EmptyCard>تعذّر تحميل البطولات الآن. حاول بعد قليل.</EmptyCard>
              : active.length === 0 ? <EmptyCard>لا توجد بطولات جارية الآن.</EmptyCard>
              : active.map((t) => <TourCard key={t.id} t={t} />)}
          </div>
        </div>
        <div className="split-side">
          <h2>الترتيب</h2>
          <StandingsTable rows={standings?.rows.slice(0, 5) ?? []} />
        </div>
      </section>

      <section id="news" className="wrap sec">
        <h2>آخر الأخبار</h2>
        <div className="grid g300">
          {!news || news.length === 0 ? <EmptyCard>لا توجد أخبار منشورة بعد.</EmptyCard> : news.map((n) => <NewsCard key={n.id} n={n} />)}
        </div>
      </section>

      <section id="sponsor" className="wrap sec">
        <div className="band dark">
          <div className="band-text">
            <span className="badge gold">برعاية</span>
            <h2>اجعل علامتك حاضرة أمام كل جمهور</h2>
            <p>شرائح رعاية في التطبيق والموقع، وتقارير ظهور ونقرات مفصّلة، ومنح باسمك للاعبين في المدرسة لاحقاً.</p>
          </div>
          <a href="#" className="btn btn-gold">كن راعياً</a>
        </div>
      </section>

      <AppBand />
    </>
  );
}

