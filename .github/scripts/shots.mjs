// لقطات CI للموقع واللوحة (فاتح وداكن، جوال وحاسوب) عبر Chrome DevTools Protocol — بلا حزم إضافية.
// الاستخدام: node shots.mjs <BASE> <OUT_DIR> [--preview]
// يدخل كمدير عام عبر الـ API (يفعّل TOTP بحساب الرمز هنا) ليلتقط صفحات اللوحة وبوابة الراعي.
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

const [BASE = 'http://localhost:8098', OUT = 'shots', MODE] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───── TOTP (RFC 6238) ─────
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32(s) { let bits = 0, v = 0; const out = []; for (const c of s.replace(/=+$/, '')) { v = (v << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); }
function totp(secret, t = Date.now()) {
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(Math.floor(t / 30000)));
  const h = createHmac('sha1', b32(secret)).update(buf).digest(); const o = h[h.length - 1] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0');
}
async function post(path, body, token) {
  const r = await fetch(`${BASE}/api/v1${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body ?? {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path} ${r.status} ${JSON.stringify(j)}`);
  return j;
}
async function adminTokens() {
  const email = process.env.ADMIN_EMAIL ?? 'admin@saha.local';
  const password = process.env.ADMIN_PASSWORD ?? 'change_me_dev';
  const l = await post('/auth/admin/login', { email, password });
  if (l.status !== 'totp_setup_required') throw new Error('expected totp setup');
  const s = await post('/auth/admin/totp/setup', {}, l.setupToken);
  return post('/auth/admin/totp/enable', { code: totp(s.secret) }, l.setupToken);
}

// ───── CDP ─────
const port = 9333;
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--hide-scrollbars', `--remote-debugging-port=${port}`, '--force-device-scale-factor=1', 'about:blank'], { stdio: 'ignore' });
let ws;
for (let i = 0; i < 50 && !ws; i++) {
  try { const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); ws = v.webSocketDebuggerUrl; } catch { await sleep(200); }
}
const sock = new WebSocket(ws);
await new Promise((r) => sock.addEventListener('open', r, { once: true }));
let seq = 0; const pending = new Map();
sock.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++seq; pending.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result))); sock.send(JSON.stringify({ id, method, params, sessionId })); });

