// «ساحة» — إضافة مختبِر داخلي لـ TestFlight عبر App Store Connect API وإرسال الدعوة (دون دخول المالك إلى الموقع).
// المدخلات: EXPO_ASC_API_KEY_PATH، EXPO_ASC_KEY_ID، EXPO_ASC_ISSUER_ID، ASC_APP_ID، TESTER_EMAILS (مفصولة بفواصل)
import crypto from 'node:crypto';
import fs from 'node:fs';
const e = (k) => { const v = process.env[k]; if (!v) throw new Error(`${k} ناقص`); return v; };
const keyPem = fs.readFileSync(e('EXPO_ASC_API_KEY_PATH'), 'utf8');
const b64 = (b) => Buffer.from(b).toString('base64url');
function token() {
  const now = Math.floor(Date.now() / 1000);
  const h = b64(JSON.stringify({ alg: 'ES256', kid: e('EXPO_ASC_KEY_ID'), typ: 'JWT' }));
  const p = b64(JSON.stringify({ iss: e('EXPO_ASC_ISSUER_ID'), iat: now, exp: now + 900, aud: 'appstoreconnect-v1' }));
  return `${h}.${p}.${b64(crypto.sign('sha256', Buffer.from(`${h}.${p}`), { key: keyPem, dsaEncoding: 'ieee-p1363' }))}`;
}
async function api(method, p, body) {
  const r = await fetch(`https://api.appstoreconnect.apple.com${p}`, { method, headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} ← ${r.status}: ${t.slice(0, 600)}`);
  return t ? JSON.parse(t) : {};
}
const app = e('ASC_APP_ID');
const emails = e('TESTER_EMAILS').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

const users = await api('GET', '/v1/users?limit=200');
console.log('مستخدمو الفريق:', users.data.map((u) => `${u.attributes.username} [${u.attributes.roles.join(',')}]`).join(' | '));

const groups = await api('GET', `/v1/apps/${app}/betaGroups?limit=50`);
console.log('المجموعات:', groups.data.map((g) => `${g.attributes.name}${g.attributes.isInternalGroup ? ' (داخلية)' : ''} allBuilds=${g.attributes.hasAccessToAllBuilds}`).join(' | '));
let group = groups.data.find((g) => g.attributes.isInternalGroup);
if (!group) {
  group = (await api('POST', '/v1/betaGroups', { data: { type: 'betaGroups', attributes: { name: 'Team', isInternalGroup: true, hasAccessToAllBuilds: true }, relationships: { app: { data: { type: 'apps', id: app } } } } })).data;
  console.log('✔ أُنشئت مجموعة داخلية Team');
}
const builds = await api('GET', `/v1/builds?filter[app]=${app}&sort=-uploadedDate&limit=5`);
console.log('النسخ:', builds.data.map((b) => `${b.attributes.version} ${b.attributes.processingState} expired=${b.attributes.expired}`).join(' | '));
if (!group.attributes.hasAccessToAllBuilds && builds.data[0]) {
  await api('POST', `/v1/betaGroups/${group.id}/relationships/builds`, { data: [{ type: 'builds', id: builds.data[0].id }] }).catch((x) => console.log('… ربط النسخة:', x.message));
}

const inGroup = await api('GET', `/v1/betaGroups/${group.id}/betaTesters?limit=200`);
for (const email of emails) {
  let t = inGroup.data.find((x) => (x.attributes.email || '').toLowerCase() === email);
  if (!t) {
    try {
      t = (await api('POST', '/v1/betaTesters', { data: { type: 'betaTesters', attributes: { email }, relationships: { betaGroups: { data: [{ type: 'betaGroups', id: group.id }] } } } })).data;
      console.log(`✔ أُضيف ${email} إلى «${group.attributes.name}»`);
    } catch (x) { console.log(`… تعذّرت إضافة ${email}: ${x.message}`); continue; }
  } else console.log(`✔ ${email} موجود في «${group.attributes.name}» (الحالة: ${t.attributes.state ?? '-'})`);
  try {
    await api('POST', '/v1/betaTesterInvitations', { data: { type: 'betaTesterInvitations', relationships: { app: { data: { type: 'apps', id: app } }, betaTester: { data: { type: 'betaTesters', id: t.id } } } } });
    console.log(`✔ أُرسلت دعوة TestFlight إلى ${email}`);
  } catch (x) { console.log(`… الدعوة: ${x.message}`); }
}
