-- سجل التدقيق بتسلسل التجزئة (hash chain).
-- كل صف يحمل بصمة SHA-256 لمحتواه مع بصمة الصف السابق، فأي تعديل أو حذف لاحق يكسر السلسلة.
-- الحماية: منع UPDATE وDELETE لكل صف، ومنع TRUNCATE للجدول كله، ودالة audit_verify() تكشف أي كسر.

-- البصمة القياسية لصف واحد (تُستخدم عند الإدراج وعند التحقق)
CREATE OR REPLACE FUNCTION audit_row_hash(
  p_prev TEXT, p_seq BIGINT, p_at TIMESTAMPTZ, p_actor INTEGER,
  p_action TEXT, p_entity TEXT, p_entity_id TEXT, p_payload JSONB, p_ip TEXT
) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(concat_ws('|',
    coalesce(p_prev, 'GENESIS'),
    p_seq::text,
    to_char(p_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    coalesce(p_actor::text, '-'),
    p_action,
    p_entity,
    coalesce(p_entity_id, '-'),
    coalesce(p_payload, '{}'::jsonb)::text,
    coalesce(p_ip, '-')
  ), 'UTF8')), 'hex')
$$;

-- عند الإدراج: قفل للتسلسل، ثم رقم تسلسلي ووقت وبصمة يحددها الخادم وحده (يتجاهل ما يرسله الكود)
CREATE OR REPLACE FUNCTION audit_log_before_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  last_seq  BIGINT;
  last_hash TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('saha_audit_log'));
  SELECT seq, hash INTO last_seq, last_hash FROM audit_log ORDER BY seq DESC LIMIT 1;
  NEW.seq         := coalesce(last_seq, 0) + 1;
  NEW.occurred_at := date_trunc('milliseconds', clock_timestamp());
  NEW.payload     := coalesce(NEW.payload, '{}'::jsonb);
  NEW.prev_hash   := last_hash;
  NEW.hash        := audit_row_hash(NEW.prev_hash, NEW.seq, NEW.occurred_at, NEW.actor_user_id,
                                    NEW.action, NEW.entity, NEW.entity_id, NEW.payload, NEW.ip);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION audit_log_block_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'سجل التدقيق لا يقبل التعديل أو الحذف (%)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $$;

CREATE TRIGGER audit_log_hash_chain
  BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_before_insert();

CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_block_mutation();

CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_block_mutation();

-- حماية أقوى: TRUNCATE لا يمر عبر Triggers الصفوف، فله Trigger خاص على مستوى الجملة
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log FOR EACH STATEMENT EXECUTE FUNCTION audit_log_block_mutation();

REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM PUBLIC;

-- التحقق من السلسلة كاملة: يعيد ok=false وأول رقم تسلسلي مكسور وسبب الكسر
CREATE OR REPLACE FUNCTION audit_verify()
RETURNS TABLE (ok BOOLEAN, checked BIGINT, broken_seq BIGINT, reason TEXT)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  r        RECORD;
  expected_prev TEXT := NULL;
  expected_seq  BIGINT := 1;
  n        BIGINT := 0;
BEGIN
  FOR r IN SELECT * FROM audit_log ORDER BY seq LOOP
    n := n + 1;
    IF r.seq <> expected_seq THEN
      RETURN QUERY SELECT false, n, r.seq, 'فجوة في التسلسل (صف محذوف)'::text; RETURN;
    END IF;
    IF r.prev_hash IS DISTINCT FROM expected_prev THEN
      RETURN QUERY SELECT false, n, r.seq, 'بصمة الصف السابق لا تطابق'::text; RETURN;
    END IF;
    IF r.hash <> audit_row_hash(r.prev_hash, r.seq, r.occurred_at, r.actor_user_id,
                                r.action, r.entity, r.entity_id, r.payload, r.ip) THEN
      RETURN QUERY SELECT false, n, r.seq, 'محتوى الصف عُدِّل بعد كتابته'::text; RETURN;
    END IF;
    expected_prev := r.hash;
    expected_seq  := r.seq + 1;
  END LOOP;
  RETURN QUERY SELECT true, n, NULL::bigint, NULL::text;
END $$;
