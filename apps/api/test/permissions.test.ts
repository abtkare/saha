/**
 * شرط «الجلسة 2»: كل دور لا يصل إلا لما في المصفوفة.
 * الجدول المتوقع مكتوب هنا مستقلاً عن الكود (من docs/PLAN.md) ويُقارن بكل دور × كل صلاحية.
 */
import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLES, hasPermission, normalizeIraqiPhone, permissionsOf, type Permission, type Role } from '@saha/shared';
import { base32Encode, totpCode, verifyTotp, signJwt, verifyJwt, hashPassword, verifyPassword, encryptSecret, decryptSecret } from '../src/auth/crypto';

const EXPECTED: Record<Role, Permission[]> = {
  super_admin: [...PERMISSIONS],
  content_editor: ['content.draft', 'content.publish'],
  sponsor_manager: ['slides.sponsor', 'sponsors.manage', 'sponsor.reports.view'],
  tournament_manager: ['tournaments.manage', 'results.enter'],
  referee: ['results.enter'],
  team_manager: ['team.page.edit', 'team.players.manage', 'results.confirm', 'disputes.raise'],
  discipline_committee: ['disputes.decide'],
  sponsor_viewer: ['sponsor.reports.view'],
};

describe('مصفوفة الصلاحيات', () => {
  for (const role of ROLES) {
    it(`${role}: يصل لما في المصفوفة فقط`, () => {
      for (const p of PERMISSIONS) {
        expect(hasPermission([{ role }], p, {}, true), `${role} → ${p}`).toBe(EXPECTED[role].includes(p));
      }
    });
  }

  it('أدوار الإدارة لا تعمل بدخول الهاتف (بلا TOTP)', () => {
    for (const role of ['super_admin', 'content_editor', 'sponsor_manager'] as Role[]) {
      expect(permissionsOf([{ role }], false)).toEqual([]);
    }
    expect(permissionsOf([{ role: 'referee' }], false)).toEqual(['results.enter']);
  });

  it('الدور المقيّد بفريق لا يتجاوز فريقه', () => {
    const g = [{ role: 'team_manager' as Role, teamId: 7 }];
    expect(hasPermission(g, 'team.players.manage', { teamId: 7 })).toBe(true);
    expect(hasPermission(g, 'team.players.manage', { teamId: 8 })).toBe(false);
    expect(hasPermission(g, 'team.players.manage', {})).toBe(false);
  });

  it('الدور المقيّد ببطولة لا يتجاوز بطولته، وغير المقيّد يعمل في كلها', () => {
    expect(hasPermission([{ role: 'tournament_manager', tournamentId: 3 }], 'tournaments.manage', { tournamentId: 4 })).toBe(false);
    expect(hasPermission([{ role: 'tournament_manager', tournamentId: 3 }], 'tournaments.manage', { tournamentId: 3 })).toBe(true);
    expect(hasPermission([{ role: 'tournament_manager' }], 'tournaments.manage', { tournamentId: 4 })).toBe(true);
  });

  it('بلا أدوار لا صلاحيات', () => {
    expect(PERMISSIONS.some((p) => hasPermission([], p, {}, true))).toBe(false);
  });
});

describe('أدوات الدخول', () => {
  it('TOTP يطابق متجه الاختبار في RFC 6238', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    expect(secret).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(totpCode(secret, 59_000)).toBe('287082');
    expect(totpCode(secret, 1_111_111_109_000)).toBe('081804');
    expect(verifyTotp(secret, '287082', 59_000 + 30_000)).not.toBeNull(); // يقبل الخطوة السابقة
    expect(verifyTotp(secret, '287082', 59_000 + 90_000)).toBeNull();
  });

  it('JWT: التوقيع والانتهاء والتلاعب', () => {
    const t = signJwt({ sub: 5, typ: 'access', sid: 1 }, 's'.repeat(40), 60);
    expect(verifyJwt(t, 's'.repeat(40))?.sub).toBe(5);
    expect(verifyJwt(t, 'x'.repeat(40))).toBeNull();
    const [h, , sig] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 1, typ: 'access', sid: 1, iat: 0, exp: 9e9 })).toString('base64url');
    expect(verifyJwt(`${h}.${forged}.${sig}`, 's'.repeat(40))).toBeNull();
    expect(verifyJwt(signJwt({ sub: 5, typ: 'access' }, 's'.repeat(40), -10), 's'.repeat(40))).toBeNull();
  });

  it('كلمة السر بصيغة scrypt وتشفير سر TOTP', () => {
    const h = hashPassword('كلمة-سر-طويلة-1');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(verifyPassword('كلمة-سر-طويلة-1', h)).toBe(true);
    expect(verifyPassword('خطأ', h)).toBe(false);
    const enc = encryptSecret('ABC', 'm'.repeat(40));
    expect(enc).not.toContain('ABC');
    expect(decryptSecret(enc, 'm'.repeat(40))).toBe('ABC');
  });

  it('توحيد رقم الهاتف العراقي', () => {
    expect(normalizeIraqiPhone('07701234567')).toBe('+9647701234567');
    expect(normalizeIraqiPhone('+964 770 123 4567')).toBe('+9647701234567');
    expect(normalizeIraqiPhone('٠٧٧٠١٢٣٤٥٦٧')).toBe('+9647701234567');
    expect(normalizeIraqiPhone('0612345678')).toBeNull();
  });
});
