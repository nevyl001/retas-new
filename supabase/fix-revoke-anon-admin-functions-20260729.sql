-- =============================================================================
-- FIX 0.4 -- revoca EXECUTE de `anon` en funciones administrativas/destructivas
-- (auditoría 2026-07-29). Ninguna de estas es explotable hoy: las 15 que
-- tenían GRANT a anon ya validan internamente is_master_admin() / ownership
-- via auth.uid() (verificado leyendo pg_get_functiondef de cada una) o son
-- funciones de trigger que no se pueden invocar fuera de un trigger real
-- (sync_organizador_ranking_oficial_from_players). Este fix es defensa en
-- profundidad -- principio de mínimo privilegio -- no cierra un hueco activo.
--
-- No se revoca de `authenticated` porque los flujos legítimos (admin maestro
-- operando desde su propia sesión autenticada, RPCs "admin_*" nombradas así
-- porque re-validan is_master_admin() internamente) SÍ necesitan poder
-- llamarlas -- la protección real ya vive dentro de cada función.
--
-- Cero cambio de comportamiento para usuarios legítimos: is_master_admin()
-- siempre devuelve false para auth.uid() IS NULL (caso anon), así que ningún
-- caso de uso real dependía de que anon pudiera intentar llamarlas.
--
-- Idempotente: REVOKE ... IF EXISTS no existe en Postgres para funciones,
-- pero REVOKE de un privilegio que ya no está otorgado no falla (no-op).
-- Rollback: rollback-revoke-anon-admin-functions-20260729.sql
-- =============================================================================

BEGIN;

REVOKE EXECUTE ON FUNCTION public.admin_create_official_player_identity_from_jugador(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_user_completo(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_official_player_identity_by_jugador(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_grant_organizer_player_access(uuid[], uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_link_official_player_profile(uuid, uuid, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_official_player_profiles(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_official_ranking_emitters() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_organizer_player_access(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_organizer_player_access(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_official_ranking_emitter(uuid, boolean, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_unlink_official_player_profile(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_organizador_name(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_jugador_participacion_linked(uuid, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_granted_locals_from_source(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_organizador_ranking_oficial_from_players() FROM anon;

-- ── Verificación final dentro de la misma transacción ─────────────────────
DO $$
DECLARE
  v_still_granted int;
BEGIN
  SELECT count(*) INTO v_still_granted
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN aclexplode(p.proacl) a ON true
  JOIN pg_roles r ON r.oid = a.grantee
  WHERE n.nspname = 'public'
    AND r.rolname = 'anon'
    AND p.proname IN (
      'admin_create_official_player_identity_from_jugador','admin_delete_user_completo',
      'admin_get_official_player_identity_by_jugador','admin_grant_organizer_player_access',
      'admin_link_official_player_profile','admin_list_official_player_profiles',
      'admin_list_official_ranking_emitters','admin_list_organizer_player_access',
      'admin_revoke_organizer_player_access','admin_set_official_ranking_emitter',
      'admin_unlink_official_player_profile','admin_update_organizador_name',
      'delete_jugador_participacion_linked','sync_granted_locals_from_source',
      'sync_organizador_ranking_oficial_from_players'
    );
  IF v_still_granted <> 0 THEN
    RAISE EXCEPTION 'Fix incompleto: % función(es) siguen otorgadas a anon', v_still_granted;
  END IF;
END $$;

-- Revisar el resultado con calma antes de aceptar. Cuando estés conforme:
--   COMMIT;
-- Si algo se ve mal:
--   ROLLBACK;
