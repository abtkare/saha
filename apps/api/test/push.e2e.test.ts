/**
 * اختبار تكامل الجلسة 7 — إشعارات الهاتف عبر Expo Push، على الخادم المبني وقاعدة حقيقية وخادم Expo وهمي:
 * تسجيل رمز الجهاز والتحقق منه، الإرسال بعد كتابة الإشعار (مرة واحدة فقط)، الشارة بعدد غير المقروء،
 * تعطيل الجهاز غير المسجل (DeviceNotRegistered)، انتقال الرمز لمن دخل أخيراً، الحذف عند الخروج،
 * الإشعار القديم لا يُرسل، تذكير المباراة قبل ساعة (مرة واحدة)، وإشعار قرار تسجيل الفريق.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { randomInt } from 'node:crypto';
import { Client } from 'pg';
import { hashPassword, totpCode } from '../src/auth/crypto';
import { buildMessages, chunk, deadTokens } from '../src/notifications/push';

const PORT = 3100 + randomInt(0, 800);
const EXPO_PORT = PORT + 1000;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const db = new Client({ connectionString: process.env.DATABASE_URL });
let server: ChildProcess;
let expo: Server;
let log = '';

const run = (Date.now() + 13) % 1_000_000;
let seq = 10;
const newPhone = () => `078${String(run).padStart(6, '0')}${String(++seq).padStart(2, '0')}`;
let ipSeq = 0;
const fakeIp = () => `10.${(run >> 8) & 255}.${(run + 7) & 255}.${++ipSeq}`;

type Msg = { to: string; title: string; body: string; badge: number; sound: string; data: Record<string, unknown> };
const received: Msg[] = [];
const sentTo = (token: string) => received.filter((m) => m.to === token);
const tok = (name: string) => `ExponentPushToken[${name}${run}]`;

async function api(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}

async function login(fullName: string, birthYear = 1990) {
  const phone = newPhone();
  const h = { 'content-type': 'application/json', 'x-forwarded-for': fakeIp() };
  await fetch(`${BASE}/auth/otp/request`, { method: 'POST', headers: h, body: JSON.stringify({ phone }) });
  const r = await (await fetch(`${BASE}/auth/otp/verify`, { method: 'POST', headers: h, body: JSON.stringify({ phone, code: '000000', fullName, birthYear }) })).json() as any;
  expect(r.accessToken, JSON.stringify(r)).toBeTruthy();
  const me = await api('GET', '/me', undefined, r.accessToken);
  return { token: r.accessToken as string, id: me.body.id as number };
}

async function waitFor(check: () => Promise<boolean> | boolean, ms = 10_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

const notifyDb = (userId: number, title: string, data: object = {}, age = '0 minutes') =>
  db.query(`INSERT INTO notifications (user_id, title_ar, body_ar, data, created_at) VALUES ($1,$2,'نص الإشعار',$3, now() - $4::interval) RETURNING id`, [userId, title, JSON.stringify(data), age])
    .then((r) => r.rows[0].id as number);

let a: { token: string; id: number }, b: { token: string; id: number };
const createdTeams: number[] = [];
const slug = `e2e7-push-${run}`;

beforeAll(async () => {
  await db.connect();
  expo = createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      const msgs = JSON.parse(raw) as Msg[];
      received.push(...msgs);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        data: msgs.map((m) => (m.to.includes('Dead')
          ? { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } }
          : { status: 'ok', id: `ticket-${Math.random()}` })),
      }));
    });
  });
  await new Promise<void>((r) => expo.listen(EXPO_PORT, '127.0.0.1', r));

  const env: NodeJS.ProcessEnv = {
    ...process.env, PORT: String(PORT), NODE_ENV: 'test', OTP_PROVIDER: 'dev', RESULT_SWEEP_SECONDS: '0',
    PUSH_SWEEP_SECONDS: '1', EXPO_PUSH_URL: `http://127.0.0.1:${EXPO_PORT}/--/api/v2/push/send`,
    JWT_SECRET: 'test-jwt-secret-'.padEnd(48, 'x'), JWT_REFRESH_SECRET: 'test-refresh-secret-'.padEnd(48, 'y'),
  };
  delete env.REDIS_URL;
  server = spawn(process.execPath, ['dist/src/main.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout?.on('data', (d) => { log += d; });
  server.stderr?.on('data', (d) => { log += d; });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) break; } catch { /* ننتظر */ }
    await new Promise((r) => setTimeout(r, 500));
    if (i === 59) throw new Error(`الخادم لم يقلع:\n${log}`);
  }
  a = await login('مستخدم الإشعارات أ');
  b = await login('مستخدم الإشعارات ب');
}, 60_000);

