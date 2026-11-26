import { PRIZE_STATUS_LABELS, formatIqd } from '@saha/shared';
import type { Prize } from '@/lib/api';
import { Crest } from './cards';
import { Trophy } from './mark';

const STATUS_BADGE: Record<Prize['status'], string> = { pending: 's-scheduled', awarded: 's-scheduled', delivered: 's-provisional', confirmed: 's-confirmed' };

/** حالة الجائزة للجمهور: قبل تحديد الفائز لا تُعرض شارة */
export function PrizeStatus({ p }: { p: Prize }) {
  if (p.status === 'pending') return null;
  return <span className={`badge ${STATUS_BADGE[p.status]}`}>{p.status === 'confirmed' ? '✓ ' : ''}{PRIZE_STATUS_LABELS[p.status]}</span>;
}

function PrizeCard({ p }: { p: Prize }) {
  const who = p.category === 'best_player' ? p.player?.name : p.team?.nameAr;
  return (
    <div className={`prize-card r${p.rank}`}>
      <span className="prize-medal" aria-hidden="true">{p.rank}</span>
      <span className="prize-label">{p.label}</span>
      {p.amountIqd > 0 && <b className="prize-amount num">{formatIqd(p.amountIqd)}</b>}
      {p.extraAr && <span className="prize-extra">{p.extraAr}</span>}
      {who ? (
        <span className="prize-winner">
          {p.team && <Crest team={p.team} size="sm" />}
          <span><b>{who}</b>{p.category === 'best_player' && p.team && <small className="muted">{p.team.nameAr}</small>}</span>
        </span>
      ) : <span className="muted prize-tbd">يُحدَّد الفائز في الختام</span>}
      <PrizeStatus p={p} />
    </div>
  );
}

/** جوائز البطولة: المراكز الثلاثة الأولى ثم أفضل ثلاثة لاعبين */
export function PrizesBlock({ prizes, totalIqd }: { prizes: Prize[]; totalIqd: number }) {
  const places = prizes.filter((p) => p.category === 'team_place');
  const players = prizes.filter((p) => p.category === 'best_player');
  return (
    <div className="prizes">
      <div className="prizes-head">
        <Trophy />
        <div>
          <h2>جوائز البطولة</h2>
          {totalIqd > 0 && <p>مجموع الجوائز <b className="num">{formatIqd(totalIqd)}</b></p>}
        </div>
      </div>
      {places.length > 0 && <><h3>المراكز الثلاثة الأولى</h3><div className="prize-grid">{places.map((p) => <PrizeCard key={p.id} p={p} />)}</div></>}
      {players.length > 0 && <><h3>أفضل ثلاثة لاعبين</h3><div className="prize-grid">{players.map((p) => <PrizeCard key={p.id} p={p} />)}</div></>}
    </div>
  );
}
