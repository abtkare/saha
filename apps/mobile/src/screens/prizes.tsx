/** جوائزي (تأكيد الاستلام) وسجل الجوائز السابقة — الجلسة 16 */
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { formatIqd } from '@saha/shared';
import { api } from '../api';
import { PrizeBadge } from '../components/prizes';
import { TopBar } from '../components/layout';
import { Button, Card, Chip, Divider, Empty, ErrorBox, Loading, Notice, ScrollPage, Section } from '../components/ui';
import { shortDate } from '../format';
import { errMsg, useLoad } from '../hooks';
import { useNav } from '../nav';
import { row, T, useTheme } from '../theme';
import type { MyPrize, PrizeArchive } from '../types';

export function MyPrizesScreen() {
  const { c } = useTheme();
  const { push } = useNav();
  const list = useLoad(() => api<MyPrize[]>('/me/prizes'));
  const [done, setDone] = useState<string | null>(null);

  const confirm = (p: MyPrize) => {
    Alert.alert('تأكيد الاستلام', `تؤكد أنك استلمت «${p.label}» في ${p.tournament.nameAr}؟ التأكيد نهائي.`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'نعم، استلمتها', onPress: async () => {
          try {
            await api(`/me/prizes/${p.id}/confirm`, { method: 'POST' });
            setDone('شكراً! سُجّل تأكيد الاستلام.');
            void list.reload();
          } catch (e) { Alert.alert('لم يُسجَّل التأكيد', errMsg(e)); }
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar title="جوائزي" />
      <ScrollPage onRefresh={list.refresh} refreshing={list.refreshing}>
        <View style={{ padding: 16, gap: 12 }}>
          {done && <Notice tone="ok">{done}</Notice>}
          {list.loading && !list.data ? <Loading /> : list.error ? <ErrorBox message={list.error} onRetry={list.refresh} /> : list.data?.length ? list.data.map((p) => (
            <Card key={p.id} style={{ padding: 16, gap: 8, borderColor: p.canConfirm ? '#F2B705' : c.border }}>
              <View style={{ flexDirection: row, alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <T v="h3" style={{ flex: 1 }}>{p.label}</T>
                <PrizeBadge p={p} />
              </View>
              <T v="small" muted onPress={() => push({ name: 'tournament', slug: p.tournament.slug })}>{p.tournament.nameAr}</T>
              <T v="bodyB">{p.category === 'best_player' ? p.player?.name : p.team?.nameAr}</T>
              {p.amountIqd > 0 && <T v="num" size={22} color={c.primary}>{formatIqd(p.amountIqd)}</T>}
              {!!p.extraAr && <T>{p.extraAr}</T>}
              {p.deliveredAt && <T v="small" muted>{`سُلّمت ${shortDate(p.deliveredAt)}${p.deliveryNote ? ` — ${p.deliveryNote}` : ''}`}</T>}
              {p.confirmedAt && <T v="small" muted>{`أكّدت الاستلام ${shortDate(p.confirmedAt)}`}</T>}
              {p.canConfirm && <Button title="أؤكد استلام الجائزة" icon="check" kind="gold" onPress={() => confirm(p)} />}
              {p.status === 'awarded' && <T v="small" muted>بعد تسليمك الجائزة يظهر هنا زر تأكيد الاستلام.</T>}
            </Card>
          )) : <Empty icon="trophy">لا جوائز باسمك أو باسم فريقك بعد.</Empty>}
          <Button title="سجل الجوائز السابقة" kind="light" icon="trophy" onPress={() => push({ name: 'prizeArchive' })} />
        </View>
      </ScrollPage>
    </View>
  );
}

export function PrizeArchiveScreen() {
  const { c } = useTheme();
  const { push } = useNav();
  const [pages, setPages] = useState<PrizeArchive['tournaments']>([]);
  const [next, setNext] = useState<string | null>(null);
  const first = useLoad(async () => {
    const r = await api<PrizeArchive>('/prizes/archive?limit=10');
    setPages(r.tournaments); setNext(r.next);
    return r;
  });
  const more = async () => {
    if (!next) return;
    try {
      const r = await api<PrizeArchive>(`/prizes/archive?limit=10&before=${next}`);
      setPages((x) => [...x, ...r.tournaments]); setNext(r.next);
    } catch (e) { Alert.alert('تعذّر التحميل', errMsg(e)); }
  };
  const tot = first.data?.totals;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar title="سجل الجوائز" />
      <ScrollPage onRefresh={first.refresh} refreshing={first.refreshing}>
        <View style={{ padding: 16, gap: 12 }}>
          {tot && (
            <View style={{ flexDirection: row, gap: 8, flexWrap: 'wrap' }}>
              <Chip>{`${tot.tournaments} بطولات`}</Chip>
              <Chip>{`${tot.prizes} جوائز`}</Chip>
              <Chip tone="gold">{formatIqd(tot.amountIqd)}</Chip>
            </View>
          )}
          {first.loading && !first.data ? <Loading /> : first.error ? <ErrorBox message={first.error} onRetry={first.refresh} /> : pages.length ? pages.map(({ tournament: t, totalIqd, delivered, confirmed, prizes }) => (
            <Card key={t.id} flush>
              <View style={{ padding: 14, gap: 4 }}>
                <T v="h3" onPress={() => push({ name: 'tournament', slug: t.slug })}>{t.nameAr}</T>
                <T v="small" muted>{[t.endsOn ? `انتهت ${shortDate(t.endsOn)}` : null, totalIqd ? formatIqd(totalIqd) : null, `سُلّمت ${delivered} من ${prizes.length}`, `أكّد أصحابها ${confirmed}`].filter(Boolean).join(' · ')}</T>
              </View>
              {prizes.map((p) => (
                <View key={p.id}>
                  <Divider />
                  <View style={{ padding: 12, gap: 4 }}>
                    <View style={{ flexDirection: row, justifyContent: 'space-between', gap: 8 }}>
                      <T v="bodyB" style={{ flex: 1 }}>{p.label}</T>
                      {p.amountIqd > 0 && <T v="num" color={c.primary}>{formatIqd(p.amountIqd)}</T>}
                    </View>
                    <T v="small" muted>{(p.category === 'best_player' ? (p.player ? `${p.player.name}${p.team ? ` · ${p.team.nameAr}` : ''}` : null) : p.team?.nameAr) ?? 'لم يُحدَّد'}{p.extraAr ? ` · ${p.extraAr}` : ''}</T>
                    <PrizeBadge p={p} />
                  </View>
                </View>
              ))}
            </Card>
          )) : <Empty icon="trophy">لا بطولات منتهية بجوائز بعد.</Empty>}
          {next && <Section padded={false}><Button title="بطولات أقدم" kind="light" small onPress={more} /></Section>}
        </View>
      </ScrollPage>
    </View>
  );
}
