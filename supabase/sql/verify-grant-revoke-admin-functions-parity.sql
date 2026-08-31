-- =============================================================================
-- VERIFY — paridad REVOKE admin_* (inventario 0.4, 15 funciones)
--
-- Dos capas (no confundir):
--   A) aclexplode(proacl) — grants DIRECTOS a anon/authenticated en proacl
--   B) has_function_privilege('anon', …) — privilegio EFECTIVO (incluye PUBLIC)
--
-- PASS cuando:
--   - granted_to = {authenticated} (sin anon directo)
--   - anon_execute = false en las 15 filas
--
-- Tras fix-revoke-public-anon-admin-functions-parity.sql, ambas capas deben PASS.
-- Si aclexplode PASS pero anon_execute true → falta REVOKE FROM PUBLIC (drift).
-- =============================================================================

-- A) Grants directos (compatible con verify-revoke-anon-admin-functions-20260729.sql)
SELECT
  p.proname,
  (
    SELECT array_agg(r.rolname ORDER BY r.rolname)
    FROM aclexplode(p.proacl) a
    JOIN pg_roles r ON r.oid = a.grantee
    WHERE r.rolname IN ('anon', 'authenticated')
  ) AS granted_to
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'admin_create_official_player_identity_from_jugador',
    'admin_delete_user_completo',
    'admin_get_official_player_identity_by_jugador',
    'admin_grant_organizer_player_access',
    'admin_link_official_player_profile',
    'admin_list_official_player_profiles',
    'admin_list_official_ranking_emitters',
    'admin_list_organizer_player_access',
    'admin_revoke_organizer_player_access',
    'admin_set_official_ranking_emitter',
    'admin_unlink_official_player_profile',
    'admin_update_organizador_name',
    'delete_jugador_participacion_linked',
    'sync_granted_locals_from_source',
    'sync_organizador_ranking_oficial_from_players'
  )
ORDER BY p.proname;

-- B) Privilegio efectivo anon (detector de drift PUBLIC)
SELECT
  p.proname,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'admin_create_official_player_identity_from_jugador',
    'admin_delete_user_completo',
    'admin_get_official_player_identity_by_jugador',
    'admin_grant_organizer_player_access',
    'admin_link_official_player_profile',
    'admin_list_official_player_profiles',
    'admin_list_official_ranking_emitters',
    'admin_list_organizer_player_access',
    'admin_revoke_organizer_player_access',
    'admin_set_official_ranking_emitter',
    'admin_unlink_official_player_profile',
    'admin_update_organizador_name',
    'delete_jugador_participacion_linked',
    'sync_granted_locals_from_source',
    'sync_organizador_ranking_oficial_from_players'
  )
ORDER BY p.proname;

-- C) Resumen PASS/FAIL
SELECT
  count(*) FILTER (WHERE has_function_privilege('anon', p.oid, 'EXECUTE')) AS anon_can_still_execute,
  count(*) AS total_functions
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'admin_create_official_player_identity_from_jugador',
    'admin_delete_user_completo',
    'admin_get_official_player_identity_by_jugador',
    'admin_grant_organizer_player_access',
    'admin_link_official_player_profile',
    'admin_list_official_player_profiles',
    'admin_list_official_ranking_emitters',
    'admin_list_organizer_player_access',
    'admin_revoke_organizer_player_access',
    'admin_set_official_ranking_emitter',
    'admin_unlink_official_player_profile',
    'admin_update_organizador_name',
    'delete_jugador_participacion_linked',
    'sync_granted_locals_from_source',
    'sync_organizador_ranking_oficial_from_players'
  );
-- esperado: anon_can_still_execute = 0, total_functions = 15

-- D) Prueba REST con anon key (ejecutar aparte, no en SQL Editor):
--   admin_delete_user_completo           → 42501 permission denied for function
--   admin_grant_organizer_player_access  → 42501 (no P0001 "Solo Admin Principal…")
--   admin_revoke_organizer_player_access → 42501 (idem)
