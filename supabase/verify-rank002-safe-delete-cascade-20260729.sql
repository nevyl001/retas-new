-- =============================================================================
-- VERIFICACIÓN POST-FIX -- RANK-002 (borrado transaccional con reversión)
-- =============================================================================

-- 1. Las 3 funciones existen.
SELECT proname, prosecdef FROM pg_proc
WHERE pronamespace='public'::regnamespace
  AND proname IN ('admin_delete_torneo_express_categoria_cascade','admin_delete_liga_cascade','_revert_rating_for_partido_ref')
ORDER BY proname;

-- 2. Grants: las 2 RPCs solo a authenticated; el helper interno a nadie.
SELECT p.proname,
  (SELECT array_agg(r.rolname) FROM aclexplode(p.proacl) a JOIN pg_roles r ON r.oid=a.grantee WHERE r.rolname IN ('anon','authenticated')) AS granted_to
FROM pg_proc p
WHERE p.pronamespace='public'::regnamespace
  AND p.proname IN ('admin_delete_torneo_express_categoria_cascade','admin_delete_liga_cascade','_revert_rating_for_partido_ref')
ORDER BY p.proname;
-- esperado: las 2 RPCs -> {authenticated}; el helper -> NULL (nadie)

-- 3. Conteos de fila sin cambios (esta migración solo crea funciones, no
--    borra ni modifica datos).
SELECT 'torneo_express' t, count(*) n FROM torneo_express
UNION ALL SELECT 'ligas', count(*) FROM ligas
UNION ALL SELECT 'jugador_participaciones', count(*) FROM jugador_participaciones
UNION ALL SELECT 'rating_historial', count(*) FROM rating_historial
UNION ALL SELECT 'riviera_official_points_ledger', count(*) FROM riviera_official_points_ledger;

-- =============================================================================
-- PRUEBA MANUAL RECOMENDADA (sobre un Torneo Express / Liga de PRUEBA,
-- desechable, no sobre datos reales):
--   [ ] Crear torneo/liga de prueba, jugar 1 partido, finalizar.
--   [ ] Anotar rating/puntos del jugador.
--   [ ] Llamar a la RPC de borrado (vía el frontend actualizado).
--   [ ] Confirmar: torneo/liga desaparece, jugador_participaciones de ese
--       evento ya no existen, rating volvió al valor previo, ledger
--       revertido, riviera_official_player_totals ajustado.
-- =============================================================================
