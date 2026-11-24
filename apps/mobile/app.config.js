// إعداد التطبيق الديناميكي فوق app.json.
// SAHA_EAS=1 (من workflow النشر app-update.yml): يربط التطبيق بمشروع Expo «saha» في حساب appshoplive
// (لازم لـ EAS Update وفتحه في Expo Go على الآيفون، ولرموز إشعارات الهاتف).
// SAHA_WEB_URL: عنوان موقع «ساحة» الذي يكلّمه التطبيق المنشور (الـ API = SAHA_WEB_URL/api/v1).
// بدون هذين المتغيرين يبقى الإعداد كما في app.json (نسخة /expo الذاتية ومحاكي CI).
const EXPO_OWNER = 'appshoplive';
const EXPO_PROJECT_ID = 'e971c618-1a3d-49f3-8c3d-ddf5bd31ce29';

module.exports = ({ config }) => {
  const extra = { ...(config.extra ?? {}) };
  const out = { ...config, extra };
  if (process.env.SAHA_WEB_URL) {
    const web = process.env.SAHA_WEB_URL.replace(/\/$/, '');
    extra.webUrl = web;
    extra.apiUrl = `${web}/api/v1`;
  }
  if (process.env.SAHA_BUILD) extra.build = process.env.SAHA_BUILD;
  if (process.env.SAHA_EAS === '1') {
    out.owner = EXPO_OWNER;
    extra.eas = { projectId: EXPO_PROJECT_ID };
    out.updates = { ...(config.updates ?? {}), url: `https://u.expo.dev/${EXPO_PROJECT_ID}` };
    // Expo Go يفتح فقط النسخ المنشورة بنسخة تشغيل SDK نفسه («exposdk:58.0.0»).
    out.runtimeVersion = { policy: 'sdkVersion' };
  }
  if (process.env.SAHA_STORE === '1') {
    // نسخة المتجر/TestFlight (eas build): أيقونة، نصوص الأذونات بالعربية، وبلا تحديثات عن بُعد في هذه المرحلة.
    delete out.runtimeVersion;
    delete out.updates;
    out.icon = './assets/icon.png';
    out.ios = {
      ...out.ios,
      icon: './assets/icon.png',
      config: { ...(out.ios?.config ?? {}), usesNonExemptEncryption: false },
      infoPlist: {
        ...(out.ios?.infoPlist ?? {}),
        CFBundleDevelopmentRegion: 'ar',
        CFBundleAllowMixedLocalizations: true,
        NSCameraUsageDescription: 'تُستخدم الكاميرا لتصوير ورقة المباراة عند إدخال النتيجة.',
        NSPhotoLibraryUsageDescription: 'لاختيار صورة ورقة المباراة أو شعار الفريق.',
      },
    };
    out.android = { ...out.android, adaptiveIcon: { foregroundImage: './assets/splash-mark.png', backgroundColor: '#0B6E4F' } };
    out.plugins = [
      ...(out.plugins ?? []),
      ['expo-image-picker', { cameraPermission: 'تُستخدم الكاميرا لتصوير ورقة المباراة عند إدخال النتيجة.', photosPermission: 'لاختيار صورة ورقة المباراة أو شعار الفريق.' }],
      ['expo-notifications', { color: '#0B6E4F' }],
    ];
  }
  return out;
};
