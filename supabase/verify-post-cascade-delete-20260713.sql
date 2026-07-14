-- VERIFY post-cascade (READ-ONLY). No borra nada.
-- Corre en SQL Editor tras un borrado Opción X exitoso.

-- 1) Eventos intactos (baseline de salud)
SELECT
  (SELECT COUNT(*) FROM public.tournaments) AS tournaments,
  (SELECT COUNT(*) FROM public.pairs) AS pairs,
  (SELECT COUNT(*) FROM public.matches) AS matches,
  (SELECT COUNT(*) FROM public.gameses) AS games;

-- 2) ¿Quedó el SOURCE que borraste? (sustituye nombre o UUID)
/*
SELECT id, nombre, organizador_id, estado
FROM public.riviera_jugadores
WHERE lower(trim(nombre)) = lower('TestPlaRO1')  -- o el que borraste
   OR id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'::uuid;
*/

-- 3) Clones / grants residuales del source (pega el UUID del origen borrado)
/*
SELECT 'opa' AS tipo, opa.id::text, opa.grantee_organizer_id::text, opa.local_jugador_id::text
FROM public.organizer_player_access opa
WHERE opa.jugador_id = 'UUID-ORIGEN-BORRADO'::uuid
   OR opa.local_jugador_id = 'UUID-ORIGEN-BORRADO'::uuid
UNION ALL
SELECT 'profile_link', pl.id::text, pl.official_player_key::text, pl.riviera_jugador_id::text
FROM public.riviera_official_player_profile_link pl
WHERE pl.riviera_jugador_id = 'UUID-ORIGEN-BORRADO'::uuid;
*/

-- 4) Duelos: filas siguen existiendo (FK al jugador null, no DELETE del duelo)
SELECT COUNT(*) AS duelos_totales
FROM public.duelos_2v2;

-- 5) Backups creados por el último delete (deben existir tablas jugador_delete_backup_*)
SELECT c.relname AS backup_table
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname LIKE 'jugador_delete_backup_%'
ORDER BY c.relname DESC
LIMIT 20;
