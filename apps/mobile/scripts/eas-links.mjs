// يقرأ ناتج `eas update --json` ويكتب رابط Expo Go الدائم للقناة ورابط هذه النسخة بالتحديد.
// الاستعمال: node scripts/eas-links.mjs update.json <القناة> <معرّف المشروع>
import { readFileSync, appendFileSync } from 'node:fs';

const [file, channel, projectId] = process.argv.slice(2);
const raw = readFileSync(file, 'utf8');
const updates = JSON.parse(raw.slice(raw.indexOf('[')));
const ios = updates.find((u) => u.platform === 'ios') ?? updates[0];
if (!ios) throw new Error('لا توجد نسخة منشورة في الناتج');
const rv = ios.runtimeVersion;
const channelLink = `exp://u.expo.dev/${projectId}?runtime-version=${encodeURIComponent(rv)}&channel-name=${encodeURIComponent(channel)}`;
const groupLink = `exp://u.expo.dev/${projectId}/group/${ios.group}`;
const qr = `https://qr.expo.dev/eas-update?projectId=${projectId}&runtimeVersion=${encodeURIComponent(rv)}&channel=${encodeURIComponent(channel)}`;
const lines = [
  `## تطبيق «ساحة» — القناة ${channel}`,
  '',
  `- نسخة التشغيل: \`${rv}\``,
  `- رابط Expo Go الدائم (آخر نسخة دائماً): \`${channelLink}\``,
  `- رابط هذه النسخة بالتحديد: \`${groupLink}\``,
  `- رمز QR: ${qr}`,
  `- المجموعة: \`${ios.group}\``,
  '',
];
console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `channel_link=${channelLink}\ngroup=${ios.group}\nruntime=${rv}\n`);
if (!rv.startsWith('exposdk:')) console.log(`::warning title=Expo Go::نسخة التشغيل ${rv} لا تبدأ بـ exposdk: — قد لا يفتحها Expo Go`);
