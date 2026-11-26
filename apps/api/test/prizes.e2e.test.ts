/**
 * اختبار تكامل الجلسة 16: الجوائز — القيم والإعلان والفائزون والتسليم وتأكيد المستفيد والأرشيف.
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
const newPhone = () => `079${String(run).padStart(6, '0')}${String(++seq).padStart(2, '0')}`;
// عنوان IP مختلف لكل دخول حتى لا يصطدم الاختبار بحد الطلبات لكل IP (الخادم يثق بالـ proxy الأول)
let ipSeq = 0;
const fakeIp = () => `10.${(run >> 8) & 255}.${(run + 11) & 255}.${++ipSeq}`;

async function api(method: string, path: string, body?: unknown, token?: string, ip?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(ip ? { 'x-forwarded-for': ip } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json as any };
}

/** حساب بالهاتف عبر OTP (رمز dev = 000000) ← رمز الوصول ورقم المستخدم */
async function login(fullName: string, birthYear = 1990) {
  const phone = newPhone();
  const ip = fakeIp();
  expect((await api('POST', '/auth/otp/request', { phone }, undefined, ip)).status).toBe(200);
  const r = await api('POST', '/auth/otp/verify', { phone, code: '000000', fullName, birthYear }, undefined, ip);
  expect(r.body.accessToken, JSON.stringify(r.body)).toBeTruthy();
  const me = await api('GET', '/me', undefined, r.body.accessToken);
  return { token: r.body.accessToken as string, id: me.body.id as number, phone };
}


const slug = (s: string) => `e2e-prz-${s}-${run}`;
const createdTeams: number[] = [];
let admin = '';
let tm: { token: string; id: number };
let outsider: { token: string; id: number };
const managers: { token: string; id: number; teamId: number; joinCode: string }[] = [];
let tid = 0;
let star: { token: string; id: number }; // لاعب بالغ بحساب
let starPlayerId = 0;
let minorPlayerId = 0;
let guardian: { token: string; id: number };

