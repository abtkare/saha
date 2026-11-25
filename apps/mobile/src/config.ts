import Constants from 'expo-constants';

/**
 * عنوان الخادم: يضعه خادم «ساحة» في ملف التطبيق (manifest) عند كل فتح، من العنوان الذي فُتح منه التطبيق،
 * فلا يتغير الكود عند ربط الدومين. البديل: عنوان خادم التطوير (expo start).
 */
interface Extra { apiUrl?: string; webUrl?: string; ciMode?: boolean; eas?: { projectId?: string }; build?: string }

export const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

function guessWeb(): string {
  if (extra.webUrl) return extra.webUrl.replace(/\/$/, '');
  const host = Constants.expoConfig?.hostUri?.split('/')[0];
  return host ? `http://${host}` : 'https://saha.72-61-18-234.sslip.io';
}

export const WEB_URL = guessWeb();
export const API_URL = (extra.apiUrl ?? `${WEB_URL}/api/v1`).replace(/\/$/, '');
export const CI_MODE = extra.ciMode === true;
export const PROJECT_ID: string | undefined = extra.eas?.projectId ?? (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;
/** يُعرض في «حسابي» لمعرفة النسخة المحمّلة */
export const BUILD = extra.build ?? 'dev';
