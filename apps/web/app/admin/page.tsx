'use client';
import { useEffect, useState } from 'react';
import { useSession } from '@/components/auth';
import { NAV } from '@/components/admin/shell';
import { PageHead } from '@/components/admin/kit';
import { api } from '@/lib/client';

interface Tile { key: string; label: string; href: string; value: number | null; tone?: 'gold' | 'danger' | 'info' }

/** لوحة المؤشرات — أرقام من الواجهات الموجودة بحسب صلاحيات المستخدم */
export default function Dashboard() {
  const s = useSession();
  const [tiles, setTiles] = useState<Tile[]>([]);

  useEffect(() => {
    const jobs: [Tile, () => Promise<number>][] = [];
    const add = (t: Omit<Tile, 'value'>, fn: () => Promise<number>) => jobs.push([{ ...t, value: null }, fn]);
    const count = (p: string) => api<unknown[]>(p).then((r) => r.length);
    if (s.canSome('tournaments.manage')) {
      add({ key: 'running', label: 'بطولات جارية', href: '/admin/tournaments' }, () => api<{ status: string }[]>('/admin/tournaments').then((r) => r.filter((t) => t.status === 'running').length));
      add({ key: 'reg', label: 'بطولات بالتسجيل', href: '/admin/tournaments', tone: 'info' }, () => api<{ status: string }[]>('/admin/tournaments').then((r) => r.filter((t) => t.status === 'registration').length));
    }
    if (s.can('tournaments.manage')) add({ key: 'ver', label: 'طلبات توثيق', href: '/admin/verifications', tone: 'gold' }, () => count('/admin/verifications?status=pending'));
    if (s.canSome('results.enter')) add({ key: 'ref', label: 'مباريات تنتظر نتيجتي', href: '/admin/matches' }, () => api<{ refereeing: unknown[] }>('/me/matches').then((r) => r.refereeing.length));
    if (s.canSome('disputes.decide')) add({ key: 'disp', label: 'اعتراضات مفتوحة', href: '/admin/disputes', tone: 'danger' }, () => count('/admin/disputes?status=open'));
    if (s.canSome('content.publish') || s.canSome('content.draft') || s.canSome('slides.sponsor')) add({ key: 'slides', label: 'شرائح قيد المراجعة', href: '/admin/slides', tone: 'info' }, () => count('/admin/slides?status=review'));
    if (s.canSome('content.publish') || s.canSome('content.draft')) add({ key: 'posts', label: 'أخبار قيد المراجعة', href: '/admin/posts', tone: 'info' }, () => count('/admin/posts?status=review'));
    if (s.canSome('sponsors.manage')) add({ key: 'leads', label: 'طلبات رعاية جديدة', href: '/admin/sponsors', tone: 'gold' }, () => count('/admin/sponsor-leads?status=new'));
    setTiles(jobs.map(([t]) => t));
    jobs.forEach(([t, fn]) => {
      fn().then((v) => setTiles((all) => all.map((x) => (x.key === t.key ? { ...x, value: v } : x)))).catch(() => undefined);
    });
  }, [s.me?.id]);

  const sections = NAV.filter((n) => n.href !== '/admin' && n.show(s));
  return (
    <>
      <PageHead title={`أهلاً ${s.me?.fullName ?? ''}`} text="ما ينتظر قرارك الآن، ثم أقسام اللوحة المتاحة لدورك." />
      {!s.me?.mfa && s.me?.roles.some((r) => ['super_admin', 'content_editor', 'sponsor_manager'].includes(r.role)) && (
        <p className="form-error">دخلت برقم الهاتف، فصلاحيات الإدارة والمحتوى والرعاة غير مفعّلة. سجّل الخروج وادخل ببريد الإدارة ورمز التحقق.</p>
      )}
      {tiles.length > 0 && (
        <div className="grid g200">
          {tiles.map((t) => (
            <a key={t.key} href={t.href} className={`card stat${t.tone ? ` t-${t.tone}` : ''}`}>
              <span className="num">{t.value ?? '…'}</span>
              <span className="muted">{t.label}</span>
            </a>
          ))}
        </div>
      )}
      <h2 className="admin-h2">الأقسام</h2>
      <div className="grid g200">
        {sections.map((n) => <a key={n.href} href={n.href} className="card section-link"><b>{n.label}</b></a>)}
      </div>
    </>
  );
}
