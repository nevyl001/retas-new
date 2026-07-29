-- =============================================================================
-- ROLLBACK -- restaura GRANT EXECUTE a anon en las 15 funciones administrativas
-- revocadas por fix-revoke-anon-admin-functions-20260729.sql. NO EJECUTAR
-- salvo que el fix ya se haya aplicado y se decida revertir por una razón
-- operativa concreta -- reabre superficie de ataque innecesaria (aunque cada
-- función sigue protegida internamente por is_master_admin()/ownership).
-- =============================================================================

BEGIN;

GRANT EXECUTE ON FUNCTION public.admin_create_official_player_identity_from_jugador(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_completo(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_get_official_player_identity_by_jugador(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_organizer_player_access(uuid[], uuid, boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_link_official_player_profile(uuid, uuid, text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_list_official_player_profiles(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_list_official_ranking_emitters() TO anon;
GRANT EXECUTE ON FUNCTION public.admin_list_organizer_player_access(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_organizer_player_access(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_set_official_ranking_emitter(uuid, boolean, text) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_unlink_official_player_profile(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_update_organizador_name(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.delete_jugador_participacion_linked(uuid, uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.sync_granted_locals_from_source(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.sync_organizador_ranking_oficial_from_players() TO anon;

COMMIT;
