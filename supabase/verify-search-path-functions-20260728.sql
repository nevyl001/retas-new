-- =============================================================================
-- VERIFICACIÓN POST-FIX -- search_path de las 14 funciones
-- =============================================================================

SELECT proname, proconfig
FROM pg_proc
WHERE pronamespace='public'::regnamespace AND proname IN ('_ensure_unique_jugador_slug','_map_liga_nivel_to_riviera','_normalize_riviera_id_exact','_normalize_riviera_id_loose','_resolve_organizador_for_player','_riviera_historical_event_name_whitelist_hit','_riviera_jugador_nombre_key','_riviera_normalize_evento_nombre','_riviera_normalize_player_name','_riviera_participacion_parent_lookup_table','_slugify_jugador_nombre','auth_uid','riviera_jugadores_set_updated_at','update_updated_at_column')
ORDER BY proname;
-- esperado: proconfig = {search_path=public} en las 14 filas

-- Confirmar que Security Advisor ya no reporta function_search_path_mutable
-- para estas 14 funciones (correr aparte: supabase db advisors --linked --type security)
