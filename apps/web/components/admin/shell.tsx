'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { TIMEZONE, type Permission } from '@saha/shared';
import { LoginCard, SessionContext, useSessionState, type Session } from '@/components/auth';
import { Mark } from '@/components/mark';
import { ThemeToggle } from '@/components/theme-toggle';
import { AIcon, type AdminIconName } from './icons';

interface NavItem { href: string; label: string; icon: AdminIconName; group: string; show: (s: Session) => boolean }

const any = (...p: Permission[]) => (s: Session) => p.some((x) => s.canSome(x));

export const NAV_GROUPS = ['نظرة عامة', 'البطولات', 'المحتوى والرعاة', 'الإدارة'] as const;

export const NAV: NavItem[] = [
  { href: '/admin', label: 'لوحة المؤشرات', icon: 'dashboard', group: 'نظرة عامة', show: () => true },
  { href: '/admin/analytics', label: 'تحليلات الرعاة', icon: 'chart', group: 'نظرة عامة', show: any('sponsor.reports.view') },
  { href: '/admin/tournaments', label: 'البطولات', icon: 'trophy', group: 'البطولات', show: any('tournaments.manage') },
  { href: '/admin/fees', label: 'رسوم الاشتراك', icon: 'coins', group: 'البطولات', show: any('tournaments.manage') },
  { href: '/admin/prizes', label: 'الجوائز', icon: 'gift', group: 'البطولات', show: any('tournaments.manage') },
  { href: '/admin/matches', label: 'المباريات والنتائج', icon: 'whistle', group: 'البطولات', show: any('results.enter') },
  { href: '/admin/disputes', label: 'الاعتراضات', icon: 'flag', group: 'البطولات', show: any('disputes.decide') },
  { href: '/admin/verifications', label: 'توثيق الفرق', icon: 'shield', group: 'البطولات', show: (s) => s.can('tournaments.manage') },
  { href: '/admin/slides', label: 'الهيرو سلايدر', icon: 'slides', group: 'المحتوى والرعاة', show: any('content.draft', 'content.publish', 'slides.sponsor') },
  { href: '/admin/posts', label: 'الأخبار والصفحات', icon: 'news', group: 'المحتوى والرعاة', show: any('content.draft', 'content.publish') },
  { href: '/admin/sponsors', label: 'الرعاة', icon: 'handshake', group: 'المحتوى والرعاة', show: any('sponsors.manage') },
  { href: '/admin/sponsor-requests', label: 'طلبات الرعاية', icon: 'inbox', group: 'المحتوى والرعاة', show: any('sponsors.manage') },
  { href: '/admin/banners', label: 'الراعي الدائم', icon: 'star', group: 'المحتوى والرعاة', show: any('sponsors.manage') },
  { href: '/admin/users', label: 'المستخدمون والأدوار', icon: 'users', group: 'الإدارة', show: any('users.manage') },
  { href: '/admin/audit', label: 'سجل التدقيق', icon: 'audit', group: 'الإدارة', show: any('audit.verify') },
  { href: '/admin/account', label: 'حسابي', icon: 'user', group: 'الإدارة', show: () => true },
];

const today = new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { timeZone: TIMEZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** إطار اللوحة: شريط جانبي ليلي بمجموعات وأيقونات، وشريط علوي بعنوان القسم والتاريخ؛ درج منزلق على الجوال */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const s = useSessionState();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  useEffect(() => setOpen(false), [path]);
  useEffect(() => setDate(today.format(new Date())), []);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);

  if (s.loading) return <div className="ad-app ad-loading"><p className="muted">جارٍ التحميل…</p></div>;
  if (!s.me) {
    return (
      <div className="ad-app ad-guest">
        <LoginCard
          title="لوحة إدارة ساحة"
          text="الإدارة والمحتوى والرعاة: ادخل ببريد الإدارة ورمز التحقق. الحكام ومديرو البطولات ولجنة الانضباط: ادخلوا برقم الهاتف."
          modes={['admin', 'phone']}
          onDone={() => void s.reload()}
        />
      </div>
    );
  }
  const items = NAV.filter((n) => n.show(s));
  const active = (href: string) => (href === '/admin' ? path === '/admin' : !!path?.startsWith(href));
  const current = items.find((n) => active(n.href));
  const initialLetter = s.me.fullName.trim().charAt(0);

  return (
    <SessionContext.Provider value={s}>
      <div className={`ad-app${open ? ' nav-open' : ''}`}>
        <aside className="ad-side" aria-label="أقسام اللوحة" id="ad-side">
          <a href="/admin" className="ad-brand"><Mark size={34} /><span><b>ساحة</b><small>لوحة الإدارة</small></span></a>
          <nav>
            {NAV_GROUPS.map((g) => {
              const list = items.filter((n) => n.group === g);
              if (!list.length) return null;
              return (
                <div key={g} className="ad-group">
                  <span className="ad-group-label">{g}</span>
                  {list.map((n) => (
                    <a key={n.href} href={n.href} aria-current={active(n.href) ? 'page' : undefined}><AIcon name={n.icon} />{n.label}</a>
                  ))}
                </div>
              );
            })}
          </nav>
          <div className="ad-me">
            <span className="ad-avatar" aria-hidden="true">{initialLetter}</span>
            <span className="ad-me-txt"><b>{s.me.fullName}</b><small>{s.me.roles.map((r) => r.label).join('، ') || 'بلا دور'}</small></span>
            <button type="button" className="ad-icon-btn" onClick={() => void s.signOut()} aria-label="تسجيل الخروج" title="تسجيل الخروج"><AIcon name="out" /></button>
          </div>
        </aside>
        <button type="button" className="ad-scrim" aria-label="إغلاق القائمة" tabIndex={open ? 0 : -1} onClick={() => setOpen(false)} />

        <div className="ad-body">
          <header className="ad-top">
            <button type="button" className="ad-icon-btn ad-menu" aria-label={open ? 'إغلاق القائمة' : 'فتح القائمة'} aria-expanded={open} aria-controls="ad-side" onClick={() => setOpen(!open)}>
              <AIcon name={open ? 'close' : 'menu'} />
            </button>
            <div className="ad-top-title">
              <span className="ad-crumb">لوحة ساحة{current && current.href !== '/admin' ? ` · ${current.group}` : ''}</span>
              <b>{current?.label ?? 'لوحة الإدارة'}</b>
            </div>
            <span className="ad-date">{date}</span>
            <div className="ad-top-act">
              <ThemeToggle />
              <a href="/" className="ad-icon-btn" aria-label="عرض الموقع" title="عرض الموقع" target="_blank" rel="noopener noreferrer"><AIcon name="globe" /></a>
            </div>
          </header>
          {!s.me.mfa && s.me.roles.some((r) => ['super_admin', 'content_editor', 'sponsor_manager'].includes(r.role)) && (
            <p className="ad-banner" role="alert">دخلت برقم الهاتف، فصلاحيات الإدارة والمحتوى والرعاة غير مفعّلة. سجّل الخروج وادخل ببريد الإدارة ورمز التحقق.</p>
          )}
          <div className="ad-main admin-main">{children}</div>
        </div>
      </div>
    </SessionContext.Provider>
  );
}
