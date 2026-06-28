-- =============================================================================
-- 6 huérfanas sin enlace legacy_player_id — diagnóstico de uso + opciones
-- =============================================================================
-- Resultado confirmado: riviera_jugadores.legacy_player_id NO apunta a estas filas.
-- Ejecutar en Supabase SQL Editor (postgres). Solo lectura hasta descomentar paso 3.
-- =============================================================================

-- PASO 1: ¿Se usan en parejas / retas activas?
SELECT
  p.id,
  p.name,
  p.email,
  p.tournament_id,
  p.created_at,
  (SELECT count(*) FROM public.pairs pa
   WHERE pa.player1_id = p.id OR pa.player2_id = p.id) AS refs_pairs,
  (SELECT count(*) FROM public.riviera_jugadores r
   WHERE lower(trim(r.nombre)) = lower(trim(p.name))) AS riviera_mismo_nombre
FROM public.players p
WHERE p.user_id IS NULL
ORDER BY p.name;

-- PASO 2: Posible dueño por nombre (solo preview — revisar antes de asignar)
SELECT
  p.id AS player_id,
  p.name AS player_name,
  r.id AS riviera_id,
  r.nombre AS riviera_nombre,
  r.organizador_id AS user_id_propuesto,
  u.email AS organizador_email,
  r.legacy_player_id AS riviera_legacy_actual
FROM public.players p
JOIN public.riviera_jugadores r
  ON lower(trim(r.nombre)) = lower(trim(p.name))
LEFT JOIN public.users u ON u.id = r.organizador_id
WHERE p.user_id IS NULL
ORDER BY p.name, r.organizador_id;

-- PASO 3a: ASIGNAR user_id por match de nombre (descomentar solo si paso 2 se ve bien)
-- Cuidado: Gabriel L tiene 2 filas players y puede haber varios en riviera — revisar manual.
/*
UPDATE public.players p
SET user_id = sub.organizador_id
FROM (
  SELECT DISTINCT ON (p2.id)
    p2.id AS player_id,
    r.organizador_id
  FROM public.players p2
  JOIN public.riviera_jugadores r
    ON lower(trim(r.nombre)) = lower(trim(p2.name))
  WHERE p2.user_id IS NULL
    AND r.organizador_id IS NOT NULL
  ORDER BY p2.id, r.legacy_player_id NULLS LAST, r.created_at
) sub
WHERE p.id = sub.player_id
  AND p.user_id IS NULL;
*/

-- PASO 3b: BORRAR huérfanas SIN referencias en pairs (descomentar si son basura/duplicados)
-- Solo elimina filas con refs_pairs = 0. Re-ejecuta paso 1 antes para confirmar.
/*
DELETE FROM public.players p
WHERE p.user_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.pairs pa
    WHERE pa.player1_id = p.id OR pa.player2_id = p.id
  );
*/

-- PASO 4: Verificación
SELECT count(*) AS sin_user_id_restantes FROM public.players WHERE user_id IS NULL;

SELECT id, name, email, user_id, tournament_id
FROM public.players
WHERE user_id IS NULL
ORDER BY name;
