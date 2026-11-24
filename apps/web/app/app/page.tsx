import type { Metadata } from 'next';
import { AppBand } from '@/components/app-band';
import { PageHero } from '@/components/page-hero';

export const metadata: Metadata = { title: 'حمّل التطبيق' };

const FEATURES = [
  ['سجّل فريقك', 'أنشئ فريقك وأضف لاعبيك برمز الانضمام، وسجّل في البطولات المفتوحة.'],
  ['أكّد النتيجة أو اعترض', 'يصلك إشعار عند إدخال الحكم للنتيجة، فتؤكدها أو تعترض خلال المهلة.'],
  ['تابع لحظة بلحظة', 'المباريات والترتيب والهدافون وأخبار بطولتك في مكان واحد.'],
];

export default function AppPage() {
  return (
    <>
      <PageHero title="تطبيق ساحة" text="التطبيق هو مكان الفرق والحكام: التسجيل وإدارة اللاعبين وتأكيد النتائج. قريباً على App Store وGoogle Play." />
      <section className="wrap sec">
        <div className="grid g300">
          {FEATURES.map(([t, d]) => <div key={t} className="card feature"><h3>{t}</h3><p className="muted">{d}</p></div>)}
        </div>
      </section>
      <AppBand />
    </>
  );
}
