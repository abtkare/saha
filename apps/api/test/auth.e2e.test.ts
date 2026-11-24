/**
 * اختبار تكامل للدخول والأدوار: يشغّل الخادم المبني (dist) على قاعدة حقيقية ويستدعيه عبر HTTP.
 * يتطلب: pnpm build + prisma migrate deploy + DATABASE_URL.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { Client } from 'pg';
import { hashPassword, totpCode } from '../src/auth/crypto';

const PORT = 3100 + randomInt(0, 800);
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const db = new Client({ connectionString: process.env.DATABASE_URL });
let server: ChildProcess;
let log = '';

const run = Date.now() % 1_000_000;
let seq = 0;
const newPhone = () => `077${String(run).padStart(6, '0')}${String(++seq).padStart(2, '0')}`;
const YEAR = new Date().getFullYear();

async function api(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json as any };
}

async function phoneLogin(phone: string, profile: Record<string, unknown> = { fullName: 'مستخدم اختبار', birthYear: 1990 }) {
  expect((await api('POST', '/auth/otp/request', { phone })).status).toBe(200);
  const r = await api('POST', '/auth/otp/verify', { phone, code: '000000', ...profile });
  return r;
}

async function insertUser(fields: { phone?: string; email?: string; fullName?: string; birthYear?: number; passwordHash?: string }) {
  const { rows } = await db.query(
    `INSERT INTO users (phone, email, full_name, birth_year, password_hash, updated_at) VALUES ($1,$2,$3,$4,$5, now()) RETURNING id`,
    [fields.phone ?? null, fields.email ?? null, fields.fullName ?? 'مستخدم', fields.birthYear ?? 1990, fields.passwordHash ?? null],
  );
  return rows[0].id as number;
}
const grant = (userId: number, role: string, scope: { tournamentId?: number; teamId?: number } = {}) =>
  db.query(`INSERT INTO user_roles (user_id, role, tournament_id, team_id) VALUES ($1,$2,$3,$4)`, [userId, role, scope.tournamentId ?? null, scope.teamId ?? null]);

beforeAll(async () => {
  await db.connect();
  const env: NodeJS.ProcessEnv = {
    ...process.env, PORT: String(PORT), NODE_ENV: 'test', OTP_PROVIDER: 'dev', PUSH_PROVIDER: 'off', /* مُرسل Expo Push في push.e2e وحده: القاعدة مشتركة بين الملفات المتوازية */
    JWT_SECRET: 'test-jwt-secret-'.padEnd(48, 'x'), JWT_REFRESH_SECRET: 'test-refresh-secret-'.padEnd(48, 'y'),
    SWAGGER_ENABLED: 'true',
  };
  delete env.REDIS_URL;
  server = spawn(process.execPath, ['dist/src/main.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout?.on('data', (d) => { log += d; });
  server.stderr?.on('data', (d) => { log += d; });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) return; } catch { /* ننتظر */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`الخادم لم يقلع:\n${log}`);
}, 40_000);

afterAll(async () => {
  server?.kill();
  // تنظيف ما أنشأه الاختبار حتى لا يمنع زرع البيانات التجريبية بعده في CI
  await db.query(`DELETE FROM tournaments WHERE slug LIKE $1`, [`t_-${run}`]);
  await db.query(`DELETE FROM teams WHERE name_ar IN ('فريق أ', 'فريق ب')`);
  await db.end();
});

describe('الدخول بالهاتف OTP', () => {
  it('مستخدم جديد: profile_required ثم حساب فعّال بلا صلاحيات', async () => {
    const phone = newPhone();
    await api('POST', '/auth/otp/request', { phone });
    const first = await api('POST', '/auth/otp/verify', { phone, code: '000000' });
    expect(first.body.status).toBe('profile_required');
    const second = await api('POST', '/auth/otp/verify', { phone, code: '000000', fullName: 'علي حسن', birthYear: 1995 });
    expect(second.status).toBe(200);
    expect(second.body.status).toBe('ok');
    const me = await api('GET', '/me', undefined, second.body.accessToken);
    expect(me.body).toMatchObject({ fullName: 'علي حسن', status: 'active', permissions: [] });
    expect(me.body.phone).toBe(`+964${phone.slice(1)}`);
  });

  it('رقم غير صحيح ورمز خاطئ برسائل عربية', async () => {
    const bad = await api('POST', '/auth/otp/request', { phone: '12345' });
    expect(bad.body.code).toBe('INVALID_PHONE');
    const phone = newPhone();
    await api('POST', '/auth/otp/request', { phone });
    const wrong = await api('POST', '/auth/otp/verify', { phone, code: '123456', fullName: 'س', birthYear: 1990 });
    expect(wrong.status).toBe(400);
  });

  it('Rate Limit: الطلب الرابع للرقم نفسه خلال 10 دقائق يُرفض', async () => {
    const phone = newPhone();
    for (let i = 0; i < 3; i++) expect((await api('POST', '/auth/otp/request', { phone })).status).toBe(200);
    const fourth = await api('POST', '/auth/otp/request', { phone });
    expect(fourth.status).toBe(429);
    expect(fourth.body.message).toMatch(/دقيقة/);
  });

  it('5 محاولات خاطئة تُلغي الرمز', async () => {
    const phone = newPhone();
    await api('POST', '/auth/otp/request', { phone });
    let last;
    for (let i = 0; i < 5; i++) last = await api('POST', '/auth/otp/verify', { phone, code: '111111', fullName: 'سعد', birthYear: 1990 });
    expect(last!.body.code).toBe('OTP_LOCKED');
    const after = await api('POST', '/auth/otp/verify', { phone, code: '000000', fullName: 'سعد', birthYear: 1990 });
    expect(after.body.code).toBe('OTP_EXPIRED');
  });
});

