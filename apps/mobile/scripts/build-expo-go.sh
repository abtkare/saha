#!/usr/bin/env bash
# يبني نسخة Expo Go التي يقدّمها الموقع على /expo (الجلسة 7).
# الحزمة والـ manifest يُؤخذان من خادم التطوير الرسمي نفسه (expo start بوضع الإنتاج) لأن Expo Go يقبلهما كما هما
# (مُثبت على محاكي آيفون)، ثم يُحفظان ملفات ثابتة في dist ويُقدَّمان من الموقع بعنوانه هو.
set -euo pipefail
cd "$(dirname "$0")/.."
export CI=1 EXPO_NO_TELEMETRY=1
rm -rf dist && mkdir -p dist/fonts
PORT=${METRO_PORT:-8081}
npx expo start --port "$PORT" --no-dev --minify > /tmp/metro-build.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT
for i in $(seq 1 90); do curl -sf "localhost:$PORT/status" >/dev/null && break; sleep 2; done
for p in ios android; do
  curl -sf -H "expo-platform: $p" -H 'accept: application/expo+json,application/json' "localhost:$PORT" > "dist/manifest-$p.json"
  url=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('dist/manifest-$p.json')).launchAsset.url)")
  echo "$p ← $url"
  curl -sf --max-time 600 "$url" -o "dist/bundle-$p.js"
  test "$(wc -c < "dist/bundle-$p.js")" -gt 100000
done
npx expo config --type public --json > dist/expo-config.json
date -u +%Y-%m-%dT%H:%M:%SZ > dist/built-at.txt
for f in Cairo_700Bold Cairo_800ExtraBold IBMPlexSansArabic_400Regular IBMPlexSansArabic_500Medium IBMPlexSansArabic_600SemiBold; do
  src=$(find node_modules/@expo-google-fonts -name "$f.ttf" | head -1); test -n "$src"; cp "$src" dist/fonts/
done
ls -la dist dist/fonts
