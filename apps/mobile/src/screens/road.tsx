/**
 * «طريق التأهل» كما في كأس العالم (الجلسة 12): جداول المجموعات بمنطقة التأهل، وشجرة الأدوار الإقصائية حتى النهائي والبطل،
 * وزر «أفضل اللاعبين» يفتح منصة أفضل 3 هدافين وقائمة أفضل اللاعبين.
 */
import { useRef } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { STAGE_LABELS } from '@saha/shared';
import { api } from '../api';
import { StandingsTable, ZONE_COLOR } from '../components/cards';
import { Icon } from '../components/icons';
import { HeroBlock, TopBar } from '../components/layout';
import { Avatar, Button, Card, Chip, Crest, Divider, Empty, ErrorBox, Loading, Notice, Progress, ScrollPage, Section } from '../components/ui';
import { useLoad } from '../hooks';
import { useNav } from '../nav';
import { brand, radius, row, T, useTheme } from '../theme';
import type { BracketMatch, Road, Slot, StarLine, Stars, TeamRef } from '../types';

function Legend({ groups }: { groups: boolean }) {
  const item = (color: string, text: string) => (
    <View style={{ flexDirection: row, alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color }} />
      <T v="small" muted>{text}</T>
    </View>
  );
  return (
    <View style={{ flexDirection: row, gap: 16, flexWrap: 'wrap' }}>
      {groups ? item(ZONE_COLOR.qualify, 'منطقة التأهل للدور التالي') : item(ZONE_COLOR.leader, 'المتصدر')}
    </View>
  );
}

/** محتوى تبويب «الترتيب» في صفحة البطولة */
export function RoadView({ road, slug }: { road: Road | null; slug: string }) {
  const { push } = useNav();
  if (!road) return <Section style={{ paddingTop: 16 }}><Empty icon="trophy">الترتيب يظهر بعد القرعة.</Empty></Section>;
  const hasGroups = road.groups.length > 0;
  const gs = road.groupStage;
  return (
    <>
      <Section style={{ paddingTop: 16 }}>
        <Button title="أفضل اللاعبين والهدافون" kind="gold" icon="trophy" onPress={() => push({ name: 'stars', slug })} />
        {road.champion && <Champion team={road.champion} />}
        {gs && !gs.finished && gs.total > 0 && (
          <Card style={{ padding: 14, gap: 8 }}>
            <View style={{ flexDirection: row, justifyContent: 'space-between' }}>
              <T v="smallB">دور المجموعات</T>
              <T v="num" size={13} muted>{`${gs.played}/${gs.total} مباراة`}</T>
            </View>
            <Progress pct={(gs.played / gs.total) * 100} />
          </Card>
        )}
        {(hasGroups || road.league.length > 0) && <Legend groups={hasGroups} />}
        {hasGroups ? road.groups.map((g) => (
          <View key={g.label} style={{ gap: 8 }}>
            <View style={{ flexDirection: row, justifyContent: 'space-between', alignItems: 'center' }}>
              <T v="h3">{`المجموعة ${g.label}`}</T>
              {g.qualifiers ? <Chip>{g.qualifiers === 1 ? 'يتأهل الأول' : `يتأهل أول ${g.qualifiers}`}</Chip> : null}
            </View>
            <StandingsTable rows={g.rows} full />
          </View>
        )) : road.league.length ? <StandingsTable rows={road.league} full /> : null}
      </Section>

      {road.bracket.length > 0 && (
        <Section title="طريق النهائي">
          {gs && !gs.finished && <Notice>الخانات المعلَّمة «متوقع» حسب الترتيب الحالي للمجموعات، وتُحسم بعد اعتماد نتائج دور المجموعات.</Notice>}
          <Bracket rounds={road.bracket} />
        </Section>
      )}
      {!hasGroups && !road.league.length && !road.bracket.length && <Section><Empty icon="trophy">الترتيب يظهر بعد القرعة.</Empty></Section>}
      <Section><Notice>الترتيب يحسب النتائج المعتمدة والنهائية فقط؛ المؤقتة والمتنازع عليها لا تدخل. عند تساوي النقاط: فارق الأهداف ثم الأهداف المسجّلة.</Notice></Section>
    </>
  );
}

