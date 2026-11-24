import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { ApiError } from './api';

export interface Load<T> { data: T | null; error: string | null; loading: boolean; refreshing: boolean; reload: () => Promise<void>; refresh: () => void; set: (v: T) => void }

/** تحميل بيانات شاشة: أول تحميل، السحب للتحديث، ورسالة خطأ عربية */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []): Load<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const reload = useCallback(async () => {
    try {
      const v = await fnRef.current();
      if (alive.current) { setData(v); setError(null); }
    } catch (e) {
      if (alive.current) setError(e instanceof ApiError ? e.message : 'تعذّر التحميل. حاول مرة أخرى.');
    } finally {
      if (alive.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    setLoading(true);
    void reload();
    return () => { alive.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const refresh = useCallback(() => { setRefreshing(true); void reload(); }, [reload]);
  return { data, error, loading, refreshing, reload, refresh, set: setData };
}

/** تنفيذ دوري ما دام التطبيق ظاهراً (مثل تحديث الشرائح كل 30 ثانية) */
export function useInterval(fn: () => void, ms: number | null) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!ms) return;
    const t = setInterval(() => { if (AppState.currentState === 'active') ref.current(); }, ms);
    return () => clearInterval(t);
  }, [ms]);
}

/** رسالة الخطأ من أي استثناء */
export const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'حدث خطأ غير متوقع.');
