/**
 * خادم تطبيق «ساحة» لـ Expo Go (الجلسة 7).
 * الرابط exp://<الخادم>/expo يفتح التطبيق في Expo Go مباشرة. عند بناء الصورة يُشغَّل خادم التطوير الرسمي
 * (expo start بوضع الإنتاج) لحظات، ويُحفظ ما يقدّمه لـ Expo Go كما هو: الـ manifest والحزمة (apps/mobile/scripts/build-expo-go.sh).
 * هنا نعيد ذلك الـ manifest نفسه بعد استبدال عنوان خادم التطوير بعنوان هذا الخادم، ونضيف عنوان الـ API ومعرّف مشروع Expo.
 * (Expo Go يرفض صيغة «النسخة المنشورة» من غير خوادم Expo، ويقبل صيغة خادم التطوير — مُثبت على محاكي آيفون في CI.)
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { NextRequest } from 'next/server';

export interface Built { manifests: Record<string, any>; bundles: Record<string, string>; config: Record<string, any>; builtAt: string }

let cache: { dir: string; built: Built } | null = null;

export function load(): { dir: string; built: Built } | null {
  if (cache) return cache;
  for (const dir of [path.join(process.cwd(), 'apps/web/public/expo-app'), path.join(process.cwd(), 'public/expo-app')]) {
    if (!existsSync(path.join(dir, 'manifest-ios.json'))) continue;
    const manifests: Record<string, any> = {};
    const bundles: Record<string, string> = {};
    for (const p of ['ios', 'android']) {
      if (!existsSync(path.join(dir, `manifest-${p}.json`))) continue;
      manifests[p] = JSON.parse(readFileSync(path.join(dir, `manifest-${p}.json`), 'utf8'));
      bundles[p] = `bundle-${p}.js`;
    }
    const config = existsSync(path.join(dir, 'expo-config.json')) ? JSON.parse(readFileSync(path.join(dir, 'expo-config.json'), 'utf8')) : {};
    const builtAt = existsSync(path.join(dir, 'built-at.txt')) ? readFileSync(path.join(dir, 'built-at.txt'), 'utf8').trim() : new Date(0).toISOString();
    cache = { dir, built: { manifests, bundles, config, builtAt } };
    return cache;
  }
  return null;
}

/** UUID ثابت لكل نسخة مبنية وعنوان */
function uuidFrom(text: string) {
  const h = createHash('sha256').update(text).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function originOf(req: NextRequest) {
  const proto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || new URL(req.url).protocol.replace(':', '');
  const host = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || req.headers.get('host') || new URL(req.url).host;
  return `${proto}://${host}`;
}

export function buildManifest(built: Built, platform: string, origin: string) {
  const recorded = built.manifests[platform];
  if (!recorded) return null;
  const host = origin.replace(/^https?:\/\//, '');
  // عنوان خادم التطوير وقت البناء (localhost:8081) ← عنوان هذا الخادم
  const devHost: string = recorded.extra?.expoGo?.debuggerHost ?? 'localhost:8081';
  const m = JSON.parse(JSON.stringify(recorded).split(devHost).join(host));
  const projectId: string | undefined = process.env.EXPO_PROJECT_ID || built.config.extra?.eas?.projectId || undefined;
  m.id = uuidFrom(`${platform}:${built.builtAt}:${origin}:${projectId ?? ''}:${process.env.EXPO_CI_MODE ?? ''}`);
  // بأجزاء الثانية كما يرسلها خادم Expo (2026-11-24T02:10:40.370Z) — Expo Go يتعطل بدونها
  m.createdAt = new Date(built.builtAt).toISOString();
  // launchAsset يبقى بعنوان خادم التطوير نفسه (/index.bundle?platform=…): Expo Go يقرأ معاملات هذا العنوان،
  // وبدونها يتوقف قبل تنزيل الحزمة (مُثبت في CI). المسار يقدّمه app/index.bundle/route.ts من الحزمة المحفوظة.
  m.extra.expoClient = {
    ...m.extra.expoClient,
    hostUri: host,
    extra: {
      ...(m.extra.expoClient?.extra ?? {}),
      apiUrl: `${origin}/api/v1`,
      webUrl: origin,
      build: built.builtAt.slice(0, 16).replace('T', ' '),
      ciMode: process.env.EXPO_CI_MODE === 'true',
      ...(projectId ? { eas: { projectId } } : {}),
    },
  };
  delete m.extra.expoClient._internal;
  if (m.extra.expoGo?.developer) m.extra.expoGo.developer.projectRoot = '/saha/apps/mobile';
  m.extra.eas = projectId ? { projectId } : {};
  m.extra.scopeKey = `@anonymous/saha-${createHash('sha256').update(origin).digest('hex').slice(0, 12)}`;
  return m;
}
