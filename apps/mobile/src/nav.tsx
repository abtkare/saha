/**
 * التنقل: خمسة تبويبات (الرئيسية، البطولات، فريقي، الأخبار، حسابي) كما في تصميم التطبيق، ولكل تبويب كومة شاشات.
 * مكتوب هنا بلا مكتبة تنقّل حتى لا يتعلق التطبيق بتغيّرات واجهاتها بين إصدارات Expo.
 * الشاشة الجديدة تدخل من اليسار (اتجاه عربي)، والرجوع بزر الرجوع أو بالسحب من حافة الشاشة اليمنى أو بزر أندرويد.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, BackHandler, Dimensions, Easing, PanResponder, StyleSheet, View } from 'react-native';
import { isRTL } from './theme';

export type TabName = 'home' | 'tournaments' | 'myteams' | 'news' | 'account';
export const TABS: TabName[] = ['home', 'tournaments', 'myteams', 'news', 'account'];

export type Route =
  | { name: 'tournament'; slug: string }
  | { name: 'match'; id: number }
  | { name: 'team'; id: number }
  | { name: 'post'; slug: string }
  | { name: 'notifications' }
  | { name: 'login' }
  | { name: 'teamManage'; id: number }
  | { name: 'result'; id: number }
  | { name: 'family' }
  | { name: 'createTeam' }
  | { name: 'joinTeam' }
  | { name: 'search' }
  | { name: 'sponsorRequest'; tournamentId?: number; matchId?: number }
  | { name: 'sponsorRequests' }
  | { name: 'page'; slug: 'terms' | 'privacy' | 'contact' };

interface Entry { key: number; route: Route; closing?: boolean }

interface NavValue {
  tab: TabName;
  goTab: (t: TabName) => void;
  push: (r: Route) => void;
  pop: () => void;
  /** يفتح رابطاً داخلياً من نوع /matches/12 أو /tournaments/slug (روابط الشرائح والإشعارات) */
  openPath: (path: string) => boolean;
  depth: number;
}

const NavCtx = createContext<NavValue | null>(null);
export const useNav = () => {
  const v = useContext(NavCtx);
  if (!v) throw new Error('NavProvider مفقود');
  return v;
};

