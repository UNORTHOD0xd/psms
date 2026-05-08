-- Postgres trigger that maintains the updated_at column.
-- Per CLAUDE.md: "updated_at is maintained by a Postgres trigger, not the application."
--
-- This migration is hand-rolled and runs alongside the auto-generated Prisma
-- schema migration. It defines a generic trigger function and attaches it to
-- every table that has an `updated_at` column.

CREATE OR REPLACE FUNCTION psms_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Attach to every table that needs it. Add new tables here when introducing
-- migrations that create them.
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
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I; '
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I '
      'FOR EACH ROW EXECUTE FUNCTION psms_set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END;
$$;
