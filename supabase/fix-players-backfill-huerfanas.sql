-- =============================================================================
-- Backfill de 6 huérfanas en players (user_id NULL, tournament_id = pool global)
-- =============================================================================
-- El preview por tournaments NO asigna nada: tournament_id = 00000000-… no existe
-- en public.tournaments. Estas filas se rellenan vía riviera_jugadores.legacy_player_id.
--
-- Ejecutar como postgres en SQL Editor (bypass RLS).
--   1. Run → revisa PREVIEW riviera
--   2. Descomenta UPDATE paso 2 y Run de nuevo
--   3. Revisa paso 3 — sin_user_id debe ser 0 o solo filas sin enlace Riviera
-- =============================================================================

-- PASO 1: PREVIEW — ¿a qué organizador se asignaría cada huérfana?
SELECT
  'PREVIEW riviera' AS etapa,
  p.id AS player_id,
  p.name AS player_name,
  p.email,
  p.tournament_id,
  r.id AS riviera_jugador_id,
  r.nombre AS riviera_nombre,
  r.organizador_id AS user_id_a_asignar,
  u.email AS organizador_email
FROM public.players p
LEFT JOIN public.riviera_jugadores r ON r.legacy_player_id = p.id
LEFT JOIN public.users u ON u.id = r.organizador_id
WHERE p.user_id IS NULL
ORDER BY p.name, p.created_at;

-- PASO 2: APLICAR backfill vía riviera_jugadores (descomentar tras revisar)
/*
UPDATE public.players p
SET user_id = r.organizador_id
FROM public.riviera_jugadores r
WHERE p.user_id IS NULL
  AND r.legacy_player_id = p.id
  AND r.organizador_id IS NOT NULL;
*/

-- PASO 3: Verificación
SELECT
  COALESCE(user_id::text, '(NULL)') AS user_id,
  count(*)::bigint AS filas
FROM public.players
GROUP BY user_id
ORDER BY filas DESC;

SELECT count(*) AS sin_user_id_restantes
FROM public.players
WHERE user_id IS NULL;

-- Filas que siguen huérfanas (sin enlace Riviera → decidir manual: borrar o asignar)
SELECT p.id, p.name, p.email, p.tournament_id, p.created_at
FROM public.players p
WHERE p.user_id IS NULL
ORDER BY p.name;
