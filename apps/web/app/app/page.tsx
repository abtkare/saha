import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { AppBand } from '@/components/app-band';
import { PageHero } from '@/components/page-hero';

export const metadata: Metadata = { title: 'حمّل التطبيق' };
export const dynamic = 'force-dynamic';

const EXPO_GO_IOS = 'https://apps.apple.com/app/expo-go/id982107779';
const EXPO_GO_ANDROID = 'https://play.google.com/store/apps/details?id=host.exp.exponent';

const FEATURES = [
  ['سجّل فريقك', 'أنشئ فريقك وأضف لاعبيك برمز الانضمام، وسجّل في البطولات المفتوحة.'],
  ['أكّد النتيجة أو اعترض', 'يصلك إشعار عند إدخال الحكم للنتيجة، فتؤكدها أو تعترض خلال المهلة.'],
  ['تابع لحظة بلحظة', 'المباريات والترتيب والهدافون وأخبار بطولتك في مكان واحد.'],
];

export default async function AppPage() {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const https = (h.get('x-forwarded-proto') ?? 'http').startsWith('https');
  const expoUrl = `${https ? 'exps' : 'exp'}://${host}/expo`;
  // تخفي نافذة التعريف وزر أدوات المطوّر في Expo Go
  const openUrl = `${expoUrl}?__expo_disable_onboarding=1&__expo_disable_fab=1&__expo_disable_auto_launch=1`;
  return (
    <>
      <PageHero title="تطبيق ساحة" text="التطبيق هو مكان الفرق والحكام: التسجيل وإدارة اللاعبين وتأكيد النتائج. قريباً على App Store وGoogle Play." />
      <section className="wrap sec" id="try">
        <div className="card try-app">
          <h2>جرّبه الآن على هاتفك</h2>
          <ol className="steps">
            <li>ثبّت تطبيق <b>Expo Go</b> المجاني: <a href={EXPO_GO_IOS}>App Store</a> · <a href={EXPO_GO_ANDROID}>Google Play</a></li>
            <li>افتح هذه الصفحة على الهاتف نفسه، واضغط الزر:</li>
          </ol>
          <a className="btn btn-primary" href={openUrl} id="open-expo">افتح «ساحة» في Expo Go</a>
          <p className="muted">أو انسخ الرابط والصقه في Safari: <code dir="ltr">{expoUrl}</code></p>
        </div>
      </section>
      <section className="wrap sec">
        <div className="grid g300">
          {FEATURES.map(([t, d]) => <div key={t} className="card feature"><h3>{t}</h3><p className="muted">{d}</p></div>)}
        </div>
      </section>
      <AppBand />
    </>
  );
}
