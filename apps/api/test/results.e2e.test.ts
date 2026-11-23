/**
 * اختبار تكامل الجلسة 4 — النتائج والاعتراضات، عبر HTTP على الخادم المبني وقاعدة حقيقية:
 * رفع صورة الورقة، إدخال النتيجة وتصحيحها، التأكيد المزدوج، انتهاء المهلة تلقائياً، الاعتراض،
 * لجنة الانضباط (رفض / تصحيح / إعادة)، ركلات الترجيح، الإشعارات، وأن المتنازع عليها لا تدخل الترتيب.
 * كل انتقال حالة مسموح مختبَر، وكل انتقال ممنوع يُرفض برمز ثابت.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomInt } from 'node:crypto';
import { Client } from 'pg';
import { hashPassword, totpCode } from '../src/auth/crypto';

const PORT = 3100 + randomInt(0, 800);
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const db = new Client({ connectionString: process.env.DATABASE_URL });
let server: ChildProcess;
let log = '';

const run = (Date.now() + 7) % 1_000_000;
let seq = 50;
const newPhone = () => `077${String(run).padStart(6, '0')}${String(++seq).padStart(2, '0')}`;
let ipSeq = 0;
const fakeIp = () => `10.${(run >> 8) & 255}.${(run + 1) & 255}.${++ipSeq}`;

async function api(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json as any };
}

async function upload(bytes: Buffer, token?: string, name = 'sheet.png') {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)]), name);
  const res = await fetch(`${BASE}/uploads`, { method: 'POST', body: form, headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}

async function login(fullName: string, birthYear = 1990) {
  const phone = newPhone();
  const ip = fakeIp();
  const h = { 'content-type': 'application/json', 'x-forwarded-for': ip };
  await fetch(`${BASE}/auth/otp/request`, { method: 'POST', headers: h, body: JSON.stringify({ phone }) });
  const r = await (await fetch(`${BASE}/auth/otp/verify`, { method: 'POST', headers: h, body: JSON.stringify({ phone, code: '000000', fullName, birthYear }) })).json() as any;
  expect(r.accessToken, JSON.stringify(r)).toBeTruthy();
  const me = await api('GET', '/me', undefined, r.accessToken);
  return { token: r.accessToken as string, id: me.body.id as number };
}

async function waitFor(check: () => Promise<boolean>, ms = 10_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(200)]);
const slug = (s: string) => `e2e4-${s}-${run}`;
const createdTeams: number[] = [];

let admin = '';
type U = { token: string; id: number };
type Mgr = U & { teamId: number };
let ref: U, ref2: U, outsider: U;
let c1: U, c2: U, c3: U, cOther: U;
const mgrs: Mgr[] = [];
let leagueId = 0, koId = 0;
type M = { id: number; homeTeam: { id: number }; awayTeam: { id: number } };
let matches: M[] = [];
const mgrOf = (teamId: number) => mgrs.find((m) => m.teamId === teamId)!;
const home = (m: M) => mgrOf(m.homeTeam.id);
const away = (m: M) => mgrOf(m.awayTeam.id);
let sheetId = 0;

const status = async (id: number) => (await db.query(`SELECT result_status FROM matches WHERE id=$1`, [id])).rows[0].result_status as string;
const backdate = (id: number, hours: number) => db.query(`UPDATE matches SET result_entered_at = now() - ($2::float8 * interval '1 hour') WHERE id=$1`, [id, hours]);
const result = (m: M, h: number, a: number, token = ref.token, extra: Record<string, unknown> = {}) =>
  api('POST', `/matches/${m.id}/result`, { homeScore: h, awayScore: a, sheetMediaId: sheetId, ...extra }, token);
const played = async () => {
  const s = await api('GET', `/tournaments/${slug('league')}/standings`);
  return s.body.rows.reduce((n: number, r: any) => n + r.played, 0) / 2;
};

async function prepare(format: 'league' | 'knockout', teams: Mgr[], name: string) {
  const t = await api('POST', '/tournaments', { nameAr: `اختبار الجلسة 4 ${format}`, slug: slug(name), kind: 'popular_teams', format, disputeWindowHrs: 2 }, admin);
  expect(t.status, JSON.stringify(t.body)).toBe(201);
  const id = t.body.id;
  await api('POST', `/tournaments/${id}/status`, { status: 'registration' }, admin);
  for (const m of teams) {
    const r = await api('POST', `/tournaments/${id}/registrations`, { teamId: m.teamId }, m.token);
    expect((await api('POST', `/tournaments/${id}/registrations/${r.body.id}/decision`, { approve: true }, admin)).body.status).toBe('approved');
  }
  expect((await api('POST', `/tournaments/${id}/draw`, undefined, admin)).status).toBe(200);
  await api('POST', `/tournaments/${id}/schedule`, { startDate: '2026-12-01', weekdays: [0, 1, 2, 3, 4, 5, 6], times: ['17:00'], venues: ['أ', 'ب'] }, admin);
  expect((await api('POST', `/tournaments/${id}/status`, { status: 'running' }, admin)).body.status).toBe('running');
  const fx = await api('GET', `/tournaments/${id}/fixtures`, undefined, admin);
  for (const m of fx.body.matches) expect((await api('PATCH', `/matches/${m.id}`, { refereeId: ref.id }, admin)).status).toBe(200);
  // المباريات لُعبت قبل ساعات (الحكم لا يدخل نتيجة قبل موعد الانطلاق)
  await db.query(`UPDATE matches SET kickoff_at = now() - interval '3 hours' WHERE tournament_id=$1`, [id]);
  return { id, matches: fx.body.matches as M[] };
}

beforeAll(async () => {
  await db.connect();
  const env: NodeJS.ProcessEnv = {
    ...process.env, PORT: String(PORT), NODE_ENV: 'test', OTP_PROVIDER: 'dev', RESULT_SWEEP_SECONDS: '1',
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

  const email = `t4-admin-${run}@test.saha`;
  const { rows } = await db.query(
    `INSERT INTO users (email, full_name, birth_year, password_hash, updated_at) VALUES ($1,'مدير عام الجلسة 4',1980,$2, now()) RETURNING id`,
    [email, hashPassword('كلمة-سر-الجلسة-4')],
  );
  await db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1,'super_admin')`, [rows[0].id]);
  const h = { 'content-type': 'application/json', 'x-forwarded-for': fakeIp() };
  const l1 = await (await fetch(`${BASE}/auth/admin/login`, { method: 'POST', headers: h, body: JSON.stringify({ email, password: 'كلمة-سر-الجلسة-4' }) })).json() as any;
  const setup = await (await fetch(`${BASE}/auth/admin/totp/setup`, { method: 'POST', headers: { ...h, authorization: `Bearer ${l1.setupToken}` }, body: '{}' })).json() as any;
  const en = await (await fetch(`${BASE}/auth/admin/totp/enable`, { method: 'POST', headers: { ...h, authorization: `Bearer ${l1.setupToken}` }, body: JSON.stringify({ code: totpCode(setup.secret) }) })).json() as any;
  admin = en.accessToken;
  expect(admin).toBeTruthy();

  for (let i = 1; i <= 4; i++) {
    const u = await login(`مدير فريق الجلسة 4 رقم ${i}`);
    const t = await api('POST', '/teams', { nameAr: `فريق النتائج ${i}`, city: 'بغداد' }, u.token);
    expect(t.status, JSON.stringify(t.body)).toBe(201);
    createdTeams.push(t.body.id);
    mgrs.push({ ...u, teamId: t.body.id });
  }
  ref = await login('حكم الجلسة 4', 1985);
  ref2 = await login('حكم ثان', 1984);
  outsider = await login('متفرج');
  c1 = await login('عضو اللجنة 1', 1975);
  c2 = await login('عضو اللجنة 2', 1976);
  c3 = await login('عضو اللجنة 3', 1977);
  cOther = await login('عضو لجنة بطولة أخرى', 1978);
  await db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1,'referee'), ($2,'referee')`, [ref.id, ref2.id]);

  const league = await prepare('league', mgrs, 'league');
  leagueId = league.id;
  matches = league.matches;
  expect(matches).toHaveLength(6);
  const ko = await prepare('knockout', mgrs.slice(0, 2), 'ko');
  koId = ko.id;
  for (const c of [c1, c2, c3]) await db.query(`INSERT INTO user_roles (user_id, role, tournament_id) VALUES ($1,'discipline_committee',$2)`, [c.id, leagueId]);
  await db.query(`INSERT INTO user_roles (user_id, role, tournament_id) VALUES ($1,'discipline_committee',$2)`, [cOther.id, koId]);
  // الحكم عضو في اللجنة أيضاً — لا يصوّت في مباراة يحكمها
  await db.query(`INSERT INTO user_roles (user_id, role, tournament_id) VALUES ($1,'discipline_committee',$2)`, [ref.id, leagueId]);
}, 120_000);

afterAll(async () => {
  server?.kill();
  await db.query(`DELETE FROM tournaments WHERE slug LIKE $1`, [`e2e4-%-${run}`]);
  if (createdTeams.length) await db.query(`DELETE FROM teams WHERE id = ANY($1)`, [createdTeams]);
  await db.end();
  if (process.env.SHOW_API_LOG) console.log(log);
});

describe('الجلسة 4 — صورة ورقة المباراة', () => {
  it('صور فقط، حتى 5MB، وللمسجّلين فقط', async () => {
    expect((await upload(PNG)).status).toBe(401);
    const txt = await upload(Buffer.from('ليست صورة'), ref.token, 'x.png');
    expect(txt.body.code).toBe('NOT_AN_IMAGE');
    const big = await upload(Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]), ref.token);
    expect(big.status).toBe(413);
    expect(big.body.message).toContain('5');
    const ok = await upload(PNG, ref.token);
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body.mime).toBe('image/png');
    sheetId = ok.body.id;
  });
});

describe('الجلسة 4 — إدخال النتيجة (لم تبدأ ← مؤقتة)', () => {
  it('الحكم المعيَّن فقط، بعد الانطلاق، ومع صورة الورقة', async () => {
    const m = matches[0];
    expect((await result(m, 2, 1, home(m).token)).status).toBe(403);
    expect((await result(m, 2, 1, ref2.token)).body.code).toBe('NOT_MATCH_REFEREE');
    expect((await api('POST', `/matches/${m.id}/result`, { homeScore: 2, awayScore: 1 }, ref.token)).body.code).toBe('SHEET_REQUIRED');
    const foreign = await upload(PNG, ref2.token);
    expect((await result(m, 2, 1, ref.token, { sheetMediaId: foreign.body.id })).body.code).toBe('SHEET_INVALID');
    expect((await result(m, 2, 1, ref.token, { homePens: 4, awayPens: 3 })).body.code).toBe('PENS_NOT_ALLOWED');
    expect((await result(m, -1, 1)).status).toBe(400);
    await db.query(`UPDATE matches SET kickoff_at = now() + interval '1 hour' WHERE id=$1`, [m.id]);
    expect((await result(m, 2, 1)).body.code).toBe('NOT_STARTED');
    await db.query(`UPDATE matches SET kickoff_at = now() - interval '3 hours' WHERE id=$1`, [m.id]);
    // لا يُعتمد أي تأكيد قبل وجود نتيجة
    expect((await api('POST', `/matches/${m.id}/confirm`, undefined, home(m).token)).body.code).toBe('NO_RESULT');

    const r = await result(m, 2, 1);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ resultStatus: 'provisional', homeScore: 2, awayScore: 1, homeConfirmed: false, awayConfirmed: false, hasSheet: true });
    const deadline = new Date(r.body.disputeDeadline).getTime() - new Date(r.body.resultEnteredAt).getTime();
    expect(deadline).toBe(2 * 3600_000);
    // المؤقتة لا تدخل الترتيب
    expect(await played()).toBe(0);
  });

  it('صورة الورقة لأطراف المباراة فقط، ولا تظهر في البيانات العامة', async () => {
    const m = matches[0];
    const res = await fetch(`${BASE}/matches/${m.id}/sheet`, { headers: { authorization: `Bearer ${away(m).token}` } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/png');
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG)).toBe(true);
    expect((await fetch(`${BASE}/matches/${m.id}/sheet`)).status).toBe(401);
    expect((await fetch(`${BASE}/matches/${m.id}/sheet`, { headers: { authorization: `Bearer ${outsider.token}` } })).status).toBe(403);
    expect((await fetch(`${BASE}/matches/${m.id}/sheet`, { headers: { authorization: `Bearer ${c1.token}` } })).status).toBe(200);
    const pub = await api('GET', `/matches/${m.id}`);
    expect(pub.body).toMatchObject({ resultStatus: 'provisional', hasSheet: true, homeConfirmed: false });
    expect(pub.body.sheetMediaId).toBeUndefined();
    expect(pub.body.disputeDeadline).toBeTruthy();
  });

  it('مديرا الفريقين يُشعَران بالنتيجة', async () => {
    const m = matches[0];
    for (const u of [home(m), away(m)]) {
      const n = await api('GET', '/me/notifications?unread=true', undefined, u.token);
      expect(n.body.unread).toBeGreaterThanOrEqual(1);
      const item = n.body.items.find((x: any) => x.data?.matchId === m.id && x.data?.type === 'result.entered');
      expect(item?.titleAr).toBe('نتيجة بانتظار تأكيدك');
      expect(item.bodyAr).toContain('2 - 1');
    }
    expect((await api('GET', '/me/notifications', undefined, outsider.token)).body.items).toEqual([]);
  });
});

describe('الجلسة 4 — التأكيد المزدوج (مؤقتة ← معتمدة) والتصحيح (مؤقتة ← مؤقتة)', () => {
  it('تأكيد طرف واحد يبقيها مؤقتة، وتصحيح الحكم يصفّر التأكيد', async () => {
    const m = matches[0];
    expect((await api('POST', `/matches/${m.id}/confirm`, undefined, outsider.token)).body.code).toBe('NOT_TEAM_MANAGER');
    expect((await api('POST', `/matches/${m.id}/confirm`, undefined, admin)).body.code).toBe('NOT_TEAM_MANAGER');
    const one = await api('POST', `/matches/${m.id}/confirm`, undefined, home(m).token);
    expect(one.body).toMatchObject({ resultStatus: 'provisional', homeConfirmed: true, awayConfirmed: false });
    expect((await api('POST', `/matches/${m.id}/confirm`, undefined, home(m).token)).body.homeConfirmed).toBe(true);

    const fix = await result(m, 3, 1);
    expect(fix.body).toMatchObject({ resultStatus: 'provisional', homeScore: 3, homeConfirmed: false });
    const n = await api('GET', '/me/notifications', undefined, home(m).token);
    expect(n.body.items.some((x: any) => x.titleAr.includes('صحّح الحكم'))).toBe(true);
  });

  it('تأكيد الطرفين يعتمدها، والمعتمدة تدخل الترتيب ولا تُعدَّل ولا يُعترض عليها', async () => {
    const m = matches[0];
    await api('POST', `/matches/${m.id}/confirm`, undefined, home(m).token);
    const both = await api('POST', `/matches/${m.id}/confirm`, undefined, away(m).token);
    expect(both.body).toMatchObject({ resultStatus: 'confirmed', homeConfirmed: true, awayConfirmed: true });
    expect(await played()).toBe(1);
    expect((await result(m, 0, 0)).body.code).toBe('RESULT_CONFIRMED');
    expect((await api('POST', `/matches/${m.id}/disputes`, { reason: 'سبب طويل بما يكفي للاعتراض' }, away(m).token)).body.code).toBe('RESULT_CONFIRMED');
    // الأحداث تبقى قابلة للتسجيل حتى تصبح نهائية
    expect((await api('POST', `/matches/${m.id}/events`, { teamId: m.homeTeam.id, type: 'goal', minute: 10 }, ref.token)).status).toBe(201);
    const ref1 = await api('GET', '/me/notifications', undefined, ref.token);
    expect(ref1.body.items.some((x: any) => x.data?.type === 'result.confirmed' && x.data.matchId === m.id)).toBe(true);
  });
});

describe('الجلسة 4 — انتهاء المهلة تلقائياً', () => {
  it('معتمدة ← نهائية، ومؤقتة بلا رد ← نهائية، والأحداث تُقفل', async () => {
    const [a, b] = matches;
    expect((await result(b, 0, 0)).body.resultStatus).toBe('provisional');
    await backdate(a.id, 3);
    await backdate(b.id, 3);
    expect(await waitFor(async () => (await status(a.id)) === 'final' && (await status(b.id)) === 'final')).toBe(true);
    const { rows } = await db.query(`SELECT entity_id, actor_user_id, payload->>'from' AS f FROM audit_log WHERE action='match.auto_final' AND entity_id = ANY($1) ORDER BY entity_id`, [[String(a.id), String(b.id)]]);
    expect(rows.map((r) => [Number(r.entity_id), r.actor_user_id, r.f])).toEqual([[a.id, null, 'confirmed'], [b.id, null, 'provisional']]);
    expect((await api('POST', `/matches/${a.id}/events`, { teamId: a.homeTeam.id, type: 'goal' }, ref.token)).body.code).toBe('MATCH_FINAL');
    expect((await result(b, 1, 0)).body.code).toBe('RESULT_FINAL');
    expect((await api('POST', `/matches/${b.id}/confirm`, undefined, home(b).token)).body.code).toBe('RESULT_FINAL');
    expect(await played()).toBe(2);
    const n = await api('GET', '/me/notifications', undefined, away(b).token);
    expect(n.body.items.some((x: any) => x.data?.type === 'result.final' && x.data.matchId === b.id)).toBe(true);
  });

  it('بعد انتهاء المهلة لا تأكيد ولا اعتراض', async () => {
    const f = matches[5];
    await result(f, 1, 1);
    await backdate(f.id, 2.05);
    const c = await api('POST', `/matches/${f.id}/confirm`, undefined, home(f).token);
    expect(['WINDOW_CLOSED', 'RESULT_FINAL']).toContain(c.body.code);
    const d = await api('POST', `/matches/${f.id}/disputes`, { reason: 'سبب طويل بما يكفي للاعتراض' }, away(f).token);
    expect(['WINDOW_CLOSED', 'RESULT_FINAL']).toContain(d.body.code);
    expect(await waitFor(async () => (await status(f.id)) === 'final')).toBe(true);
  });
});

describe('الجلسة 4 — الاعتراض (مؤقتة ← متنازع عليها) ولجنة الانضباط', () => {
  let dC = 0, dD = 0, dE = 0;

  it('من أكّد لا يعترض، والاعتراض يوقف النتيجة ويخرجها من الترتيب', async () => {
    const m = matches[2];
    await result(m, 2, 0);
    await api('POST', `/matches/${m.id}/confirm`, undefined, home(m).token);
    expect((await api('POST', `/matches/${m.id}/disputes`, { reason: 'سبب طويل بما يكفي للاعتراض' }, home(m).token)).body.code).toBe('ALREADY_CONFIRMED');
    expect((await api('POST', `/matches/${m.id}/disputes`, { reason: 'قصير' }, away(m).token)).status).toBe(400);
    expect((await api('POST', `/matches/${m.id}/disputes`, { reason: 'سبب طويل بما يكفي للاعتراض' }, outsider.token)).body.code).toBe('NOT_TEAM_MANAGER');
    const before = await played();
    const d = await api('POST', `/matches/${m.id}/disputes`, { reason: 'الهدف الثاني جاء بعد صافرة النهاية.' }, away(m).token);
    expect(d.status, JSON.stringify(d.body)).toBe(201);
    expect(d.body.dispute).toMatchObject({ status: 'open', teamId: m.awayTeam.id });
    expect(d.body.match.resultStatus).toBe('disputed');
    dC = d.body.dispute.id;

    expect(await played()).toBe(before);
    expect((await api('POST', `/matches/${m.id}/disputes`, { reason: 'اعتراض ثان على المباراة نفسها' }, away(m).token)).body.code).toBe('RESULT_DISPUTED');
    expect((await result(m, 1, 0)).body.code).toBe('RESULT_DISPUTED');
    expect((await api('POST', `/matches/${m.id}/confirm`, undefined, away(m).token)).body.code).toBe('RESULT_DISPUTED');
    expect((await api('POST', `/matches/${m.id}/events`, { teamId: m.homeTeam.id, type: 'goal' }, ref.token)).body.code).toBe('MATCH_DISPUTED');
    // المهلة لا تُنهي النتيجة المتنازع عليها
    await backdate(m.id, 5);
    await new Promise((r) => setTimeout(r, 2500));
    expect(await status(m.id)).toBe('disputed');
    // اللجنة والحكم والطرف الآخر يُشعَرون، والمعترض لا
    for (const u of [c1, ref, home(m)]) {
      const n = await api('GET', '/me/notifications', undefined, u.token);
      expect(n.body.items.some((x: any) => x.data?.type === 'dispute.opened' && x.data.disputeId === dC), `مستخدم ${u.id}`).toBe(true);
    }
    expect((await api('GET', '/me/notifications', undefined, away(m).token)).body.items.some((x: any) => x.data?.type === 'dispute.opened')).toBe(false);
    expect((await api('GET', `/matches/${m.id}`)).body.disputes).toEqual([expect.objectContaining({ id: dC, status: 'open' })]);
  });

  it('اللجنة بنطاق بطولتها، ولا يصوّت من له صلة بالمباراة', async () => {
    const list = await api('GET', '/admin/disputes?status=open', undefined, c1.token);
    expect(list.status).toBe(200);
    expect(list.body.find((x: any) => x.id === dC)).toMatchObject({ reason: 'الهدف الثاني جاء بعد صافرة النهاية.', votes: 0, myVote: null });
    expect((await api('GET', '/admin/disputes', undefined, cOther.token)).body.some((x: any) => x.id === dC)).toBe(false);
    expect((await api('GET', '/admin/disputes', undefined, outsider.token)).status).toBe(403);
    expect((await api('POST', `/admin/disputes/${dC}/vote`, { decision: 'reject' }, cOther.token)).status).toBe(403);
    expect((await api('POST', `/admin/disputes/${dC}/vote`, { decision: 'reject' }, home(matches[2]).token)).status).toBe(403);
    expect((await api('POST', `/admin/disputes/${dC}/vote`, { decision: 'reject' }, ref.token)).body.code).toBe('CONFLICT_OF_INTEREST');
    expect((await api('POST', `/admin/disputes/${dC}/vote`, { decision: 'correct' }, c1.token)).status).toBe(400);
    expect((await api('POST', `/admin/disputes/${dC}/vote`, { decision: 'maybe' }, c1.token)).status).toBe(400);
  });

  it('تصحيح النتيجة (متنازع عليها ← نهائية): صوتان بالنتيجة نفسها', async () => {
    const m = matches[2];
    const v1 = await api('POST', `/admin/disputes/${dC}/vote`, { decision: 'reject', note: 'الورقة واضحة' }, c1.token);
    expect(v1.status, JSON.stringify(v1.body)).toBe(200);
    expect(v1.body).toMatchObject({ decided: null, votes: 1 });
    expect((await api('POST', `/admin/disputes/${dC}/vote`, { decision: 'correct', homeScore: 1, awayScore: 0 }, c2.token)).body).toMatchObject({ decided: null, votes: 2 });
    const v3 = await api('POST', `/admin/disputes/${dC}/vote`, { decision: 'correct', homeScore: 1, awayScore: 0, note: 'الهدف الثاني بعد النهاية' }, c3.token);
    expect(v3.body).toMatchObject({ decided: 'correct', votes: 3, dispute: { status: 'upheld', decision: 'correct', decisionNote: 'الهدف الثاني بعد النهاية' } });
    expect(v3.body.match).toMatchObject({ resultStatus: 'final', homeScore: 1, awayScore: 0 });
    expect((await api('POST', `/admin/disputes/${dC}/vote`, { decision: 'reject' }, c1.token)).body.code).toBe('DISPUTE_CLOSED');
    const n = await api('GET', '/me/notifications', undefined, away(m).token);
    expect(n.body.items.find((x: any) => x.data?.type === 'dispute.decided' && x.data.disputeId === dC)?.bodyAr).toContain('1 - 0');
  });

  it('إعادة المباراة (متنازع عليها ← لم تبدأ): تُمسح النتيجة والأحداث وصورة الورقة', async () => {
    const m = matches[3];
    await result(m, 4, 4);
    expect((await api('POST', `/matches/${m.id}/events`, { teamId: m.homeTeam.id, type: 'goal', minute: 5 }, ref.token)).status).toBe(201);
    const d = await api('POST', `/matches/${m.id}/disputes`, { reason: 'الملعب لم يكن صالحاً للعب بسبب المطر.' }, home(m).token);
    dD = d.body.dispute.id;
    await api('POST', `/admin/disputes/${dD}/vote`, { decision: 'replay' }, c1.token);
    const v = await api('POST', `/admin/disputes/${dD}/vote`, { decision: 'replay' }, c2.token);
    expect(v.body).toMatchObject({ decided: 'replay', dispute: { status: 'upheld', decision: 'replay' } });
    expect(v.body.match).toMatchObject({ resultStatus: 'scheduled', homeScore: null, awayScore: null, hasSheet: false, resultEnteredAt: null });
    expect((await api('GET', `/matches/${m.id}`)).body.events).toEqual([]);
    // تُعاد المباراة وتمر بالدورة كاملة من جديد، وتحتاج صورة ورقة جديدة
    expect((await api('POST', `/matches/${m.id}/result`, { homeScore: 1, awayScore: 2 }, ref.token)).body.code).toBe('SHEET_REQUIRED');
    expect((await result(m, 1, 2)).body.resultStatus).toBe('provisional');
  });

  it('رفض الاعتراض (متنازع عليها ← نهائية بالنتيجة الأصلية)، والعضو يغيّر صوته قبل الحسم', async () => {
    const m = matches[4];
    await result(m, 3, 2);
    const d = await api('POST', `/matches/${m.id}/disputes`, { reason: 'الحكم احتسب ضربة جزاء غير صحيحة.' }, away(m).token);
    dE = d.body.dispute.id;
    await api('POST', `/admin/disputes/${dE}/vote`, { decision: 'reject' }, c1.token);
    expect((await api('POST', `/admin/disputes/${dE}/vote`, { decision: 'correct', homeScore: 2, awayScore: 2 }, c2.token)).body.decided).toBeNull();
    const mine = await api('GET', '/admin/disputes?status=open', undefined, c2.token);
    expect(mine.body.find((x: any) => x.id === dE).myVote).toMatchObject({ decision: 'correct', homeScore: 2, awayScore: 2 });
    const v = await api('POST', `/admin/disputes/${dE}/vote`, { decision: 'reject' }, c2.token);
    expect(v.body).toMatchObject({ decided: 'reject', votes: 2, dispute: { status: 'rejected' } });
    expect(v.body.match).toMatchObject({ resultStatus: 'final', homeScore: 3, awayScore: 2 });
  });

  it('سجل التدقيق يحمل كل خطوة والسلسلة سليمة', async () => {
    const ids = matches.map((m) => String(m.id));
    const { rows } = await db.query(
      `SELECT DISTINCT action FROM audit_log WHERE (entity='match' AND entity_id = ANY($1)) OR (entity='dispute' AND entity_id = ANY($2))`,
      [ids, [String(dC), String(dD), String(dE)]],
    );
    expect(rows.map((r) => r.action).sort()).toEqual(expect.arrayContaining([
      'match.result', 'match.result_correct', 'match.confirm', 'match.auto_final', 'dispute.open', 'dispute.vote', 'dispute.decide',
    ]));
    const v = await api('GET', '/admin/audit/verify', undefined, admin);
    expect(v.body.ok).toBe(true);
  });
});

describe('الجلسة 4 — خروج المغلوب وركلات الترجيح', () => {
  it('التعادل الإقصائي يحتاج ترجيحاً لا ينتهي بالتعادل', async () => {
    const fx = await api('GET', `/tournaments/${koId}/fixtures`, undefined, admin);
    const m = fx.body.matches[0] as M;
    expect((await result(m, 1, 1)).body.code).toBe('PENS_REQUIRED');
    expect((await result(m, 1, 1, ref.token, { homePens: 4, awayPens: 4 })).body.code).toBe('PENS_TIE');
    expect((await result(m, 2, 1, ref.token, { homePens: 4, awayPens: 3 })).body.code).toBe('PENS_NOT_ALLOWED');
    expect((await result(m, 1, 1, ref.token, { homePens: 5 })).body.code).toBe('PENS_PAIR');
    const ok = await result(m, 1, 1, ref.token, { homePens: 5, awayPens: 4 });
    expect(ok.body).toMatchObject({ resultStatus: 'provisional', homePens: 5, awayPens: 4 });
    // عضو لجنة البطولة الأخرى يرى اعتراضات بطولته فقط
    const d = await api('POST', `/matches/${m.id}/disputes`, { reason: 'ركلة الترجيح الأخيرة أعيدت بلا سبب.' }, away(m).token);
    expect((await api('POST', `/admin/disputes/${d.body.dispute.id}/vote`, { decision: 'correct', homeScore: 1, awayScore: 1 }, cOther.token)).body.code).toBe('PENS_REQUIRED');
    expect((await api('POST', `/admin/disputes/${d.body.dispute.id}/vote`, { decision: 'reject' }, c1.token)).status).toBe(403);
  });
});

describe('الجلسة 4 — مبارياتي والإشعارات وإنهاء البطولة', () => {
  it('الحكم يرى مبارياته المفتوحة، ومدير الفريق ما ينتظر تأكيده', async () => {
    const r = await api('GET', '/me/matches', undefined, ref.token);
    expect(r.body.refereeing.length).toBeGreaterThanOrEqual(1);
    expect(r.body.refereeing.every((m: any) => ['scheduled', 'provisional'].includes(m.resultStatus))).toBe(true);
    const m = matches[3];
    const p = await api('GET', '/me/matches', undefined, home(m).token);
    expect(p.body.pendingConfirmation.map((x: any) => x.id)).toContain(m.id);
    await api('POST', `/matches/${m.id}/confirm`, undefined, home(m).token);
    expect((await api('GET', '/me/matches', undefined, home(m).token)).body.pendingConfirmation.map((x: any) => x.id)).not.toContain(m.id);
    expect((await api('POST', `/matches/${m.id}/confirm`, undefined, away(m).token)).body.resultStatus).toBe('confirmed');
  });

  it('قراءة الإشعارات', async () => {
    const u = home(matches[0]);
    const all = await api('GET', '/me/notifications', undefined, u.token);
    expect(all.body.unread).toBeGreaterThan(0);
    const first = all.body.items[0];
    expect((await api('POST', `/me/notifications/${first.id}/read`, undefined, u.token)).body.ok).toBe(true);
    expect((await api('POST', `/me/notifications/${first.id}/read`, undefined, outsider.token)).status).toBe(404);
    expect((await api('GET', '/me/notifications', undefined, u.token)).body.unread).toBe(all.body.unread - 1);
    expect((await api('POST', '/me/notifications/read-all', undefined, u.token)).body.ok).toBe(true);
    expect((await api('GET', '/me/notifications?unread=true', undefined, u.token)).body).toEqual({ unread: 0, items: [] });
  });

  it('تنتهي البطولة حين تصبح كل نتائجها نهائية، والترتيب من 6 مباريات', async () => {
    expect((await api('POST', `/tournaments/${leagueId}/status`, { status: 'finished' }, admin)).body.code).toBe('MATCHES_OPEN');
    await backdate(matches[3].id, 3);
    expect(await waitFor(async () => (await status(matches[3].id)) === 'final')).toBe(true);
    expect(await played()).toBe(6);
    expect((await api('POST', `/tournaments/${leagueId}/status`, { status: 'finished' }, admin)).body.status).toBe('finished');
  });
});