afterAll(async () => {
  server?.kill();
  expo?.close();
  await db.query(`DELETE FROM tournaments WHERE slug = $1`, [slug]);
  if (createdTeams.length) await db.query(`DELETE FROM teams WHERE id = ANY($1)`, [createdTeams]);
  await db.query(`DELETE FROM push_tokens WHERE token LIKE $1`, [`%${run}]`]);
  await db.end();
  if (process.env.SHOW_API_LOG) console.log(log);
});

describe('منطق الرسائل (خالص)', () => {
  it('رسالة لكل جهاز من أجهزة صاحب الإشعار، والشارة بعدد غير المقروء، ورقم الإشعار في data', () => {
    const msgs = buildMessages(
      [{ id: 7, userId: 1, titleAr: 'عنوان', bodyAr: 'نص', data: { type: 'x', matchId: 3 } }, { id: 8, userId: 2, titleAr: 'ب', bodyAr: 'ب', data: null }],
      [{ userId: 1, token: 't1' }, { userId: 1, token: 't2' }, { userId: 3, token: 't3' }],
      new Map([[1, 4]]),
    );
    expect(msgs.map((m) => m.to)).toEqual(['t1', 't2']);
    expect(msgs[0]).toMatchObject({ title: 'عنوان', body: 'نص', badge: 4, sound: 'default', data: { type: 'x', matchId: 3, notificationId: 7 } });
  });
  it('التقسيم إلى دفعات من 100، واستخراج الأجهزة غير المسجلة بالترتيب', () => {
    expect(chunk(Array.from({ length: 250 }, (_, i) => i), 100).map((c) => c.length)).toEqual([100, 100, 50]);
    const msgs = buildMessages([{ id: 1, userId: 1, titleAr: 'ع', bodyAr: 'ن', data: {} }], [{ userId: 1, token: 'a' }, { userId: 1, token: 'b' }], new Map());
    expect(deadTokens(msgs, [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }])).toEqual(['b']);
    expect(deadTokens(msgs, [{ status: 'error', details: { error: 'MessageRateExceeded' } }, { status: 'ok' }])).toEqual([]);
  });
});

describe('تسجيل جهاز الإشعارات', () => {
  it('يحتاج دخولاً، ويرفض الرمز والنظام غير الصالحين برمز ثابت', async () => {
    expect((await api('POST', '/me/push-tokens', { token: tok('Good'), platform: 'ios' })).status).toBe(401);
    const bad = await api('POST', '/me/push-tokens', { token: 'abc', platform: 'ios' }, a.token);
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('INVALID_PUSH_TOKEN');
    expect((await api('POST', '/me/push-tokens', { token: tok('Good'), platform: 'windows' }, a.token)).status).toBe(400);
  });

  it('يسجل الجهاز، وتكراره لا يكرر السطر', async () => {
    for (let i = 0; i < 2; i++) expect((await api('POST', '/me/push-tokens', { token: tok('Good'), platform: 'ios' }, a.token)).status).toBe(200);
    expect((await api('POST', '/me/push-tokens', { token: tok('Dead'), platform: 'android' }, a.token)).status).toBe(200);
    expect((await api('POST', '/me/push-tokens', { token: tok('Bee'), platform: 'ios' }, b.token)).status).toBe(200);
    const { rows } = await db.query(`SELECT user_id, count(*)::int AS n FROM push_tokens WHERE token LIKE $1 GROUP BY user_id ORDER BY user_id`, [`%${run}]`]);
    expect(rows).toEqual([{ user_id: a.id, n: 2 }, { user_id: b.id, n: 1 }]);
  });
});

