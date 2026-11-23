import type { Metadata } from 'next';
import { apiGet, type NewsItem } from '@/lib/api';
import { EmptyCard, NewsCard } from '@/components/cards';
import { PageHero } from '@/components/page-hero';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'الأخبار' };

export default async function NewsPage() {
  const news = await apiGet<NewsItem[]>('/news?limit=50');
  return (
    <>
      <PageHero title="الأخبار" text="آخر أخبار البطولات والفرق وقرارات اللجان." />
      <section className="wrap sec last">
        <div className="grid g300">
          {news === null ? <EmptyCard>تعذّر تحميل الأخبار الآن. حاول بعد قليل.</EmptyCard>
            : news.length === 0 ? <EmptyCard>لا توجد أخبار منشورة بعد.</EmptyCard>
            : news.map((n) => <NewsCard key={n.id} n={n} />)}
        </div>
      </section>
    </>
  );
}
