/**
 * أدوات التشفير للدخول — كلها من node:crypto بلا حزم خارجية.
 * JWT (HS256)، TOTP (RFC 6238)، هاش كلمة السر (scrypt)، هاش الرموز (SHA-256)، تشفير سر TOTP (AES-256-GCM).
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// ───── كلمة السر: scrypt$<salt hex>$<hash hex> (نفس صيغة prisma/seed.ts) ─────
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [algo, saltHex, hashHex] = stored.split('$');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
  const hash = scryptSync(password, Buffer.from(saltHex, 'hex'), 64).toString('hex');
  return safeEqual(hash, hashHex);
}

// ───── JWT HS256 ─────
export interface JwtPayload { sub: number; typ: 'access' | 'setup'; mfa?: boolean; sid?: number; iat: number; exp: number }
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

export function signJwt(payload: Omit<JwtPayload, 'iat' | 'exp'>, secret: string, ttlSec: number): string {
  const iat = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ ...payload, iat, exp: iat + ttlSec })}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}
export function verifyJwt(token: string, secret: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest('base64url');
  if (!safeEqual(expected, parts[2])) return null;
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    if (header.alg !== 'HS256') return null;
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as JwtPayload;
    if (typeof p.sub !== 'number' || typeof p.exp !== 'number' || p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch {
    return null;
  }
}

// ───── Base32 و TOTP ─────
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$|\s/g, '');
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('base32');
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const newTotpSecret = () => base32Encode(randomBytes(20));

export function totpCode(secretB32: string, time = Date.now(), step = 30): string {
  const counter = Math.floor(time / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secretB32)).update(buf).digest();
  const off = h[h.length - 1] & 15;
  const bin = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}

/** يقبل الرمز الحالي والسابق والتالي (فرق ساعة الجوال حتى 30 ثانية). يُرجع رقم الخطوة المطابقة لمنع إعادة الاستخدام. */
export function verifyTotp(secretB32: string, code: string, time = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  for (const drift of [0, -1, 1]) {
    const t = time + drift * 30_000;
    if (safeEqual(totpCode(secretB32, t), code)) return Math.floor(t / 1000 / 30);
  }
  return null;
}

export function otpauthUri(secretB32: string, account: string, issuer = 'Saha'): string {
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// ───── تشفير سر TOTP في القاعدة ─────
function encKey(master: string): Buffer {
  return Buffer.from(hkdfSync('sha256', master, 'saha-totp', 'totp-secret-v1', 32));
}
export function encryptSecret(plain: string, master: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', encKey(master), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `v1.${iv.toString('base64url')}.${c.getAuthTag().toString('base64url')}.${data.toString('base64url')}`;
}
export function decryptSecret(stored: string, master: string): string {
  const [v, iv, tag, data] = stored.split('.');
  if (v !== 'v1') throw new Error('totp secret format');
  const d = createDecipheriv('aes-256-gcm', encKey(master), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
}
