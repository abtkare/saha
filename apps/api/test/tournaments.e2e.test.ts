/**
 * اختبار تكامل الجلسة 3: بطولة تجريبية بـ 8 فرق تُنشأ وتُسجَّل وتُجرى قرعتها وتُجدول ويُحسب ترتيبها صحيحاً،
 * مع الصلاحيات بالنطاق، والأهلية، والأحداث، وخروج المغلوب والمجموعات — كله عبر HTTP على الخادم المبني.
 * النتائج تُكتب مباشرة في القاعدة لأن إدخالها وتأكيدها من الجلسة 4.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { Client } from 'pg';
import { hashPassword, totpCode } from '../src/auth/crypto';
import { roundRobin, shuffle } from '../src/tournaments/fixtures';

const PORT = 3100 + randomInt(0, 800);
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const db = new Client({ connectionString: process.env.DATABASE_URL });
let server: ChildProcess;
let log = '';

const run = Date.now() % 1_000_000;
let seq = 0;
const newPhone = () => `078${String(run).padStart(6, '0')}${String(++seq).padStart(2, '0')}`;
// عنوان IP مختلف لكل دخول حتى لا يصطدم الاختبار بحد الطلبات لكل IP (الخادم يثق بالـ proxy الأول)
let ipSeq = 0;
const fakeIp = () => `10.${(run >> 8) & 255}.${run & 255}.${++ipSeq}`;

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

const slug = (s: string) => `e2e-${s}-${run}`;
const createdTeams: number[] = [];

/** النتيجة تُكتب مباشرة (إدخال النتيجة من الجلسة 4) */
const setResult = (matchId: number, h: number, a: number, status = 'final', pens: [number, number] | null = null) =>
  db.query(`UPDATE matches SET home_score=$2, away_score=$3, result_status=$4, home_pens=$5, away_pens=$6 WHERE id=$1`,
    [matchId, h, a, status, pens?.[0] ?? null, pens?.[1] ?? null]);

let admin = '';
let tm: { token: string; id: number };
const managers: { token: string; id: number; teamId: number; joinCode: string; name: string }[] = [];
let leagueId = 0;

