-- =============================================================================
-- VERIFICACIÓN POST-FIX -- 0.4 (revoke EXECUTE de anon en funciones admin_*/
-- delete_/sync_ sensibles)
-- =============================================================================

SELECT p.proname,
  (SELECT array_agg(r.rolname ORDER BY r.rolname) FROM aclexplode(p.proacl) a
     JOIN pg_roles r ON r.oid = a.grantee WHERE r.rolname IN ('anon','authenticated')) AS granted_to
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN (
    'admin_create_official_player_identity_from_jugador','admin_delete_user_completo',
    'admin_get_official_player_identity_by_jugador','admin_grant_organizer_player_access',
    'admin_link_official_player_profile','admin_list_official_player_profiles',
    'admin_list_official_ranking_emitters','admin_list_organizer_player_access',
    'admin_revoke_organizer_player_access','admin_set_official_ranking_emitter',
    'admin_unlink_official_player_profile','admin_update_organizador_name',
    'delete_jugador_participacion_linked','sync_granted_locals_from_source',
    'sync_organizador_ranking_oficial_from_players'
  )
ORDER BY p.proname;
-- esperado: granted_to = {authenticated} en las 15 filas (anon ausente)

-- Prueba con anon key real (ejecutar aparte, vía REST):
--   POST .../rest/v1/rpc/admin_delete_user_completo {"p_target_user_id":"<uuid>"}
--   -> esperado: 42501 permission denied for function (no la excepción interna
--      "No tienes permisos de administrador maestro" -- eso significaría que
--      SÍ pudo invocarla, solo que el chequeo interno la detuvo).
