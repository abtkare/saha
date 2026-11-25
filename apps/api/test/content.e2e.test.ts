/**
 * اختبار تكامل الجلسة 5 — المحتوى والرعاة، عبر HTTP على الخادم المبني وقاعدة حقيقية.
 * الشرطان: (1) شريحة مدفوعة لا تُنشر دون اعتماد — لا عبر الـ API ولا بتعديل مباشر في القاعدة،
 * وتعديل شريحة معتمدة يسحب اعتمادها. (2) تقرير الراعي يطابق الأحداث المسجلة عدّاً مستقلاً.
 * ويختبر أيضاً: شريحة «مباراة اليوم» ونتيجتها النصية، الأخبار والصفحات، صور المحتوى العامة،
 * بوابة الراعي بالنطاق، نموذج «كن راعياً»، وسلامة سجل التدقيق.
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

const run = (Date.now() + 11) % 1_000_000;
let seq = 60;
const newPhone = () => `077${String(run).padStart(6, '0')}${String(++seq).padStart(2, '0')}`;
let ipSeq = 0;
const fakeIp = () => `10.${(run >> 8) & 255}.${(run + 5) & 255}.${++ipSeq}`;

async function api(method: string, path: string, body?: unknown, token?: string, ip?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(ip ? { 'x-forwarded-for': ip } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json, headers: res.headers };
}

async function upload(bytes: Buffer, token: string, purpose?: string) {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)]), 'img.png');
  if (purpose) form.append('purpose', purpose);
  const res = await fetch(`${BASE}/uploads`, { method: 'POST', body: form, headers: { authorization: `Bearer ${token}` } });
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

/** حساب إدارة بدور أو أكثر، يدخل بالبريد وكلمة السر وTOTP */
async function mfaUser(label: string, roles: string[]) {
  const email = `t5-${label}-${run}@test.saha`;
  const password = `كلمة-سر-${label}-5`;
  const { rows } = await db.query(`INSERT INTO users (email, full_name, birth_year, password_hash, updated_at) VALUES ($1,$2,1980,$3, now()) RETURNING id`, [email, `إدارة ${label}`, hashPassword(password)]);
  for (const role of roles) await db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1,$2)`, [rows[0].id, role]);
  const h = { 'content-type': 'application/json', 'x-forwarded-for': fakeIp() };
  const l1 = await (await fetch(`${BASE}/auth/admin/login`, { method: 'POST', headers: h, body: JSON.stringify({ email, password }) })).json() as any;
  const setup = await (await fetch(`${BASE}/auth/admin/totp/setup`, { method: 'POST', headers: { ...h, authorization: `Bearer ${l1.setupToken}` }, body: '{}' })).json() as any;
  const en = await (await fetch(`${BASE}/auth/admin/totp/enable`, { method: 'POST', headers: { ...h, authorization: `Bearer ${l1.setupToken}` }, body: JSON.stringify({ code: totpCode(setup.secret) }) })).json() as any;
  expect(en.accessToken, JSON.stringify(en)).toBeTruthy();
  return { token: en.accessToken as string, id: rows[0].id as number };
}

const PNG = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(200)]);
const baghdadDay = (offset = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + offset * 86400_000));
const dev = (n: number) => `dev-${run}-${String(n).padStart(4, '0')}`;
const heroIds = async () => ((await api('GET', '/home/hero')).body.slides as any[]).map((s) => s.id);

type U = { token: string; id: number };
let admin: U, editor: U, sponsorMgr: U, editor2: U;
let ref: U, outsider: U, viewerA: U, viewerB: U;
let sponsorA = 0, sponsorB = 0;
let paidSlide = 0, otherSponsorSlide = 0;
let matchId = 0, tournamentId = 0;
const createdTeams: number[] = [];
const createdSlides: number[] = [];
const createdPosts: number[] = [];
let leadId = 0;

beforeAll(async () => {
  await db.connect();
  const env: NodeJS.ProcessEnv = {
    ...process.env, PORT: String(PORT), NODE_ENV: 'test', OTP_PROVIDER: 'dev', PUSH_PROVIDER: 'off', /* مُرسل Expo Push في push.e2e وحده: القاعدة مشتركة بين الملفات المتوازية */
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

  admin = await mfaUser('admin', ['super_admin']);
  editor = await mfaUser('editor', ['content_editor']);
  editor2 = await mfaUser('editor2', ['content_editor']);
  sponsorMgr = await mfaUser('sponsors', ['sponsor_manager']);
  ref = await login('حكم الجلسة 5', 1985);
  outsider = await login('متابع الجلسة 5');
  viewerA = await login('راعٍ أ');
  viewerB = await login('راعٍ ب');
  await db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1,'referee')`, [ref.id]);

  // بطولة جارية ومباراة بدأت قبل نصف ساعة (لشريحة «مباراة اليوم»)
  const t = await db.query(
    `INSERT INTO tournaments (name_ar, slug, kind, format, status, updated_at) VALUES ('بطولة الجلسة 5', $1, 'popular_teams', 'league', 'running', now()) RETURNING id`,
    [`e2e5-cup-${run}`],
  );
  tournamentId = t.rows[0].id;
  const mgr = await login('مدير فريق الجلسة 5');
  for (const name of ['نسور الجلسة 5', 'أسود الجلسة 5']) {
    const r = await db.query(`INSERT INTO teams (name_ar, manager_id) VALUES ($1,$2) RETURNING id`, [name, mgr.id]);
    createdTeams.push(r.rows[0].id);
  }
  const m = await db.query(
    `INSERT INTO matches (tournament_id, home_team_id, away_team_id, kickoff_at, venue, referee_id) VALUES ($1,$2,$3, now() - interval '30 minutes', 'ساحة الاختبار', $4) RETURNING id`,
    [tournamentId, createdTeams[0], createdTeams[1], ref.id],
  );
  matchId = m.rows[0].id;
}, 120_000);

