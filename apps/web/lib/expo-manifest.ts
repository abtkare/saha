/**
 * خادم تطبيق «ساحة» لـ Expo Go (الجلسة 7).
 * الرابط exp://<الخادم>/expo يفتح التطبيق في Expo Go مباشرة: Expo Go يطلب هذا المسار ويتلقى «manifest» بصيغة
 * expo-updates، فيه رابط حزمة JavaScript المبنية مسبقاً (public/expo-app، تُبنى في Dockerfile الموقع بـ expo export).
 * عنوان الـ API يُكتب في الـ manifest من عنوان الطلب نفسه، فلا يتغير شيء عند ربط الدومين.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { NextRequest } from 'next/server';

export interface Built { metadata: { fileMetadata: Record<string, { bundle: string; assets: { path: string; ext: string }[] }> }; config: Record<string, any>; builtAt: string }

let cache: { dir: string; built: Built } | null = null;

export function load(): { dir: string; built: Built } | null {
  if (cache) return cache;
  for (const dir of [path.join(process.cwd(), 'apps/web/public/expo-app'), path.join(process.cwd(), 'public/expo-app')]) {
    if (!existsSync(path.join(dir, 'metadata.json'))) continue;
    const metadata = JSON.parse(readFileSync(path.join(dir, 'metadata.json'), 'utf8'));
    const config = JSON.parse(readFileSync(path.join(dir, 'expo-config.json'), 'utf8'));
    const builtAt = existsSync(path.join(dir, 'built-at.txt')) ? readFileSync(path.join(dir, 'built-at.txt'), 'utf8').trim() : new Date(0).toISOString();
    cache = { dir, built: { metadata, config, builtAt } };
    return cache;
  }
  return null;
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', ttf: 'font/ttf', otf: 'font/otf', json: 'application/json' };

/** UUID ثابت لكل نسخة مبنية (Expo Go يخزّن النسخة ولا يعيد تنزيلها ما دام المعرّف نفسه) */
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
  const meta = built.metadata.fileMetadata[platform];
  if (!meta) return null;
  const sdk: string = built.config.sdkVersion ?? '58.0.0';
  const projectId: string | undefined = process.env.EXPO_PROJECT_ID || built.config.extra?.eas?.projectId || undefined;
  const owner: string | undefined = process.env.EXPO_OWNER || built.config.owner || undefined;
  const slug: string = built.config.slug ?? 'saha';
  const base = `${origin}/expo-app`;
  const expoClient = {
    ...built.config,
    ...(owner ? { owner } : {}),
    extra: {
      ...(built.config.extra ?? {}),
      apiUrl: `${origin}/api/v1`,
      webUrl: origin,
      build: built.builtAt.slice(0, 16).replace('T', ' '),
      ciMode: process.env.EXPO_CI_MODE === 'true',
      ...(projectId ? { eas: { projectId } } : {}),
    },
  };
  return {
    id: uuidFrom(`${platform}:${meta.bundle}:${origin}:${projectId ?? ''}:${process.env.EXPO_CI_MODE ?? ''}`),
    createdAt: built.builtAt,
    runtimeVersion: `exposdk:${sdk}`,
    launchAsset: { key: `bundle-${path.basename(meta.bundle)}`, contentType: 'application/javascript', url: `${base}/${meta.bundle}` },
    assets: meta.assets.map((a) => ({ key: path.basename(a.path), fileExtension: `.${a.ext}`, contentType: MIME[a.ext] ?? 'application/octet-stream', url: `${base}/${a.path}` })),
    metadata: {},
    extra: {
      expoClient: { ...expoClient, hostUri: origin.replace(/^https?:\/\//, '') },
      /*
       * Expo Go يحمّل «النسخة المنشورة» (بلا expoGo) عبر قاعدة تحديثات خاصة تشترط خوادم Expo، فيرفض خادمنا.
       * فنعلن الحزمة كما يعلنها خادم التطوير (expoGo + developer) لكن بحزمة إنتاج مبنية مسبقاً (dev: false):
       * Expo Go يحمّل launchAsset مباشرة. مُختبَر على محاكي آيفون في .github/workflows/app-ios.yml.
       */
      expoGo: {
        debuggerHost: origin.replace(/^https?:\/\//, ''),
        developer: { tool: 'expo-cli', projectRoot: '/saha/apps/mobile' },
        packagerOpts: { dev: false },
        mainModuleName: 'index',
      },
      scopeKey: owner ? `@${owner}/${slug}` : `@anonymous/${slug}-${createHash('sha256').update(origin).digest('hex').slice(0, 12)}`,
      eas: projectId ? { projectId } : {},
    },
  };
}

