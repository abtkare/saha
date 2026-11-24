import * as SecureStore from 'expo-secure-store';

/** تخزين صغير على الجهاز (رموز الدخول والإعدادات) عبر SecureStore، مع بديل في الذاكرة إن تعذّر */
const memory = new Map<string, string>();
const key = (k: string) => `saha_${k}`;

export const store = {
  async get(k: string): Promise<string | null> {
    try {
      return (await SecureStore.getItemAsync(key(k))) ?? memory.get(k) ?? null;
    } catch {
      return memory.get(k) ?? null;
    }
  },
  async set(k: string, v: string | null): Promise<void> {
    if (v === null) memory.delete(k); else memory.set(k, v);
    try {
      if (v === null) await SecureStore.deleteItemAsync(key(k));
      else await SecureStore.setItemAsync(key(k), v);
    } catch { /* يبقى في الذاكرة حتى إغلاق التطبيق */ }
  },
};
