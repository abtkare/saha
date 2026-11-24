import type { Metadata } from 'next';
import { StaticPage } from '@/components/static-page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'سياسة الخصوصية' };

export default function Page() {
  return <StaticPage slug="privacy" title="سياسة الخصوصية" fallback={'تُنشر سياسة الخصوصية هنا قبل الإطلاق العام.\n\nباختصار: نجمع رقم الهاتف والاسم وسنة الميلاد فقط لتشغيل البطولات، واللاعبون دون 18 سنة يظهرون للعامة بالاسم الأول فقط وبموافقة ولي الأمر، ولا نبيع بيانات أحد.'} />;
}
