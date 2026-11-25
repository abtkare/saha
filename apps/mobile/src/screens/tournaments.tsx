/** البطولات: القائمة بفلتر الأنواع الثلاثة، وصفحة البطولة بتبويبات المباريات/الترتيب/الفرق/الهدافون */
import { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import {
  AGE_CATEGORY_LABELS, STAGE_LABELS, TOURNAMENT_FORMAT_LABELS, TOURNAMENT_KINDS, TOURNAMENT_KIND_LABELS, TOURNAMENT_STATUS_LABELS, type TournamentKind,
} from '@saha/shared';
import { api } from '../api';
import { useAuth } from '../auth';
import { MatchCard, StandingsTable, TourCard } from '../components/cards';
import { Icon } from '../components/icons';
import { HeroBlock, TabHeader, TopBar } from '../components/layout';
import { Button, Card, Chip, Empty, ErrorBox, Loading, Notice, ScrollPage, Section, Tabs, ListRow, Divider } from '../components/ui';
import { kickoffDay, shortDate } from '../format';
import { errMsg, useLoad } from '../hooks';
import { useNav } from '../nav';
import { row, T, useTheme } from '../theme';
import { ChipPicker } from './match';
import type { MatchItem, Scorer, Standings, TournamentDetail, TournamentSummary } from '../types';

type KindFilter = 'all' | TournamentKind;
const KIND_TABS: { key: KindFilter; label: string }[] = [{ key: 'all', label: 'الكل' }, ...TOURNAMENT_KINDS.map((k) => ({ key: k as KindFilter, label: TOURNAMENT_KIND_LABELS[k] }))];
const ORDER = ['running', 'registration', 'finished', 'cancelled'];

export function TournamentsScreen() {
  const { c } = useTheme();
  const [kind, setKind] = useState<KindFilter>('all');
  const list = useLoad(() => api<TournamentSummary[]>(kind === 'all' ? '/tournaments' : `/tournaments?kind=${kind}`), [kind]);
  const items = useMemo(() => (list.data ?? []).filter((t) => t.status !== 'draft').sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status)), [list.data]);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TabHeader title="البطولات" subtitle="كل جمهور يستحق بطولته" />
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}><ChipPicker items={KIND_TABS} value={kind} onChange={setKind} /></View>
      <ScrollPage onRefresh={list.refresh} refreshing={list.refreshing}>
        <View style={{ padding: 16, gap: 12 }}>
          {list.loading && !list.data ? <Loading /> : list.error ? <ErrorBox message={list.error} onRetry={list.refresh} /> :
            items.length ? items.map((t) => <TourCard key={t.id} t={t} />) : <Empty icon="trophy">لا بطولات من هذا النوع بعد.</Empty>}
        </View>
      </ScrollPage>
    </View>
  );
}

type Tab = 'matches' | 'table' | 'teams' | 'scorers';
const TABS: { key: Tab; label: string }[] = [{ key: 'matches', label: 'المباريات' }, { key: 'table', label: 'الترتيب' }, { key: 'teams', label: 'الفرق' }, { key: 'scorers', label: 'الهدافون' }];

/** تجميع المباريات بالجولة أو الدور */
function groupMatches(ms: MatchItem[]) {
  const groups: { title: string; items: MatchItem[] }[] = [];
  for (const m of ms) {
    const title = m.round ? `الجولة ${m.round}` : STAGE_LABELS[m.stage ?? ''] ?? (m.kickoffAt ? kickoffDay(m.kickoffAt) : 'مباريات');
    const g = groups.find((x) => x.title === title);
    if (g) g.items.push(m); else groups.push({ title, items: [m] });
  }
  return groups;
}

