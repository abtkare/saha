/**
 * Expo Go في وضع «خادم التطوير» قد يطلب الحزمة بالعنوان الذي يبنيه خادم التطوير (/index.bundle?platform=ios)
 * بدل launchAsset. نعيد الحزمة المبنية نفسها لهذا العنوان أيضاً.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { load } from '@/lib/expo-manifest';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const loaded = load();
  const platform = new URL(req.url).searchParams.get('platform') ?? req.headers.get('expo-platform') ?? 'ios';
  const file = loaded?.built.bundles[platform];
  if (!loaded || !file) return NextResponse.json({ code: 'APP_NOT_BUILT', message: 'نسخة التطبيق غير موجودة.' }, { status: 404 });
  const js = readFileSync(path.join(loaded.dir, file));
  return new NextResponse(js, { headers: { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'public, max-age=300' } });
}