describe('الإرسال', () => {
  it('الإشعار يصل لكل أجهزة صاحبه مرة واحدة، بالشارة ورقم الإشعار، ولا يصل لغيره', async () => {
    await db.query(`UPDATE notifications SET read_at = now() WHERE user_id = $1`, [a.id]);
    const id = await notifyDb(a.id, 'نتيجة بانتظار تأكيدك', { type: 'result.entered', matchId: 42 });
    expect(await waitFor(() => sentTo(tok('Good')).length > 0 && sentTo(tok('Dead')).length > 0), log).toBe(true);
    const m = sentTo(tok('Good'))[0];
    expect(m).toMatchObject({ title: 'نتيجة بانتظار تأكيدك', body: 'نص الإشعار', badge: 1, sound: 'default', data: { type: 'result.entered', matchId: 42, notificationId: id } });
    expect(sentTo(tok('Bee'))).toHaveLength(0);
    const row = (await db.query(`SELECT pushed_at FROM notifications WHERE id = $1`, [id])).rows[0];
    expect(row.pushed_at).not.toBeNull();
    await new Promise((r) => setTimeout(r, 2500));
    expect(sentTo(tok('Good'))).toHaveLength(1);
  });

  it('الجهاز الذي يقول Expo إنه غير مسجل يُعطَّل ولا يُرسل له بعدها', async () => {
    expect(await waitFor(async () => (await db.query(`SELECT disabled_at FROM push_tokens WHERE token = $1`, [tok('Dead')])).rows[0].disabled_at !== null)).toBe(true);
    await notifyDb(a.id, 'إشعار ثان');
    expect(await waitFor(() => sentTo(tok('Good')).length === 2)).toBe(true);
    expect(sentTo(tok('Good'))[1].badge).toBe(2);
    expect(sentTo(tok('Dead'))).toHaveLength(1);
  });

  it('إعادة تسجيل الجهاز تعيد تفعيله', async () => {
    await api('POST', '/me/push-tokens', { token: tok('Dead'), platform: 'android' }, a.token);
    expect((await db.query(`SELECT disabled_at FROM push_tokens WHERE token = $1`, [tok('Dead')])).rows[0].disabled_at).toBeNull();
  });

  it('الإشعار الأقدم من 30 دقيقة لا يُرسل للهاتف (يبقى داخل التطبيق)', async () => {
    const before = sentTo(tok('Good')).length;
    const id = await notifyDb(a.id, 'إشعار قديم', {}, '2 hours');
    expect(await waitFor(async () => (await db.query(`SELECT pushed_at FROM notifications WHERE id = $1`, [id])).rows[0].pushed_at !== null)).toBe(true);
    await new Promise((r) => setTimeout(r, 1500));
    expect(sentTo(tok('Good')).filter((m) => m.title === 'إشعار قديم')).toHaveLength(0);
    expect(sentTo(tok('Good')).length).toBe(before);
    const list = await api('GET', '/me/notifications?limit=50', undefined, a.token);
    expect(list.body.items.some((n: any) => n.titleAr === 'إشعار قديم')).toBe(true);
  });

  it('الجهاز ينتقل لمن سجّل الدخول عليه أخيراً', async () => {
    expect((await api('POST', '/me/push-tokens', { token: tok('Good'), platform: 'ios' }, b.token)).status).toBe(200);
    const before = sentTo(tok('Good')).length;
    await notifyDb(a.id, 'لـ أ فقط');
    await notifyDb(b.id, 'لـ ب على الجهاز المنقول');
    expect(await waitFor(() => sentTo(tok('Good')).some((m) => m.title === 'لـ ب على الجهاز المنقول'))).toBe(true);
    await new Promise((r) => setTimeout(r, 1200));
    expect(sentTo(tok('Good')).slice(before).map((m) => m.title)).toEqual(['لـ ب على الجهاز المنقول']);
  });

  it('الخروج يحذف الجهاز (ولا يحذف جهاز مستخدم آخر)', async () => {
    expect((await api('DELETE', '/me/push-tokens', { token: tok('Bee') }, a.token)).body.removed).toBe(0);
    expect((await api('DELETE', '/me/push-tokens', { token: tok('Bee') }, b.token)).body.removed).toBe(1);
    expect((await db.query(`SELECT count(*)::int AS n FROM push_tokens WHERE token = $1`, [tok('Bee')])).rows[0].n).toBe(0);
  });
});