export function TournamentScreen({ slug }: { slug: string }) {
  const { c } = useTheme();
  const { push } = useNav();
  const { me, teams } = useAuth();
  const [tab, setTab] = useState<Tab>('matches');
  const page = useLoad(async () => {
    const t = await api<TournamentDetail>(`/tournaments/${encodeURIComponent(slug)}`);
    const [standings, scorers] = await Promise.all([
      api<Standings>(`/tournaments/${encodeURIComponent(t.slug)}/standings`).catch(() => null),
      api<Scorer[]>(`/tournaments/${encodeURIComponent(t.slug)}/scorers`).catch(() => [] as Scorer[]),
    ]);
    return { t, standings, scorers };
  }, [slug]);
  const d = page.data;
  const t = d?.t;
  const registered = new Set(t?.registrations.map((r) => r.team.id) ?? []);
  const canRegister = !!t && t.status === 'registration' && teams.some((x) => !registered.has(x.id));

  const register = () => {
    if (!t) return;
    if (!me) { push({ name: 'login' }); return; }
    const free = teams.filter((x) => !registered.has(x.id));
    const go = async (teamId: number) => {
      try {
        await api(`/tournaments/${t.id}/registrations`, { method: 'POST', body: { teamId } });
        Alert.alert('وصل طلبك', 'سجّلنا طلب فريقك، وتراجعه إدارة البطولة. يصلك إشعار بالقرار.');
        void page.reload();
      } catch (e) { Alert.alert('لم يُرسل الطلب', errMsg(e)); }
    };
    if (free.length === 1) void go(free[0].id);
    else Alert.alert('أي فريق تسجّل؟', undefined, [...free.map((x) => ({ text: x.nameAr, onPress: () => void go(x.id) })), { text: 'إلغاء', style: 'cancel' as const }]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar hero title={t?.nameAr} />
      <ScrollPage onRefresh={page.refresh} refreshing={page.refreshing}>
        {page.loading && !d ? <Loading /> : page.error || !t ? <View style={{ padding: 16 }}><ErrorBox message={page.error ?? 'البطولة غير موجودة.'} onRetry={page.refresh} /></View> : (
          <>
            <HeroBlock>
              <View style={{ flexDirection: row, gap: 8, flexWrap: 'wrap' }}>
                <Chip tone="glass">{TOURNAMENT_KIND_LABELS[t.kind]}</Chip>
                <Chip tone={t.status === 'registration' ? 'gold' : 'glass'}>{TOURNAMENT_STATUS_LABELS[t.status]}</Chip>
              </View>
              <T v="h1" color="#FFFFFF">{t.nameAr}</T>
              <T v="body" color="#DCEDE6">
                {[t.city, t.startsOn ? `${shortDate(t.startsOn)}${t.endsOn ? ` – ${shortDate(t.endsOn)}` : ''}` : null, t.community ? `يستضيفها: ${t.community.nameAr}` : null].filter(Boolean).join(' · ')}
              </T>
              <View style={{ flexDirection: row, gap: 8, flexWrap: 'wrap' }}>
                <Chip tone="glass">{TOURNAMENT_FORMAT_LABELS[t.format]}</Chip>
                <Chip tone="glass">{`الفئة: ${AGE_CATEGORY_LABELS[t.ageCategory]}`}</Chip>
                <Chip tone="glass">{`${t.registrations.length} فرق`}</Chip>
              </View>
              {canRegister && <Button title="سجّل فريقك" kind="gold" icon="plus" onPress={register} />}
              {t.status === 'registration' && !me && <Button title="سجّل فريقك" kind="gold" icon="plus" onPress={() => push({ name: 'login' })} />}
              {t.status === 'registration' && !!me && teams.length === 0 && <Button title="أنشئ فريقاً لتسجّله" kind="gold" icon="plus" onPress={() => push({ name: 'createTeam' })} />}
              {(t.status === 'registration' || t.status === 'running') && (
                <Button title="ارعَ هذه البطولة" kind="light" icon="trophy" small onPress={() => push(me ? { name: 'sponsorRequest', tournamentId: t.id } : { name: 'login' })} />
              )}
            </HeroBlock>

            <View style={{ padding: 16, paddingBottom: 0 }}><Tabs items={TABS} value={tab} onChange={setTab} /></View>

            {tab === 'matches' && (
              t.matches.length ? groupMatches(t.matches).map((g) => (
                <Section key={g.title} title={g.title} style={{ paddingTop: 16 }}>
                  {g.items.map((m) => <MatchCard key={m.id} m={m} withDay />)}
                </Section>
              )) : <Section><Empty icon="clock">لم تُجدول المباريات بعد.</Empty></Section>
            )}

            {tab === 'table' && (
              <Section style={{ paddingTop: 16 }}>
                {d.standings?.groups?.length ? d.standings.groups.map((g) => (
                  <View key={g.label} style={{ gap: 8 }}>
                    <T v="h3">{`المجموعة ${g.label}`}</T>
                    <StandingsTable rows={g.rows} full />
                  </View>
                )) : d.standings ? <StandingsTable rows={d.standings.rows} full /> : <Empty icon="trophy">الترتيب يظهر بعد القرعة.</Empty>}
                <Notice>الترتيب يحسب النتائج المعتمدة والنهائية فقط؛ المؤقتة والمتنازع عليها لا تدخل.</Notice>
              </Section>
            )}

            {tab === 'teams' && (
              <Section style={{ paddingTop: 16 }}>
                {t.registrations.length ? (
                  <Card flush>
                    {t.registrations.map((r, i) => (
                      <View key={r.team.id}>
                        {i > 0 && <Divider />}
                        <ListRow title={r.team.nameAr} icon="team" onPress={() => push({ name: 'team', id: r.team.id })}
                          right={r.team.verifiedAt ? <Chip>موثّق</Chip> : undefined} />
                      </View>
                    ))}
                  </Card>
                ) : <Empty icon="team">لم تُعتمد فرق بعد.</Empty>}
              </Section>
            )}

            {tab === 'scorers' && (
              <Section style={{ paddingTop: 16 }}>
                {d.scorers.length ? (
                  <Card flush>
                    {d.scorers.map((s, i) => (
                      <View key={s.player.id}>
                        {i > 0 && <Divider />}
                        <View style={{ flexDirection: row, alignItems: 'center', gap: 12, padding: 14 }}>
                          <T v="num" size={15} style={{ width: 22 }}>{i + 1}</T>
                          <View style={{ flex: 1 }}>
                            <T v="bodyB">{s.player.name}</T>
                            <T v="small" muted>{s.team.nameAr}</T>
                          </View>
                          <View style={{ flexDirection: row, alignItems: 'center', gap: 6 }}>
                            <T v="num" size={20} color={c.primary}>{s.goals}</T>
                            <Icon name="trophy" size={16} color={i === 0 ? '#F2B705' : c.muted} />
                          </View>
                        </View>
                      </View>
                    ))}
                  </Card>
                ) : <Empty icon="trophy">لا أهداف محسوبة بعد.</Empty>}
              </Section>
            )}
          </>
        )}
      </ScrollPage>
    </View>
  );
}