function Champion({ team }: { team: TeamRef }) {
  return (
    <View style={{ backgroundColor: brand.night, borderRadius: radius.md, padding: 18, alignItems: 'center', gap: 10, borderWidth: 2, borderColor: brand.gold }}>
      <Icon name="trophy" size={34} color={brand.gold} />
      <T v="small" color="#F2B705">بطل البطولة</T>
      <View style={{ flexDirection: row, alignItems: 'center', gap: 10 }}>
        <Crest name={team.nameAr} uri={team.logoUrl} size={48} onHero />
        {team.ownerPhotoUrl ? <Avatar uri={team.ownerPhotoUrl} size={40} name={team.ownerName} /> : null}
      </View>
      <T v="h2" color="#FFFFFF" center>{team.nameAr}</T>
      {team.ownerName ? <T v="small" color="#C9D3D9" center>{team.ownerName}</T> : null}
    </View>
  );
}

const COL_W = 176;
const MATCH_H = 84;

/** الشجرة: عمود لكل دور، الدور الأول يميناً والنهائي يساراً، والمباريات موزعة لتلتقي أزواجها في الدور التالي */
function Bracket({ rounds }: { rounds: Road['bracket'] }) {
  const ref = useRef<ScrollView>(null);
  const height = Math.max(1, rounds[0].matches.length) * (MATCH_H + 16);
  return (
    <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false}
      onContentSizeChange={() => { if (row === 'row-reverse') ref.current?.scrollToEnd({ animated: false }); }}
      contentContainerStyle={{ flexDirection: row, gap: 12, paddingVertical: 4 }}>
      {rounds.map((r) => (
        <View key={r.stage} style={{ width: COL_W, gap: 8 }}>
          <View style={{ alignItems: 'center' }}><Chip tone={r.stage === 'final' ? 'gold' : 'kind'}>{STAGE_LABELS[r.stage] ?? r.stage}</Chip></View>
          <View style={{ height, justifyContent: 'space-around' }}>
            {r.matches.map((m) => <BracketCard key={m.slot} m={m} final={r.stage === 'final'} />)}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function BracketCard({ m, final }: { m: BracketMatch; final: boolean }) {
  const { c } = useTheme();
  const { push } = useNav();
  const played = m.homeScore !== null && m.awayScore !== null;
  const side = (s: Slot, score: number | null, pens: number | null) => {
    const won = m.winnerId !== null && s.team?.id === m.winnerId;
    const lost = m.winnerId !== null && !won;
    return (
      <View style={{ flexDirection: row, alignItems: 'center', gap: 6, height: 30, opacity: lost ? 0.5 : 1 }}>
        {s.team ? <Crest name={s.team.nameAr} uri={s.team.logoUrl} size={22} /> : <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderStyle: 'dashed', borderColor: c.border }} />}
        <View style={{ flex: 1 }}>
          <T v={won ? 'smallB' : 'small'} numberOfLines={1} muted={!s.team}>{s.team?.nameAr ?? s.label ?? '—'}</T>
          {s.team && s.label ? <T v="tiny" muted numberOfLines={1}>{`${s.label}${s.projected ? ' · متوقع' : ''}`}</T> : null}
        </View>
        {played && <T v="num" size={14} color={won ? c.primary : undefined}>{`${score}${pens !== null ? ` (${pens})` : ''}`}</T>}
      </View>
    );
  };
  return (
    <Pressable disabled={!m.id} onPress={() => m.id && push({ name: 'match', id: m.id })} accessibilityRole={m.id ? 'button' : undefined}
      style={{ height: MATCH_H, backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: final ? 2 : 1, borderColor: final ? brand.gold : c.border, paddingHorizontal: 10, justifyContent: 'center' }}>
      {side(m.home, m.homeScore, m.homePens)}
      <View style={{ height: 1, backgroundColor: c.line, marginVertical: 2 }} />
      {side(m.away, m.awayScore, m.awayPens)}
    </Pressable>
  );
}

// ───────────── أفضل اللاعبين ─────────────

const MEDAL = ['#F2B705', '#B8C2CA', '#C98A4B'];

export function StarsScreen({ slug }: { slug: string }) {
  const { c } = useTheme();
  const page = useLoad(() => api<Stars>(`/tournaments/${encodeURIComponent(slug)}/stars`), [slug]);
  const d = page.data;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar hero title="أفضل اللاعبين" />
      <ScrollPage onRefresh={page.refresh} refreshing={page.refreshing}>
        {page.loading && !d ? <Loading /> : page.error || !d ? <View style={{ padding: 16 }}><ErrorBox message={page.error ?? ''} onRetry={page.refresh} /></View> : (
          <>
            <HeroBlock>
              <T v="h2" color="#FFFFFF" center>ترشيح أفضل هدّاف</T>
              {d.topScorers.length ? <Podium lines={d.topScorers} /> : <T color="#DCEDE6" center>لا أهداف محسوبة بعد.</T>}
            </HeroBlock>
            {d.topScorers.length > 3 && (
              <Section title="متساوون في المراكز الثلاثة">
                <Card flush>{d.topScorers.slice(3).map((l, i) => <View key={l.player.id}>{i > 0 && <Divider />}<StarRow l={l} metric="goals" /></View>)}</Card>
              </Section>
            )}
            <Section title="قائمة أفضل اللاعبين">
              <T v="small" muted>الترتيب بعدد مرات «أفضل لاعب في المباراة» ثم الأهداف، من المباريات المعتمدة والنهائية.</T>
              {d.bestPlayers.length ? (
                <Card flush>
                  {d.bestPlayers.map((l, i) => <View key={l.player.id}>{i > 0 && <Divider />}<StarRow l={l} metric="mvp" /></View>)}
                </Card>
              ) : <Empty icon="trophy">لم يُختر أفضل لاعب في أي مباراة بعد.</Empty>}
            </Section>
          </>
        )}
      </ScrollPage>
    </View>
  );
}

/** منصة التتويج: الأول في الوسط أعلى، والثاني والثالث على جانبيه */
function Podium({ lines }: { lines: StarLine[] }) {
  const top = lines.slice(0, 3);
  const order = top.length === 3 ? [top[1], top[0], top[2]] : top.length === 2 ? [top[1], top[0]] : top;
  const step = (rank: number) => (rank === 1 ? 92 : rank === 2 ? 68 : 52);
  return (
    <View style={{ flexDirection: row, alignItems: 'flex-end', justifyContent: 'center', gap: 8, paddingTop: 6 }}>
      {order.map((l) => (
        <View key={l.player.id} style={{ flex: 1, maxWidth: 120, alignItems: 'center', gap: 6 }}>
          <View>
            <Avatar size={l.rank === 1 ? 64 : 52} name={l.player.name} />
            {l.team && (
              <View style={{ position: 'absolute', bottom: -4, alignSelf: 'center' }}>
                <Crest name={l.team.nameAr} uri={l.team.logoUrl} size={22} onHero />
              </View>
            )}
          </View>
          <T v="smallB" color="#FFFFFF" center numberOfLines={2}>{l.player.name}</T>
          <T v="tiny" color="#DCEDE6" center numberOfLines={1}>{l.team?.nameAr ?? ''}</T>
          <View style={{ alignSelf: 'stretch', height: step(l.rank), backgroundColor: 'rgba(255,255,255,0.14)', borderTopLeftRadius: 10, borderTopRightRadius: 10, borderTopWidth: 3, borderTopColor: MEDAL[l.rank - 1] ?? MEDAL[2], alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <T v="num" size={22} color={MEDAL[l.rank - 1] ?? MEDAL[2]}>{String(l.rank)}</T>
            <T v="tiny" color="#FFFFFF">{`${l.goals} ${l.goals === 1 ? 'هدف' : l.goals === 2 ? 'هدفان' : 'أهداف'}`}</T>
          </View>
        </View>
      ))}
    </View>
  );
}

function StarRow({ l, metric }: { l: StarLine; metric: 'goals' | 'mvp' }) {
  const { c } = useTheme();
  const { push } = useNav();
  return (
    <Pressable onPress={() => l.team && push({ name: 'team', id: l.team.id })} style={{ flexDirection: row, alignItems: 'center', gap: 12, padding: 14 }}>
      <T v="num" size={15} style={{ width: 22 }} color={l.rank <= 3 ? MEDAL[l.rank - 1] : undefined}>{String(l.rank)}</T>
      {l.team ? <Crest name={l.team.nameAr} uri={l.team.logoUrl} size={32} /> : null}
      <View style={{ flex: 1 }}>
        <T v="bodyB" numberOfLines={1}>{l.player.name}</T>
        <T v="small" muted numberOfLines={1}>{[l.team?.nameAr, `${l.matches} مباراة`].filter(Boolean).join(' · ')}</T>
      </View>
      <View style={{ alignItems: 'center', minWidth: 40 }}>
        <T v="num" size={18} color={c.primary}>{String(metric === 'mvp' ? l.mvp : l.goals)}</T>
        <T v="tiny" muted>{metric === 'mvp' ? 'أفضل لاعب' : 'أهداف'}</T>
      </View>
      {metric === 'mvp' && (
        <View style={{ alignItems: 'center', minWidth: 36 }}>
          <T v="num" size={16}>{String(l.goals)}</T>
          <T v="tiny" muted>أهداف</T>
        </View>
      )}
    </Pressable>
  );
}
