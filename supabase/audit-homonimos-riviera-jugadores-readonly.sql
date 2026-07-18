-- =============================================================================
-- AUDITORÍA READ-ONLY: Homónimos en riviera_jugadores
-- =============================================================================
-- Criterio: mismo organizador_id + mismo nombre normalizado + distinto id.
-- La normalización SOLO mide homónimos; NUNCA atribuye identidad.
--
-- Sin DDL. Sin DML. Sin RPCs con efectos secundarios.
-- =============================================================================

BEGIN;
SET TRANSACTION READ ONLY;

-- ---------------------------------------------------------------------------
-- 1) Grupos de homónimos (org + nombre normalizado)
-- ---------------------------------------------------------------------------
WITH normalized AS (
  SELECT
    id,
    organizador_id,
    nombre,
    lower(btrim(regexp_replace(nombre, '\s+', ' ', 'g'))) AS nombre_norm,
    legacy_player_id,
    legacy_liga_jugador_id,
    estado,
    created_at
  FROM public.riviera_jugadores
  WHERE nombre IS NOT NULL
    AND btrim(nombre) <> ''
),
homonym_groups AS (
  SELECT
    organizador_id,
    nombre_norm,
    count(DISTINCT id) AS riviera_ids_distintos,
    array_agg(id ORDER BY created_at, id) AS riviera_ids,
    array_agg(DISTINCT nombre ORDER BY nombre) AS nombres_raw,
    array_agg(legacy_player_id ORDER BY created_at, id)
      FILTER (WHERE legacy_player_id IS NOT NULL) AS legacy_player_ids,
    array_agg(legacy_liga_jugador_id ORDER BY created_at, id)
      FILTER (WHERE legacy_liga_jugador_id IS NOT NULL) AS legacy_liga_jugador_ids
  FROM normalized
  GROUP BY organizador_id, nombre_norm
  HAVING count(DISTINCT id) > 1
)
SELECT
  organizador_id,
  nombre_norm,
  riviera_ids_distintos,
  riviera_ids,
  nombres_raw,
  legacy_player_ids,
  legacy_liga_jugador_ids,
  (
    SELECT count(*)::int
    FROM unnest(legacy_player_ids) AS lp(id)
  ) AS legacy_player_id_count,
  (
    SELECT count(DISTINCT x)
    FROM unnest(legacy_player_ids) AS t(x)
  ) AS legacy_player_id_distinct,
  (
    SELECT count(*)::int
    FROM unnest(legacy_liga_jugador_ids) AS ll(id)
  ) AS legacy_liga_id_count,
  (
    SELECT count(DISTINCT x)
    FROM unnest(legacy_liga_jugador_ids) AS t(x)
  ) AS legacy_liga_id_distinct
FROM homonym_groups
ORDER BY riviera_ids_distintos DESC, organizador_id, nombre_norm;

-- ---------------------------------------------------------------------------
-- 2) Detalle por riviera_jugadores.id dentro de grupos homónimos
--    + OPA + participaciones + rating + ledger
-- ---------------------------------------------------------------------------
WITH normalized AS (
  SELECT
    id,
    organizador_id,
    nombre,
    lower(btrim(regexp_replace(nombre, '\s+', ' ', 'g'))) AS nombre_norm,
    legacy_player_id,
    legacy_liga_jugador_id,
    estado,
    created_at
  FROM public.riviera_jugadores
  WHERE nombre IS NOT NULL
    AND btrim(nombre) <> ''
),
homonym_ids AS (
  SELECT n.*
  FROM normalized n
  INNER JOIN (
    SELECT organizador_id, nombre_norm
    FROM normalized
    GROUP BY organizador_id, nombre_norm
    HAVING count(DISTINCT id) > 1
  ) g
    ON g.organizador_id = n.organizador_id
   AND g.nombre_norm = n.nombre_norm
)
SELECT
  h.organizador_id,
  h.nombre_norm,
  h.id AS riviera_jugador_id,
  h.nombre,
  h.estado,
  h.legacy_player_id,
  h.legacy_liga_jugador_id,
  h.created_at,
  (
    SELECT count(*)::int
    FROM public.organizer_player_access opa
    WHERE opa.jugador_id = h.id
       OR opa.local_jugador_id = h.id
  ) AS opa_rows_as_jugador_or_local,
  (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', opa.id,
      'jugador_id', opa.jugador_id,
      'local_jugador_id', opa.local_jugador_id,
      'local_display_name', opa.local_display_name,
      'is_active', opa.is_active,
      'grantee_organizer_id', opa.grantee_organizer_id
    ) ORDER BY opa.id), '[]'::jsonb)
    FROM public.organizer_player_access opa
    WHERE opa.jugador_id = h.id
       OR opa.local_jugador_id = h.id
  ) AS opa_related,
  (
    SELECT count(*)::int
    FROM public.jugador_participaciones jp
    WHERE jp.jugador_id = h.id
  ) AS participaciones_count,
  (
    SELECT count(*)::int
    FROM public.rating_historial rh
    WHERE rh.jugador_id = h.id
  ) AS rating_historial_count,
  (
    SELECT count(*)::int
    FROM public.jugador_participaciones jp
    WHERE jp.jugador_id = h.id
      AND coalesce(jp.puntos_obtenidos, 0) <> 0
  ) AS ledger_participaciones_con_puntos,
  (
    SELECT coalesce(sum(jp.puntos_obtenidos), 0)::int
    FROM public.jugador_participaciones jp
    WHERE jp.jugador_id = h.id
  ) AS ledger_puntos_suma
FROM homonym_ids h
ORDER BY h.organizador_id, h.nombre_norm, h.created_at, h.id;

-- ---------------------------------------------------------------------------
-- 3) Resumen ejecutivo
-- ---------------------------------------------------------------------------
WITH normalized AS (
  SELECT
    id,
    organizador_id,
    lower(btrim(regexp_replace(nombre, '\s+', ' ', 'g'))) AS nombre_norm
  FROM public.riviera_jugadores
  WHERE nombre IS NOT NULL
    AND btrim(nombre) <> ''
),
groups AS (
  SELECT organizador_id, nombre_norm, count(DISTINCT id) AS n
  FROM normalized
  GROUP BY organizador_id, nombre_norm
  HAVING count(DISTINCT id) > 1
)
SELECT
  (SELECT count(*)::int FROM groups) AS grupos_homonimos,
  (SELECT coalesce(sum(n), 0)::int FROM groups) AS riviera_ids_en_grupos,
  (SELECT count(DISTINCT organizador_id)::int FROM groups) AS organizadores_afectados,
  CASE
    WHEN (SELECT count(*) FROM groups) = 0 THEN 'NO_HAY_HOMONIMOS_ACTUALES_DETECTADOS'
    ELSE 'RIESGO_ACTIVO_HOMONIMOS_DETECTADOS'
  END AS interpretacion_base;

ROLLBACK;
