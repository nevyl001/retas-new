-- SOLO LECTURA — segunda sonda 0126: definición viva de la RPC, columnas de foto, políticas de storage.
SELECT 'overview_def' AS chk, to_jsonb(pg_get_functiondef('public.get_student_coaching_overview()'::regprocedure)) AS result
UNION ALL
SELECT 'photo_columns', jsonb_agg(jsonb_build_object('t', table_name, 'c', column_name) ORDER BY table_name)
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (column_name ILIKE '%foto%' OR column_name ILIKE '%avatar%' OR column_name ILIKE '%photo%')
UNION ALL
SELECT 'jugadores_avatars_policies', jsonb_agg(jsonb_build_object('n', policyname, 'cmd', cmd, 'roles', roles, 'qual', qual, 'check', with_check))
FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
  AND (qual ILIKE '%jugadores-avatars%' OR with_check ILIKE '%jugadores-avatars%')
UNION ALL
SELECT 'identity_cols', jsonb_agg(jsonb_build_object('t', table_name, 'c', column_name))
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('riviera_official_player_identity','riviera_official_player_profile_link');
