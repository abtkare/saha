/** بطاقات «ساحة» في التطبيق — نفس تصميم «رئيسية التطبيق»: المباراة، البطولة، الترتيب، الخبر، والهيرو سلايدر */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Linking, PanResponder, Pressable, View, useWindowDimensions } from 'react-native';
import { RESULT_STATUS_LABELS, TOURNAMENT_FORMAT_LABELS, TOURNAMENT_KIND_LABELS, TOURNAMENT_STATUS_LABELS } from '@saha/shared';
import { api, deviceId } from '../api';
import { WEB_URL } from '../config';
import { useInterval } from '../hooks';
import { useNav } from '../nav';
import { radius, row, T, useTheme } from '../theme';
import { kickoffDay, kickoffTime, relativeTime, scoreText, shortDate, signed } from '../format';
import type { Banner, Hero, HeroSlide, MatchItem, NewsItem, StandingRow, TeamRef, TournamentSummary, Zone } from '../types';
import { Icon, Mark, PitchLines } from './icons';
import { Avatar, Card, Chip, Crest, Progress, StatusBadge } from './ui';

/** بطاقة المباراة: الشعاران والنتيجة وشارة الحالة تحتها، ثم الوقت والملعب */
export function MatchCard({ m, showTournament, withDay }: { m: MatchItem; showTournament?: boolean; withDay?: boolean }) {
  const { c } = useTheme();
  const { push } = useNav();
  return (
    <Card onPress={() => push({ name: 'match', id: m.id })} style={{ padding: 14, gap: 10 }}>
      {showTournament && m.tournament && <T v="small" muted center numberOfLines={1}>{m.tournament.nameAr}</T>}
      <View style={{ flexDirection: row, alignItems: 'center' }} accessible accessibilityLabel={`${m.homeTeam.nameAr} ${scoreText(m)} ${m.awayTeam.nameAr}، ${RESULT_STATUS_LABELS[m.resultStatus]}`}>
        <TeamCol name={m.homeTeam.nameAr} logo={m.homeTeam.logoUrl} />
        <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
          <T v="num" size={26} center style={{ lineHeight: 30 }}>{scoreText(m)}</T>
          <StatusBadge status={m.resultStatus} small />
        </View>
        <TeamCol name={m.awayTeam.nameAr} logo={m.awayTeam.logoUrl} />
      </View>
      <View style={{ flexDirection: row, justifyContent: 'center', gap: 14, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 10, flexWrap: 'wrap' }}>
        {withDay && <T v="small" size={12} muted>{kickoffDay(m.kickoffAt)}</T>}
        <View style={{ flexDirection: row, alignItems: 'center', gap: 4 }}>
          <Icon name="clock" size={14} color={c.muted} />
          <T v="num" size={12} muted style={{ fontWeight: '700' }}>{kickoffTime(m.kickoffAt)}</T>
        </View>
        {m.venue ? (
          <View style={{ flexDirection: row, alignItems: 'center', gap: 4 }}>
            <Icon name="pin" size={14} color={c.muted} />
            <T v="small" size={12} muted>{m.venue}</T>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

function TeamCol({ name, onHero, logo }: { name: string; onHero?: boolean; logo?: string | null }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
      <Crest name={name} uri={logo} size={onHero ? 44 : 36} onHero={onHero} />
      <T v="smallB" center numberOfLines={2} color={onHero ? '#FFFFFF' : undefined}>{name}</T>
    </View>
  );
}

/** بطاقة البطولة (240px في الشريط الأفقي) */
export function TourCard({ t, width }: { t: TournamentSummary; width?: number }) {
  const { c } = useTheme();
  const { push } = useNav();
  const { pct, label } = tournamentProgress(t);
  const teams = t.status === 'registration' && t.maxTeams ? t.maxTeams : t._count.registrations;
  return (
    <Card onPress={() => push({ name: 'tournament', slug: t.slug })} style={{ padding: 16, gap: 10, width }}>
      <View style={{ flexDirection: row, justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ width: 40, height: 40, borderRadius: radius.lg, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="trophy" size={22} color="#F2B705" />
        </View>
        <Chip>{TOURNAMENT_FORMAT_LABELS[t.format]}</Chip>
      </View>
      <View>
        <T v="h3" numberOfLines={2}>{t.nameAr}</T>
        <T v="small" muted numberOfLines={1}>{[t.city, `${teams} فرق`, TOURNAMENT_KIND_LABELS[t.kind]].filter(Boolean).join(' · ')}</T>
      </View>
      <View style={{ gap: 6 }}>
        <Progress pct={pct} />
        <T v="small" size={12} muted>{label}</T>
      </View>
    </Card>
  );
}

/** شريط التقدّم ونصّه (منقول من apps/web/lib/format.ts) */
export function tournamentProgress(t: TournamentSummary): { pct: number; label: string } {
  const p = t.progress;
  if (t.status === 'registration') {
    const max = t.maxTeams ?? 0;
    const pct = max ? Math.round((t._count.registrations / max) * 100) : 0;
    const starts = t.startsOn ? ` · تبدأ ${shortDate(t.startsOn)}` : '';
    return { pct, label: `${TOURNAMENT_STATUS_LABELS.registration}${starts}` };
  }
  if (t.status === 'finished') return { pct: 100, label: TOURNAMENT_STATUS_LABELS.finished };
  const pct = p.total ? Math.round((p.played / p.total) * 100) : 0;
  if (p.rounds > 0) return { pct, label: `الجولة ${Math.max(p.currentRound, 1)} من ${p.rounds}` };
  return { pct, label: TOURNAMENT_STATUS_LABELS[t.status] };
}

/** جدول الترتيب: الأول بحد ذهبي. full = فاز/تعادل/خسر أيضاً */
/** لون شريط منطقة الجدول: المتأهلون أخضر، والمتصدر ذهبي */
export const ZONE_COLOR: Record<Exclude<Zone, null>, string> = { qualify: '#0B6E4F', leader: '#F2B705' };

/** الفريق في صف الجدول: الشعار وعليه صورة صاحب الفريق/المؤثر صغيرة بحد ذهبي، ثم الاسم واسم صاحبه */
export function TeamCell({ team, size = 28 }: { team: TeamRef; size?: number }) {
  const badge = Math.round(size * 0.62);
  return (
    <View style={{ flex: 1, flexDirection: row, alignItems: 'center', gap: 8 }}>
      <View style={{ width: size + badge * 0.35, height: size + badge * 0.3 }}>
        <Crest name={team.nameAr} uri={team.logoUrl} size={size} />
        {team.ownerPhotoUrl ? (
          <View style={[{ position: 'absolute', bottom: 0 }, row === 'row' ? { right: 0 } : { left: 0 }]}>
            <Avatar uri={team.ownerPhotoUrl} size={badge} name={team.ownerName} />
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        <T v="bodyB" size={14} numberOfLines={1}>{team.nameAr}</T>
        {team.ownerName ? <T v="tiny" muted numberOfLines={1}>{team.ownerName}</T> : null}
      </View>
    </View>
  );
}

export function StandingsTable({ rows, full }: { rows: (StandingRow & { zone?: Zone })[]; full?: boolean }) {
  const { c } = useTheme();
  const { push } = useNav();
  const cols = full ? ['لعب', 'فاز', 'تعادل', 'خسر', 'الفارق', 'النقاط'] : ['لعب', 'الفارق', 'النقاط'];
  const w = full ? 30 : 44;
  return (
    <Card flush>
      <View style={{ flexDirection: row, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: c.head, gap: 4 }}>
        <T v="tiny" muted style={{ width: 20 }}>#</T>
        <T v="tiny" muted style={{ flex: 1 }}>الفريق</T>
        {cols.map((h) => <T key={h} v="tiny" muted center style={{ width: w }}>{h}</T>)}
      </View>
      {rows.length === 0 && <T muted center style={{ padding: 16 }}>لم تُعتمد فرق بعد.</T>}
      {rows.map((r, i) => {
        const zone = r.zone !== undefined ? r.zone : i === 0 && r.points > 0 ? 'leader' : null;
        const vals = full ? [r.played, r.won, r.drawn, r.lost, signed(r.goalDiff)] : [r.played, signed(r.goalDiff)];
        return (
          <Pressable key={r.team.id} onPress={() => push({ name: 'team', id: r.team.id })} accessibilityRole="button"
            accessibilityLabel={`${r.position}، ${r.team.nameAr}، ${r.points} نقطة${zone === 'qualify' ? '، في منطقة التأهل' : ''}`}
            style={{ flexDirection: row, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', gap: 4, borderTopWidth: 1, borderTopColor: c.line,
              backgroundColor: zone === 'qualify' ? (c.dark ? 'rgba(47,163,122,0.08)' : 'rgba(11,110,79,0.04)') : undefined }}>
            {zone && <View style={[{ position: 'absolute', top: 0, bottom: 0, width: 3, backgroundColor: ZONE_COLOR[zone] }, row === 'row' ? { left: 0 } : { right: 0 }]} />}
            <T v="num" size={15} style={{ width: 20 }}>{r.position}</T>
            <TeamCell team={r.team} />
            {vals.map((v, k) => <T key={k} v="num" size={13} center style={{ width: w }}>{String(v)}</T>)}
            <T v="num" size={16} center color={c.primary} style={{ width: w }}>{r.points}</T>
          </Pressable>
        );
      })}
    </Card>
  );
}

/** الخبر: صورة 84×84 والعنوان والوقت */
export function NewsRow({ n }: { n: NewsItem }) {
  const { c } = useTheme();
  const { push } = useNav();
  return (
    <Card onPress={() => push({ name: 'post', slug: n.slug })} style={{ padding: 12, flexDirection: row, gap: 12, alignItems: 'center' }}>
      <View style={{ width: 84, height: 84, borderRadius: radius.lg, backgroundColor: c.thumb, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {n.coverUrl ? <Image source={{ uri: absolute(n.coverUrl) }} style={{ width: 84, height: 84 }} /> : <Icon name="news" size={28} color={c.primary} />}
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <T v="bodyB" numberOfLines={3}>{n.titleAr}</T>
        <T v="small" size={12} muted>{relativeTime(n.publishedAt)}</T>
      </View>
    </Card>
  );
}

/** روابط الصور من الخادم (/api/v1/media/5) تُكمَّل بعنوانه */
export const absolute = (u: string) => (/^https?:/.test(u) ? u : `${WEB_URL}${u.startsWith('/') ? '' : '/'}${u}`);

const AUTO_MS = 6000;

/**
 * الهيرو سلايدر: بطاقة خضراء 16:9 تقريباً بخطوط الملعب. شريحة المباراة بالنتيجة وحالتها،
 * وشريحة الصورة بتدرّج داكن، وشريحة الراعي بخلفية ليلية وشارة «برعاية» ذهبية. يتحدث كل 30 ثانية ويقيس الظهور والنقر.
 */
export function HeroSlider({ hero, onRefresh }: { hero: Hero | null; onRefresh: () => void }) {
  const { width } = useWindowDimensions();
  const w = width - 32;
  const h = Math.round(w * 0.5625);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const fade = useRef(new Animated.Value(1)).current;
  const seen = useRef(new Set<number>());
  const slides = hero?.slides ?? [];
  const n = slides.length;
  const cur = n ? Math.min(i, n - 1) : 0;

  const go = (d: number) => {
    if (n < 2) return;
    fade.setValue(0.25);
    setI((x) => (Math.min(x, n - 1) + d + n) % n);
    Animated.timing(fade, { toValue: 1, duration: 450, useNativeDriver: true }).start();
  };
  const goRef = useRef(go);
  goRef.current = go;

  useInterval(onRefresh, (hero?.refreshSeconds ?? 30) * 1000);
  useInterval(() => { if (!paused) goRef.current(1); }, n > 1 ? AUTO_MS : null);

  useEffect(() => {
    const s = slides[cur];
    if (!s || seen.current.has(s.id)) return;
    seen.current.add(s.id);
    void track(s.id, 'impression');
  }, [cur, slides]);

  // السحب: لليمين ← التالية (الاتجاه العربي كما في الموقع)
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderRelease: (_, g) => { setPaused(true); if (Math.abs(g.dx) > 40) goRef.current(g.dx > 0 ? 1 : -1); },
  }), []);

  if (!n) return null;
  const s = slides[cur];
  return (
    <View style={{ height: h, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#0B6E4F' }} {...pan.panHandlers}
      accessibilityRole="adjustable" accessibilityLabel={`الشريحة ${cur + 1} من ${n}: ${s.titleAr}`}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => go(e.nativeEvent.actionName === 'increment' ? 1 : -1)}>
      <Animated.View style={{ flex: 1, opacity: fade }}>
        <Slide s={s} w={w} h={h} />
      </Animated.View>
      {n > 1 && (
        <View style={{ position: 'absolute', bottom: 6, left: 0, right: 0, flexDirection: row, justifyContent: 'center', gap: 2 }} pointerEvents="box-none">
          {slides.map((x, k) => (
            <Pressable key={x.id} accessibilityRole="button" accessibilityLabel={`الشريحة ${k + 1}: ${x.titleAr}`} hitSlop={4}
              onPress={() => { setPaused(true); go(k - cur); }}
              style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
              <View style={k === cur ? { width: 18, height: 6, borderRadius: 3, backgroundColor: '#F2B705' } : { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.55)' }} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

async function track(id: number, type: 'impression' | 'click') {
  try { await api(`/hero/${id}/events`, { method: 'POST', auth: false, body: { type, deviceId: await deviceId() } }); } catch { /* القياس لا يوقف التطبيق */ }
}

function Slide({ s, w, h }: { s: HeroSlide; w: number; h: number }) {
  const { openPath, push } = useNav();
  const open = () => {
    void track(s.id, 'click');
    const href = s.linkUrl ?? (s.type === 'match' && s.match ? `/matches/${s.match.id}` : s.tournament ? `/tournaments/${s.tournament.slug}` : s.sponsor?.website ?? null);
    if (!href) return;
    if (/^https?:/.test(href)) {
      const local = href.replace(/^https?:\/\/[^/]+/, '');
      if (href.startsWith(WEB_URL) && openPath(local)) return;
      void Linking.openURL(href);
    } else if (!openPath(href) && s.match) push({ name: 'match', id: s.match.id });
  };
  return (
    <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={s.titleAr} style={{ width: w, height: h }}>
      {s.type === 'match' && s.match ? <MatchSlide s={s} w={w} h={h} /> : s.type === 'sponsor' && !s.imageUrl ? <SponsorSlide s={s} /> : <ImageSlide s={s} w={w} h={h} />}
    </Pressable>
  );
}

function MatchSlide({ s, w, h }: { s: HeroSlide; w: number; h: number }) {
  const m = s.match!;
  const live = m.resultStatus === 'scheduled' && !!m.liveText;
  const label = m.round ? `مباراة اليوم · الجولة ${m.round}` : 'مباراة اليوم';
  const st = m.resultStatus === 'scheduled' ? (live ? 'جارية الآن' : RESULT_STATUS_LABELS.scheduled) : `نتيجة ${RESULT_STATUS_LABELS[m.resultStatus]}`;
  const stColor = { scheduled: '#4E5A63', provisional: '#1F5FC4', confirmed: '#0B6E4F', disputed: '#B51F33', final: '#0E1A24' }[m.resultStatus];
  return (
    <View style={{ flex: 1, backgroundColor: '#0B6E4F' }}>
      <PitchLines width={w} height={h} />
      <View style={{ flex: 1, padding: 16, justifyContent: 'space-between', paddingBottom: 30 }}>
        <View style={{ flexDirection: row, justifyContent: 'space-between', alignItems: 'center' }}>
          <Chip tone="glass">{label}</Chip>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}><T v="tiny" color={stColor}>{st}</T></View>
        </View>
        <View style={{ flexDirection: row, alignItems: 'center' }}>
          <TeamCol name={m.homeTeam.nameAr} logo={m.homeTeam.logoUrl} onHero />
          <T v="num" size={40} color="#FFFFFF" center style={{ flex: 1, lineHeight: 46 }}>{scoreText(m)}</T>
          <TeamCol name={m.awayTeam.nameAr} logo={m.awayTeam.logoUrl} onHero />
        </View>
        <T v="small" size={12} color="#D6EAE2" center numberOfLines={1}>
          {live ? m.liveText : m.homePens !== null && m.awayPens !== null ? `ركلات الترجيح ${m.homePens} – ${m.awayPens}` : [m.venue, kickoffTime(m.kickoffAt)].filter(Boolean).join(' · ')}
        </T>
      </View>
    </View>
  );
}

function ImageSlide({ s, w, h }: { s: HeroSlide; w: number; h: number }) {
  // أرضية الملعب ترسم دائماً تحت الصورة: إن تأخرت الصورة أو فشل تحميلها تبقى الشريحة بشكل الملعب لا خضراء فارغة
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [s.imageUrl]);
  return (
    <View style={{ flex: 1, backgroundColor: '#0B6E4F' }}>
      <PitchLines width={w} height={h} />
      <View style={{ position: 'absolute', top: 18, left: 18, opacity: 0.35 }}><Mark size={72} color="#FFFFFF" /></View>
      {s.imageUrl && !failed ? (
        <Image source={{ uri: absolute(s.imageUrl) }} style={{ position: 'absolute', width: w, height: h }} resizeMode="cover" onError={() => setFailed(true)} />
      ) : null}
      {/* تدرّج داكن أسفل الصورة للنص (طبقات بدل مكتبة تدرّج) */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: h * 0.7 }}>
        {[0.04, 0.1, 0.18, 0.28, 0.4, 0.52, 0.62, 0.7].map((o, k) => (
          <View key={k} style={{ flex: 1, backgroundColor: `rgba(14,26,36,${o})` }} />
        ))}
      </View>
      <View style={{ flex: 1, padding: 18, paddingBottom: 30, justifyContent: 'flex-end', gap: 8 }}>
        {s.sponsored ? <Chip tone="gold">{`برعاية${s.sponsor ? ` ${s.sponsor.nameAr}` : ''}`}</Chip>
          : s.type === 'tournament' ? <Chip tone="gold">البطولات</Chip> : s.type === 'news' ? <Chip tone="glass">خبر</Chip> : null}
        <T v="h2" size={22} color="#FFFFFF" numberOfLines={2}>{s.titleAr}</T>
        {s.subtitleAr ? <T v="small" color="#E4ECEF" numberOfLines={2}>{s.subtitleAr}</T> : null}
      </View>
    </View>
  );
}

function SponsorSlide({ s }: { s: HeroSlide }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#0E1A24', padding: 18, paddingBottom: 30, justifyContent: 'flex-end', gap: 8 }}>
      <View style={{ position: 'absolute', top: 14, left: 14 }}><Chip tone="gold">برعاية</Chip></View>
      <T v="h2" size={24} color="#FFFFFF" numberOfLines={2}>{s.sponsor?.nameAr ?? s.titleAr}</T>
      <T v="small" size={14} color="#C9D3D9" numberOfLines={2}>{s.subtitleAr ?? s.titleAr}</T>
    </View>
  );
}

/** بطاقة «مباراة اليوم» البديلة إن لم توجد شرائح */
export function FeaturedFallback({ m }: { m: MatchItem }) {
  const s: HeroSlide = {
    id: -m.id, type: 'match', titleAr: '', subtitleAr: null, imageUrl: null, linkUrl: `/matches/${m.id}`, sponsored: false, sponsor: null, tournament: null,
    match: { ...m, homePens: m.homePens ?? null, awayPens: m.awayPens ?? null, liveTextAt: null },
  };
  const { width } = useWindowDimensions();
  const w = width - 32;
  const h = Math.round(w * 0.5625);
  const { push } = useNav();
  return (
    <Pressable onPress={() => push({ name: 'match', id: m.id })} style={{ height: h, borderRadius: radius.md, overflow: 'hidden' }} accessibilityRole="button">
      <MatchSlide s={s} w={w} h={h} />
    </Pressable>
  );
}


/** الراعي الدائم (الجلسة 14): لوحة ثابتة بعرض الشاشة، لا تدور مع السلايدر؛ صورتها تُغيَّر من لوحة الإدارة */
export function SponsorBanners({ banners }: { banners: Banner[] | null | undefined }) {
  if (!banners?.length) return null;
  return <View style={{ gap: 12 }}>{banners.map((b) => <BannerCard key={b.id} b={b} />)}</View>;
}

function BannerCard({ b }: { b: Banner }) {
  const { c } = useTheme();
  const { openPath } = useNav();
  const [ratio, setRatio] = useState(16 / 9);
  const open = () => {
    const href = b.linkUrl;
    if (!href) return;
    if (/^https?:/.test(href)) {
      const local = href.replace(/^https?:\/\/[^/]+/, '');
      if (href.startsWith(WEB_URL) && openPath(local)) return;
      void Linking.openURL(href);
    } else openPath(href);
  };
  return (
    <Pressable
      onPress={open} disabled={!b.linkUrl} accessibilityRole={b.linkUrl ? 'link' : 'image'} accessibilityLabel={b.labelAr}
      style={({ pressed }) => ({ borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#0E1A24', borderWidth: 1, borderColor: c.border, opacity: pressed ? 0.9 : 1 })}
    >
      <Image
        source={{ uri: absolute(b.imageUrl) }} resizeMode="contain" accessibilityIgnoresInvertColors
        style={{ width: '100%', aspectRatio: ratio }}
        onLoad={(e) => { const s = e.nativeEvent.source; if (s?.width && s?.height) setRatio(Math.max(1, Math.min(4, s.width / s.height))); }}
      />
    </Pressable>
  );
}
