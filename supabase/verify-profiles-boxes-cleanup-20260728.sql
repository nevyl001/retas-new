-- =============================================================================
-- VERIFICACIÓN POST-LIMPIEZA — profiles/boxes/is_admin/is_coach_or_admin/enums
-- =============================================================================

-- 1. Los 8 objetos ya no existen.
SELECT
  to_regclass('public.profiles') IS NULL AS profiles_borrada,
  to_regclass('public.boxes') IS NULL AS boxes_borrada,
  to_regprocedure('public.is_admin()') IS NULL AS is_admin_borrada,
  to_regprocedure('public.is_coach_or_admin()') IS NULL AS is_coach_or_admin_borrada,
  to_regtype('public.account_status') IS NULL AS account_status_borrado,
  to_regtype('public.user_role') IS NULL AS user_role_borrado,
  to_regtype('public.box_plan') IS NULL AS box_plan_borrado,
  to_regtype('public.box_status') IS NULL AS box_status_borrado;

-- 2. auth.users conserva exactamente los mismos usuarios (comparar contra
--    el conteo de antes de la limpieza).
SELECT count(*) AS auth_users_count FROM auth.users;  -- esperado: igual a antes

-- 3. Estructuras reales de Riviera intactas.
SELECT 'users' t, count(*) n FROM users
UNION ALL SELECT 'admin_users', count(*) FROM admin_users
UNION ALL SELECT 'riviera_jugadores', count(*) FROM riviera_jugadores
UNION ALL SELECT 'jugador_participaciones', count(*) FROM jugador_participaciones
UNION ALL SELECT 'jugador_stats', count(*) FROM jugador_stats
UNION ALL SELECT 'tournaments', count(*) FROM tournaments
UNION ALL SELECT 'matches', count(*) FROM matches
UNION ALL SELECT 'pairs', count(*) FROM pairs
UNION ALL SELECT 'duelos_2v2', count(*) FROM duelos_2v2
UNION ALL SELECT 'ligas', count(*) FROM ligas
UNION ALL SELECT 'torneo_express_evento', count(*) FROM torneo_express_evento
UNION ALL SELECT 'organizer_player_access', count(*) FROM organizer_player_access
UNION ALL SELECT 'riviera_jugadores_sitio_oficial', count(*) FROM riviera_jugadores_sitio_oficial
UNION ALL SELECT '_career_participacion_host_audit', count(*) FROM _career_participacion_host_audit
UNION ALL SELECT '_historical_orphan_parent_participaciones', count(*) FROM _historical_orphan_parent_participaciones;

-- 4. Riviera ID / organizadores: spot-check de que las políticas de
--    aislamiento por organizador siguen intactas (no debieron cambiar).
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname='public' AND tablename IN ('riviera_jugadores','jugador_participaciones','jugador_stats')
ORDER BY tablename, policyname;

-- 5. Ningún objeto de Riviera quedó con una referencia rota a is_admin()/
--    is_coach_or_admin() (si algo las llamara, esta consulta lo mostraría
--    con "does not exist" al intentar describirlo — aquí solo confirmamos
--    que ninguna política/función viva las menciona).
SELECT policyname, tablename, qual FROM pg_policies
WHERE schemaname='public' AND (qual ILIKE '%is_admin(%' OR qual ILIKE '%is_coach_or_admin(%');
-- esperado: 0 filas

-- =============================================================================
-- CHECKLIST FUNCIONAL (manual, en la app real, después de correr esto):
--   [ ] Login (Riviera Open y Hack Padel)
--   [ ] Registro de cuenta nueva de prueba — se completa sin error
--   [ ] Organizadores, branding dinámico
--   [ ] Riviera ID: búsqueda y vinculación de jugador
--   [ ] Ranking oficial (vista pública)
--   [ ] Retas, Torneo Express, Americano, Ligas, Duelo 2v2
--   [ ] Vistas públicas de cada modo
-- Advisor: re-correr `supabase db advisors --linked --type security` y
-- confirmar que no aparece ninguna alerta nueva.
-- =============================================================================
