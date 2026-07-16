-- Verify matches.court is nullable after patch-matches-court-nullable.sql
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'matches'
  AND column_name = 'court';

-- Expect: is_nullable = YES