beforeAll(async () => {
  await db.connect();
  const env: NodeJS.ProcessEnv = {
    ...process.env, PORT: String(PORT), NODE_ENV: 'test', OTP_PROVIDER: 'dev',
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

  // مدير عام بدخول TOTP
  const email = `t3-admin-${run}@test.saha`;
  const { rows } = await db.query(
    `INSERT INTO users (email, full_name, birth_year, password_hash, updated_at) VALUES ($1,'مدير عام الجلسة 3',1980,$2, now()) RETURNING id`,
    [email, hashPassword('كلمة-سر-الجلسة-3')],
  );
  await db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1,'super_admin')`, [rows[0].id]);
  const ip = fakeIp();
  const l1 = await api('POST', '/auth/admin/login', { email, password: 'كلمة-سر-الجلسة-3' }, undefined, ip);
  const setup = await api('POST', '/auth/admin/totp/setup', {}, l1.body.setupToken, ip);
  const en = await api('POST', '/auth/admin/totp/enable', { code: totpCode(setup.body.secret) }, l1.body.setupToken, ip);
  admin = en.body.accessToken;
  expect(admin).toBeTruthy();
}, 60_000);

afterAll(async () => {
  server?.kill();
  // تنظيف ما أنشأه الاختبار حتى لا يمنع زرع البيانات التجريبية بعده في CI
  await db.query(`DELETE FROM tournaments WHERE slug LIKE $1`, [`e2e-%-${run}`]);
  if (createdTeams.length) await db.query(`DELETE FROM teams WHERE id = ANY($1)`, [createdTeams]);
  await db.end();
  if (process.env.SHOW_API_LOG) console.log(log);
});

describe('الجلسة 3 — بطولة دوري بـ 8 فرق من البداية للترتيب', () => {
  it('المدير العام ينشئ البطولة، ومدير البطولة بنطاقها فقط', async () => {
    const r = await api('POST', '/tournaments', {
      nameAr: 'دوري اختبار الجلسة 3', slug: slug('league'), kind: 'popular_teams', format: 'league', maxTeams: 8, city: 'بغداد', startsOn: '2026-12-01',
    }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    leagueId = r.body.id;
    expect(r.body.status).toBe('draft');

    // المسودة لا تظهر للعامة
    expect((await api('GET', `/tournaments/${leagueId}`)).status).toBe(404);

    // أخطاء التحقق برسالة عربية
    const bad = await api('POST', '/tournaments', { nameAr: 'خطأ', kind: 'popular_teams', format: 'groups_knockout', groupCount: 3, qualifiersPerGroup: 1 }, admin);
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('GROUPS_BRACKET');
    const dup = await api('POST', '/tournaments', { nameAr: 'مكررة', slug: slug('league'), kind: 'popular_teams', format: 'league' }, admin);
    expect(dup.body.code).toBe('SLUG_TAKEN');
    const comm = await api('POST', '/tournaments', { nameAr: 'شعبية بمجتمع', kind: 'popular_teams', format: 'league', communityId: 1 }, admin);
    expect(comm.body.code).toBe('COMMUNITY_NOT_ALLOWED');

    tm = await login('مدير بطولة الاختبار');
    await db.query(`INSERT INTO user_roles (user_id, role, tournament_id) VALUES ($1,'tournament_manager',$2)`, [tm.id, leagueId]);
    const other = await api('POST', '/tournaments', { nameAr: 'بطولة أخرى', slug: slug('other'), kind: 'popular_teams', format: 'league' }, admin);
    expect(other.status).toBe(201);

    expect((await api('POST', '/tournaments', { nameAr: 'ممنوعة', kind: 'popular_teams', format: 'league' }, tm.token)).status).toBe(403);
    expect((await api('PATCH', `/tournaments/${other.body.id}`, { city: 'البصرة' }, tm.token)).status).toBe(403);
    expect((await api('PATCH', `/tournaments/${leagueId}`, { city: 'بغداد - الكرخ' }, tm.token)).body.city).toBe('بغداد - الكرخ');

    const list = await api('GET', '/admin/tournaments', undefined, tm.token);
    expect(list.body.map((t: any) => t.id)).toEqual([leagueId]);

    expect((await api('POST', `/tournaments/${leagueId}/status`, { status: 'running' }, tm.token)).body.code).toBe('INVALID_TRANSITION');
    expect((await api('POST', `/tournaments/${leagueId}/status`, { status: 'registration' }, tm.token)).body.status).toBe('registration');
  });

  it('9 مدراء ينشئون فرقهم ويسجلونها؛ الاعتماد يفحص العدد وتكرار اللاعبين', async () => {
    for (let i = 1; i <= 9; i++) {
      const u = await login(`مدير الفريق ${i}`);
      const t = await api('POST', '/teams', { nameAr: `فريق اختبار ${i}`, city: 'بغداد' }, u.token);
      expect(t.status, JSON.stringify(t.body)).toBe(201);
      createdTeams.push(t.body.id);
      expect(t.body.joinCode).toMatch(/^[A-Z2-9]{6}$/);
      managers.push({ ...u, teamId: t.body.id, joinCode: t.body.joinCode, name: t.body.nameAr });
    }
    const [m1, m2] = managers;

    // مدير فريق لا يسجّل فريق غيره
    expect((await api('POST', `/tournaments/${leagueId}/registrations`, { teamId: m2.teamId }, m1.token)).status).toBe(403);

    const regs: Record<number, number> = {};
    for (const m of managers) {
      const r = await api('POST', `/tournaments/${leagueId}/registrations`, { teamId: m.teamId }, m.token);
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      regs[m.teamId] = r.body.id;
    }
    expect((await api('POST', `/tournaments/${leagueId}/registrations`, { teamId: m1.teamId }, m1.token)).body.code).toBe('ALREADY_REGISTERED');

    // لاعب بالغ ينضم برمز الفريق 1 ثم برمز الفريق 2
    const player = await login('لاعب مشترك', 1999);
    expect((await api('POST', '/teams/join', { code: m1.joinCode.toLowerCase(), shirtNo: 10 }, player.token)).status).toBe(200);
    expect((await api('POST', '/teams/join', { code: m2.joinCode }, player.token)).status).toBe(200);
    expect((await api('POST', '/teams/join', { code: 'ZZZZZZ' }, player.token)).body.code).toBe('INVALID_JOIN_CODE');

    // مدير فريق 1 يضيف لاعباً ثانياً برقمه، ورقم القميص لا يتكرر
    const p2 = await login('لاعب ثان', 1998);
    expect((await api('POST', `/teams/${m1.teamId}/players`, { phone: p2.phone, shirtNo: 10 }, m1.token)).body.code).toBe('SHIRT_TAKEN');
    expect((await api('POST', `/teams/${m1.teamId}/players`, { phone: p2.phone, shirtNo: 9 }, m1.token)).status).toBe(201);
    expect((await api('POST', `/teams/${m2.teamId}/players`, { phone: p2.phone }, m1.token)).status).toBe(403);

    // مدير البطولة يعتمد الفريق 1، ثم الفريق 2 يُرفض اعتماده بسبب اللاعب المشترك
    const dec = (teamId: number, approve = true) => api('POST', `/tournaments/${leagueId}/registrations/${regs[teamId]}/decision`, { approve }, tm.token);
    expect((await dec(m1.teamId)).body.status).toBe('approved');
    const clash = await dec(m2.teamId);
    expect(clash.body.code).toBe('TEAM_NOT_ELIGIBLE');
    expect(clash.body.message).toContain('فريق اختبار 1');

    // اللاعب يغادر الفريق 2 بنفسه ← يُعتمد
    const me = await api('GET', `/teams/${m1.teamId}`);
    const shared = me.body.players.find((p: any) => p.name === 'لاعب مشترك');
    expect(shared.shirtNo).toBe(10);
    expect((await api('DELETE', `/teams/${m2.teamId}/players/${shared.id}`, undefined, player.token)).status).toBe(200);
    expect((await dec(m2.teamId)).body.status).toBe('approved');

    // ولا ينضم لاحقاً لفريق آخر معتمد في البطولة نفسها
    expect((await api('POST', '/teams/join', { code: managers[2].joinCode }, player.token)).status).toBe(200); // الفريق 3 لم يُعتمد بعد
    expect((await api('DELETE', `/teams/${managers[2].teamId}/players/${shared.id}`, undefined, managers[2].token)).status).toBe(200);
    for (const m of managers.slice(2, 8)) expect((await dec(m.teamId)).body.status).toBe('approved');
    expect((await api('POST', '/teams/join', { code: managers[3].joinCode }, player.token)).body.code).toBe('PLAYER_NOT_ELIGIBLE');

    // الفريق التاسع: اكتمل العدد (8)
    expect((await dec(managers[8].teamId)).body.code).toBe('TOURNAMENT_FULL');
    expect((await dec(managers[8].teamId, false)).body.status).toBe('rejected');

    // رسوم الاشتراك تُسجَّل يدوياً
    expect((await api('PATCH', `/tournaments/${leagueId}/registrations/${regs[m1.teamId]}/fee`, { feePaidIqd: 50000 }, tm.token)).body.feePaidIqd).toBe(50000);
    expect((await api('PATCH', `/tournaments/${leagueId}/registrations/${regs[m1.teamId]}/fee`, { feePaidIqd: 1 }, m1.token)).status).toBe(403);

    const list = await api('GET', `/tournaments/${leagueId}/registrations`, undefined, tm.token);
    expect(list.body.filter((r: any) => r.status === 'approved')).toHaveLength(8);
  });

  it('القرعة: 28 مباراة في 7 جولات، ويمكن لأي أحد إعادة حسابها من البذرة', async () => {
    expect((await api('POST', `/tournaments/${leagueId}/draw`, undefined, managers[0].token)).status).toBe(403);
    expect((await api('POST', `/tournaments/${leagueId}/status`, { status: 'running' }, tm.token)).body.code).toBe('DRAW_REQUIRED');
    const d = await api('POST', `/tournaments/${leagueId}/draw`, undefined, tm.token);
    expect(d.status, JSON.stringify(d.body)).toBe(200);
    expect(d.body.matches).toHaveLength(28);
    expect(new Set(d.body.matches.map((m: any) => m.round)).size).toBe(7);
    const approved = managers.slice(0, 8).map((m) => m.teamId);
    for (const id of approved) {
      expect(d.body.matches.filter((m: any) => m.homeTeam.id === id || m.awayTeam.id === id)).toHaveLength(7);
    }
    expect(d.body.matches.some((m: any) => [m.homeTeam.id, m.awayTeam.id].includes(managers[8].teamId))).toBe(false);

    // التحقق العلني من القرعة
    const info = await api('GET', `/tournaments/${slug('league')}/draw`);
    expect(info.body.drawn).toBe(true);
    expect(info.body.teamIdsBeforeDraw).toEqual([...approved].sort((a, b) => a - b));
    const expected = roundRobin(shuffle(info.body.teamIdsBeforeDraw, info.body.seed))
      .flatMap((round, r) => round.map((p) => `${r + 1}:${p.home}>${p.away}`)).sort();
    const actual = d.body.matches.map((m: any) => `${m.round}:${m.homeTeam.id}>${m.awayTeam.id}`).sort();
    expect(actual).toEqual(expected);

    // الانسحاب والاعتماد مغلقان بعد القرعة
    const regs = await api('GET', `/tournaments/${leagueId}/registrations`, undefined, tm.token);
    const reg1 = regs.body.find((r: any) => r.team.id === managers[0].teamId);
    expect((await api('POST', `/tournaments/${leagueId}/registrations/${reg1.id}/withdraw`, undefined, managers[0].token)).body.code).toBe('DRAW_DONE');
  });

  it('الجدولة: الجمعة والسبت 16:00 و18:00 بتوقيت بغداد، ولا يلعب فريق مرتين في اليوم', async () => {
    expect((await api('POST', `/tournaments/${leagueId}/status`, { status: 'running' }, tm.token)).body.code).toBe('SCHEDULE_REQUIRED');
    const bad = await api('POST', `/tournaments/${leagueId}/schedule`, { startDate: '2026-12-01', weekdays: [9], times: ['16:00'], venues: ['م'] }, tm.token);
    expect(bad.status).toBe(400);
    const s = await api('POST', `/tournaments/${leagueId}/schedule`, {
      startDate: '2026-12-01', weekdays: [5, 6], times: ['18:00', '16:00'], venues: ['ملعب الاختبار'],
    }, tm.token);
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    expect(s.body.scheduled).toBe(28);
    expect(s.body.firstDay).toBe('2026-12-04');
    const seen = new Set<string>();
    const slots = new Set<string>();
    for (const m of s.body.matches) {
      const local = new Date(new Date(m.kickoffAt).getTime() + 3 * 3600_000).toISOString();
      const day = local.slice(0, 10);
      expect([5, 6]).toContain(new Date(`${day}T00:00:00Z`).getUTCDay());
      expect(['16:00', '18:00']).toContain(local.slice(11, 16));
      expect(m.venue).toBe('ملعب الاختبار');
      for (const t of [m.homeTeam.id, m.awayTeam.id]) {
        expect(seen.has(`${day}|${t}`)).toBe(false);
        seen.add(`${day}|${t}`);
      }
      slots.add(local);
    }
    expect(slots.size).toBe(28);
    expect((await api('POST', `/tournaments/${leagueId}/status`, { status: 'running' }, tm.token)).body.status).toBe('running');
    expect((await api('GET', `/tournaments/${slug('league')}`)).body.matches).toHaveLength(28);
  });

  it('أحداث المباراة: الحكم المعيَّن فقط، واللاعب من قائمة فريقه', async () => {
    const fx = await api('GET', `/tournaments/${leagueId}/fixtures`, undefined, tm.token);
    const m1 = managers[0];
    const match = fx.body.matches.find((m: any) => m.homeTeam.id === m1.teamId || m.awayTeam.id === m1.teamId);
    const ref = await login('حكم الاختبار', 1985);
    const ref2 = await login('حكم آخر', 1986);
    await db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1,'referee'), ($2,'referee')`, [ref.id, ref2.id]);
    const plain = await login('مستخدم عادي');
    expect((await api('PATCH', `/matches/${match.id}`, { refereeId: plain.id }, tm.token)).body.code).toBe('NOT_A_REFEREE');
    expect((await api('PATCH', `/matches/${match.id}`, { refereeId: ref.id }, tm.token)).body.refereeId).toBe(ref.id);
    expect((await api('PATCH', `/matches/${match.id}`, { refereeId: ref.id }, ref.token)).status).toBe(403);

    const team = await api('GET', `/teams/${m1.teamId}`);
    const scorer = team.body.players.find((p: any) => p.shirtNo === 9);
    const goal = { teamId: m1.teamId, playerId: scorer.id, type: 'goal', minute: 23 };
    expect((await api('POST', `/matches/${match.id}/events`, goal, ref2.token)).body.code).toBe('NOT_MATCH_REFEREE');
    expect((await api('POST', `/matches/${match.id}/events`, goal, plain.token)).status).toBe(403);
    const other = match.homeTeam.id === m1.teamId ? match.awayTeam.id : match.homeTeam.id;
    expect((await api('POST', `/matches/${match.id}/events`, { ...goal, teamId: other }, ref.token)).body.code).toBe('PLAYER_NOT_IN_TEAM');
    expect((await api('POST', `/matches/${match.id}/events`, goal, ref.token)).status).toBe(201);
    expect((await api('POST', `/matches/${match.id}/events`, { ...goal, minute: 70 }, ref.token)).status).toBe(201);
    const card = await api('POST', `/matches/${match.id}/events`, { ...goal, type: 'yellow_card', minute: 80 }, ref.token);
    expect((await api('DELETE', `/matches/${match.id}/events/${card.body.id}`, undefined, ref.token)).status).toBe(200);
    expect((await api('POST', `/matches/${match.id}/events`, { ...goal, type: 'mvp' }, tm.token)).status).toBe(201);
    expect((await api('POST', `/matches/${match.id}/events`, { ...goal, type: 'mvp' }, tm.token)).body.code).toBe('MVP_EXISTS');

    const pub = await api('GET', `/matches/${match.id}`);
    expect(pub.body.events.map((e: any) => [e.type, e.minute, e.player?.name])).toEqual([
      ['goal', 23, 'لاعب ثان'], ['goal', 70, 'لاعب ثان'], ['mvp', null, 'لاعب ثان'],
    ]);

    // الهدافون: لا يُحسب قبل اعتماد النتيجة
    expect((await api('GET', `/tournaments/${leagueId}/scorers`)).body).toEqual([]);
    await setResult(match.id, 2, 0, 'confirmed');
    const scorers = await api('GET', `/tournaments/${leagueId}/scorers`);
    expect(scorers.body[0]).toMatchObject({ player: { name: 'لاعب ثان' }, team: { id: m1.teamId }, goals: 2 });
  });

  it('الترتيب يُحسب صحيحاً بعد كل النتائج، والمؤقتة والمتنازع عليها لا تدخل', async () => {
    const fx = await api('GET', `/tournaments/${leagueId}/fixtures`, undefined, tm.token);
    const teamIds = managers.slice(0, 8).map((m) => m.teamId);
    const idx = (id: number) => teamIds.indexOf(id);
    const counted: { h: number; a: number; hs: number; as: number }[] = [];
    let i = 0;
    for (const m of fx.body.matches) {
      const h = m.homeTeam.id, a = m.awayTeam.id;
      const hs = (idx(h) * 3 + idx(a)) % 4, as = (idx(a) * 2 + idx(h)) % 3;
      // مباراتان: واحدة مؤقتة وأخرى متنازع عليها بنتائج كبيرة لا يجب أن تظهر
      const status = i === 5 ? 'provisional' : i === 11 ? 'disputed' : i % 2 ? 'final' : 'confirmed';
      if (status === 'provisional' || status === 'disputed') await setResult(m.id, 9, 0, status);
      else { await setResult(m.id, hs, as, status); counted.push({ h, a, hs, as }); }
      i++;
    }
    expect(counted).toHaveLength(26);

    // حساب مستقل للترتيب المتوقع
    const names = Object.fromEntries(managers.map((m) => [m.teamId, m.name]));
    const st = new Map(teamIds.map((id) => [id, { id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }]));
    for (const c of counted) {
      const H = st.get(c.h)!, A = st.get(c.a)!;
      H.p++; A.p++; H.gf += c.hs; H.ga += c.as; A.gf += c.as; A.ga += c.hs;
      if (c.hs > c.as) { H.w++; A.l++; H.pts += 3; } else if (c.hs < c.as) { A.w++; H.l++; A.pts += 3; } else { H.d++; A.d++; H.pts++; A.pts++; }
    }
    const expected = [...st.values()].sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || names[x.id].localeCompare(names[y.id], 'ar'));

    const res = await api('GET', `/tournaments/${slug('league')}/standings`);
    expect(res.status).toBe(200);
    expect(res.body.rows.map((r: any) => [r.position, r.team.id, r.played, r.won, r.drawn, r.lost, r.goalsFor, r.goalsAgainst, r.goalDiff, r.points]))
      .toEqual(expected.map((e, k) => [k + 1, e.id, e.p, e.w, e.d, e.l, e.gf, e.ga, e.gf - e.ga, e.pts]));
    expect(res.body.rows.reduce((s: number, r: any) => s + r.played, 0)).toBe(52);
    expect(res.body.groups).toEqual([]);

    // صفحة الفريق العامة
    const team = await api('GET', `/teams/${managers[0].teamId}`);
    expect(team.body.tournaments.map((t: any) => t.slug)).toContain(slug('league'));
    expect(team.body.matches).toHaveLength(7);
    expect(team.body.verified).toBe(false);
  });

  it('سجل التدقيق يحمل كل خطوة والسلسلة سليمة', async () => {
    const { rows } = await db.query(
      `SELECT DISTINCT action FROM audit_log WHERE (entity='tournament' AND entity_id=$1) OR (entity='tournament_registration' AND (payload->>'tournamentId')=$1)`,
      [String(leagueId)],
    );
    const actions = rows.map((r) => r.action);
    for (const a of ['tournament.create', 'tournament.update', 'tournament.status', 'registration.create', 'registration.approved', 'registration.rejected', 'registration.fee', 'tournament.draw', 'tournament.schedule']) {
      expect(actions).toContain(a);
    }
    expect((await api('GET', '/admin/audit/verify', undefined, admin)).body.ok).toBe(true);
  });
});

