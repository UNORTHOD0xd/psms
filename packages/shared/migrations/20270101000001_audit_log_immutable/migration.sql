CREATE OR REPLACE FUNCTION psms_audit_log_block_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only (CTL-08); % is forbidden', TG_OP;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'audit_log'
  ) THEN
    DROP TRIGGER IF EXISTS trg_audit_log_no_update ON audit_log;
    CREATE TRIGGER trg_audit_log_no_update
      BEFORE UPDATE ON audit_log
      FOR EACH ROW EXECUTE FUNCTION psms_audit_log_block_mutation();

    DROP TRIGGER IF EXISTS trg_audit_log_no_delete ON audit_log;
    CREATE TRIGGER trg_audit_log_no_delete
      BEFORE DELETE ON audit_log
      FOR EACH ROW EXECUTE FUNCTION psms_audit_log_block_mutation();
  END IF;
END;
$$;