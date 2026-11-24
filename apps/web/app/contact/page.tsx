import type { Metadata } from 'next';
import { StaticPage } from '@/components/static-page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'تواصل معنا' };

export default function Page() {
  return <StaticPage slug="contact" title="تواصل معنا" fallback={'للاستفسار عن البطولات أو تسجيل الفرق راسلنا عبر التطبيق قريباً.\n\nللرعاية والإعلان استخدم صفحة «كن راعياً» وسيتواصل معك فريق ساحة.'} />;
}
