-- =============================================================================
-- SOLO LECTURA — sonda previa a la migración 0126 (perfil del alumno).
-- No escribe. No toca schema_migrations.
-- =============================================================================
SELECT 'users_columns' AS chk, jsonb_agg(jsonb_build_object('c', column_name, 't', data_type) ORDER BY column_name) AS result
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
UNION ALL
SELECT 'rj_cols', jsonb_agg(jsonb_build_object('c', column_name, 't', data_type, 'n', is_nullable) ORDER BY column_name)
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'riviera_jugadores'
  AND column_name IN ('foto_url','edad','en_cancha','instagram_url','facebook_url','tiktok_url','updated_at','email')
UNION ALL
SELECT 'rj_constraints', jsonb_agg(jsonb_build_object('n', conname, 'def', pg_get_constraintdef(oid)))
FROM pg_constraint
WHERE conrelid = 'public.riviera_jugadores'::regclass AND contype = 'c'
UNION ALL
SELECT 'rj_en_cancha_values', jsonb_agg(jsonb_build_object('v', en_cancha, 'n', n))
FROM (SELECT en_cancha, count(*) n FROM public.riviera_jugadores GROUP BY 1) s
UNION ALL
SELECT 'rj_triggers', jsonb_agg(jsonb_build_object('n', tgname, 'def', pg_get_triggerdef(oid)))
FROM pg_trigger
WHERE tgrelid = 'public.riviera_jugadores'::regclass AND NOT tgisinternal
UNION ALL
SELECT 'objects', jsonb_build_object(
  'identity_tbl', to_regclass('public.riviera_official_player_identity'),
  'profile_link_tbl', to_regclass('public.riviera_official_player_profile_link'),
  'opa_tbl', to_regclass('public.organizer_player_access'),
  'rewards_links_tbl', to_regclass('public.rewards_player_links'),
  'csal_tbl', to_regclass('public.coach_student_account_links'),
  'get_overview', to_regprocedure('public.get_student_coaching_overview()'),
  'get_org_name', to_regprocedure('public.get_organizador_display_name(uuid)'),
  'update_profile_rpc', to_regprocedure('public.update_student_coaching_profile(text,boolean,integer,boolean,text,boolean,text,boolean,text,boolean,text,boolean)')
)
UNION ALL
SELECT 'storage_bucket', jsonb_agg(jsonb_build_object('id', id, 'public', public, 'limit', file_size_limit, 'mimes', allowed_mime_types))
FROM storage.buckets WHERE id = 'jugadores-avatars'
UNION ALL
SELECT 'storage_policies', jsonb_agg(jsonb_build_object('n', policyname, 'cmd', cmd, 'roles', roles, 'qual', qual, 'check', with_check))
FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
UNION ALL
SELECT 'rj_policies', jsonb_agg(jsonb_build_object('n', policyname, 'cmd', cmd, 'roles', roles, 'qual', qual))
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'riviera_jugadores'
UNION ALL
SELECT 'users_policies', jsonb_agg(jsonb_build_object('n', policyname, 'cmd', cmd, 'qual', qual))
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users';
