'use client';
import { usePathname } from 'next/navigation';
import type { Permission } from '@saha/shared';
import { LoginCard, SessionContext, useSessionState, type Session } from '@/components/auth';

interface NavItem { href: string; label: string; show: (s: Session) => boolean }

const any = (...p: Permission[]) => (s: Session) => p.some((x) => s.canSome(x));

export const NAV: NavItem[] = [
  { href: '/admin', label: 'لوحة المؤشرات', show: () => true },
  { href: '/admin/tournaments', label: 'البطولات', show: any('tournaments.manage') },
  { href: '/admin/matches', label: 'المباريات والنتائج', show: any('results.enter') },
  { href: '/admin/disputes', label: 'الاعتراضات', show: any('disputes.decide') },
  { href: '/admin/verifications', label: 'توثيق الفرق', show: (s) => s.can('tournaments.manage') },
  { href: '/admin/slides', label: 'الهيرو سلايدر', show: any('content.draft', 'content.publish', 'slides.sponsor') },
  { href: '/admin/posts', label: 'الأخبار والصفحات', show: any('content.draft', 'content.publish') },
  { href: '/admin/sponsors', label: 'الرعاة', show: any('sponsors.manage') },
  { href: '/admin/sponsor-requests', label: 'طلبات الرعاية', show: any('sponsors.manage') },
  { href: '/admin/users', label: 'المستخدمون والأدوار', show: any('users.manage') },
  { href: '/admin/audit', label: 'سجل التدقيق', show: any('audit.verify') },
  { href: '/admin/account', label: 'حسابي', show: () => true },
];

/** إطار اللوحة: الدخول، ثم قائمة جانبية (أو شريط تمرير على الجوال) بحسب صلاحيات المستخدم */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const s = useSessionState();
  const path = usePathname();
  if (s.loading) return <section className="wrap sec last"><p className="muted">جارٍ التحميل…</p></section>;
  if (!s.me) {
    return (
      <LoginCard
        title="لوحة إدارة ساحة"
        text="الإدارة والمحتوى والرعاة: ادخل ببريد الإدارة ورمز التحقق. الحكام ومديرو البطولات ولجنة الانضباط: ادخلوا برقم الهاتف."
        modes={['admin', 'phone']}
        onDone={() => void s.reload()}
      />
    );
  }
  const items = NAV.filter((n) => n.show(s));
  const active = (href: string) => (href === '/admin' ? path === '/admin' : path?.startsWith(href));
  return (
    <SessionContext.Provider value={s}>
      <div className="wrap admin">
        <aside className="admin-nav" aria-label="أقسام اللوحة">
          <div className="admin-user">
            <b>{s.me.fullName}</b>
            <span className="muted">{s.me.roles.map((r) => r.label).join('، ') || 'بلا دور'}</span>
          </div>
          <nav>
            {items.map((n) => <a key={n.href} href={n.href} aria-current={active(n.href) ? 'page' : undefined}>{n.label}</a>)}
          </nav>
          <button type="button" className="btn-link" onClick={() => void s.signOut()}>تسجيل الخروج</button>
        </aside>
        <div className="admin-main">{children}</div>
      </div>
    </SessionContext.Provider>
  );
}