afterAll(async () => {
  server?.kill();
  if (createdSlides.length) await db.query(`DELETE FROM hero_slides WHERE id = ANY($1)`, [createdSlides]);
  if (createdPosts.length) await db.query(`DELETE FROM posts WHERE id = ANY($1)`, [createdPosts]);
  await db.query(`DELETE FROM tournaments WHERE slug = $1`, [`e2e5-cup-${run}`]);
  if (createdTeams.length) await db.query(`DELETE FROM teams WHERE id = ANY($1)`, [createdTeams]);
  if (leadId) await db.query(`DELETE FROM sponsor_leads WHERE id = $1`, [leadId]);
  await db.end();
  if (process.env.SHOW_API_LOG) console.log(log);
});

describe('الجلسة 5 — الرعاة وصور المحتوى', () => {
  it('مدير الرعاة ينشئ الرعاة، ومحرر المحتوى يرى القائمة بلا بيانات التواصل', async () => {
    expect((await api('POST', '/admin/sponsors', { nameAr: 'راعٍ ممنوع' }, editor.token)).status).toBe(403);
    const logo = await upload(PNG(), sponsorMgr.token, 'content');
    expect(logo.status, JSON.stringify(logo.body)).toBe(201);
    expect(logo.body.url).toBe(`/api/v1/media/${logo.body.id}`);
    const a = await api('POST', '/admin/sponsors', { nameAr: `شركة الرافدين ${run}`, contactPhone: '07701234567', website: 'https://example.iq', logoMediaId: logo.body.id }, sponsorMgr.token);
    expect(a.status, JSON.stringify(a.body)).toBe(201);
    expect(a.body.contactPhone).toBe('+9647701234567');
    expect(a.body.logoUrl).toBe(logo.body.url);
    sponsorA = a.body.id;
    const b = await api('POST', '/admin/sponsors', { nameAr: `مطاعم دجلة ${run}` }, sponsorMgr.token);
    sponsorB = b.body.id;
    expect((await api('POST', '/admin/sponsors', { nameAr: 'خطأ', website: 'javascript:alert(1)' }, sponsorMgr.token)).body.code).toBe('INVALID_LINK');
    const list = await api('GET', '/admin/sponsors', undefined, editor.token);
    const mine = list.body.find((s: any) => s.id === sponsorA);
    expect(mine.nameAr).toContain('الرافدين');
    expect(mine.contactPhone).toBeUndefined();
    expect((await api('GET', '/admin/sponsors', undefined, outsider.token)).status).toBe(403);
  });

  it('صورة المحتوى عامة، وصورة ورقة المباراة لا تُعرض للعامة', async () => {
    expect((await upload(PNG(), outsider.token, 'content')).status).toBe(403);
    const pub = await upload(PNG(), editor.token, 'content');
    const res = await fetch(`${BASE}/media/${pub.body.id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    const priv = await upload(PNG(), ref.token);
    expect(priv.body.isPublic).toBe(false);
    expect((await fetch(`${BASE}/media/${priv.body.id}`)).status).toBe(404);
    // صورة خاصة لا تُستخدم في المحتوى
    expect((await api('PATCH', `/admin/sponsors/${sponsorB}`, { logoMediaId: priv.body.id }, sponsorMgr.token)).body.code).toBe('MEDIA_INVALID');
  });
});

describe('الجلسة 5 — شريحة مدفوعة لا تُنشر دون اعتماد', () => {
  it('المسودة وقيد المراجعة لا تظهر، ومدير الرعاة لا يعتمد ولا يكتب غير شرائح الرعاة', async () => {
    expect((await api('POST', '/admin/slides', { type: 'promo', titleAr: 'إعلان' }, sponsorMgr.token)).status).toBe(403);
    expect((await api('POST', '/admin/slides', { type: 'sponsor', titleAr: 'بلا راعٍ' }, sponsorMgr.token)).body.code).toBe('SPONSOR_REQUIRED');
    expect((await api('POST', '/admin/slides', { type: 'sponsor', titleAr: 'خطأ', sponsorId: sponsorA, linkUrl: 'http://x.iq' }, sponsorMgr.token)).body.code).toBe('INVALID_LINK');
    const s = await api('POST', '/admin/slides', { type: 'sponsor', titleAr: 'عروض الرافدين', subtitleAr: 'خصم للاعبين', sponsorId: sponsorA, linkUrl: 'https://example.iq/offer', priority: 50 }, sponsorMgr.token);
    expect(s.status, JSON.stringify(s.body)).toBe(201);
    expect(s.body.status).toBe('draft');
    paidSlide = s.body.id;
    createdSlides.push(paidSlide);
    expect(await heroIds()).not.toContain(paidSlide);

    // لا اعتماد من المسودة، ولا من غير الناشر
    expect((await api('POST', `/admin/slides/${paidSlide}/approve`, undefined, editor.token)).body.code).toBe('NOT_IN_REVIEW');
    expect((await api('POST', `/admin/slides/${paidSlide}/submit`, undefined, sponsorMgr.token)).body.status).toBe('review');
    expect(await heroIds()).not.toContain(paidSlide);
    expect((await api('POST', `/admin/slides/${paidSlide}/approve`, undefined, sponsorMgr.token)).status).toBe(403);
    expect((await api('POST', `/admin/slides/${paidSlide}/approve`, undefined, outsider.token)).status).toBe(403);
    // مدير الرعاة يرى شرائح الرعاة فقط
    const list = await api('GET', '/admin/slides', undefined, sponsorMgr.token);
    expect(list.body.every((x: any) => x.type === 'sponsor')).toBe(true);
  });

  it('الإرجاع بسبب ثم الاعتماد من شخص آخر', async () => {
    const back = await api('POST', `/admin/slides/${paidSlide}/reject`, { note: 'الصورة ناقصة' }, editor.token);
    expect(back.body.status).toBe('draft');
    expect(back.body.reviewNote).toBe('الصورة ناقصة');
    await api('POST', `/admin/slides/${paidSlide}/submit`, undefined, sponsorMgr.token);
    const ok = await api('POST', `/admin/slides/${paidSlide}/approve`, undefined, editor.token);
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.status).toBe('published');
    expect(ok.body.approvedBy.id).toBe(editor.id);
    const hero = await api('GET', '/home/hero');
    const slide = hero.body.slides.find((x: any) => x.id === paidSlide);
    expect(slide.sponsored).toBe(true);
    expect(slide.sponsor.nameAr).toContain('الرافدين');
    expect(hero.body.refreshSeconds).toBe(30);
  });

  it('من أنشأ الشريحة المدفوعة أو عدّلها لا يعتمدها — إلا المدير العام ويُسجَّل ذلك', async () => {
    const s = await api('POST', '/admin/slides', { type: 'sponsor', titleAr: 'عرض دجلة', sponsorId: sponsorB }, editor.token);
    otherSponsorSlide = s.body.id;
    createdSlides.push(otherSponsorSlide);
    await api('POST', `/admin/slides/${otherSponsorSlide}/submit`, undefined, editor.token);
    expect((await api('POST', `/admin/slides/${otherSponsorSlide}/approve`, undefined, editor.token)).body.code).toBe('SELF_APPROVAL');
    // المدير العام عدّلها وهي قيد المراجعة ← يعتمدها بنفسه، ويُسجَّل selfApproved
    expect((await api('PATCH', `/admin/slides/${otherSponsorSlide}`, { subtitleAr: 'وجبة مجانية للفائز' }, admin.token)).status).toBe(200);
    expect((await api('POST', `/admin/slides/${otherSponsorSlide}/approve`, undefined, editor.token)).body.code).toBe('SELF_APPROVAL');
    const ok = await api('POST', `/admin/slides/${otherSponsorSlide}/approve`, undefined, admin.token);
    expect(ok.body.status, JSON.stringify(ok.body)).toBe('published');
    const audit = await db.query(`SELECT payload FROM audit_log WHERE entity='hero_slide' AND entity_id=$1 AND action='slide.approve' ORDER BY seq DESC LIMIT 1`, [String(otherSponsorSlide)]);
    expect(audit.rows[0].payload.selfApproved).toBe(true);
  });

  it('تعديل محتوى شريحة منشورة يسحب اعتمادها فتختفي، وتغيير الأولوية لا يسحبه', async () => {
    const p = await api('PATCH', `/admin/slides/${otherSponsorSlide}`, { priority: 40 }, sponsorMgr.token);
    expect(p.body.status).toBe('published');
    expect(await heroIds()).toContain(otherSponsorSlide);
    const e = await api('PATCH', `/admin/slides/${otherSponsorSlide}`, { titleAr: 'عرض دجلة الجديد' }, sponsorMgr.token);
    expect(e.body.status).toBe('review');
    expect(e.body.approvedAt).toBeNull();
    expect(await heroIds()).not.toContain(otherSponsorSlide);
    const audit = await db.query(`SELECT payload FROM audit_log WHERE entity='hero_slide' AND entity_id=$1 AND action='slide.update' ORDER BY seq DESC LIMIT 1`, [String(otherSponsorSlide)]);
    expect(audit.rows[0].payload.approvalRevoked).toBe(true);
    expect((await api('POST', `/admin/slides/${otherSponsorSlide}/approve`, undefined, editor2.token)).body.status).toBe('published');
  });

  it('القاعدة نفسها ترفض النشر بلا اعتماد، وتسحب الاعتماد عند التعديل المباشر', async () => {
    const r = await db.query(`INSERT INTO hero_slides (type, title_ar, sponsor_id, status, updated_at) VALUES ('sponsor','مباشر',$1,'draft', now()) RETURNING id`, [sponsorB]);
    createdSlides.push(r.rows[0].id);
    await expect(db.query(`UPDATE hero_slides SET status='published' WHERE id=$1`, [r.rows[0].id])).rejects.toThrow(/hero_slides_(publish|approver)_chk/);
    await expect(db.query(`UPDATE hero_slides SET status='published', approved_at=now() WHERE id=$1`, [r.rows[0].id])).rejects.toThrow(/hero_slides_approver_chk/);
    await db.query(`UPDATE hero_slides SET image_url='/api/v1/media/1' WHERE id=$1`, [otherSponsorSlide]);
    const after = await db.query(`SELECT status, approved_at FROM hero_slides WHERE id=$1`, [otherSponsorSlide]);
    expect(after.rows[0]).toEqual({ status: 'review', approved_at: null });
    expect(await heroIds()).not.toContain(otherSponsorSlide);
    await api('POST', `/admin/slides/${otherSponsorSlide}/approve`, undefined, editor2.token);
  });

  it('فترة العرض: لا تظهر قبل بدايتها ولا بعد نهايتها، والأحداث تُرفض خارجها', async () => {
    const future = new Date(Date.now() + 2 * 86400_000).toISOString();
    const s = await api('POST', '/admin/slides', { type: 'promo', titleAr: 'قريباً', startsAt: future }, editor.token);
    createdSlides.push(s.body.id);
    await api('POST', `/admin/slides/${s.body.id}/submit`, undefined, editor.token);
    expect((await api('POST', `/admin/slides/${s.body.id}/approve`, undefined, editor.token)).body.status).toBe('published');
    expect(await heroIds()).not.toContain(s.body.id);
    expect((await api('POST', `/hero/${s.body.id}/events`, { type: 'impression', deviceId: dev(1) })).body.code).toBe('SLIDE_NOT_LIVE');
    expect((await api('PATCH', `/admin/slides/${s.body.id}`, { endsAt: new Date(Date.now() + 86400_000).toISOString() }, editor.token)).body.code).toBe('INVALID_WINDOW');
  });
});

describe('الجلسة 5 — التقرير يطابق الأحداث', () => {
  const sent = { impressions: new Set<string>(), clicks: new Set<string>() };

  it('الظهور مرة لكل جهاز في اليوم، والنقرة لا تُحسب بلا ظهور', async () => {
    const ip = fakeIp();
    for (let i = 1; i <= 12; i++) {
      const r = await api('POST', `/hero/${paidSlide}/events`, { type: 'impression', deviceId: dev(i) }, undefined, ip);
      expect(r.status).toBe(202);
      expect(r.body.counted).toBe(true);
      sent.impressions.add(dev(i));
    }
    // تكرار الظهور من الأجهزة نفسها لا يُحسب
    for (let i = 1; i <= 5; i++) expect((await api('POST', `/hero/${paidSlide}/events`, { type: 'impression', deviceId: dev(i) }, undefined, ip)).body.counted).toBe(false);
    // نقرات من 4 أجهزة رأت الشريحة، ومكررة
    for (const i of [2, 4, 6, 8, 2, 4]) {
      const r = await api('POST', `/hero/${paidSlide}/events`, { type: 'click', deviceId: dev(i) }, undefined, ip);
      expect(r.body.counted).toBe(!sent.clicks.has(dev(i)));
      sent.clicks.add(dev(i));
    }
    // جهاز لم يرَ الشريحة
    expect((await api('POST', `/hero/${paidSlide}/events`, { type: 'click', deviceId: dev(99) }, undefined, ip)).body.counted).toBe(false);
    // مدخلات خاطئة
    expect((await api('POST', `/hero/${paidSlide}/events`, { type: 'view', deviceId: dev(1) })).status).toBe(400);
    expect((await api('POST', `/hero/${paidSlide}/events`, { type: 'click', deviceId: 'x;drop' })).status).toBe(400);
  });

  it('تقرير اليوم وأيام سابقة يطابق عدّاً مستقلاً من جدول الأحداث', async () => {
    const today = baghdadDay();
    // أحداث أيام سابقة (كما يسجلها الخادم: صف لكل جهاز ونوع ويوم)
    const past: Record<string, { impressions: number; clicks: number }> = {};
    for (const [offset, imp, clk] of [[-1, 7, 3], [-3, 4, 0], [-40, 9, 9]] as const) {
      const day = baghdadDay(offset);
      for (let i = 0; i < imp; i++) {
        await db.query(`INSERT INTO slide_events (slide_id, type, device_id, day) VALUES ($1,'impression',$2,$3)`, [paidSlide, `${dev(500 + i)}`, day]);
        if (i < clk) await db.query(`INSERT INTO slide_events (slide_id, type, device_id, day) VALUES ($1,'click',$2,$3)`, [paidSlide, `${dev(500 + i)}`, day]);
      }
      past[day] = { impressions: imp, clicks: clk };
    }
    const from = baghdadDay(-29);
    const r = await api('GET', `/sponsor/report?sponsorId=${sponsorA}&from=${from}&to=${today}`, undefined, sponsorMgr.token);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const s = r.body.slides.find((x: any) => x.id === paidSlide);

    // العدّ المستقل من الجدول نفسه
    const raw = await db.query(
      `SELECT to_char(day,'YYYY-MM-DD') AS day, type::text, count(*)::int AS n FROM slide_events WHERE slide_id=$1 AND day BETWEEN $2 AND $3 GROUP BY 1,2`,
      [paidSlide, from, today],
    );
    const expected = new Map<string, { impressions: number; clicks: number }>();
    for (const row of raw.rows) {
      const d = expected.get(row.day) ?? { impressions: 0, clicks: 0 };
      if (row.type === 'impression') d.impressions = row.n; else d.clicks = row.n;
      expected.set(row.day, d);
    }
    expect(s.days).toEqual([...expected].sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day, ...v })));

    // وما أرسلناه فعلاً: اليوم 12 ظهوراً و4 نقرات، واليومان السابقان كما أُدخلا، ويوم -40 خارج الفترة
    expect(s.days.find((d: any) => d.day === today)).toEqual({ day: today, impressions: sent.impressions.size, clicks: sent.clicks.size });
    expect(s.days.find((d: any) => d.day === baghdadDay(-1))).toEqual({ day: baghdadDay(-1), ...past[baghdadDay(-1)] });
    expect(s.days.find((d: any) => d.day === baghdadDay(-40))).toBeUndefined();
    expect(s.impressions).toBe(12 + 7 + 4);
    expect(s.clicks).toBe(4 + 3);
    expect(r.body.totals.impressions).toBe(r.body.slides.reduce((n: number, x: any) => n + x.impressions, 0));
    expect(r.body.totals.clicks).toBe(r.body.slides.reduce((n: number, x: any) => n + x.clicks, 0));
    // شريحة راعٍ آخر لا تدخل تقرير هذا الراعي
    expect(r.body.slides.map((x: any) => x.id)).not.toContain(otherSponsorSlide);

    // نسخة CSV بالأرقام نفسها
    const csv = await fetch(`${BASE}/sponsor/report.csv?sponsorId=${sponsorA}&from=${from}&to=${today}`, { headers: { authorization: `Bearer ${sponsorMgr.token}` } });
    expect(csv.headers.get('content-type')).toContain('text/csv');
    const text = await csv.text();
    expect(text.trim().split('\r\n').at(-1)).toBe(`المجموع,,${r.body.totals.impressions},${r.body.totals.clicks},${r.body.totals.ctr}`);
  });

  it('بوابة الراعي: كل راعٍ يرى تقريره فقط', async () => {
    // الدور يحتاج راعياً محدداً
    expect((await api('POST', `/admin/users/${viewerA.id}/roles`, { role: 'sponsor_viewer' }, admin.token)).body.code).toBe('SCOPE_REQUIRED');
    expect((await api('POST', `/admin/users/${viewerA.id}/roles`, { role: 'referee', sponsorId: sponsorA }, admin.token)).body.code).toBe('SCOPE_NOT_ALLOWED');
    expect((await api('POST', `/admin/users/${viewerA.id}/roles`, { role: 'sponsor_viewer', sponsorId: sponsorA }, admin.token)).status).toBe(201);
    expect((await api('POST', `/admin/users/${viewerB.id}/roles`, { role: 'sponsor_viewer', sponsorId: sponsorB }, admin.token)).status).toBe(201);
    // جلسة جديدة تحمل الدور
    const relogin = async (u: U) => (await api('GET', '/me', undefined, u.token)).body;
    expect((await relogin(viewerA)).permissions).toEqual(['sponsor.reports.view']);

    const own = await api('GET', '/sponsor/report', undefined, viewerA.token);
    expect(own.status, JSON.stringify(own.body)).toBe(200);
    expect(own.body.sponsor.id).toBe(sponsorA);
    expect(own.body.slides.find((x: any) => x.id === paidSlide).impressions).toBe(12 + 7 + 4);
    expect((await api('GET', `/sponsor/report?sponsorId=${sponsorB}`, undefined, viewerA.token)).status).toBe(403);
    expect((await api('GET', `/sponsor/report?sponsorId=${sponsorA}`, undefined, viewerB.token)).status).toBe(403);
    expect((await api('GET', '/sponsor/me', undefined, viewerB.token)).body.map((x: any) => x.id)).toEqual([sponsorB]);
    expect((await api('GET', '/sponsor/report', undefined, outsider.token)).status).toBe(400);
    expect((await api('GET', `/sponsor/report?sponsorId=${sponsorA}`, undefined, outsider.token)).status).toBe(403);
    // الراعي لا يصل للوحة الشرائح
    expect((await api('GET', '/admin/slides', undefined, viewerA.token)).status).toBe(403);
    // فترة غير صحيحة
    expect((await api('GET', `/sponsor/report?from=2026-12-10&to=2026-12-01`, undefined, viewerA.token)).body.code).toBe('INVALID_RANGE');
    expect((await api('GET', `/sponsor/report?from=2024-01-01&to=2026-12-01`, undefined, viewerA.token)).body.code).toBe('RANGE_TOO_LONG');
  });

  it('الأرشفة توقف العرض والأحداث، ويبقى التقرير', async () => {
    expect((await api('POST', `/admin/slides/${otherSponsorSlide}/archive`, undefined, sponsorMgr.token)).body.status).toBe('archived');
    expect(await heroIds()).not.toContain(otherSponsorSlide);
    expect((await api('POST', `/hero/${otherSponsorSlide}/events`, { type: 'impression', deviceId: dev(1) })).body.code).toBe('SLIDE_NOT_LIVE');
    expect((await api('PATCH', `/admin/slides/${otherSponsorSlide}`, { titleAr: 'تعديل' }, sponsorMgr.token)).body.code).toBe('SLIDE_ARCHIVED');
    expect((await api('GET', '/sponsor/report', undefined, viewerB.token)).body.slides[0].status).toBe('archived');
  });
});

describe('الجلسة 5 — شريحة «مباراة اليوم» والنتيجة النصية', () => {
  let slideId = 0;

  it('تُنشأ من المباراة وتعرض الفريقين والنتيجة النصية', async () => {
    expect((await api('POST', '/admin/slides', { type: 'match', titleAr: 'مباراة اليوم' }, editor.token)).body.code).toBe('MATCH_REQUIRED');
    const s = await api('POST', '/admin/slides', { type: 'match', titleAr: 'مباراة اليوم', matchId, priority: 90 }, editor.token);
    expect(s.status, JSON.stringify(s.body)).toBe(201);
    slideId = s.body.id;
    createdSlides.push(slideId);
    expect(s.body.tournamentId).toBe(tournamentId);
    await api('POST', `/admin/slides/${slideId}/submit`, undefined, editor.token);
    expect((await api('POST', `/admin/slides/${slideId}/approve`, undefined, editor.token)).body.status).toBe('published');

    expect((await api('PATCH', `/matches/${matchId}/live`, { text: 'الشوط الأول 1-0' }, outsider.token)).status).toBe(403);
    expect((await api('PATCH', `/matches/${matchId}/live`, { text: 'x'.repeat(81) }, ref.token)).status).toBe(400);
    const live = await api('PATCH', `/matches/${matchId}/live`, { text: 'الشوط الأول 1-0' }, ref.token);
    expect(live.status, JSON.stringify(live.body)).toBe(200);

    const hero = await api('GET', '/home/hero');
    const slide = hero.body.slides.find((x: any) => x.id === slideId);
    expect(slide.sponsored).toBe(false);
    expect(slide.match.homeTeam.nameAr).toBe('نسور الجلسة 5');
    expect(slide.match.liveText).toBe('الشوط الأول 1-0');
    expect(slide.match.liveTextAt).toBeTruthy();
    // الأعلى أولوية أولاً
    const ids = hero.body.slides.map((x: any) => x.id);
    expect(ids.indexOf(slideId)).toBeLessThan(ids.indexOf(paidSlide));
    // التحديث النصي لا يسحب اعتماد الشريحة
    expect((await api('PATCH', `/matches/${matchId}/live`, { text: 'الشوط الثاني 2-1' }, ref.token)).body.liveText).toBe('الشوط الثاني 2-1');
    expect(await heroIds()).toContain(slideId);
    expect((await api('GET', `/matches/${matchId}`)).body.liveText).toBe('الشوط الثاني 2-1');
  });

  it('بعد إدخال النتيجة تظهر النتيجة الرسمية بدل النصية، ولا تُكتب نصية بعدها', async () => {
    const sheet = await upload(PNG(), ref.token);
    const r = await api('POST', `/matches/${matchId}/result`, { homeScore: 2, awayScore: 1, sheetMediaId: sheet.body.id }, ref.token);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const slide = (await api('GET', '/home/hero')).body.slides.find((x: any) => x.id === slideId);
    expect(slide.match.resultStatus).toBe('provisional');
    expect(slide.match.homeScore).toBe(2);
    expect(slide.match.liveText).toBeNull();
    expect((await api('PATCH', `/matches/${matchId}/live`, { text: 'انتهت' }, ref.token)).body.code).toBe('RESULT_ENTERED');
  });
});

describe('الجلسة 5 — الأخبار والصفحات', () => {
  let newsId = 0, newsSlug = '', pageId = 0;

  it('المسودة لا تظهر، والنشر يظهرها، والرابط المختصر فريد', async () => {
    expect((await api('POST', '/admin/posts', { titleAr: 'خبر', bodyAr: 'نص' }, outsider.token)).status).toBe(403);
    const n = await api('POST', '/admin/posts', { titleAr: `افتتاح بطولة الجلسة 5 ${run}`, bodyAr: 'انطلقت البطولة اليوم.\nثماني فرق.' }, editor.token);
    expect(n.status, JSON.stringify(n.body)).toBe(201);
    newsId = n.body.id; newsSlug = n.body.slug;
    createdPosts.push(newsId);
    expect(newsSlug).toMatch(/^news-[a-z0-9]+$/);
    expect((await api('GET', `/news/${newsSlug}`)).status).toBe(404);
    expect((await api('GET', '/news?limit=50')).body.map((x: any) => x.id)).not.toContain(newsId);

    expect((await api('POST', `/admin/posts/${newsId}/submit`, undefined, editor.token)).body.status).toBe('review');
    expect((await api('POST', `/admin/posts/${newsId}/reject`, { note: 'أضف صورة' }, editor2.token)).body.reviewNote).toBe('أضف صورة');
    const pub = await api('POST', `/admin/posts/${newsId}/publish`, undefined, editor2.token);
    expect(pub.body.status).toBe('published');
    expect(pub.body.publishedAt).toBeTruthy();
    const item = await api('GET', `/news/${newsSlug}`);
    expect(item.body.bodyAr).toBe('انطلقت البطولة اليوم.\nثماني فرق.');
    expect((await api('GET', '/news?limit=50')).body.map((x: any) => x.id)).toContain(newsId);

    const page = await api('POST', '/admin/posts', { type: 'page', slug: `privacy-e2e-${run}`, titleAr: 'سياسة الخصوصية', bodyAr: 'نص الخصوصية' }, editor.token);
    pageId = page.body.id;
    createdPosts.push(pageId);
    expect((await api('POST', '/admin/posts', { type: 'page', slug: `privacy-e2e-${run}`, titleAr: 'نسخة', bodyAr: 'نص' }, editor.token)).body.code).toBe('SLUG_TAKEN');
    expect((await api('POST', '/admin/posts', { type: 'page', slug: 'Bad Slug', titleAr: 'نسخة', bodyAr: 'نص' }, editor.token)).body.code).toBe('INVALID_SLUG');
    await api('POST', `/admin/posts/${pageId}/publish`, undefined, editor.token);
    expect((await api('GET', `/pages/privacy-e2e-${run}`)).body.titleAr).toBe('سياسة الخصوصية');
    // الصفحة لا تُفتح كخبر
    expect((await api('GET', `/news/privacy-e2e-${run}`)).status).toBe(404);
  });

  it('تصحيح المنشور للناشر، والرابط لا يتغير بعد النشر، والأرشفة تخفيه', async () => {
    expect((await api('PATCH', `/admin/posts/${newsId}`, { slug: 'new-slug-x' }, editor.token)).body.code).toBe('SLUG_LOCKED');
    const fix = await api('PATCH', `/admin/posts/${newsId}`, { titleAr: `افتتاح بطولة الجلسة 5 (مصحح) ${run}` }, editor.token);
    expect(fix.body.status).toBe('published');
    const audit = await db.query(`SELECT payload FROM audit_log WHERE entity='post' AND entity_id=$1 AND action='post.update' ORDER BY seq DESC LIMIT 1`, [String(newsId)]);
    expect(audit.rows[0].payload.titleBefore).toContain('افتتاح');
    expect((await api('POST', `/admin/posts/${newsId}/archive`, undefined, editor.token)).body.status).toBe('archived');
    expect((await api('GET', `/news/${newsSlug}`)).status).toBe(404);
    expect((await api('PATCH', `/admin/posts/${newsId}`, { titleAr: 'تعديل' }, editor.token)).body.code).toBe('POST_ARCHIVED');
  });
});

describe('الجلسة 11 — طلب رعاية حدث', () => {
  let reqId = 0;
  let requester: U;
  let img = 0;

  it('صاحب الطلب يرى الأحداث المتاحة ويقدّم طلباً بصورة خاصة، ويُشعَر مدير الرعاة', async () => {
    requester = await login('صاحب مطعم الجلسة 11', 1988);
    const ev = await api('GET', '/sponsor-requests/events', undefined, requester.token);
    expect(ev.status, JSON.stringify(ev.body)).toBe(200);
    expect(ev.body.some((t: any) => t.id === tournamentId)).toBe(true);
    const up = await upload(PNG(), requester.token);
    expect(up.body.isPublic).toBe(false);
    img = up.body.id;
    const base = { orgName: `مطعم السلطان ${run}`, titleAr: 'السلطان يرعى المباراة', subtitleAr: 'خصم 20% لجمهور ساحة', imageMediaId: img, days: 14, matchId };
    expect((await api('POST', '/sponsor-requests', { ...base, days: 5 }, requester.token)).status).toBe(400);
    expect((await api('POST', '/sponsor-requests', { ...base, matchId: undefined }, requester.token)).body.code).toBe('EVENT_REQUIRED');
    const other = await upload(PNG(), outsider.token);
    expect((await api('POST', '/sponsor-requests', { ...base, imageMediaId: other.body.id }, requester.token)).body.code).toBe('MEDIA_INVALID');
    const r = await api('POST', '/sponsor-requests', base, requester.token);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.status).toBe('pending');
    expect(r.body.tournament.id).toBe(tournamentId);
    reqId = r.body.id;
    // الصورة خاصة: لا تُعرض للعامة، وتُعرض لصاحبها ولمدير الرعاة فقط
    expect((await fetch(`${BASE}/media/${img}`)).status).toBe(404);
    const own = await fetch(`${BASE}/sponsor-requests/${reqId}/image`, { headers: { authorization: `Bearer ${requester.token}` } });
    expect(own.status).toBe(200);
    expect((await fetch(`${BASE}/sponsor-requests/${reqId}/image`, { headers: { authorization: `Bearer ${outsider.token}` } })).status).toBe(404);
    expect((await fetch(`${BASE}/sponsor-requests/${reqId}/image`, { headers: { authorization: `Bearer ${sponsorMgr.token}` } })).status).toBe(200);
    const n = await db.query(`SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND data->>'sponsorRequestId' = $2`, [sponsorMgr.id, String(reqId)]);
    expect(n.rows[0].n).toBe(1);
    const mine = await api('GET', '/me/sponsor-requests', undefined, requester.token);
    expect(mine.body[0].id).toBe(reqId);
  });

  it('غير مدير الرعاة لا يرى الطلبات ولا يقبلها', async () => {
    expect((await api('GET', '/admin/sponsor-requests', undefined, editor.token)).status).toBe(403);
    expect((await api('POST', `/admin/sponsor-requests/${reqId}/accept`, {}, requester.token)).status).toBe(403);
    const list = await api('GET', '/admin/sponsor-requests?status=pending', undefined, sponsorMgr.token);
    const row = list.body.find((x: any) => x.id === reqId);
    expect(row.user.id).toBe(requester.id);
  });

  it('القبول من المدير العام: راعٍ جديد + شريحة منشورة كاتبها صاحب الطلب + بوابة الراعي + إشعار', async () => {
    const a = await api('POST', `/admin/sponsor-requests/${reqId}/accept`, { priority: 95 }, admin.token);
    expect(a.status, JSON.stringify(a.body)).toBe(200);
    expect(a.body.slide.status).toBe('published');
    createdSlides.push(a.body.slide.id);
    const days = (Date.parse(a.body.slide.endsAt) - Date.parse(a.body.slide.startsAt)) / 86400_000;
    expect(days).toBe(14);
    const hero = await api('GET', '/home/hero');
    const s = hero.body.slides.find((x: any) => x.id === a.body.slide.id);
    expect(s, JSON.stringify(hero.body.slides.map((x: any) => x.id))).toBeTruthy();
    expect(s.sponsored).toBe(true);
    expect(s.sponsor.nameAr).toBe(`مطعم السلطان ${run}`);
    expect(s.imageUrl).toBe(`/api/v1/media/${img}`);
    expect(s.linkUrl).toBe(`/matches/${matchId}`);
    expect((await fetch(`${BASE}${s.imageUrl.replace('/api/v1', '')}`)).status).toBe(200);
    const row = await db.query(`SELECT created_by_id, approved_by_id FROM hero_slides WHERE id = $1`, [a.body.slide.id]);
    expect(row.rows[0]).toEqual({ created_by_id: requester.id, approved_by_id: admin.id });
    // صاحب الطلب صار يرى تقرير راعيه فقط
    const rep = await api('GET', '/sponsor/report', undefined, requester.token);
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    expect(rep.body.sponsor.id).toBe(a.body.sponsorId);
    expect((await api('GET', `/sponsor/report?sponsorId=${sponsorA}`, undefined, requester.token)).status).toBe(403);
    const n = await db.query(`SELECT title_ar FROM notifications WHERE user_id = $1 AND data->>'sponsorRequestId' = $2`, [requester.id, String(reqId)]);
    expect(n.rows[0].title_ar).toContain('قُبل');
    expect((await api('POST', `/admin/sponsor-requests/${reqId}/accept`, {}, admin.token)).body.code).toBe('NOT_PENDING');
    expect((await api('POST', `/me/sponsor-requests/${reqId}/cancel`, undefined, requester.token)).body.code).toBe('NOT_PENDING');
  });

  it('مدير الرعاة يقبل لراعٍ موجود فتنتظر الشريحة الاعتماد، ويرفض بسبب، وصاحب الطلب يلغي', async () => {
    const mk = async () => {
      const up = await upload(PNG(), requester.token);
      return (await api('POST', '/sponsor-requests', { orgName: 'الرافدين', titleAr: 'الرافدين ترعى البطولة', imageMediaId: up.body.id, days: 7, tournamentId }, requester.token)).body.id as number;
    };
    const r1 = await mk();
    const a = await api('POST', `/admin/sponsor-requests/${r1}/accept`, { sponsorId: sponsorA }, sponsorMgr.token);
    expect(a.status, JSON.stringify(a.body)).toBe(200);
    expect(a.body.sponsorId).toBe(sponsorA);
    expect(a.body.slide.status).toBe('review');
    createdSlides.push(a.body.slide.id);
    expect(await heroIds()).not.toContain(a.body.slide.id);
    // الكاتب صاحب الطلب، فيعتمدها محرر المحتوى
    expect((await api('POST', `/admin/slides/${a.body.slide.id}/approve`, undefined, editor.token)).body.status).toBe('published');

    const r2 = await mk();
    expect((await api('POST', `/admin/sponsor-requests/${r2}/reject`, { note: 'ن' }, sponsorMgr.token)).status).toBe(400);
    const rj = await api('POST', `/admin/sponsor-requests/${r2}/reject`, { note: 'الصورة غير واضحة' }, sponsorMgr.token);
    expect(rj.body.status).toBe('rejected');
    expect(rj.body.reviewNote).toBe('الصورة غير واضحة');

    const r3 = await mk();
    expect((await api('POST', `/me/sponsor-requests/${r3}/cancel`, undefined, outsider.token)).status).toBe(404);
    expect((await api('POST', `/me/sponsor-requests/${r3}/cancel`, undefined, requester.token)).body.status).toBe('cancelled');
    const audit = await db.query(`SELECT DISTINCT action FROM audit_log WHERE entity = 'sponsor_request'`);
    for (const x of ['sponsor_request.create', 'sponsor_request.accept', 'sponsor_request.reject', 'sponsor_request.cancel']) expect(audit.rows.map((y) => y.action)).toContain(x);
  });

  it('القاعدة ترفض مدة غير مسموحة وطلباً مقبولاً بلا راعٍ', async () => {
    await expect(db.query(`UPDATE sponsor_requests SET days = 5 WHERE id = $1`, [reqId])).rejects.toThrow(/sponsor_requests_days_chk/);
    await expect(db.query(`UPDATE sponsor_requests SET sponsor_id = NULL WHERE id = $1`, [reqId])).rejects.toThrow(/sponsor_requests_accepted_chk/);
  });
});

describe('الجلسة 5 — «كن راعياً» وسجل التدقيق', () => {
  it('النموذج يُحفظ ويصل لمدير الرعاة، بحد للطلبات', async () => {
    const ip = fakeIp();
    expect((await api('POST', '/sponsor-leads', { fullName: 'أحمد', phone: '123' }, undefined, ip)).body.code).toBe('INVALID_PHONE');
    const l = await api('POST', '/sponsor-leads', { fullName: 'أحمد علي', orgName: 'شركة الاختبار', phone: '0780 123 4567', message: 'نريد رعاية بطولة' }, undefined, ip);
    expect(l.status, JSON.stringify(l.body)).toBe(201);
    leadId = l.body.id;
    const list = await api('GET', '/admin/sponsor-leads?status=new', undefined, sponsorMgr.token);
    const row = list.body.find((x: any) => x.id === leadId);
    expect(row.phone).toBe('+9647801234567');
    expect((await api('GET', '/admin/sponsor-leads', undefined, editor.token)).status).toBe(403);
    expect((await api('PATCH', `/admin/sponsor-leads/${leadId}`, { status: 'contacted' }, sponsorMgr.token)).body.status).toBe('contacted');
    for (let i = 0; i < 4; i++) await api('POST', '/sponsor-leads', { fullName: 'تكرار', phone: `07801234${500 + i}` }, undefined, ip);
    expect((await api('POST', '/sponsor-leads', { fullName: 'تكرار', phone: '07801234599' }, undefined, ip)).status).toBe(429);
    await db.query(`DELETE FROM sponsor_leads WHERE full_name = 'تكرار' AND ip = $1`, [ip]);
  });

  it('كل عمليات الجلسة في سجل التدقيق، والسلسلة سليمة', async () => {
    const r = await db.query(`SELECT DISTINCT action FROM audit_log WHERE action LIKE 'slide.%' OR action LIKE 'post.%' OR action LIKE 'sponsor%' OR action = 'match.live_text'`);
    const actions = r.rows.map((x) => x.action);
    for (const a of ['slide.create', 'slide.submit', 'slide.approve', 'slide.reject', 'slide.update', 'slide.archive', 'post.create', 'post.publish', 'post.archive', 'sponsor.create', 'sponsor_lead.create', 'sponsor_lead.status', 'match.live_text']) {
      expect(actions, a).toContain(a);
    }
    const v = await api('GET', '/admin/audit/verify', undefined, admin.token);
    expect(v.body.ok, JSON.stringify(v.body)).toBe(true);
  });
});
