CREATE OR REPLACE FUNCTION psms_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'programme',
    'competency',
    'user',
    'student_profile',
    'supervisor_profile',
    'staff_profile',
    'organisation',
    'opportunity',
    'application',
    'placement',
    'hours_log',
    'evaluation',
    'certificate',
    'notification'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format(
        'DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I; '
        'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I '
        'FOR EACH ROW EXECUTE FUNCTION psms_set_updated_at();',
        t, t, t, t
      );
    END IF;
  END LOOP;
END;
$$;