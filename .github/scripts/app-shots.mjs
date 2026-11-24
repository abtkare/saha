// لقطات تطبيق «ساحة» داخل Expo Go على محاكي آيفون (الجلسة 7).
// يفتح exp://127.0.0.1:8098/expo ثم يتنقّل بروابط داخلية (/--/…) ويلتقط كل شاشة فاتحة وداكنة.
// الدخول: حساب اختبار برمز OTP التجريبي (000000)، ويُمرَّر رمزاه في الرابط (يعمل فقط مع EXPO_CI_MODE=true على الخادم).
// الاستخدام: node app-shots.mjs <OUT_DIR>
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = process.argv[2] ?? 'app-shots';
const BASE = 'http://127.0.0.1:8098';
const EXP = 'exp://127.0.0.1:8098/expo';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sim = (...a) => execFileSync('xcrun', ['simctl', ...a], { stdio: ['ignore', 'pipe', 'inherit'] }).toString();
const log = [];

async function api(method, path, body, token) {
  const r = await fetch(`${BASE}/api/v1${path}`, { method, headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(j)}`);
  return j;
}
async function login(phone, fullName, birthYear = 1990) {
  await api('POST', '/auth/otp/request', { phone });
  const r = await api('POST', '/auth/otp/verify', { phone, code: '000000', fullName, birthYear });
  return r;
}

async function shot(name, wait = 4000) {
  await sleep(wait);
  sim('io', 'booted', 'screenshot', '--type=png', `${OUT}/${name}.png`);
  log.push(name);
  console.log('📸', name);
}
const open = (path = '', q = '') => sim('openurl', 'booted', `${EXP}/--/${path}${q ? `?${q}` : ''}`);

// ───── البيانات: مدير فريق + حكم لمباراة جارية ─────
const tours = await api('GET', '/tournaments');
const running = tours.find((t) => t.status === 'running') ?? tours[0];
const detail = await api('GET', `/tournaments/${running.slug}`);
const match = detail.matches.find((m) => m.resultStatus === 'scheduled') ?? detail.matches[0];
const anyMatch = detail.matches.find((m) => m.resultStatus !== 'scheduled') ?? match;
const teamId = detail.registrations[0].team.id;
const news = await api('GET', '/news?limit=1');

const mgr = await login('07790000101', 'مدير فريق التجربة');
const created = await api('POST', '/teams', { nameAr: 'نجوم التجربة', city: 'النجف' }, mgr.accessToken);
const ref = await login('07790000102', 'حكم التجربة', 1984);
const refMe = await api('GET', '/me', undefined, ref.accessToken);
writeFileSync(`${OUT}/ids.json`, JSON.stringify({ running: running.slug, match: match.id, anyMatch: anyMatch.id, teamId, created: created.id, ref: refMe.id }));
// يمنح الحكم دوره ويعيّنه للمباراة ويجعل موعدها قد مضى (يتم في الخطوة التالية من الـ workflow عبر psql)
console.log(`REF_ID=${refMe.id} MATCH_ID=${match.id}`);
writeFileSync(`${OUT}/../ref.sql`, `INSERT INTO user_roles (user_id, role) VALUES (${refMe.id}, 'referee'); UPDATE matches SET referee_id=${refMe.id}, kickoff_at = now() - interval '2 hours' WHERE id=${match.id};
INSERT INTO notifications (user_id, title_ar, body_ar, data) VALUES (${refMe.id}, 'مباراتك بعد قليل', 'شباب الكرادة × صقور المنصور الساعة 16:00 — بطولة ساحات بغداد.', '{"type":"match.reminder","matchId":${match.id}}'), (${refMe.id}, 'نتيجة بانتظار تأكيدك', 'أكّد النتيجة أو اعترض قبل انتهاء المهلة.', '{"type":"result.entered","matchId":${anyMatch.id}}');`);
if (process.argv[3] !== '--shots') process.exit(0);

// ───── اللقطات ─────
const q = (theme, t) => [`theme=${theme}`, t ? `ci_access=${encodeURIComponent(t.accessToken)}&ci_refresh=${encodeURIComponent(t.refreshToken)}` : ''].filter(Boolean).join('&');

sim('openurl', 'booted', EXP);
await shot('00-launch-splash', 3500);
await shot('01-home-light', 30000);

for (const theme of ['light', 'dark']) {
  const p = theme === 'light' ? '1' : '2';
  open('home', q(theme)); await shot(`${p}0-home-${theme}`, 5000);
  open('tournaments', q(theme)); await shot(`${p}1-tournaments-${theme}`);
  open(`tournaments/${running.slug}`, q(theme)); await shot(`${p}2-tournament-${theme}`);
  open(`matches/${anyMatch.id}`, q(theme)); await shot(`${p}3-match-${theme}`);
  open(`teams/${teamId}`, q(theme)); await shot(`${p}4-team-${theme}`);
  open('news', q(theme)); await shot(`${p}5-news-${theme}`);
  if (news[0]) { open(`news/${news[0].slug}`, q(theme)); await shot(`${p}6-post-${theme}`); }
  open('login', q(theme)); await shot(`${p}7-login-${theme}`);
}

// بعد الدخول (مدير فريق)
open('myteams', q('light', mgr)); await shot('30-myteams-manager', 6000);
open(`manage/${created.id}`, q('light')); await shot('31-team-manage');
open('account', q('light')); await shot('32-account');
open('family', q('light')); await shot('33-family');
// الحكم
open('myteams', q('dark', ref)); await shot('40-myteams-referee-dark', 6000);
open(`result/${match.id}`, q('dark')); await shot('41-result-entry-dark');
open('notifications', q('dark')); await shot('42-notifications-dark');
open(`matches/${match.id}`, q('light')); await shot('43-match-referee-light');

writeFileSync(`${OUT}/index.json`, JSON.stringify(log, null, 1));
