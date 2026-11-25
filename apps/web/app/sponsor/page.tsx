import type { Metadata } from 'next';
import { PageHero } from '@/components/page-hero';
import { SponsorForm } from '@/components/sponsor-form';

export const metadata: Metadata = { title: 'كن راعياً' };

const OFFERS = [
  ['شرائح في الهيرو', 'شريحتك في أعلى التطبيق والموقع بشارة «برعاية» ذهبية، تُعرض بعد مراجعتها واعتمادها.'],
  ['تقارير ظهور ونقرات', 'بوابة خاصة بك تعرض مرات الظهور والنقرات يوماً بيوم، مع تصدير PDF وExcel.'],
  ['رعاية بطولة كاملة', 'اسمك على بطولة شعبية أو بطولة لمتابعي مؤثر أو لأعضاء مجموعة فيسبوك.'],
];

/** «كن راعياً» — الشريط الداكن من المعاينة صار صفحة كاملة مع نموذج تواصل */
export default function SponsorPage() {
  return (
    <>
      <PageHero title="اجعل علامتك حاضرة أمام كل جمهور" text="ساحة تجمع الفرق الشعبية ومتابعي المؤثرين وأعضاء مجموعات فيسبوك. رعايتك تظهر حيث يتابع الجمهور فريقه." chips={['برعاية', 'تقارير شفافة', 'اعتماد قبل النشر']} />
      <section className="wrap sec split last">
        <div className="split-main">
          <h2>ماذا نقدّم للراعي</h2>
          <div className="grid g240">
            {OFFERS.map(([t, d]) => <div key={t} className="card feature"><span className="badge gold">برعاية</span><h3>{t}</h3><p className="muted">{d}</p></div>)}
          </div>
          <div className="band light">
            <div className="band-text">
              <h2>ارعَ بطولة أو مباراة الآن</h2>
              <p>اختر الحدث وارفع صورة شريحتك ومدة العرض، وتصلك الموافقة بإشعار.</p>
            </div>
            <a href="/sponsor/request" className="btn btn-primary">اطلب رعاية حدث</a>
          </div>
          <div className="band dark">
            <div className="band-text">
              <h2>راعٍ حالي؟</h2>
              <p>ادخل برقم هاتفك المسجّل لترى تقرير شرائحك.</p>
            </div>
            <a href="/sponsor/portal" className="btn btn-gold">بوابة الراعي</a>
          </div>
        </div>
        <div className="split-side">
          <SponsorForm />
        </div>
      </section>
    </>
  );
}
