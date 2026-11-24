/** خادم تطبيق «ساحة» لـ Expo Go — الرابط exp://<الخادم>/expo. التفاصيل في lib/expo-manifest.ts */
import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { buildManifest, load, originOf } from '@/lib/expo-manifest';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const accept = req.headers.get('accept') ?? '';
  const platform = (req.headers.get('expo-platform') ?? new URL(req.url).searchParams.get('platform') ?? '').toLowerCase();
  // متصفح عادي (لا Expo Go): صفحة التطبيق التي فيها زر الفتح
  if (!platform && accept.includes('text/html')) return NextResponse.redirect(new URL('/app', originOf(req)));

  const loaded = load();
  if (!loaded) return NextResponse.json({ code: 'APP_NOT_BUILT', message: 'نسخة التطبيق غير موجودة في هذه الصورة.' }, { status: 503 });
  const manifest = buildManifest(loaded.built, platform || 'ios', originOf(req));
  if (!manifest) return NextResponse.json({ code: 'PLATFORM', message: 'النظام غير مدعوم.' }, { status: 404 });

  const headers: Record<string, string> = { 'expo-protocol-version': '0', 'expo-sfv-version': '0', 'cache-control': 'private, max-age=0' };
  if (!accept.includes('multipart/mixed')) {
    return new NextResponse(JSON.stringify(manifest), { headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } });
  }
  // نفس صيغة خادم Expo الرسمي حرفياً (Expo Go يقرأ هذا الشكل)
  const boundary = `----formdata-${createHash('md5').update(manifest.id).digest('hex').slice(0, 10)}`;
  const body = `--${boundary}\r\nContent-Disposition: form-data; name="manifest"; filename="manifest"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(manifest)}\r\n--${boundary}--\r\n`;
  return new NextResponse(body, { headers: { ...headers, 'content-type': `multipart/mixed; boundary=${boundary}` } });
}
