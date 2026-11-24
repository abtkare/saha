import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { api, getTokens, logoutTokens, onTokens, setTokens, type Tokens } from './api';
import { registerPush, setBadge, unregisterPush, type PushState } from './push';
import type { Me, MyTeam } from './types';

interface AuthValue {
  ready: boolean;
  me: Me | null;
  teams: MyTeam[];
  unread: number;
  push: PushState | null;
  signIn: (t: Tokens) => Promise<void>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
  reloadUnread: () => Promise<void>;
  enablePush: () => Promise<PushState>;
  has: (role: string) => boolean;
}

const Ctx = createContext<AuthValue | null>(null);
export const useAuth = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('AuthProvider مفقود');
  return v;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [teams, setTeams] = useState<MyTeam[]>([]);
  const [unread, setUnread] = useState(0);
  const [push, setPush] = useState<PushState | null>(null);
  const pushTried = useRef(false);

  const reloadUnread = useCallback(async () => {
    if (!(await getTokens())) { setUnread(0); return; }
    try {
      const r = await api<{ unread: number }>('/me/notifications?unread=true&limit=1');
      setUnread(r.unread);
      void setBadge(r.unread);
    } catch { /* نحاول لاحقاً */ }
  }, []);

  const reload = useCallback(async () => {
    if (!(await getTokens())) { setMe(null); setTeams([]); setReady(true); return; }
    try {
      const [m, t] = await Promise.all([api<Me>('/me'), api<MyTeam[]>('/me/teams').catch(() => [] as MyTeam[])]);
      setMe(m);
      setTeams(t);
      void reloadUnread();
      if (!pushTried.current) {
        pushTried.current = true;
        // يسجل الجهاز بصمت إن كان الإذن ممنوحاً مسبقاً؛ الطلب الأول للإذن من زر «فعّل الإشعارات»
        void registerPush(false).then(setPush);
      }
    } catch {
      if (!(await getTokens())) setMe(null);
    } finally {
      setReady(true);
    }
  }, [reloadUnread]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => onTokens((t) => { if (!t) { setMe(null); setTeams([]); setUnread(0); } }), []);

  // عدد الإشعارات غير المقروءة: عند العودة للتطبيق وكل دقيقة
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void reloadUnread(); });
    const t = setInterval(() => { if (AppState.currentState === 'active') void reloadUnread(); }, 60_000);
    return () => { sub.remove(); clearInterval(t); };
  }, [reloadUnread]);

  const signIn = useCallback(async (t: Tokens) => {
    await setTokens(t);
    pushTried.current = true;
    await reload();
    setPush(await registerPush(true));
  }, [reload]);

  const signOut = useCallback(async () => {
    await unregisterPush();
    await logoutTokens();
    pushTried.current = false;
    setPush(null);
    void setBadge(0);
  }, []);

  const enablePush = useCallback(async () => {
    const r = await registerPush(true);
    setPush(r);
    return r;
  }, []);

  const value = useMemo<AuthValue>(() => ({
    ready, me, teams, unread, push, signIn, signOut, reload, reloadUnread, enablePush,
    has: (role: string) => !!me?.roles.some((r) => r.role === role),
  }), [ready, me, teams, unread, push, signIn, signOut, reload, reloadUnread, enablePush]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