describe('الأهلية، التوثيق اليدوي، خروج المغلوب، والمجموعات', () => {
  it('بطولة تحت 18 ترفض فريقاً فيه لاعب بالغ', async () => {
    const t = await api('POST', '/tournaments', { nameAr: 'كأس الناشئين', slug: slug('u18'), kind: 'popular_teams', format: 'league', ageCategory: 'u18' }, admin);
    await api('POST', `/tournaments/${t.body.id}/status`, { status: 'registration' }, admin);
    const m1 = managers[0];
    const reg = await api('POST', `/tournaments/${t.body.id}/registrations`, { teamId: m1.teamId }, m1.token);
    const dec = await api('POST', `/tournaments/${t.body.id}/registrations/${reg.body.id}/decision`, { approve: true }, admin);
    expect(dec.body.code).toBe('TEAM_NOT_ELIGIBLE');
    expect(dec.body.message).toContain('تحت 18');
  });

  it('ولي الأمر يضم ابنه القاصر برمز الفريق، والصفحة العامة تعرض الاسم الأول فقط', async () => {
    const g = await login('ولي أمر الاختبار', 1980);
    const child = await api('POST', '/me/guardian/children', { firstName: 'يوسف', birthYear: new Date().getFullYear() - 12, mediaConsent: true }, g.token);
    expect(child.status, JSON.stringify(child.body)).toBe(201);
    const m9 = managers[8];
    expect((await api('POST', `/me/children/${child.body.id}/teams`, { code: m9.joinCode, shirtNo: 7 }, g.token)).status).toBe(200);
    expect((await api('POST', `/me/children/${child.body.id}/teams`, { code: m9.joinCode }, m9.token)).body.code).toBe('PLAYER_NOT_FOUND');
    const team = await api('GET', `/teams/${m9.teamId}`);
    expect(team.body.players).toEqual([{ id: child.body.id, name: 'يوسف', shirtNo: 7 }]);
    const mine = await api('GET', '/me/teams', undefined, m9.token);
    expect(mine.body[0].joinCode).toBe(m9.joinCode);
    const fresh = await api('POST', `/teams/${m9.teamId}/join-code`, undefined, m9.token);
    expect(fresh.body.joinCode).not.toBe(m9.joinCode);
    expect((await api('POST', '/teams/join', { code: m9.joinCode }, g.token)).body.code).toBe('INVALID_JOIN_CODE');
  });

  it('التوثيق اليدوي: رمز ← رابط المنشور ← اعتماد الإدارة', async () => {
    const m = managers[4];
    expect((await api('POST', `/teams/${m.teamId}/verification`, undefined, m.token)).body.code).toBe('FB_PAGE_REQUIRED');
    expect((await api('PATCH', `/teams/${m.teamId}`, { fbPageUrl: 'https://example.com/x' }, m.token)).body.code).toBe('INVALID_FB_URL');
    await api('PATCH', `/teams/${m.teamId}`, { fbPageUrl: 'https://www.facebook.com/saha.test.team' }, m.token);
    const r = await api('POST', `/teams/${m.teamId}/verification`, undefined, m.token);
    expect(r.body.code).toMatch(/^SAHA-[A-Z2-9]{6}$/);
    expect(r.body.instructions).toContain(r.body.code);
    // الطلب نفسه يُعاد إن كان قائماً
    expect((await api('POST', `/teams/${m.teamId}/verification`, undefined, m.token)).body.id).toBe(r.body.id);
    expect((await api('POST', `/admin/verifications/${r.body.id}/decide`, { approve: true }, admin)).body.code).toBe('POST_URL_REQUIRED');
    expect((await api('PATCH', `/teams/${m.teamId}/verification`, { postUrl: 'https://www.facebook.com/saha.test.team/posts/1' }, m.token)).body.postUrl).toContain('posts/1');
    expect((await api('POST', `/admin/verifications/${r.body.id}/decide`, { approve: true }, m.token)).status).toBe(403);
    expect((await api('POST', `/admin/verifications/${r.body.id}/decide`, { approve: true }, tm.token)).status).toBe(403); // مدير بطولة بنطاق لا يوثّق الفرق
    const pending = await api('GET', '/admin/verifications', undefined, admin);
    expect(pending.body.some((x: any) => x.id === r.body.id)).toBe(true);
    expect((await api('POST', `/admin/verifications/${r.body.id}/decide`, { approve: true }, admin)).body.status).toBe('approved');
    const team = await api('GET', `/teams/${m.teamId}`);
    expect(team.body.verified).toBe(true);
    expect(team.body.verifyMethod).toBe('manual');
    // تغيير الصفحة يلغي التوثيق
    await api('PATCH', `/teams/${m.teamId}`, { fbPageUrl: 'https://www.facebook.com/another.page' }, m.token);
    expect((await api('GET', `/teams/${m.teamId}`)).body.verified).toBe(false);
  });

  async function prepare(format: string, n: number, extra: Record<string, unknown> = {}) {
    const t = await api('POST', '/tournaments', { nameAr: `اختبار ${format}`, slug: slug(format.replace('_', '-')), kind: 'popular_teams', format, ...extra }, admin);
    expect(t.status, JSON.stringify(t.body)).toBe(201);
    const id = t.body.id;
    await api('POST', `/tournaments/${id}/status`, { status: 'registration' }, admin);
    for (const m of managers.slice(0, n)) {
      const r = await api('POST', `/tournaments/${id}/registrations`, { teamId: m.teamId }, m.token);
      expect((await api('POST', `/tournaments/${id}/registrations/${r.body.id}/decision`, { approve: true }, admin)).body.status).toBe('approved');
    }
    const d = await api('POST', `/tournaments/${id}/draw`, undefined, admin);
    expect(d.status, JSON.stringify(d.body)).toBe(200);
    await api('POST', `/tournaments/${id}/schedule`, { startDate: '2026-12-01', weekdays: [0, 1, 2, 3, 4, 5, 6], times: ['17:00'], venues: ['أ', 'ب'] }, admin);
    expect((await api('POST', `/tournaments/${id}/status`, { status: 'running' }, admin)).body.status).toBe('running');
    return { id, draw: d.body };
  }

  it('خروج المغلوب بـ 4 فرق: نصف النهائي ← النهائي، والتعادل يحتاج ركلات ترجيح', async () => {
    const { id, draw } = await prepare('knockout', 4);
    expect(draw.matches.map((m: any) => m.stage)).toEqual(['sf', 'sf']);
    expect((await api('POST', `/tournaments/${id}/next-round`, undefined, admin)).body.code).toBe('ROUND_NOT_FINISHED');
    const [a, b] = draw.matches;
    await setResult(a.id, 3, 1);
    await setResult(b.id, 1, 1);
    expect((await api('POST', `/tournaments/${id}/next-round`, undefined, admin)).body.code).toBe('ROUND_NOT_FINISHED');
    await setResult(b.id, 1, 1, 'final', [4, 5]);
    const nx = await api('POST', `/tournaments/${id}/next-round`, undefined, admin);
    const final = nx.body.matches.filter((m: any) => m.stage === 'final');
    expect(final).toHaveLength(1);
    expect([final[0].homeTeam.id, final[0].awayTeam.id]).toEqual([a.homeTeam.id, b.awayTeam.id]);
    expect(final[0].kickoffAt).toBeNull();
    // جدولة الدور الجديد فقط
    const s = await api('POST', `/tournaments/${id}/schedule`, { startDate: '2026-12-20', weekdays: [5], times: ['20:00'], venues: ['الملعب الرئيسي'], fromRound: 2 }, admin);
    expect(s.body.scheduled).toBe(1);
    await setResult(final[0].id, 2, 0);
    expect((await api('POST', `/tournaments/${id}/next-round`, undefined, admin)).body.code).toBe('TOURNAMENT_COMPLETE');
    expect((await api('POST', `/tournaments/${id}/status`, { status: 'finished' }, admin)).body.status).toBe('finished');
  });

  it('مجموعتان × متأهلان: 12 مباراة مجموعات ← نصف نهائي بالتقاطع', async () => {
    const { id, draw } = await prepare('groups_knockout', 8, { groupCount: 2, qualifiersPerGroup: 2 });
    expect(draw.groups.map((g: any) => [g.label, g.teams.length])).toEqual([['أ', 4], ['ب', 4]]);
    expect(draw.matches).toHaveLength(12);
    expect(draw.matches.every((m: any) => m.stage === 'group')).toBe(true);
    // كل مباراة داخل مجموعة واحدة
    const groupOf = new Map<number, string>();
    for (const g of draw.groups) for (const t of g.teams) groupOf.set(t.id, g.label);
    expect(draw.matches.every((m: any) => groupOf.get(m.homeTeam.id) === groupOf.get(m.awayTeam.id))).toBe(true);

    // صاحب الأرض يفوز دائماً بفارق حسب ترتيب الفريق في القائمة
    const rank = (tid: number) => managers.findIndex((m) => m.teamId === tid);
    for (const m of draw.matches) {
      const better = rank(m.homeTeam.id) < rank(m.awayTeam.id);
      await setResult(m.id, better ? 2 : 0, better ? 0 : 2);
    }
    const st = await api('GET', `/tournaments/${id}/standings`);
    expect(st.body.groups.map((g: any) => g.label)).toEqual(['أ', 'ب']);
    const top = st.body.groups.map((g: any) => g.rows.map((r: any) => r.team.id));
    for (const rows of top) expect(rows).toEqual([...rows].sort((x: number, y: number) => rank(x) - rank(y)));

    const nx = await api('POST', `/tournaments/${id}/next-round`, undefined, admin);
    const sf = nx.body.matches.filter((m: any) => m.stage === 'sf').map((m: any) => [m.homeTeam.id, m.awayTeam.id]);
    expect(sf).toEqual([[top[0][0], top[1][1]], [top[1][0], top[0][1]]]);
    expect(nx.body.matches.filter((m: any) => m.stage === 'sf').every((m: any) => m.round === 4)).toBe(true);
    // الترتيب لا يتأثر بمباريات خروج المغلوب
    await setResult(nx.body.matches.find((m: any) => m.stage === 'sf').id, 7, 0);
    const st2 = await api('GET', `/tournaments/${id}/standings`);
    expect(st2.body.groups).toEqual(st.body.groups);
  });
});
