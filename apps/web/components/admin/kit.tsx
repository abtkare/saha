'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CONTENT_STATUS_LABELS, type ContentStatus } from '@saha/shared';
import { api } from '@/lib/client';
import { TIMEZONE } from '@saha/shared';

/** يحمّل مساراً من الـ API ويعيد تحميله عند الطلب */
export function useLoad<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!!path);
  const reload = useCallback(async () => {
    if (!path) { setLoading(false); return; }
    setLoading(true);
    try { setData(await api<T>(path)); setError(''); } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [path]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}

/** تنفيذ إجراء مع رسالة نجاح أو خطأ ظاهرة للمستخدم */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const run = useCallback(async (fn: () => Promise<unknown>, success?: string) => {
    setBusy(true); setNote(null);
    try {
      await fn();
      if (success) { setNote({ ok: true, text: success }); clearTimeout(timer.current); timer.current = setTimeout(() => setNote(null), 4000); }
      return true;
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
      return false;
    } finally { setBusy(false); }
  }, []);
  return { busy, note, run, clear: () => setNote(null) };
}

export function Note({ note }: { note: { ok: boolean; text: string } | null }) {
  if (!note) return null;
  return <p className={note.ok ? 'form-ok' : 'form-error'} role={note.ok ? 'status' : 'alert'}>{note.text}</p>;
}

export function Loading({ error, loading }: { error: string; loading: boolean }) {
  if (error) return <p className="form-error" role="alert">{error}</p>;
  if (loading) return <p className="muted">جارٍ التحميل…</p>;
  return null;
}

export function PageHead({ title, text, children }: { title: string; text?: string; children?: React.ReactNode }) {
  return (
    <div className="admin-head">
      <div><h1>{title}</h1>{text && <p className="muted">{text}</p>}</div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}

const CONTENT_BADGE: Record<ContentStatus, string> = { draft: 's-scheduled', review: 's-provisional', published: 's-confirmed', archived: 's-final' };
export function ContentBadge({ status }: { status: ContentStatus }) {
  return <span className={`badge ${CONTENT_BADGE[status]}`}>{CONTENT_STATUS_LABELS[status]}</span>;
}

/** تبويبات فلترة بنفس .tabs */
export function FilterTabs<V extends string>({ value, options, onChange, label }: { value: V; options: [V, string][]; onChange: (v: V) => void; label: string }) {
  return (
    <div className="tabs self-start scroll-tabs" role="tablist" aria-label={label}>
      {options.map(([v, l]) => <button key={v} type="button" role="tab" aria-selected={value === v} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

const dt = new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { timeZone: TIMEZONE, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const when = (iso: string | null | undefined) => (iso ? dt.format(new Date(iso)) : '—');

/** وقت محلي بغداد لحقل datetime-local ← ISO بإزاحة +03:00 (العراق بلا توقيت صيفي) */
export const localToIso = (v: string) => (v ? `${v}:00+03:00` : null);
export function isoToLocal(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + 3 * 3600_000);
  return d.toISOString().slice(0, 16);
}

/** حقل نموذج موحّد */
export function Field({ label, hint, children, wide }: { label: string; hint?: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={`field${wide ? ' wide' : ''}`}><span>{label}</span>{children}{hint && <small className="muted">{hint}</small>}</label>;
}

/** زر يطلب تأكيداً قبل التنفيذ */
export function ConfirmButton({ children, confirm, onClick, className = 'btn btn-sm', disabled }: { children: React.ReactNode; confirm?: string; onClick: () => void; className?: string; disabled?: boolean }) {
  return (
    <button type="button" className={className} disabled={disabled} onClick={() => { if (!confirm || window.confirm(confirm)) onClick(); }}>{children}</button>
  );
}

export const num = (v: FormDataEntryValue | null) => (v === null || v === '' ? undefined : Number(v));
export const text = (v: FormDataEntryValue | null) => (v === null || String(v).trim() === '' ? undefined : String(v).trim());
