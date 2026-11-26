import type { Metadata } from 'next';
import { TOURNAMENT_KIND_LABELS, formatIqd, type TournamentKind } from '@saha/shared';
import { apiGet, type PrizeArchive } from '@/lib/api';
import { EmptyCard } from '@/components/cards';
import { PageHero } from '@/components/page-hero';
import { PrizeStatus } from '@/components/prizes';
import { shortDate } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'سجل الجوائز' };

interface Props { searchParams: Promise<{ before?: string }> }

/** الأرشيف التاريخي للجوائز: كل بطولة منتهية بجوائزها وفائزيها وحالة التسليم والتأكيد */
export default async function PrizesArchive({ searchParams }: Props) {
  const { before } = await searchParams;
  const data = await apiGet<PrizeArchive>(`/prizes/archive?limit=12${before && /^\d+$/.test(before) ? `&before=${before}` : ''}`);
  return (
    <>
      <PageHero
        title="سجل الجوائز"
        text="جوائز البطولات السابقة: من فاز، وبكم، وهل سُلّمت الجائزة وأكّد صاحبها استلامها."
        chips={data ? [`${data.totals.tournaments} بطولات`, `${data.totals.prizes} جوائز`, formatIqd(data.totals.amountIqd)] : []}
      >
        <a href="/prizes/mine" className="btn btn-gold">جوائزي — تأكيد الاستلام</a>
      </PageHero>
      <section className="wrap sec last">
        {data === null ? <EmptyCard>تعذّر تحميل السجل الآن. حاول بعد قليل.</EmptyCard>
          : data.tournaments.length === 0 ? <EmptyCard>لا بطولات منتهية بجوائز بعد. تظهر هنا البطولة بعد انتهائها أو تسليم كل جوائزها.</EmptyCard>
          : (
            <div className="archive">
              {data.tournaments.map(({ tournament: t, totalIqd, delivered, confirmed, prizes }) => (
                <article key={t.id} className="card archive-card">
                  <div className="between wrap-row">
                    <div>
                      <h2><a href={`/tournaments/${t.slug}#prizes`} className="plain">{t.nameAr}</a></h2>
                      <span className="muted">{TOURNAMENT_KIND_LABELS[t.kind as TournamentKind] ?? ''}{t.endsOn ? ` · انتهت ${shortDate(t.endsOn)}` : ''}</span>
                    </div>
                    <div className="archive-sum">
                      {totalIqd > 0 && <b className="num">{formatIqd(totalIqd)}</b>}
                      <small className="muted">سُلّمت <span className="num">{delivered}</span> من <span className="num">{prizes.length}</span> · أكّد أصحابها <span className="num">{confirmed}</span></small>
                    </div>
                  </div>
                  <div className="card flush scroll-x">
                    <table className="table">
                      <thead><tr><th>الجائزة</th><th>الفائز</th><th>القيمة</th><th>الحالة</th></tr></thead>
                      <tbody>
                        {prizes.map((p) => (
                          <tr key={p.id}>
                            <td>{p.label}</td>
                            <td>{p.category === 'best_player' ? (p.player ? <>{p.player.name}{p.team && <small className="muted"> · {p.team.nameAr}</small>}</> : '—') : (p.team?.nameAr ?? '—')}</td>
                            <td className="num">{p.amountIqd > 0 ? formatIqd(p.amountIqd) : ''}{p.extraAr ? <small className="muted">{p.amountIqd > 0 ? ' + ' : ''}{p.extraAr}</small> : null}</td>
                            <td><PrizeStatus p={p} />{p.status === 'pending' && <span className="muted">لم يُحدَّد</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              ))}
              {data.next && <a className="btn" href={`/prizes?before=${data.next}`}>بطولات أقدم</a>}
            </div>
          )}
      </section>
    </>
  );
}
