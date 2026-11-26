/**
 * تطبيق «ساحة» — الجلسة 7. يُفتح في Expo Go من رابط مباشر يقدّمه خادم الموقع (/expo).
 * الخطوط تُحمَّل من الخادم نفسه (لا ملفات داخل الحزمة)، والروابط exp://…/--/match/12 تفتح الشاشة المطلوبة.
 */
import { useCallback, useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Font from 'expo-font';
import { setTokens } from './api';
import { AuthProvider, useAuth } from './auth';
import { Boundary } from './components/boundary';
import { TabBar } from './components/layout';
import { Splash } from './components/splash';
import { CI_MODE, WEB_URL } from './config';
import { linkPath, NavProvider, StackCard, useNav, type Route, type TabName } from './nav';
import { onNotificationOpen, setupNotifications } from './push';
import { setFontsReady, ThemeProvider, useTheme } from './theme';
import { AccountScreen, FamilyScreen, LoginScreen, NotificationsScreen, SearchScreen } from './screens/account';
import { HomeScreen } from './screens/home';
import { MatchScreen, ResultScreen } from './screens/match';
import { NewsScreen, PostScreen, StaticPageScreen } from './screens/news';
import { CreateTeamScreen, JoinTeamScreen, MyTeamsScreen, TeamManageScreen, TeamScreen } from './screens/teams';
import { TournamentScreen, TournamentsScreen } from './screens/tournaments';
import { StarsScreen } from './screens/road';
import { SponsorRequestScreen, SponsorRequestsScreen } from './screens/sponsor';
import { MyPrizesScreen, PrizeArchiveScreen } from './screens/prizes';

const FONT_FILES = {
  Cairo_700Bold: 'Cairo_700Bold.ttf',
  Cairo_800ExtraBold: 'Cairo_800ExtraBold.ttf',
  IBMPlexSansArabic_400Regular: 'IBMPlexSansArabic_400Regular.ttf',
  IBMPlexSansArabic_500Medium: 'IBMPlexSansArabic_500Medium.ttf',
  IBMPlexSansArabic_600SemiBold: 'IBMPlexSansArabic_600SemiBold.ttf',
};

setupNotifications();

function TabRoot({ tab }: { tab: TabName }) {
  switch (tab) {
    case 'home': return <HomeScreen />;
    case 'tournaments': return <TournamentsScreen />;
    case 'myteams': return <MyTeamsScreen />;
    case 'news': return <NewsScreen />;
    case 'account': return <AccountScreen />;
  }
}

function RouteScreen({ route }: { route: Route }) {
  switch (route.name) {
    case 'tournament': return <TournamentScreen slug={route.slug} />;
    case 'stars': return <StarsScreen slug={route.slug} />;
    case 'match': return <MatchScreen id={route.id} />;
    case 'team': return <TeamScreen id={route.id} />;
    case 'post': return <PostScreen slug={route.slug} />;
    case 'notifications': return <NotificationsScreen />;
    case 'login': return <LoginScreen />;
    case 'teamManage': return <TeamManageScreen id={route.id} />;
    case 'result': return <ResultScreen id={route.id} />;
    case 'family': return <FamilyScreen />;
    case 'createTeam': return <CreateTeamScreen />;
    case 'joinTeam': return <JoinTeamScreen />;
    case 'search': return <SearchScreen />;
    case 'sponsorRequest': return <SponsorRequestScreen tournamentId={route.tournamentId} matchId={route.matchId} />;
    case 'sponsorRequests': return <SponsorRequestsScreen />;
    case 'myPrizes': return <MyPrizesScreen />;
    case 'prizeArchive': return <PrizeArchiveScreen />;
    case 'page': return <StaticPageScreen slug={route.slug} />;
  }
}

/** الروابط الداخلية (exp://…/--/…) وضغط الإشعارات */
function Links({ onTheme }: { onTheme: (t: 'light' | 'dark' | null) => void }) {
  const { openPath, pop } = useNav();
  const { reload } = useAuth();
  useEffect(() => {
    const handle = async (url: string | null | undefined) => {
      if (!url) return;
      const l = linkPath(url);
      if (!l) return;
      if (l.query.theme === 'dark' || l.query.theme === 'light') onTheme(l.query.theme);
      // وضع CI فقط (يضعه الخادم في الـ manifest إن كان EXPO_CI_MODE=true): دخول بحساب اختبار لالتقاط لقطات الشاشات
      if (CI_MODE && l.query.ci_access && l.query.ci_refresh) { await setTokens({ accessToken: l.query.ci_access, refreshToken: l.query.ci_refresh }); await reload(); }
      if (l.query.back === '1') pop();
      if (l.path) openPath(`/${l.path}`);
    };
    void Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', (e) => void handle(e.url));
    const off = onNotificationOpen((path, id) => {
      openPath(path);
      if (id) void import('./api').then(({ api }) => api(`/me/notifications/${id}/read`, { method: 'POST' }).catch(() => undefined));
    });
    return () => { sub.remove(); off(); };
  }, [openPath, pop, onTheme, reload]);
  return null;
}

function Shell({ onTheme }: { onTheme: (t: 'light' | 'dark' | null) => void }) {
  const { c } = useTheme();
  const [splash, setSplash] = useState(true);
  const render = useCallback((tab: TabName, entries: { key: number; route: Route; closing?: boolean }[], close: (key: number) => void) => (
    <>
      <Boundary><TabRoot tab={tab} /></Boundary>
      {entries.map((e) => (
        <StackCard key={e.key} closing={e.closing} onClosed={() => close(e.key)} bg={c.bg}>
          <Boundary><RouteScreen route={e.route} /></Boundary>
        </StackCard>
      ))}
    </>
  ), [c.bg]);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={splash ? 'light' : c.dark ? 'light' : 'dark'} />
      <NavProvider render={render}>
        <Links onTheme={onTheme} />
        <TabBar />
      </NavProvider>
      {splash && <Splash onDone={() => setSplash(false)} />}
    </View>
  );
}

export default function App() {
  const [fonts, setFonts] = useState(false);
  const [forced, setForced] = useState<'light' | 'dark' | null>(null);
  useEffect(() => {
    const base = `${WEB_URL}/expo-app/fonts/`;
    const map = Object.fromEntries(Object.entries(FONT_FILES).map(([k, f]) => [k, { uri: base + f }]));
    const timeout = new Promise((r) => setTimeout(r, 6000));
    void Promise.race([Font.loadAsync(map), timeout])
      .then(() => { const ok = Object.keys(FONT_FILES).every((k) => Font.isLoaded(k)); setFontsReady(ok); })
      .catch(() => setFontsReady(false))
      .finally(() => setFonts(true));
  }, []);
  if (!fonts) return <View style={{ flex: 1, backgroundColor: '#0B6E4F' }} />;
  return (
    <SafeAreaProvider>
      <ThemeProvider forced={forced}>
        <AuthProvider>
          <Shell onTheme={setForced} />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
