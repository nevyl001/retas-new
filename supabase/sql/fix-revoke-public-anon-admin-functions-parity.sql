-- =============================================================================
-- Paridad REVOKE admin_* — mismo patrón que admin_delete_user_completo
--
-- Contexto (prod 2026-08-30):
--   fix-revoke-anon-admin-functions-20260729.sql revocó EXECUTE solo de `anon`.
--   En Postgres, `anon` hereda EXECUTE vía rol PUBLIC (grant por defecto al
--   CREATE FUNCTION). Por eso verify-revoke con aclexplode(proacl) mostraba
--   granted_to={authenticated} pero has_function_privilege('anon', …) seguía true
--   en 14/15 funciones — y REST devolvía P0001 (guard interno) en vez de 42501.
--
--   admin_delete_user_completo ya tenía REVOKE FROM PUBLIC + anon (ver
--   admin-delete-user-completo.sql) → única con anon_execute=false.
--
-- Este script aplica el patrón completo a las 15 funciones del inventario 0.4.
-- Idempotente. Tras aplicar, correr verify-grant-revoke-admin-functions-parity.sql
-- =============================================================================

BEGIN;

REVOKE ALL ON FUNCTION public.admin_create_official_player_identity_from_jugador(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_create_official_player_identity_from_jugador(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_create_official_player_identity_from_jugador(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_delete_user_completo(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_user_completo(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_completo(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_get_official_player_identity_by_jugador(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_official_player_identity_by_jugador(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_official_player_identity_by_jugador(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_grant_organizer_player_access(uuid[], uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_grant_organizer_player_access(uuid[], uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_organizer_player_access(uuid[], uuid, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_link_official_player_profile(uuid, uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_link_official_player_profile(uuid, uuid, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_link_official_player_profile(uuid, uuid, text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_list_official_player_profiles(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_official_player_profiles(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_official_player_profiles(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_list_official_ranking_emitters() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_official_ranking_emitters() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_official_ranking_emitters() TO authenticated;

REVOKE ALL ON FUNCTION public.admin_list_organizer_player_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_organizer_player_access(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_organizer_player_access(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_revoke_organizer_player_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_revoke_organizer_player_access(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_organizer_player_access(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_set_official_ranking_emitter(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_official_ranking_emitter(uuid, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_official_ranking_emitter(uuid, boolean, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_unlink_official_player_profile(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_unlink_official_player_profile(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_unlink_official_player_profile(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_update_organizador_name(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_organizador_name(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_organizador_name(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_jugador_participacion_linked(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_jugador_participacion_linked(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_jugador_participacion_linked(uuid, uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.sync_granted_locals_from_source(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_granted_locals_from_source(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_granted_locals_from_source(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.sync_organizador_ranking_oficial_from_players() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_organizador_ranking_oficial_from_players() FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_organizador_ranking_oficial_from_players() TO authenticated;

-- ── Verificación dentro de la transacción ───────────────────────────────────
DO $$
DECLARE
  v_anon_can_execute int;
BEGIN
  SELECT count(*) INTO v_anon_can_execute
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
    AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF v_anon_can_execute <> 0 THEN
    RAISE EXCEPTION
      'Paridad REVOKE incompleta: % función(es) siguen ejecutables por anon',
      v_anon_can_execute;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
