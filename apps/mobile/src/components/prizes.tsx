/** جوائز البطولة (الجلسة 16): بطاقة داكنة بحد ذهبي — المراكز الثلاثة الأولى ثم أفضل ثلاثة لاعبين */
import { View } from 'react-native';
import { PRIZE_STATUS_LABELS, formatIqd } from '@saha/shared';
import type { Prize } from '../types';
import { Icon } from './icons';
import { Crest } from './ui';
import { radius, row, T } from '../theme';

const MEDAL = ['#F2B705', '#C9D3D9', '#D49A6A'];

export function PrizeBadge({ p, onDark }: { p: Prize; onDark?: boolean }) {
  if (p.status === 'pending') return null;
  const done = p.status === 'confirmed';
  const bg = done ? 'rgba(47,163,122,0.22)' : p.status === 'delivered' ? 'rgba(92,157,255,0.2)' : onDark ? 'rgba(255,255,255,0.12)' : '#EFEBE2';
  const fg = done ? (onDark ? '#5FD3A6' : '#0B6E4F') : p.status === 'delivered' ? (onDark ? '#8DBBFF' : '#1F5FC4') : onDark ? '#DCEDE6' : '#4E5A63';
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <T v="tiny" color={fg}>{done ? '✓ ' : ''}{PRIZE_STATUS_LABELS[p.status]}</T>
    </View>
  );
}

function PrizeRow({ p }: { p: Prize }) {
  const who = p.category === 'best_player' ? p.player?.name : p.team?.nameAr;
  return (
    <View style={{ flexDirection: row, gap: 12, alignItems: 'flex-start', paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#2A3B49' }}>
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: MEDAL[p.rank - 1] ?? '#F2B705', alignItems: 'center', justifyContent: 'center' }}>
        <T v="num" color="#0E1A24">{p.rank}</T>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <T v="bodyB" color="#DCEDE6">{p.label}</T>
        {p.amountIqd > 0 && <T v="num" size={20} color="#F2B705">{formatIqd(p.amountIqd)}</T>}
        {!!p.extraAr && <T v="small" color="#FFFFFF">{p.extraAr}</T>}
        {who ? (
          <View style={{ flexDirection: row, alignItems: 'center', gap: 8 }}>
            {p.team && <Crest name={p.team.nameAr} uri={p.team.logoUrl} size={24} />}
            <T v="smallB" color="#FFFFFF">{who}{p.category === 'best_player' && p.team ? ` · ${p.team.nameAr}` : ''}</T>
          </View>
        ) : <T v="small" color="#9FB0BA">يُحدَّد الفائز في الختام</T>}
        <PrizeBadge p={p} onDark />
      </View>
    </View>
  );
}

export function PrizesCard({ prizes, totalIqd }: { prizes: Prize[]; totalIqd: number }) {
  if (!prizes.length) return null;
  const places = prizes.filter((p) => p.category === 'team_place');
  const players = prizes.filter((p) => p.category === 'best_player');
  return (
    <View style={{ backgroundColor: '#0E1A24', borderRadius: radius.md, borderWidth: 2, borderColor: '#F2B705', padding: 16, gap: 6 }}>
      <View style={{ flexDirection: row, alignItems: 'center', gap: 10 }}>
        <Icon name="trophy" size={30} color="#F2B705" />
        <View style={{ flex: 1 }}>
          <T v="h2" color="#FFFFFF">جوائز البطولة</T>
          {totalIqd > 0 && <T v="small" color="#C9D3D9">المجموع <T v="smallB" color="#F2B705">{formatIqd(totalIqd)}</T></T>}
        </View>
      </View>
      {places.length > 0 && <T v="h3" color="#FFFFFF" style={{ marginTop: 8 }}>المراكز الثلاثة الأولى</T>}
      {places.map((p) => <PrizeRow key={p.id} p={p} />)}
      {players.length > 0 && <T v="h3" color="#FFFFFF" style={{ marginTop: 8 }}>أفضل ثلاثة لاعبين</T>}
      {players.map((p) => <PrizeRow key={p.id} p={p} />)}
    </View>
  );
}
