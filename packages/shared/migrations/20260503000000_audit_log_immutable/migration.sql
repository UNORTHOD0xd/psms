-- CTL-08: audit_log is append-only.
--
-- We block UPDATE and DELETE at the database level so a stray ORM call,
-- a misconfigured admin tool, or a future migration cannot rewrite
-- history. INSERT remains permitted for the application's writeAudit
-- middleware.

CREATE OR REPLACE FUNCTION psms_audit_log_block_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only (CTL-08); % is forbidden', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_log_no_update ON audit_log;
CREATE TRIGGER trg_audit_log_no_update
  BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION psms_audit_log_block_mutation();

DROP TRIGGER IF EXISTS trg_audit_log_no_delete ON audit_log;
CREATE TRIGGER trg_audit_log_no_delete
  BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION psms_audit_log_block_mutation();