/** تحويل مسار (من الموقع أو من رابط Expo بعد /--/) إلى تبويب وشاشة */
export function routeFromPath(path: string): { tab?: TabName; route?: Route } | null {
  const clean = path.replace(/^\/+/, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
  const [a, b] = clean.split('/').map((x) => decodeURIComponent(x));
  const id = Number(b);
  switch (a) {
    case '': case 'home': return { tab: 'home' };
    case 'tournaments': return b ? { tab: 'tournaments', route: { name: 'tournament', slug: b } } : { tab: 'tournaments' };
    case 'tournament': return b ? { tab: 'tournaments', route: { name: 'tournament', slug: b } } : null;
    case 'matches': case 'match': return Number.isInteger(id) && id > 0 ? { route: { name: 'match', id } } : null;
    case 'teams': case 'team': return Number.isInteger(id) && id > 0 ? { route: { name: 'team', id } } : null;
    case 'news': return b ? { tab: 'news', route: { name: 'post', slug: b } } : { tab: 'news' };
    case 'my': case 'myteams': return { tab: 'myteams' };
    case 'account': return { tab: 'account' };
    case 'notifications': return { route: { name: 'notifications' } };
    case 'login': return { tab: 'account', route: { name: 'login' } };
    case 'result': return Number.isInteger(id) && id > 0 ? { tab: 'myteams', route: { name: 'result', id } } : null;
    case 'manage': return Number.isInteger(id) && id > 0 ? { tab: 'myteams', route: { name: 'teamManage', id } } : null;
    case 'family': return { tab: 'account', route: { name: 'family' } };
    case 'search': return { route: { name: 'search' } };
    case 'sponsor-requests': return { tab: 'account', route: { name: 'sponsorRequests' } };
    case 'terms': case 'privacy': case 'contact': return { route: { name: 'page', slug: a } };
    default: return null;
  }
}

/** الجزء الداخلي من رابط exp://host/expo/--/match/12?theme=dark أو saha://match/12 */
export function linkPath(url: string): { path: string; query: Record<string, string> } | null {
  const m = url.match(/\/--\/([^?#]*)(\?[^#]*)?/) ?? url.match(/^saha:\/\/([^?#]*)(\?[^#]*)?/);
  if (!m) return null;
  const query: Record<string, string> = {};
  for (const pair of (m[2] ?? '').replace(/^\?/, '').split('&')) {
    if (!pair) continue;
    const [k, v = ''] = pair.split('=');
    query[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
  }
  return { path: m[1] ?? '', query };
}

let seq = 1;

export function NavProvider({ children, render }: { children?: ReactNode; render: (tab: TabName, entries: Entry[], close: (key: number) => void) => ReactNode }) {
  const [tab, setTab] = useState<TabName>('home');
  const [stacks, setStacks] = useState<Record<TabName, Entry[]>>({ home: [], tournaments: [], myteams: [], news: [], account: [] });
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const stacksRef = useRef(stacks);
  stacksRef.current = stacks;

  const push = useCallback((r: Route) => {
    const t = tabRef.current;
    setStacks((s) => ({ ...s, [t]: [...s[t], { key: seq++, route: r }] }));
  }, []);

  const pop = useCallback(() => {
    const t = tabRef.current;
    setStacks((s) => {
      const list = s[t];
      const idx = list.map((e) => !e.closing).lastIndexOf(true);
      if (idx < 0) return s;
      return { ...s, [t]: list.map((e, i) => (i === idx ? { ...e, closing: true } : e)) };
    });
  }, []);

  const close = useCallback((key: number) => {
    setStacks((s) => {
      const next = { ...s };
      for (const t of TABS) next[t] = s[t].filter((e) => e.key !== key);
      return next;
    });
  }, []);

  const goTab = useCallback((t: TabName) => {
    if (t === tabRef.current) setStacks((s) => ({ ...s, [t]: [] })); // الضغط على التبويب الحالي يعيده لبدايته
    else setTab(t);
  }, []);

  const openPath = useCallback((path: string) => {
    const r = routeFromPath(path);
    if (!r) return false;
    if (r.tab) {
      tabRef.current = r.tab;
      setTab(r.tab);
      if (!r.route) setStacks((s) => ({ ...s, [r.tab!]: [] }));
    }
    if (r.route) push(r.route);
    return true;
  }, [push]);

  // زر الرجوع في أندرويد
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stacksRef.current[tabRef.current].some((e) => !e.closing)) { pop(); return true; }
      if (tabRef.current !== 'home') { setTab('home'); return true; }
      return false;
    });
    return () => sub.remove();
  }, [pop]);

  const depth = stacks[tab].filter((e) => !e.closing).length;
  const value = useMemo(() => ({ tab, goTab, push, pop, openPath, depth }), [tab, goTab, push, pop, openPath, depth]);
  return (
    <NavCtx.Provider value={value}>
      <View style={{ flex: 1 }}>
        {TABS.map((t) => (
          <View key={t} style={[StyleSheet.absoluteFill, t !== tab && { display: 'none' }]} pointerEvents={t === tab ? 'auto' : 'none'}>
            {render(t, stacks[t], close)}
          </View>
        ))}
      </View>
      {children}
    </NavCtx.Provider>
  );
}

const W = Dimensions.get('window').width;
/** الشاشة المغلقة تذهب لليسار في الواجهة العربية (translateX فيزيائي لا ينقلب مع لغة الجهاز) */
const OFF = -W;
/** left/right تنقلبان في الأجهزة بلغة RTL، فالحافة اليمنى الفعلية تُكتب حسبها */
const RIGHT_EDGE = isRTL ? { left: 0 } : { right: 0 };

/** شاشة فوق الكومة: تدخل بحركة، وتُغلق بالرجوع أو بالسحب من الحافة اليمنى */
export function StackCard({ children, closing, onClosed, bg }: { children: ReactNode; closing?: boolean; onClosed: () => void; bg: string }) {
  const x = useRef(new Animated.Value(OFF)).current;
  useEffect(() => {
    Animated.timing(x, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [x]);
  useEffect(() => {
    if (!closing) return;
    Animated.timing(x, { toValue: OFF, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => onClosed());
  }, [closing, x, onClosed]);

  // السحب من الحافة اليمنى للرجوع (الاتجاه العربي)
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dy) < 20 && g.dx < 0,
    onPanResponderMove: (_, g) => x.setValue(Math.min(0, g.dx)),
    onPanResponderRelease: (_, g) => {
      const far = Math.abs(g.dx) > W * 0.33 || Math.abs(g.vx) > 0.6;
      if (far) Animated.timing(x, { toValue: OFF, duration: 180, useNativeDriver: true }).start(() => onClosed());
      else Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
    },
    onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start(),
  }), [x, onClosed]);

  const shade = x.interpolate({ inputRange: [OFF, 0], outputRange: [0, 0.18] });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={closing ? 'none' : 'auto'}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: shade }]} />
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: bg, transform: [{ translateX: x }], shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12 }]}>
        {children}
        <View {...pan.panHandlers} style={[styles.edge, RIGHT_EDGE]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({ edge: { position: 'absolute', top: 120, bottom: 0, width: 14 } });
