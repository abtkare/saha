import Link from 'next/link';
import { brand } from '@saha/ui';
import {
  TOURNAMENT_KINDS, TOURNAMENT_KIND_LABELS, TOURNAMENT_STATUS_LABELS, TOURNAMENT_FORMAT_LABELS, AGE_CATEGORY_LABELS,
  type TournamentKind,
} from '@saha/shared';
import { apiGet, type TournamentSummary } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const active = (TOURNAMENT_KINDS as readonly string[]).includes(kind ?? '') ? (kind as TournamentKind) : undefined;
  const tournaments = await apiGet<TournamentSummary[]>(`/tournaments${active ? `?kind=${active}` : ''}`);

  return (
    <>
      <section className="hero">
        <h1>{brand.tagline}</h1>
        <p>بطولات كرة قدم منظّمة للفرق الشعبية، ولمتابعي المؤثرين وصنّاع المحتوى، ولأعضاء مجموعات فيسبوك.</p>
        <div className="kinds" aria-label="نوع البطولة">
          <Link href="/#tournaments" className={`kind-chip ${!active ? 'active' : ''}`}>الكل</Link>
          {TOURNAMENT_KINDS.map((k) => (
            <Link key={k} href={`/?kind=${k}#tournaments`} className={`kind-chip ${active === k ? 'active' : ''}`}>
              {TOURNAMENT_KIND_LABELS[k]}
            </Link>
          ))}
        </div>
      </section>

      <div className="section-head" id="tournaments">
        <h2>البطولات</h2>
        {tournaments && <span className="muted">{tournaments.length} بطولة</span>}
      </div>

      {tournaments === null ? (
        <div className="empty">الخادم غير متاح الآن. حاول بعد قليل.</div>
      ) : tournaments.length === 0 ? (
        <div className="empty">لا توجد بطولات من هذا النوع بعد.</div>
      ) : (
        <div className="grid">
          {tournaments.map((t) => (
            <Link key={t.id} href={`/tournaments/${t.slug}`} className="card">
              <span className={`badge k-${t.kind}`}>{TOURNAMENT_KIND_LABELS[t.kind]}</span>
              <h3>{t.nameAr}</h3>
              {t.community && <span className="meta">يستضيفها: {t.community.nameAr}</span>}
              <span className="meta">
                {TOURNAMENT_STATUS_LABELS[t.status]} · {TOURNAMENT_FORMAT_LABELS[t.format]} · {AGE_CATEGORY_LABELS[t.ageCategory]}
                {t.city ? ` · ${t.city}` : ''}
              </span>
              <span className="meta">
                الفرق <span className="num">{t._count.registrations}</span> · المباريات <span className="num">{t._count.matches}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
