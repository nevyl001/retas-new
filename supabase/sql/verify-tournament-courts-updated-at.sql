-- Read-only checks before applying court-unassign patch.
-- Run in SQL editor; does not mutate data.

-- 1) tournaments.updated_at exists?
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tournaments'
  AND column_name IN ('id', 'courts', 'updated_at')
ORDER BY column_name;

-- 2) Any updated_at trigger on tournaments?
SELECT tgname, pg_get_triggerdef(oid)
FROM pg_trigger
WHERE tgrelid = 'public.tournaments'::regclass
  AND NOT tgisinternal;

-- 3) matches.court nullability
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'matches'
  AND column_name = 'court';

-- 4) RPC present?
SELECT proname, pg_get_function_identity_arguments(oid)
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname = 'update_tournament_courts_and_unassign';
