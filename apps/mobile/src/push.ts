/**
 * إشعارات الهاتف (Expo Push): إذن الإشعارات، رمز الجهاز، تسجيله في الخادم، وفتح الشاشة عند الضغط على الإشعار.
 * يحتاج Expo Push معرّف مشروع (EXPO_PROJECT_ID على السيرفر يصل للتطبيق في الـ manifest).
 */
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { api } from './api';
import { PROJECT_ID } from './config';
import { store } from './storage';

export type PushState =
  | { ok: true; token: string }
  | { ok: false; reason: 'simulator' | 'denied' | 'no_project' | 'error'; message: string };

let handlerSet = false;
export function setupNotifications() {
  if (handlerSet) return;
  handlerSet = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
    });
    if (Platform.OS === 'android') {
      void Notifications.setNotificationChannelAsync('default', { name: 'إشعارات ساحة', importance: Notifications.AndroidImportance.HIGH, lightColor: '#0B6E4F' });
    }
  } catch { /* بيئة لا تدعم الإشعارات */ }
}

export async function permissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  try {
    const p = await Notifications.getPermissionsAsync();
    return p.granted ? 'granted' : p.canAskAgain === false ? 'denied' : 'undetermined';
  } catch {
    return 'undetermined';
  }
}

/** يطلب الإذن (إن لزم) ويسجل رمز الجهاز للمستخدم الحالي. ask=false: يسجل فقط إن كان الإذن ممنوحاً */
export async function registerPush(ask: boolean): Promise<PushState> {
  if (!Device.isDevice) return { ok: false, reason: 'simulator', message: 'الإشعارات تعمل على هاتف حقيقي فقط.' };
  try {
    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && ask && perm.canAskAgain !== false) perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return { ok: false, reason: 'denied', message: 'الإشعارات غير مسموحة. فعّلها من إعدادات الهاتف ← Expo Go ← الإشعارات.' };
    if (!PROJECT_ID) return { ok: false, reason: 'no_project', message: 'إشعارات الهاتف لم تُفعَّل على الخادم بعد (معرّف مشروع Expo). الإشعارات تظهر داخل التطبيق.' };
    const token = (await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID })).data;
    await api('/me/push-tokens', { method: 'POST', body: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' } });
    await store.set('push_token', token);
    return { ok: true, token };
  } catch (e) {
    return { ok: false, reason: 'error', message: `تعذّر تفعيل إشعارات الهاتف: ${(e as Error).message}` };
  }
}

/** عند الخروج: الجهاز لا يستقبل إشعارات الحساب بعدها */
export async function unregisterPush() {
  const token = await store.get('push_token');
  if (!token) return;
  await api('/me/push-tokens', { method: 'DELETE', body: { token } }).catch(() => undefined);
  await store.set('push_token', null);
}

/** المسار الداخلي لوجهة الإشعار (data.matchId …) */
export function pathFromData(data: Record<string, unknown> | null | undefined): string | null {
  if (!data) return null;
  const n = (k: string) => (typeof data[k] === 'number' ? (data[k] as number) : Number.isInteger(Number(data[k])) && data[k] != null ? Number(data[k]) : null);
  if (n('sponsorRequestId')) return '/sponsor-requests';
  if (n('matchId')) return `/matches/${n('matchId')}`;
  if (n('tournamentId')) return `/tournaments/${n('tournamentId')}`;
  if (n('teamId')) return `/manage/${n('teamId')}`;
  return '/notifications';
}

/** الضغط على إشعار (والتطبيق مفتوح أو فُتح منه) */
export function onNotificationOpen(cb: (path: string, notificationId: number | null) => void): () => void {
  try {
    const handle = (r: Notifications.NotificationResponse | null) => {
      if (!r) return;
      const data = r.notification.request.content.data as Record<string, unknown> | undefined;
      const path = pathFromData(data);
      if (path) cb(path, typeof data?.notificationId === 'number' ? (data.notificationId as number) : null);
    };
    void Notifications.getLastNotificationResponseAsync().then(handle).catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  } catch {
    return () => undefined;
  }
}

export async function setBadge(n: number) {
  try { await Notifications.setBadgeCountAsync(n); } catch { /* لا شيء */ }
}