describe('ولي الأمر', () => {
  it('القاصر يحتاج ولي أمر، وحسابه بلا صلاحية حتى الموافقة', async () => {
    const kid = newPhone();
    const parent = newPhone();
    await api('POST', '/auth/otp/request', { phone: kid });
    const noGuardian = await api('POST', '/auth/otp/verify', { phone: kid, code: '000000', fullName: 'يوسف', birthYear: YEAR - 15 });
    expect(noGuardian.body.code).toBe('GUARDIAN_REQUIRED');
    // الرمز لم يُستهلك بسبب الخطأ في الحقول
    const ok = await api('POST', '/auth/otp/verify', { phone: kid, code: '000000', fullName: 'يوسف', birthYear: YEAR - 15, guardianPhone: parent });
    expect(ok.body.status).toBe('pending_guardian');
    const kidToken = ok.body.accessToken;
    expect((await api('GET', '/me', undefined, kidToken)).body.status).toBe('pending_guardian');
    expect((await api('POST', '/me/guardian/children', { firstName: 'س', birthYear: YEAR - 10 }, kidToken)).status).toBe(403);

    // ولي الأمر يدخل برقمه (حسابه أُنشئ ناقصاً) ويكمل بياناته ثم يوافق
    const p = await phoneLogin(parent, {});
    expect(p.body.status).toBe('ok');
    const pt = p.body.accessToken;
    const wards = await api('GET', '/me/wards', undefined, pt);
    expect(wards.body).toHaveLength(1);
    const early = await api('POST', `/me/wards/${wards.body[0].id}/approve`, {}, pt);
    expect(early.body.code).toBe('GUARDIAN_PROFILE_REQUIRED');
    expect((await api('PATCH', '/me', { fullName: 'حسن يوسف', birthYear: 1980 }, pt)).status).toBe(200);
    expect((await api('POST', `/me/wards/${wards.body[0].id}/approve`, {}, pt)).status).toBe(200);
    expect((await api('GET', '/me', undefined, kidToken)).body.status).toBe('active');

    // ابن بلا حساب + موافقة الصور
    const child = await api('POST', '/me/guardian/children', { firstName: 'زينب', birthYear: YEAR - 9 }, pt);
    expect(child.body.mediaConsent).toBe(false);
    const c = await api('PATCH', `/me/children/${child.body.id}/consent`, { mediaConsent: true }, pt);
    expect(c.body.mediaConsent).toBe(true);
    const other = await phoneLogin(newPhone());
    expect((await api('PATCH', `/me/children/${child.body.id}/consent`, { mediaConsent: false }, other.body.accessToken)).status).toBe(404);
  });
});

describe('الجلسات', () => {
  it('تدوير رمز التجديد، وإعادة استخدام رمز قديم تُلغي كل الجلسات', async () => {
    const login = await phoneLogin(newPhone());
    const r1 = await api('POST', '/auth/refresh', { refreshToken: login.body.refreshToken });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(login.body.refreshToken);
    const reuse = await api('POST', '/auth/refresh', { refreshToken: login.body.refreshToken });
    expect(reuse.status).toBe(401);
    expect((await api('POST', '/auth/refresh', { refreshToken: r1.body.refreshToken })).status).toBe(401);
    expect((await api('GET', '/me', undefined, r1.body.accessToken)).status).toBe(401);
  });

  it('رمز مزوّر أو بلا رمز = 401', async () => {
    expect((await api('GET', '/me')).status).toBe(401);
    expect((await api('GET', '/me', undefined, 'abc.def.ghi')).status).toBe(401);
  });
});

