/**
 * شرط «الجلسة 1»: اختبار يثبت أن تعديل سجل التدقيق يُكتشف.
 * يعمل على قاعدة PostgreSQL حقيقية (DATABASE_URL) بعد تطبيق الـ migrations.
 * كل اختبار داخل معاملة تُلغى في آخره، فلا يترك أثراً في القاعدة.
 */
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { Client } from 'pg';

const client = new Client({ connectionString: process.env.DATABASE_URL });

beforeAll(async () => { await client.connect(); });
afterAll(async () => { await client.end(); });
beforeEach(async () => { await client.query('BEGIN'); });
afterEach(async () => { await client.query('ROLLBACK'); });

async function addEntries(n: number) {
  for (let i = 1; i <= n; i++) {
    await client.query(
      `INSERT INTO audit_log (action, entity, entity_id, payload) VALUES ($1, $2, $3, $4)`,
      ['test.create', 'match', String(i), JSON.stringify({ home: i, away: 0 })],
    );
  }
}

async function verify() {
  const { rows } = await client.query('SELECT * FROM audit_verify()');
  return rows[0] as { ok: boolean; checked: string; broken_seq: string | null; reason: string | null };
}

async function seqOf(entityId: string): Promise<string> {
  const { rows } = await client.query(
    `SELECT seq FROM audit_log WHERE action = 'test.create' AND entity_id = $1 ORDER BY seq DESC LIMIT 1`,
    [entityId],
  );
  return String(rows[0].seq);
}

async function expectRejected(sql: string) {
  await client.query('SAVEPOINT s');
  await expect(client.query(sql)).rejects.toThrow(/سجل التدقيق لا يقبل/);
  await client.query('ROLLBACK TO SAVEPOINT s');
}

describe('سجل التدقيق (تسلسل التجزئة)', () => {
  it('السلسلة السليمة تمر بالتحقق، والخادم يحدد البصمة والتسلسل لا الكود', async () => {
    await client.query(
      `INSERT INTO audit_log (action, entity, seq, hash, prev_hash) VALUES ('test.forge', 'x', 999, 'مزوّر', 'مزوّر')`,
    );
    await addEntries(3);
    const { rows } = await client.query(`SELECT seq, hash FROM audit_log WHERE action = 'test.forge'`);
    expect(rows[0].hash).toMatch(/^[0-9a-f]{64}$/);
    expect(String(rows[0].seq)).not.toBe('999');
    expect((await verify()).ok).toBe(true);
  });

  it('يرفض UPDATE وDELETE وTRUNCATE', async () => {
    await addEntries(2);
    await expectRejected(`UPDATE audit_log SET action = 'x'`);
    await expectRejected(`DELETE FROM audit_log`);
    await expectRejected(`TRUNCATE audit_log`);
    expect((await verify()).ok).toBe(true);
  });

  it('يكتشف تعديل محتوى صف حتى لو عُطّل الـ Trigger', async () => {
    await addEntries(3);
    const target = await seqOf('2');
    await client.query('ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_update');
    await client.query(`UPDATE audit_log SET payload = '{"home":9,"away":0}' WHERE seq = $1`, [target]);
    const result = await verify();
    expect(result.ok).toBe(false);
    expect(result.broken_seq).toBe(target);
    expect(result.reason).toContain('عُدِّل');
  });

  it('يكتشف حذف صف من وسط السلسلة', async () => {
    await addEntries(3);
    const target = await seqOf('2');
    await client.query('ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_delete');
    await client.query('DELETE FROM audit_log WHERE seq = $1', [target]);
    const result = await verify();
    expect(result.ok).toBe(false);
    expect(Number(result.broken_seq)).toBe(Number(target) + 1);
  });

  it('يكتشف إعادة حساب بصمة صف مزوّر لأن الصف التالي يشير للبصمة القديمة', async () => {
    await addEntries(3);
    const target = await seqOf('2');
    await client.query('ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_update');
    await client.query(
      `UPDATE audit_log SET payload = '{"home":9}',
         hash = audit_row_hash(prev_hash, seq, occurred_at, actor_user_id, action, entity, entity_id, '{"home":9}'::jsonb, ip)
       WHERE seq = $1`,
      [target],
    );
    const result = await verify();
    expect(result.ok).toBe(false);
    expect(Number(result.broken_seq)).toBe(Number(target) + 1);
  });
});

describe('نوع البطولة', () => {
  async function expectCheckFails(sql: string, params: unknown[]) {
    await client.query('SAVEPOINT k');
    await expect(client.query(sql, params)).rejects.toThrow();
    await client.query('ROLLBACK TO SAVEPOINT k');
  }
  const insert = `INSERT INTO tournaments (name_ar, slug, kind, community_id, community_kind, format, updated_at)
                  VALUES ($1, $2, $3, $4, $5, 'league', now())`;

  it('يفرض تطابق نوع البطولة مع نوع المجتمع المضيف', async () => {
    const { rows } = await client.query(
      `INSERT INTO communities (kind, name_ar) VALUES ('influencer', 'مؤثر تجريبي'), ('facebook_group', 'مجموعة تجريبية') RETURNING id`,
    );
    const [influencer, group] = rows.map((r) => r.id);
    await client.query(insert, ['شعبية', 't-pop', 'popular_teams', null, null]);
    await client.query(insert, ['مؤثر', 't-inf', 'influencer_followers', influencer, 'influencer']);
    await client.query(insert, ['مجموعة بلا ربط', 't-grp', 'facebook_group', null, null]);
    await expectCheckFails(insert, ['خطأ', 't-x1', 'popular_teams', influencer, 'influencer']);
    await expectCheckFails(insert, ['خطأ', 't-x2', 'facebook_group', influencer, 'influencer']);
    await expectCheckFails(insert, ['خطأ', 't-x3', 'facebook_group', influencer, 'facebook_group']);
    await expectCheckFails(insert, ['خطأ', 't-x4', 'influencer_followers', group, null]);
  });
});
