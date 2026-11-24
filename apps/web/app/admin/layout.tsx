import type { Metadata } from 'next';
import { AdminShell } from '@/components/admin/shell';

export const metadata: Metadata = { title: { default: 'لوحة الإدارة', template: '%s · لوحة ساحة' }, robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