describe('دخول الإدارة بـ TOTP', () => {
  it('كلمة سر ← إعداد TOTP ← جلسة إدارة؛ والرمز نفسه لا يُستخدم مرتين', async () => {
    const email = `admin-${run}@test.saha`;
    const uid = await insertUser({ email, fullName: 'مدير اختبار', passwordHash: hashPassword('كلمة-سر-الاختبار-123') });
    await grant(uid, 'super_admin');

    const wrong = await api('POST', '/auth/admin/login', { email, password: 'خطأ' });
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');

    const l1 = await api('POST', '/auth/admin/login', { email, password: 'كلمة-سر-الاختبار-123' });
    expect(l1.body.status).toBe('totp_setup_required');
    const setup = await api('POST', '/auth/admin/totp/setup', {}, l1.body.setupToken);
    expect(setup.body.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    const code = totpCode(setup.body.secret);
    const en = await api('POST', '/auth/admin/totp/enable', { code }, l1.body.setupToken);
    expect(en.body.status).toBe('ok');

    const me = await api('GET', '/me', undefined, en.body.accessToken);
    expect(me.body.mfa).toBe(true);
    expect(me.body.permissions).toContain('audit.verify');

    const verify = await api('GET', '/admin/audit/verify', undefined, en.body.accessToken);
    expect(verify.status).toBe(200);
    expect(verify.body.ok).toBe(true);

    const noTotp = await api('POST', '/auth/admin/login', { email, password: 'كلمة-سر-الاختبار-123' });
    expect(noTotp.body.code).toBe('TOTP_REQUIRED');
    const replay = await api('POST', '/auth/admin/login', { email, password: 'كلمة-سر-الاختبار-123', totp: code });
    expect(replay.body.code).toBe('TOTP_INVALID');

    // رمز الإعداد لا يصلح للدخول العادي، وSwagger يُفتح للمدير فقط
    expect((await api('GET', '/me', undefined, l1.body.setupToken)).status).toBe(401);
    expect((await fetch(`http://127.0.0.1:${PORT}/api/docs`)).status).toBe(401);
    expect((await fetch(`http://127.0.0.1:${PORT}/api/docs`, { headers: { authorization: `Bearer ${en.body.accessToken}` } })).status).toBe(200);
  });
});

describe('الصلاحيات عبر HTTP', () => {
  it('كل دور يصل لنطاقه فقط', async () => {
    const managerId = await insertUser({ fullName: 'مدير فرق' });
    const teams = await db.query(`INSERT INTO teams (name_ar, manager_id) VALUES ('فريق أ', $1), ('فريق ب', $1) RETURNING id`, [managerId]);
    const [teamA, teamB] = teams.rows.map((r) => r.id as number);
    const tours = await db.query(
      `INSERT INTO tournaments (name_ar, slug, format, status, updated_at) VALUES ('ب1', $1, 'league', 'running', now()), ('ب2', $2, 'league', 'running', now()) RETURNING id`,
      [`t1-${run}`, `t2-${run}`],
    );
    const [t1, t2] = tours.rows.map((r) => r.id as number);

    const tmPhone = newPhone();
    const tm = await insertUser({ phone: `+964${tmPhone.slice(1)}`, fullName: 'مدير فريق أ' });
    await grant(tm, 'team_manager', { teamId: teamA });
    const tmTok = (await phoneLogin(tmPhone)).body.accessToken;
    expect((await api('GET', `/teams/${teamA}/players`, undefined, tmTok)).status).toBe(200);
    expect((await api('GET', `/teams/${teamB}/players`, undefined, tmTok)).status).toBe(403);
    expect((await api('GET', `/tournaments/${t1}/registrations`, undefined, tmTok)).status).toBe(403);
    expect((await api('GET', '/admin/users', undefined, tmTok)).status).toBe(403);
    expect((await api('GET', '/admin/audit/verify', undefined, tmTok)).status).toBe(403);

    const trPhone = newPhone();
    const tr = await insertUser({ phone: `+964${trPhone.slice(1)}`, fullName: 'مدير بطولة' });
    await grant(tr, 'tournament_manager', { tournamentId: t1 });
    const trTok = (await phoneLogin(trPhone)).body.accessToken;
    expect((await api('GET', `/tournaments/${t1}/registrations`, undefined, trTok)).status).toBe(200);
    expect((await api('GET', `/tournaments/${t2}/registrations`, undefined, trTok)).status).toBe(403);
    expect((await api('GET', `/teams/${teamA}/players`, undefined, trTok)).status).toBe(403);

    // المدير العام بدخول الهاتف (بلا TOTP) لا يملك صلاحيات الإدارة
    const saPhone = newPhone();
    const sa = await insertUser({ phone: `+964${saPhone.slice(1)}`, fullName: 'مدير عام بالهاتف' });
    await grant(sa, 'super_admin');
    const saTok = (await phoneLogin(saPhone)).body.accessToken;
    expect((await api('GET', '/admin/audit/verify', undefined, saTok)).status).toBe(403);
    expect((await api('GET', `/teams/${teamA}/players`, undefined, saTok)).status).toBe(403);
  });
});
