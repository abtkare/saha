import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { TOURNAMENT_KIND_LABELS, TOURNAMENT_STATUS_LABELS, type TournamentKind, type TournamentStatus } from '@saha/shared';
import { apiGet, type MatchItem } from '@/lib/api';
import { initial } from '@/lib/format';
import { EmptyCard, MatchCard } from '@/components/cards';
import { PitchLines, Trophy } from '@/components/mark';
import { AppBand } from '@/components/app-band';

export const dynamic = 'force-dynamic';

interface TeamDetail {
  id: number; nameAr: string; logoUrl: string | null; ownerName: string | null; ownerPhotoUrl: string | null; city: string | null; fbPageUrl: string | null; verified: boolean;
  community: { id: number; kind: string; nameAr: string } | null;
  players: { id: number; name: string; shirtNo: number | null }[];
  tournaments: { id: number; nameAr: string; slug: string; status: TournamentStatus; kind: TournamentKind; groupLabel: string | null }[];
  matches: (MatchItem & { tournament: { id: number; nameAr: string; slug: string } })[];
}

type Props = { params: Promise<{ id: string }> };
const load = (id: string) => (/^\d+$/.test(id) ? apiGet<TeamDetail>(`/teams/${id}`) : Promise.resolve(null));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await load((await params).id);
  return { title: t?.nameAr ?? 'الفريق' };
}

/** صفحة الفريق — من مكونات المعاينة: الهيرو، بطاقات المباريات والبطولات، الجدول */
export default async function TeamPage({ params }: Props) {
  const t = await load((await params).id);
  if (!t) notFound();
  return (
    <>
      <section className="hero page">
        <PitchLines variant="hero" />
        <div className="wrap hero-in">
          <div className="hero-text">
            <div className="team-head">
              {t.logoUrl ? <img src={t.logoUrl} alt="" className="crest xl" /> : <span className="crest xl">{initial(t.nameAr)}</span>}
              <div>
                <h1>{t.nameAr}</h1>
                {(t.ownerName || t.ownerPhotoUrl) && (
                  <p className="team-owner">
                    {t.ownerPhotoUrl && <img src={t.ownerPhotoUrl} alt="" className="owner-photo" />}
                    <span>{t.ownerName ?? 'صاحب الفريق'}</span>
                  </p>
                )}
                <div className="chips">
                  {t.verified && <span className="chip-gold">موثّق ✓</span>}
                  {t.city && <span>{t.city}</span>}
                  {t.community && <span>{t.community.nameAr}</span>}
                  <span>{t.players.length} لاعباً</span>
                </div>
              </div>
            </div>
            {t.fbPageUrl && <div className="row"><a href={t.fbPageUrl} className="btn btn-ghost" target="_blank" rel="noopener noreferrer">صفحة الفريق على فيسبوك</a></div>}
          </div>
        </div>
      </section>

      <section className="wrap sec">
        <h2>البطولات</h2>
        <div className="grid g240">
          {t.tournaments.length === 0 ? <EmptyCard>لم يشارك الفريق في بطولة معتمدة بعد.</EmptyCard>
            : t.tournaments.map((x) => (
              <a key={x.id} href={`/tournaments/${x.slug}`} className="card tour">
                <span className="ico"><Trophy /></span>
                <span className="kind">{TOURNAMENT_KIND_LABELS[x.kind]}</span>
                <h3>{x.nameAr}</h3>
                <span className="muted">{[TOURNAMENT_STATUS_LABELS[x.status], x.groupLabel ? `المجموعة ${x.groupLabel}` : null].filter(Boolean).join(' · ')}</span>
              </a>
            ))}
        </div>
      </section>

      <section className="wrap sec split">
        <div className="split-main">
          <h2>المباريات</h2>
          <div className="grid g320">
            {t.matches.length === 0 ? <EmptyCard>لا توجد مباريات بعد.</EmptyCard> : t.matches.map((m) => <MatchCard key={m.id} m={m} withDay />)}
          </div>
        </div>
        <div className="split-side">
          <h2>اللاعبون</h2>
          <div className="card flush scroll-x">
            <table className="table">
              <thead><tr><th>#</th><th>اللاعب</th></tr></thead>
              <tbody>
                {t.players.length === 0 && <tr><td colSpan={2} className="muted">لم يُضف لاعبون بعد.</td></tr>}
                {t.players.map((p) => <tr key={p.id}><td className="num">{p.shirtNo ?? '—'}</td><td>{p.name}</td></tr>)}
              </tbody>
            </table>
          </div>
          <p className="muted">اللاعبون دون 18 سنة يظهرون بالاسم الأول فقط.</p>
        </div>
      </section>
      <AppBand />
    </>
  );
}