beforeAll(async () => {
  await db.connect();
  const env: NodeJS.ProcessEnv = {
    ...process.env, PORT: String(PORT), NODE_ENV: 'test', OTP_PROVIDER: 'dev', PUSH_PROVIDER: 'off',
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
  const email = `t16-admin-${run}@test.saha`;
  const { rows } = await db.query(
    `INSERT INTO users (email, full_name, birth_year, password_hash, updated_at) VALUES ($1,'مدير عام الجلسة 16',1980,$2, now()) RETURNING id`,
    [email, hashPassword('كلمة-سر-الجلسة-16')],
  );
  await db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1,'super_admin')`, [rows[0].id]);
  const ip = fakeIp();
  const l1 = await api('POST', '/auth/admin/login', { email, password: 'كلمة-سر-الجلسة-16' }, undefined, ip);
  const setup = await api('POST', '/auth/admin/totp/setup', {}, l1.body.setupToken, ip);
  const en = await api('POST', '/auth/admin/totp/enable', { code: totpCode(setup.body.secret) }, l1.body.setupToken, ip);
  admin = en.body.accessToken;
  expect(admin).toBeTruthy();

  // بطولة دوري بـ 4 فرق معتمدة
  const t = await api('POST', '/tournaments', { nameAr: 'دوري جوائز الاختبار', slug: slug('league'), kind: 'popular_teams', format: 'league', maxTeams: 4 }, admin);
  expect(t.status, JSON.stringify(t.body)).toBe(201);
  tid = t.body.id;
  tm = await login('مدير بطولة الجوائز');
  await db.query(`INSERT INTO user_roles (user_id, role, tournament_id) VALUES ($1,'tournament_manager',$2)`, [tm.id, tid]);
  outsider = await login('متفرج');
  expect((await api('POST', `/tournaments/${tid}/status`, { status: 'registration' }, admin)).status).toBe(200);
  for (let i = 1; i <= 4; i++) {
    const u = await login(`مدير فريق الجوائز ${i}`);
    const team = await api('POST', '/teams', { nameAr: `فريق جوائز ${i}`, city: 'بغداد' }, u.token);
    expect(team.status, JSON.stringify(team.body)).toBe(201);
    createdTeams.push(team.body.id);
    managers.push({ ...u, teamId: team.body.id, joinCode: team.body.joinCode });
    const r = await api('POST', `/tournaments/${tid}/registrations`, { teamId: team.body.id }, u.token);
    expect((await api('POST', `/tournaments/${tid}/registrations/${r.body.id}/decision`, { approve: true }, admin)).body.status).toBe('approved');
  }
  star = await login('نجم البطولة', 1995);
  expect((await api('POST', '/teams/join', { code: managers[0].joinCode }, star.token)).status).toBe(200);
  starPlayerId = (await db.query(`SELECT id FROM players WHERE user_id = $1`, [star.id])).rows[0].id;
  // لاعب قاصر بلا حساب، ولي أمره مستخدم
  guardian = await login('ولي أمر', 1975);
  const mp = await db.query(`INSERT INTO players (first_name, last_name, birth_year, guardian_id) VALUES ('سجاد','الصغير',2014,$1) RETURNING id`, [guardian.id]);
  minorPlayerId = mp.rows[0].id;
  await db.query(`INSERT INTO team_players (team_id, player_id) VALUES ($1,$2)`, [managers[1].teamId, minorPlayerId]);
}, 120_000);

afterAll(async () => {
  server?.kill();
  await db.query(`DELETE FROM tournaments WHERE slug LIKE $1`, [`e2e-prz-%-${run}`]);
  if (createdTeams.length) await db.query(`DELETE FROM teams WHERE id = ANY($1)`, [createdTeams]);
  if (minorPlayerId) await db.query(`DELETE FROM players WHERE id = $1`, [minorPlayerId]);
  await db.end();
  if (process.env.SHOW_API_LOG) console.log(log);
});

describe('الجلسة 16 — الجوائز', () => {
  const ids: Record<string, number> = {};

  it('الإدارة تحدد قيم الجوائز الست وتعدّلها؛ غير المخوَّل ممنوع', async () => {
    const values = [
      ['team_place', 1, 3_000_000, 'كأس البطولة'], ['team_place', 2, 1_500_000, null], ['team_place', 3, 750_000, null],
      ['best_player', 1, 500_000, null], ['best_player', 2, 250_000, null], ['best_player', 3, 0, 'ميدالية'],
    ] as const;
    expect((await api('POST', '/admin/prizes', { tournamentId: tid, category: 'team_place', rank: 1, amountIqd: 1 }, managers[0].token)).status).toBe(403);
    expect((await api('POST', '/admin/prizes', { tournamentId: tid, category: 'team_place', rank: 4, amountIqd: 1 }, admin)).status).toBe(400);
    expect((await api('POST', '/admin/prizes', { tournamentId: tid, category: 'best_player', rank: 3, amountIqd: 0 }, admin)).body.code).toBe('PRIZE_VALUE_REQUIRED');
    for (const [category, rank, amountIqd, extraAr] of values) {
      const r = await api('POST', '/admin/prizes', { tournamentId: tid, category, rank, amountIqd, ...(extraAr ? { extraAr } : {}) }, tm.token);
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      ids[`${category}${rank}`] = r.body.id;
    }
    expect((await api('POST', '/admin/prizes', { tournamentId: tid, category: 'team_place', rank: 1, amountIqd: 5 }, admin)).body.code).toBe('PRIZE_EXISTS');
    const u = await api('PATCH', `/admin/prizes/${ids.team_place1}`, { amountIqd: 4_000_000 }, tm.token);
    expect(u.body.amountIqd).toBe(4_000_000);
    expect(u.body.label).toBe('المركز الأول');
    expect((await api('PATCH', `/admin/prizes/${ids.best_player1}`, { titleAr: 'الهداف' }, tm.token)).body.label).toBe('الهداف');
    expect((await api('GET', `/admin/tournaments/${tid}/prizes`, undefined, outsider.token)).status).toBe(403);
    const a = await api('GET', `/admin/tournaments/${tid}/prizes`, undefined, tm.token);
    expect(a.body.prizes.map((p: any) => `${p.category}${p.rank}`)).toEqual(['team_place1', 'team_place2', 'team_place3', 'best_player1', 'best_player2', 'best_player3']);
    expect(a.body.totalIqd).toBe(4_000_000 + 1_500_000 + 750_000 + 500_000 + 250_000);
    expect(a.body.candidates.teams).toHaveLength(4);
    expect(a.body.candidates.players.map((p: any) => p.id)).toEqual(expect.arrayContaining([starPlayerId, minorPlayerId]));
  });

  it('الإعلان: لا تظهر للجمهور قبله، وبعده تظهر ويصل إشعار للفرق ولاعبيها', async () => {
    expect((await api('GET', `/tournaments/${slug('league')}/prizes`)).body.prizes).toEqual([]);
    const an = await api('POST', `/admin/tournaments/${tid}/prizes/announce`, { announced: true }, tm.token);
    expect(an.status, JSON.stringify(an.body)).toBe(200);
    expect(an.body.notified).toBe(5); // 4 مدراء + اللاعب صاحب الحساب
    const pub = await api('GET', `/tournaments/${slug('league')}/prizes`);
    expect(pub.body.prizes).toHaveLength(6);
    expect(pub.body.totalIqd).toBe(7_000_000);
    expect(pub.body.prizes[0]).toMatchObject({ label: 'المركز الأول', amountIqd: 4_000_000, extraAr: 'كأس البطولة', status: 'pending', team: null });
    expect(JSON.stringify(pub.body)).not.toContain('managerId');
    const n = await db.query(`SELECT count(*)::int AS c FROM notifications WHERE user_id = $1 AND data->>'type' = 'prizes'`, [star.id]);
    expect(n.rows[0].c).toBe(1);
  });

  it('اختيار الفائزين: من فرق البطولة فقط وبلا تكرار', async () => {
    const other = await login('فريق خارجي');
    const ot = await api('POST', '/teams', { nameAr: 'فريق خارج البطولة' }, other.token);
    createdTeams.push(ot.body.id);
    expect((await api('PATCH', `/admin/prizes/${ids.team_place1}`, { teamId: ot.body.id }, tm.token)).body.code).toBe('WINNER_NOT_IN_TOURNAMENT');
    const w = await api('PATCH', `/admin/prizes/${ids.team_place1}`, { teamId: managers[0].teamId }, tm.token);
    expect(w.body.status).toBe('awarded');
    expect(w.body.team.id).toBe(managers[0].teamId);
    expect((await api('PATCH', `/admin/prizes/${ids.team_place2}`, { teamId: managers[0].teamId }, tm.token)).body.code).toBe('WINNER_DUPLICATE');
    expect((await api('PATCH', `/admin/prizes/${ids.team_place2}`, { teamId: managers[1].teamId }, tm.token)).body.status).toBe('awarded');
    // جائزة اللاعب: فريقه يُعرف تلقائياً
    const s = await api('PATCH', `/admin/prizes/${ids.best_player1}`, { playerId: starPlayerId }, tm.token);
    expect(s.body.status).toBe('awarded');
    expect(s.body.team.id).toBe(managers[0].teamId);
    expect((await api('PATCH', `/admin/prizes/${ids.best_player2}`, { playerId: minorPlayerId }, tm.token)).body.player.name).toBe('سجاد'); // القاصر باسمه الأول فقط
    // إلغاء الاختيار يعيدها «لم يُحدد»
    expect((await api('PATCH', `/admin/prizes/${ids.team_place2}`, { teamId: null }, tm.token)).body.status).toBe('pending');
    expect((await api('POST', `/admin/prizes/${ids.team_place2}/deliver`, {}, tm.token)).body.code).toBe('PRIZE_NO_WINNER');
  });

  it('التسليم ثم تأكيد المستفيد؛ المسلَّمة لا تتغير قيمتها، والمؤكَّدة مجمّدة', async () => {
    // المستفيد لا يؤكد قبل التسليم
    expect((await api('POST', `/me/prizes/${ids.team_place1}/confirm`, undefined, managers[0].token)).body.code).toBe('PRIZE_NOT_DELIVERED');
    const d = await api('POST', `/admin/prizes/${ids.team_place1}/deliver`, { note: 'سُلّم نقداً في الملعب' }, tm.token);
    expect(d.status, JSON.stringify(d.body)).toBe(200);
    expect(d.body.status).toBe('delivered');
    expect((await api('POST', `/admin/prizes/${ids.team_place1}/deliver`, {}, tm.token)).body.code).toBe('PRIZE_ALREADY_DELIVERED');
    expect((await api('PATCH', `/admin/prizes/${ids.team_place1}`, { amountIqd: 1 }, tm.token)).body.code).toBe('PRIZE_DELIVERED');
    expect((await api('DELETE', `/admin/prizes/${ids.team_place1}`, undefined, tm.token)).body.code).toBe('PRIZE_DELIVERED');
    await expect(db.query(`UPDATE prizes SET amount_iqd = 1 WHERE id = $1`, [ids.team_place1])).rejects.toThrow();
    // إشعار للمستفيد
    const n = await db.query(`SELECT count(*)::int AS c FROM notifications WHERE user_id = $1 AND data->>'type' = 'prize'`, [managers[0].id]);
    expect(n.rows[0].c).toBe(1);

    // غير المستفيد لا يرى ولا يؤكد
    expect((await api('POST', `/me/prizes/${ids.team_place1}/confirm`, undefined, star.token)).status).toBe(404);
    const mine = await api('GET', '/me/prizes', undefined, managers[0].token);
    expect(mine.body.find((p: any) => p.id === ids.team_place1).canConfirm).toBe(true);
    const c = await api('POST', `/me/prizes/${ids.team_place1}/confirm`, undefined, managers[0].token);
    expect(c.body.status).toBe('confirmed');
    expect((await api('POST', `/admin/prizes/${ids.team_place1}/undeliver`, undefined, tm.token)).body.code).toBe('PRIZE_CONFIRMED');
    expect((await api('PATCH', `/admin/prizes/${ids.team_place1}`, { titleAr: 'تعديل' }, admin)).body.code).toBe('PRIZE_CONFIRMED');
    await expect(db.query(`UPDATE prizes SET title_ar = 'x' WHERE id = $1`, [ids.team_place1])).rejects.toThrow();

    // اللاعب البالغ يؤكد جائزته بنفسه، وولي أمر القاصر يؤكد عنه
    await api('POST', `/admin/prizes/${ids.best_player1}/deliver`, {}, tm.token);
    expect((await api('POST', `/me/prizes/${ids.best_player1}/confirm`, undefined, managers[0].token)).status).toBe(404);
    expect((await api('POST', `/me/prizes/${ids.best_player1}/confirm`, undefined, star.token)).body.status).toBe('confirmed');
    await api('POST', `/admin/prizes/${ids.best_player2}/deliver`, {}, tm.token);
    // التراجع عن التسليم قبل التأكيد
    expect((await api('POST', `/admin/prizes/${ids.best_player2}/undeliver`, undefined, tm.token)).body.status).toBe('awarded');
    await api('POST', `/admin/prizes/${ids.best_player2}/deliver`, {}, tm.token);
    expect((await api('POST', `/me/prizes/${ids.best_player2}/confirm`, undefined, guardian.token)).body.status).toBe('confirmed');

    const audit = await db.query(`SELECT DISTINCT action FROM audit_log WHERE entity = 'prize' AND entity_id = $1`, [String(ids.team_place1)]);
    expect(audit.rows.map((x) => x.action).sort()).toEqual(['prize.confirm', 'prize.create', 'prize.deliver', 'prize.update']);
  });

  it('الأرشيف: البطولة المنتهية تظهر بجوائزها وحالاتها', async () => {
    let arc = await api('GET', '/prizes/archive?limit=50');
    expect(arc.body.tournaments.map((x: any) => x.tournament.id)).not.toContain(tid);
    await db.query(`UPDATE tournaments SET status = 'finished' WHERE id = $1`, [tid]);
    arc = await api('GET', '/prizes/archive?limit=50');
    const mine = arc.body.tournaments.find((x: any) => x.tournament.id === tid);
    expect(mine, JSON.stringify(arc.body)).toBeTruthy();
    expect(mine.confirmed).toBe(3);
    expect(mine.prizes).toHaveLength(6);
    expect(arc.body.totals.prizes).toBeGreaterThanOrEqual(6);
    const adm = await api('GET', '/admin/prizes?status=confirmed', undefined, tm.token);
    expect(adm.body.every((p: any) => p.tournament.id === tid && p.status === 'confirmed')).toBe(true);
    expect(adm.body).toHaveLength(3);
    expect((await api('GET', '/admin/prizes', undefined, outsider.token)).status).toBe(403);
  });
});