async function shot(name, path, [w, h], { theme = 'light', tokens = null, wait = 2500 } = {}) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  await s('Page.enable');
  await s('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  // نفس الأصل أولاً لكتابة التخزين (الوضع، تخطي شاشة البداية، رموز الدخول)
  await s('Page.navigate', { url: `${BASE}/robots.txt` }); await sleep(400);
  const store = `localStorage.setItem('saha_theme','${theme}');sessionStorage.setItem('saha_splash','1');` +
    (tokens ? `localStorage.setItem('saha_auth',${JSON.stringify(JSON.stringify({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }))});` : `localStorage.removeItem('saha_auth');`);
  await s('Runtime.evaluate', { expression: store });
  await s('Page.navigate', { url: `${BASE}${path}` }); await sleep(wait);
  const { result } = await s('Runtime.evaluate', { expression: 'Math.min(document.documentElement.scrollHeight, 9000)', returnByValue: true });
  const full = Math.max(h, result.value);
  await s('Emulation.setDeviceMetricsOverride', { width: w, height: full, deviceScaleFactor: 1, mobile: w < 600 }); await sleep(400);
  const { data } = await s('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: w, height: full, scale: 1 } });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, 'base64'));
  await send('Target.closeTarget', { targetId });
  console.log('📸', name, path, theme);
}

const D = [1440, 900], M = [390, 844];
try {
  if (MODE === '--preview') {
    await shot('5-preview-dark', '/?theme=dark', D, { theme: 'dark' });
  } else {
    const j = await (await fetch(`${BASE}/api/v1/tournaments/baghdad-sahat-2026`)).json();
    const match = j.matches?.[0]?.id ?? 1;
    const team = j.registrations?.[0]?.team?.id ?? 1;
    await shot('5-web-home-dark', '/', D, { theme: 'dark' });
    await shot('6-web-home-dark-mobile', '/', M, { theme: 'dark' });
    await shot('7-web-tournaments', '/tournaments', D);
    await shot('8-web-match', `/matches/${match}`, D);
    await shot('8-web-match-dark-mobile', `/matches/${match}`, M, { theme: 'dark' });
    await shot('9-web-team-mobile', `/teams/${team}`, M);
    await shot('10-web-news', '/news/saha-launch', D);
    await shot('11-web-sponsor-mobile', '/sponsor', M);
    await shot('12-web-admin-login-mobile', '/admin', M);
    const t = await adminTokens();
    await shot('13-admin-dashboard', '/admin', D, { tokens: t });
    await shot('14-admin-dashboard-dark-mobile', '/admin', M, { tokens: t, theme: 'dark' });
    await shot('15-admin-tournament', '/admin/tournaments/1', D, { tokens: t });
    await shot('16-admin-slides', '/admin/slides', D, { tokens: t });
    await shot('17-admin-posts-mobile', '/admin/posts', M, { tokens: t });
    await shot('18-admin-users', '/admin/users', D, { tokens: t });
    await shot('19-admin-audit-dark', '/admin/audit', D, { tokens: t, theme: 'dark' });
    await shot('20-sponsor-portal', '/sponsor/portal?sponsorId=1', D, { tokens: t });
    await shot('21-sponsor-portal-mobile', '/sponsor/portal?sponsorId=1', M, { tokens: t });
    // الجلسة 16: جوائز البطولة التجريبية — قيم، فائز للمركز الأول، إعلان
    const tok = t.accessToken;
    const req = async (method, path, body) => {
      const r = await fetch(`${BASE}/api/v1${path}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: body ? JSON.stringify(body) : undefined });
      const x = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(x)}`);
      return x;
    };
    const vals = [['team_place', 1, 3000000, 'كأس البطولة'], ['team_place', 2, 1500000], ['team_place', 3, 750000], ['best_player', 1, 500000], ['best_player', 2, 250000], ['best_player', 3, 0, 'ميدالية ذهبية']];
    const made = [];
    for (const [category, rank, amountIqd, extraAr] of vals) made.push(await req('POST', '/admin/prizes', { tournamentId: j.id, category, rank, amountIqd, ...(extraAr ? { extraAr } : {}) }));
    await req('PATCH', `/admin/prizes/${made[0].id}`, { teamId: team });
    await req('POST', `/admin/prizes/${made[0].id}/deliver`, { note: 'نقداً في حفل الختام' });
    await req('POST', `/admin/tournaments/${j.id}/prizes/announce`, { announced: true, notify: false });
    await shot('22-web-tournament-prizes', `/tournaments/baghdad-sahat-2026`, D);
    await shot('23-web-tournament-prizes-dark-mobile', `/tournaments/baghdad-sahat-2026`, M, { theme: 'dark' });
    await shot('24-admin-prizes', `/admin/prizes?t=${j.id}`, D, { tokens: t });
    await shot('25-admin-prizes-mobile', `/admin/prizes?t=${j.id}`, M, { tokens: t });
    await shot('26-web-prizes-archive', '/prizes', D);
    // الجلسة 17: بيانات العرض — خمس بطولات بكل الحالات
    await req('POST', '/admin/demo/showcase');
    await shot('27-admin-dashboard-showcase', '/admin', D, { tokens: t });
    await shot('28-web-home-showcase', '/', D);
    await shot('29-web-knockout-finished', '/tournaments/demo-abuhaider-cup', D);
    await shot('30-web-groups-running-mobile', '/tournaments/demo-basra-groups', M);
    await shot('31-web-prizes-archive-showcase', '/prizes', D);
  }
} finally {
  sock.close(); chrome.kill();
}