describe('إشعارات البطولة والمباراة', () => {
  it('قرار التسجيل يُشعر مدير الفريق، وتذكير المباراة قبل ساعة يصل مرة واحدة للحكم والفريقين', async () => {
    const email = `t7-admin-${run}@test.saha`;
    const { rows } = await db.query(
      `INSERT INTO users (email, full_name, birth_year, password_hash, updated_at) VALUES ($1,'مدير عام الجلسة 7',1980,$2, now()) RETURNING id`,
      [email, hashPassword('كلمة-سر-الجلسة-7')],
    );
    await db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1,'super_admin')`, [rows[0].id]);
    const h = { 'content-type': 'application/json', 'x-forwarded-for': fakeIp() };
    const l1 = await (await fetch(`${BASE}/auth/admin/login`, { method: 'POST', headers: h, body: JSON.stringify({ email, password: 'كلمة-سر-الجلسة-7' }) })).json() as any;
    const setup = await (await fetch(`${BASE}/auth/admin/totp/setup`, { method: 'POST', headers: { ...h, authorization: `Bearer ${l1.setupToken}` }, body: '{}' })).json() as any;
    const admin = (await (await fetch(`${BASE}/auth/admin/totp/enable`, { method: 'POST', headers: { ...h, authorization: `Bearer ${l1.setupToken}` }, body: JSON.stringify({ code: totpCode(setup.secret) }) })).json() as any).accessToken as string;
    expect(admin).toBeTruthy();

    const mgrs = [];
    for (let i = 1; i <= 2; i++) {
      const u = await login(`مدير فريق الجلسة 7 رقم ${i}`);
      const t = await api('POST', '/teams', { nameAr: `فريق التذكير ${i}`, city: 'بغداد' }, u.token);
      expect(t.status, JSON.stringify(t.body)).toBe(201);
      createdTeams.push(t.body.id);
      await api('POST', '/me/push-tokens', { token: tok(`Mgr${i}x`), platform: 'ios' }, u.token);
      mgrs.push({ ...u, teamId: t.body.id as number });
    }
    const ref = await login('حكم الجلسة 7', 1985);
    await db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1,'referee')`, [ref.id]);

    const t = await api('POST', '/tournaments', { nameAr: 'اختبار تذكير المباريات', slug, kind: 'popular_teams', format: 'league' }, admin);
    expect(t.status, JSON.stringify(t.body)).toBe(201);
    const tid = t.body.id;
    await api('POST', `/tournaments/${tid}/status`, { status: 'registration' }, admin);
    for (const m of mgrs) {
      const r = await api('POST', `/tournaments/${tid}/registrations`, { teamId: m.teamId }, m.token);
      expect((await api('POST', `/tournaments/${tid}/registrations/${r.body.id}/decision`, { approve: true }, admin)).body.status).toBe('approved');
    }
    expect(await waitFor(() => sentTo(tok('Mgr1x')).some((m) => m.title === 'قُبل فريقك في البطولة' && m.data.tournamentId === tid))).toBe(true);

    expect((await api('POST', `/tournaments/${tid}/draw`, undefined, admin)).status).toBe(200);
    await api('POST', `/tournaments/${tid}/schedule`, { startDate: '2026-12-01', weekdays: [0, 1, 2, 3, 4, 5, 6], times: ['17:00'], venues: ['ساحة الكرادة'] }, admin);
    expect((await api('POST', `/tournaments/${tid}/status`, { status: 'running' }, admin)).body.status).toBe('running');
    const fx = await api('GET', `/tournaments/${tid}/fixtures`, undefined, admin);
    const match = fx.body.matches[0];
    expect((await api('PATCH', `/matches/${match.id}`, { refereeId: ref.id }, admin)).status).toBe(200);
    await db.query(`UPDATE matches SET kickoff_at = now() + interval '40 minutes' WHERE id = $1`, [match.id]);

    const reminders = async (userId: number) =>
      (await db.query(`SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND data->>'type' = 'match.reminder' AND (data->>'matchId')::int = $2`, [userId, match.id])).rows[0].n as number;
    expect(await waitFor(async () => (await reminders(ref.id)) === 1)).toBe(true);
    expect(await reminders(mgrs[0].id)).toBe(1);
    expect(await reminders(mgrs[1].id)).toBe(1);
    expect(await waitFor(() => sentTo(tok('Mgr2x')).some((m) => m.title === 'مباراتك بعد قليل' && m.data.matchId === match.id))).toBe(true);
    await new Promise((r) => setTimeout(r, 2500));
    expect(await reminders(ref.id)).toBe(1);

    // تغيير الموعد يعيد التذكير مرة واحدة للموعد الجديد
    const newTime = new Date(Date.now() + 50 * 60_000).toISOString().replace('Z', '+00:00');
    expect((await api('PATCH', `/matches/${match.id}`, { kickoffAt: newTime }, admin)).status).toBe(200);
    expect(await waitFor(async () => (await reminders(ref.id)) === 2)).toBe(true);
  }, 60_000);
});
