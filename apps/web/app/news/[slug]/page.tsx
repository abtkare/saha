import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { apiGet, type NewsItem } from '@/lib/api';
import { kickoffDay } from '@/lib/format';
import { NewsCard } from '@/components/cards';
import { Paragraphs } from '@/components/page-hero';

export const dynamic = 'force-dynamic';

interface Post { id: number; slug: string; titleAr: string; bodyAr: string; coverUrl: string | null; publishedAt: string | null; updatedAt: string }
type Props = { params: Promise<{ slug: string }> };
const valid = (s: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = valid(slug) ? await apiGet<Post>(`/news/${slug}`) : null;
  return { title: p?.titleAr ?? 'الخبر' };
}

/** تفاصيل الخبر — بطاقة مقال بنفس لغة .card.news */
export default async function NewsDetail({ params }: Props) {
  const { slug } = await params;
  const [p, more] = await Promise.all([valid(slug) ? apiGet<Post>(`/news/${slug}`) : null, apiGet<NewsItem[]>('/news?limit=4')]);
  if (!p) notFound();
  const others = (more ?? []).filter((n) => n.id !== p.id).slice(0, 3);
  return (
    <>
      <section className="wrap sec">
        <nav className="crumbs dark" aria-label="مسار الصفحة"><a href="/news">الأخبار</a></nav>
        <article className="card article">
          {p.coverUrl && <img src={p.coverUrl} alt="" className="cover" />}
          <div className="article-body">
            <h1>{p.titleAr}</h1>
            <span className="muted">{kickoffDay(p.publishedAt)}</span>
            <div className="prose"><Paragraphs text={p.bodyAr} /></div>
          </div>
        </article>
      </section>
      {others.length > 0 && (
        <section className="wrap sec last">
          <h2>أخبار أخرى</h2>
          <div className="grid g300">{others.map((n) => <NewsCard key={n.id} n={n} />)}</div>
        </section>
      )}
      {others.length === 0 && <div className="sec last" />}
    </>
  );
}
