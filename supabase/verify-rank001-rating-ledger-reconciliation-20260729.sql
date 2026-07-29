-- =============================================================================
-- VERIFICACIÓN POST-FIX -- RANK-001 (reconciliación de rating/ledger)
-- =============================================================================

-- 1. Ambas funciones existen y siguen SECURITY DEFINER con los guards de
--    autorización del 2026-07-26 intactos.
SELECT proname, prosecdef,
  (prosrc ILIKE '%_assert_rating_rpc_authenticated%') AS conserva_auth_guard
FROM pg_proc
WHERE pronamespace='public'::regnamespace AND proname='aplicar_rating_partido';

SELECT proname, prosecdef,
  (prosrc ILIKE '%_is_official_ranking_emitter%') AS conserva_emitter_guard
FROM pg_proc
WHERE pronamespace='public'::regnamespace AND proname='try_write_riviera_official_ledger';

-- 2. Confirmar que el cuerpo nuevo contiene la lógica de reconciliación
--    (no solo el CREATE OR REPLACE vacío).
SELECT proname, (prosrc ILIKE '%v_prev_ganador%') AS tiene_reconciliacion_rating
FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='aplicar_rating_partido';

SELECT proname, (prosrc ILIKE '%v_prev_points%') AS tiene_reconciliacion_ledger
FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='try_write_riviera_official_ledger';

-- =============================================================================
-- PRUEBA MANUAL RECOMENDADA (en la app real, no destructiva si se hace sobre
-- un partido de prueba desechable):
--   [ ] Crear una Reta de prueba, jugar un partido, finalizar.
--   [ ] Anotar rating y puntos del jugador ganador.
--   [ ] Reabrir el partido, invertir el marcador, volver a finalizar.
--   [ ] Confirmar que el rating ahora refleja al nuevo ganador (no el viejo).
--   [ ] Confirmar que rating_partidos NO se duplicó.
--   [ ] Volver a finalizar sin cambios -> confirmar que nada más cambia.
-- =============================================================================
