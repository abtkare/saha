// «ساحة» — تجهيز توقيع iOS (شهادة توزيع + ملف تعريف App Store) عبر App Store Connect API،
// لأن EAS يرفض إنشاء الشهادات دون تفاعل. يعمل في CI فقط ولا يحفظ شيئاً في المستودع.
//
// في كل تشغيل: يحذف الشهادة وملف التعريف اللذين أنشأهما التشغيل السابق (اسم الملف «saha-eas <الرقم التسلسلي>»)
// ثم ينشئ زوجاً جديداً. إلغاء شهادة التوزيع لا يؤثر على النسخ المرفوعة سابقاً إلى TestFlight أو المتجر.
// لا يلمس أي شهادة أو ملف تعريف آخر في الحساب.
//
// المدخلات (متغيرات بيئة): EXPO_ASC_API_KEY_PATH، EXPO_ASC_KEY_ID، EXPO_ASC_ISSUER_ID، BUNDLE_ID، OUT_DIR
// المخرجات: OUT_DIR/dist.p12 و OUT_DIR/profile.mobileprovision و credentials.json في المجلد الحالي.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const env = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`المتغير ${k} ناقص`);
  return v;
};
const keyPem = fs.readFileSync(env('EXPO_ASC_API_KEY_PATH'), 'utf8');
const keyId = env('EXPO_ASC_KEY_ID');
const issuer = env('EXPO_ASC_ISSUER_ID');
const bundle = env('BUNDLE_ID');
const out = path.resolve(env('OUT_DIR'));
const PREFIX = 'saha-eas ';

const b64url = (b) => Buffer.from(b).toString('base64url');
function token() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const body = b64url(JSON.stringify({ iss: issuer, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' }));
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key: keyPem, dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${b64url(sig)}`;
}

async function api(method, p, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${p}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${p} ← ${res.status}: ${text.slice(0, 800)}`);
  return text ? JSON.parse(text) : {};
}

fs.mkdirSync(out, { recursive: true });

// 1) المعرّف app.saha.iq
const ids = await api('GET', `/v1/bundleIds?filter[identifier]=${encodeURIComponent(bundle)}&limit=200`);
const bundleId = ids.data.find((d) => d.attributes.identifier === bundle);
if (!bundleId) throw new Error(`المعرّف ${bundle} غير موجود في الحساب`);
console.log(`✔ المعرّف ${bundle} (${bundleId.id})`);

// 2) قدرة الإشعارات (expo-notifications يضيف aps-environment، فيجب أن يشملها ملف التعريف)
const caps = await api('GET', `/v1/bundleIds/${bundleId.id}/bundleIdCapabilities`);
if (!caps.data.some((c) => c.attributes.capabilityType === 'PUSH_NOTIFICATIONS')) {
  await api('POST', '/v1/bundleIdCapabilities', {
    data: {
      type: 'bundleIdCapabilities',
      attributes: { capabilityType: 'PUSH_NOTIFICATIONS' },
      relationships: { bundleId: { data: { type: 'bundleIds', id: bundleId.id } } },
    },
  });
  console.log('✔ فُعّلت Push Notifications على المعرّف');
} else console.log('✔ Push Notifications مفعّلة');

// 3) حذف ما أنشأه التشغيل السابق فقط
const profiles = await api('GET', '/v1/profiles?limit=200');
for (const p of profiles.data.filter((p) => p.attributes.name.startsWith(PREFIX))) {
  const serial = p.attributes.name.slice(PREFIX.length).trim();
  const certs = await api('GET', `/v1/certificates?filter[serialNumber]=${encodeURIComponent(serial)}`);
  for (const c of certs.data) {
    await api('DELETE', `/v1/certificates/${c.id}`);
    console.log(`✔ أُلغيت الشهادة السابقة ${serial}`);
  }
  try {
    await api('DELETE', `/v1/profiles/${p.id}`);
  } catch (e) {
    // قد يكون حُذف تلقائياً مع إلغاء شهادته
    if (!String(e.message).includes('404')) throw e;
  }
  console.log(`✔ حُذف ملف التعريف السابق «${p.attributes.name}»`);
}

// 4) مفتاح + طلب شهادة (CSR) + شهادة توزيع جديدة
const keyFile = path.join(out, 'dist.key');
const csrFile = path.join(out, 'dist.csr');
execFileSync('openssl', ['genrsa', '-out', keyFile, '2048'], { stdio: 'ignore' });
execFileSync('openssl', ['req', '-new', '-key', keyFile, '-out', csrFile, '-subj', '/CN=Saha EAS/O=Asr Al-Riyada/C=IQ']);
const csrContent = fs.readFileSync(csrFile, 'utf8');

let cert;
for (const certificateType of ['DISTRIBUTION', 'IOS_DISTRIBUTION']) {
  try {
    cert = await api('POST', '/v1/certificates', { data: { type: 'certificates', attributes: { certificateType, csrContent } } });
    console.log(`✔ شهادة ${certificateType} جديدة: ${cert.data.attributes.serialNumber}`);
    break;
  } catch (e) {
    console.log(`… تعذّر ${certificateType}: ${e.message}`);
  }
}
if (!cert) throw new Error('تعذّر إنشاء شهادة توزيع (ربما بلغ الحساب الحد الأقصى للشهادات — ألغِ شهادة قديمة غير مستخدمة من developer.apple.com ← Certificates)');

const derFile = path.join(out, 'dist.cer');
const pemFile = path.join(out, 'dist.pem');
fs.writeFileSync(derFile, Buffer.from(cert.data.attributes.certificateContent, 'base64'));
execFileSync('openssl', ['x509', '-inform', 'DER', '-in', derFile, '-out', pemFile]);
const password = crypto.randomBytes(18).toString('base64url');
console.log(`::add-mask::${password}`);
execFileSync('openssl', [
  'pkcs12', '-export', '-inkey', keyFile, '-in', pemFile, '-out', path.join(out, 'dist.p12'),
  '-passout', `pass:${password}`, '-name', 'Saha EAS',
  '-certpbe', 'PBE-SHA1-3DES', '-keypbe', 'PBE-SHA1-3DES', '-macalg', 'sha1',
]);

// 5) ملف تعريف App Store
const serial = cert.data.attributes.serialNumber;
const prof = await api('POST', '/v1/profiles', {
  data: {
    type: 'profiles',
    attributes: { name: `${PREFIX}${serial}`, profileType: 'IOS_APP_STORE' },
    relationships: {
      bundleId: { data: { type: 'bundleIds', id: bundleId.id } },
      certificates: { data: [{ type: 'certificates', id: cert.data.id }] },
    },
  },
});
fs.writeFileSync(path.join(out, 'profile.mobileprovision'), Buffer.from(prof.data.attributes.profileContent, 'base64'));
console.log(`✔ ملف تعريف App Store «${PREFIX}${serial}»`);

// 6) credentials.json لـ EAS (credentialsSource: local)
fs.writeFileSync(
  'credentials.json',
  JSON.stringify(
    {
      ios: {
        provisioningProfilePath: path.join(out, 'profile.mobileprovision'),
        distributionCertificate: { path: path.join(out, 'dist.p12'), password },
      },
    },
    null,
    2,
  ),
);
for (const f of [keyFile, csrFile, derFile, pemFile]) fs.rmSync(f, { force: true });
console.log('✔ credentials.json جاهز');
