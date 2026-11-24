import type { Metadata } from 'next';
import { StaticPage } from '@/components/static-page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'الشروط والأحكام' };

export default function Page() {
  return <StaticPage slug="terms" title="الشروط والأحكام" fallback={'تُنشر الشروط والأحكام هنا بعد مراجعتها من محامٍ قبل الإطلاق العام. المنصة الآن نسخة تجريبية.'} />;
}
