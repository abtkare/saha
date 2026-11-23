import { apiGet } from '@/lib/api';
import { PageHero, Paragraphs } from './page-hero';

interface Page { titleAr: string; bodyAr: string; updatedAt: string }

/** صفحة ثابتة من «الأخبار والصفحات» في اللوحة؛ إن لم تُنشر بعد يظهر نص بديل */
export async function StaticPage({ slug, title, fallback }: { slug: string; title: string; fallback: string }) {
  const p = await apiGet<Page>(`/pages/${slug}`);
  return (
    <>
      <PageHero title={p?.titleAr ?? title} />
      <section className="wrap sec last">
        <article className="card article"><div className="article-body"><div className="prose"><Paragraphs text={p?.bodyAr ?? fallback} /></div></div></article>
      </section>
    </>
  );
}
