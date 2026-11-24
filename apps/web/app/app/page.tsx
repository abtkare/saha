import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { AppBand } from '@/components/app-band';
import { PageHero } from '@/components/page-hero';

export const metadata: Metadata = { title: 'حمّل التطبيق' };
export const dynamic = 'force-dynamic';

const EXPO_GO_IOS = 'https://apps.apple.com/app/expo-go/id982107779';
const EXPO_GO_ANDROID = 'https://play.google.com/store/apps/details?id=host.exp.exponent';

// نسخة التطبيق المنشورة على Expo (EAS Update، القناة production) — Expo Go يفتحها لصاحب حساب المشروع وأعضائه فقط.
const EXPO_PROJECT_ID = process.env.EXPO_PROJECT_ID || 'e971c618-1a3d-49f3-8c3d-ddf5bd31ce29';
const EAS_URL = `exp://u.expo.dev/${EXPO_PROJECT_ID}?runtime-version=${encodeURIComponent('exposdk:58.0.0')}&channel-name=production`;

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
          <h2>النسخة التجريبية لفريق ساحة</h2>
          <ol className="steps">
            <li>ثبّت تطبيق <b>Expo Go</b> المجاني: <a href={EXPO_GO_IOS}>App Store</a> · <a href={EXPO_GO_ANDROID}>Google Play</a></li>
            <li>سجّل الدخول في Expo Go بحساب مشروع ساحة على Expo.</li>
            <li>افتح هذه الصفحة على الهاتف نفسه، واضغط الزر:</li>
          </ol>
          <a className="btn btn-primary" href={EAS_URL} id="open-eas">افتح «ساحة» في Expo Go</a>
          <p className="muted">أو انسخ الرابط والصقه في Safari: <code dir="ltr">{EAS_URL}</code></p>
          <p className="muted">نسخة الخادم المباشرة (للمحاكي والشبكة المحلية): <a href={openUrl} id="open-expo" dir="ltr">{expoUrl}</a></p>
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
