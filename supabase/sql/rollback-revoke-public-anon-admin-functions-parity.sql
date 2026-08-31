-- =============================================================================
-- ROLLBACK — revierte fix-revoke-public-anon-admin-functions-parity.sql
--
-- Restaura el estado de prod PRE-paridad (2026-08-30):
--   • 14 funciones: GRANT EXECUTE TO PUBLIC (anon vuelve a heredar → P0001 en REST)
--   • admin_delete_user_completo: sin PUBLIC (ya estaba así antes del fix de paridad)
--   • authenticated conserva EXECUTE en las 15
--
-- Idempotente. NOTIFY recarga PostgREST.
-- =============================================================================

BEGIN;

-- Las 14 que tenían anon_execute=true por PUBLIC antes del fix de paridad
GRANT EXECUTE ON FUNCTION public.admin_create_official_player_identity_from_jugador(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_official_player_identity_from_jugador(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.admin_get_official_player_identity_by_jugador(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_official_player_identity_by_jugador(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.admin_grant_organizer_player_access(uuid[], uuid, boolean) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_grant_organizer_player_access(uuid[], uuid, boolean) TO authenticated;

GRANT EXECUTE ON FUNCTION public.admin_link_official_player_profile(uuid, uuid, text, uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_link_official_player_profile(uuid, uuid, text, uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.admin_list_official_player_profiles(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_official_player_profiles(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.admin_list_official_ranking_emitters() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_official_ranking_emitters() TO authenticated;

GRANT EXECUTE ON FUNCTION public.admin_list_organizer_player_access(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_organizer_player_access(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.admin_revoke_organizer_player_access(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_revoke_organizer_player_access(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.admin_set_official_ranking_emitter(uuid, boolean, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_official_ranking_emitter(uuid, boolean, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.admin_unlink_official_player_profile(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_unlink_official_player_profile(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.admin_update_organizador_name(uuid, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_organizador_name(uuid, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.delete_jugador_participacion_linked(uuid, uuid, uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_jugador_participacion_linked(uuid, uuid, uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.sync_granted_locals_from_source(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_granted_locals_from_source(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.sync_organizador_ranking_oficial_from_players() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_organizador_ranking_oficial_from_players() TO authenticated;

-- delete: mantener sin PUBLIC (estado pre-paridad — única con 42501 para anon)
REVOKE ALL ON FUNCTION public.admin_delete_user_completo(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_user_completo(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_completo(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
