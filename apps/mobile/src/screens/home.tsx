/** الرئيسية — تصميم «رئيسية التطبيق»: الهيرو سلايدر، مباريات اليوم (أمس/اليوم/غداً)، البطولات الجارية، الترتيب، آخر الأخبار */
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { api } from '../api';
import { FeaturedFallback, HeroSlider, SponsorBanners, MatchCard, NewsRow, StandingsTable, TourCard } from '../components/cards';
import { BrandHeader } from '../components/layout';
import { Empty, ErrorBox, Loading, ScrollPage, Section, Tabs } from '../components/ui';
import { baghdadDate } from '../format';
import { useLoad } from '../hooks';
import { useNav } from '../nav';
import { invertHorizontal, useTheme } from '../theme';
import type { Banner, Hero, MatchItem, NewsItem, Standings, TournamentSummary } from '../types';

type Day = 'y' | 't' | 'm';
const DAY_TABS: { key: Day; label: string }[] = [{ key: 'y', label: 'أمس' }, { key: 't', label: 'اليوم' }, { key: 'm', label: 'غداً' }];
const OFFSET: Record<Day, number> = { y: -1, t: 0, m: 1 };
const ORDER = ['running', 'registration', 'finished'];

export function HomeScreen() {
  const { c } = useTheme();
  const { goTab, push } = useNav();
  const [day, setDay] = useState<Day>('t');

  const page = useLoad(async () => {
    const [y, t, m, tours, news] = await Promise.all([
      api<MatchItem[]>(`/matches?date=${baghdadDate(-1)}`),
      api<MatchItem[]>(`/matches?date=${baghdadDate(0)}`),
      api<MatchItem[]>(`/matches?date=${baghdadDate(1)}`),
      api<TournamentSummary[]>('/tournaments'),
      api<NewsItem[]>('/news?limit=3').catch(() => [] as NewsItem[]),
    ]);
    const live = tours.filter((x) => x.status !== 'draft' && x.status !== 'cancelled').sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
    const first = live.find((x) => x.status === 'running');
    const standings = first ? await api<Standings>(`/tournaments/${first.slug}/standings`).catch(() => null) : null;
    return { days: { y, t, m } as Record<Day, MatchItem[]>, tours: live, standings, news };
  });
  const hero = useLoad(() => api<Hero>('/home/hero').catch(() => null), []);
  const banners = useLoad(() => api<{ banners: Banner[] }>('/home/banners').then((r) => r.banners).catch(() => null), []);

  const d = page.data;
  const heroData = hero.data;
  const featured = d ? (d.days.t[0] ?? d.days.m[0] ?? d.days.y[d.days.y.length - 1]) : undefined;
  const matches = d?.days[day] ?? [];
  const title = day === 't' ? 'مباريات اليوم' : day === 'y' ? 'مباريات الأمس' : 'مباريات الغد';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <BrandHeader />
      <ScrollPage onRefresh={() => { page.refresh(); void hero.reload(); void banners.reload(); }} refreshing={page.refreshing}>
        {page.loading && !d ? <Loading /> : page.error && !d ? (
          <View style={{ padding: 16 }}><ErrorBox message={page.error} onRetry={page.refresh} /></View>
        ) : d ? (
          <>
            <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
              {heroData && heroData.slides.length ? <HeroSlider hero={heroData} onRefresh={() => void hero.reload()} /> : featured ? <FeaturedFallback m={featured} /> : null}
            </View>

            {!!banners.data?.length && <View style={{ paddingHorizontal: 16, paddingTop: 16 }}><SponsorBanners banners={banners.data} /></View>}

            <Section title={title} action="البطولات" onAction={() => goTab('tournaments')}>
              <Tabs items={DAY_TABS} value={day} onChange={setDay} />
              {matches.length ? matches.map((m) => <MatchCard key={m.id} m={m} showTournament />) : (
                <Empty icon="clock">{day === 't' ? 'لا مباريات اليوم.' : day === 'y' ? 'لم تُلعب مباريات أمس.' : 'لا مباريات غداً.'}</Empty>
              )}
            </Section>

            <Section title="البطولات الجارية" action="عرض الكل" onAction={() => goTab('tournaments')} padded={false}>
              {d.tours.length ? (
                <FlatList
                  horizontal inverted={invertHorizontal} data={d.tours.slice(0, 8)} keyExtractor={(t) => String(t.id)}
                  showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingBottom: 4 }}
                  renderItem={({ item }) => <TourCard t={item} width={240} />}
                />
              ) : <View style={{ paddingHorizontal: 16 }}><Empty icon="trophy">لا بطولات منشورة بعد.</Empty></View>}
            </Section>

            {d.standings && (
              <Section title="الترتيب" action="الجدول الكامل" onAction={() => push({ name: 'tournament', slug: d.standings!.tournament.slug })}>
                <StandingsTable rows={d.standings.rows.slice(0, 4)} />
              </Section>
            )}

            <Section title="آخر الأخبار" action="كل الأخبار" onAction={() => goTab('news')}>
              {d.news.length ? d.news.map((n) => <NewsRow key={n.id} n={n} />) : <Empty icon="news">لا أخبار بعد.</Empty>}
            </Section>
          </>
        ) : null}
      </ScrollPage>
    </View>
  );
}
