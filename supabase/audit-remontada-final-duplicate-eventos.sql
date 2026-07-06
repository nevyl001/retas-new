-- Auditoría READ-ONLY: Remontada Final — dos evento_id distintos.
-- Sin INSERT / UPDATE / DELETE.
--
-- evento_id A: 52d338ec-77a7-4b40-9714-8728db183974
-- evento_id B: 99a9e83c-2fd5-4701-8602-7093235cbe8e
--
-- Paso 0 (ejecutar primero en prod para confirmar tipos):
/*
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('jugador_participaciones', 'riviera_jugadores', 'tournaments')
ORDER BY table_name, ordinal_position;
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Resumen por evento_id
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  jp.tipo_evento,
  jp.evento_id,
  MIN(jp.evento_nombre) AS evento_nombre,
  COUNT(*)::integer AS participaciones,
  COUNT(DISTINCT jp.jugador_id)::integer AS jugadores_distintos,
  COALESCE(SUM(jp.puntos_obtenidos), 0) AS puntos_totales,
  MIN(jp.fecha) AS fecha_min,
  MAX(jp.fecha) AS fecha_max,
  MIN(jp.created_at) AS created_at_min,
  MAX(jp.created_at) AS created_at_max,
  EXISTS (
    SELECT 1
    FROM public.tournaments t
    WHERE t.id = jp.evento_id
  ) AS parent_row_found,
  (
    SELECT t.user_id
    FROM public.tournaments t
    WHERE t.id = jp.evento_id
    LIMIT 1
  ) AS tournament_host_user_id,
  (
    SELECT COALESCE(public.get_organizador_display_name(t.user_id), '')
    FROM public.tournaments t
    WHERE t.id = jp.evento_id
    LIMIT 1
  ) AS tournament_host_display_name,
  COUNT(*) FILTER (
    WHERE NULLIF(trim(jp.metadata->>'organizador_id'), '') IS NOT NULL
  )::integer AS participaciones_con_metadata_organizador,
  array_agg(DISTINCT jp.metadata->>'subtipo' ORDER BY jp.metadata->>'subtipo')
    FILTER (WHERE jp.metadata->>'subtipo' IS NOT NULL) AS subtipos_metadata
FROM public.jugador_participaciones jp
WHERE jp.evento_id IN (
  '52d338ec-77a7-4b40-9714-8728db183974'::uuid,
  '99a9e83c-2fd5-4701-8602-7093235cbe8e'::uuid
)
  AND lower(trim(jp.evento_nombre)) = 'remontada final'
  AND COALESCE(jp.puntos_obtenidos, 0) > 0
GROUP BY jp.tipo_evento, jp.evento_id
ORDER BY jp.evento_id;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Lista de jugadores por evento_id
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  jp.evento_id,
  jp.id AS participacion_id,
  jp.jugador_id,
  rj.nombre AS jugador_nombre,
  rj.organizador_id AS jugador_home_organizador_id,
  COALESCE(public.get_organizador_display_name(rj.organizador_id), '') AS jugador_home_club,
  jp.puntos_obtenidos,
  jp.fecha,
  jp.created_at,
  jp.resultado,
  jp.metadata->>'organizador_id' AS metadata_organizador_id,
  jp.metadata->>'club_name' AS metadata_club_name,
  jp.metadata->>'subtipo' AS metadata_subtipo,
  jp.metadata->>'source_club_name' AS metadata_source_club_name,
  jp.metadata->>'integrity_status' AS metadata_integrity_status,
  jp.metadata AS metadata_json
FROM public.jugador_participaciones jp
LEFT JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
WHERE jp.evento_id IN (
  '52d338ec-77a7-4b40-9714-8728db183974'::uuid,
  '99a9e83c-2fd5-4701-8602-7093235cbe8e'::uuid
)
  AND lower(trim(jp.evento_nombre)) = 'remontada final'
  AND COALESCE(jp.puntos_obtenidos, 0) > 0
ORDER BY jp.evento_id, rj.nombre NULLS LAST, jp.created_at;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) Solapamiento de jugadores (jugador_id::text en ambos lados)
-- ═══════════════════════════════════════════════════════════════════════════
WITH base AS (
  SELECT
    jp.evento_id,
    jp.jugador_id::text AS jugador_id_key
  FROM public.jugador_participaciones jp
  WHERE jp.evento_id IN (
    '52d338ec-77a7-4b40-9714-8728db183974'::uuid,
    '99a9e83c-2fd5-4701-8602-7093235cbe8e'::uuid
  )
    AND lower(trim(jp.evento_nombre)) = 'remontada final'
    AND COALESCE(jp.puntos_obtenidos, 0) > 0
),
a AS (
  SELECT DISTINCT jugador_id_key
  FROM base
  WHERE evento_id = '52d338ec-77a7-4b40-9714-8728db183974'::uuid
),
b AS (
  SELECT DISTINCT jugador_id_key
  FROM base
  WHERE evento_id = '99a9e83c-2fd5-4701-8602-7093235cbe8e'::uuid
),
comun AS (
  SELECT a.jugador_id_key
  FROM a
  INNER JOIN b ON b.jugador_id_key = a.jugador_id_key
)
SELECT
  (SELECT COUNT(*)::integer FROM a) AS jugadores_evento_a,
  (SELECT COUNT(*)::integer FROM b) AS jugadores_evento_b,
  (SELECT COUNT(*)::integer FROM comun) AS jugadores_en_comun,
  (SELECT COUNT(*)::integer FROM a WHERE NOT EXISTS (
    SELECT 1 FROM b WHERE b.jugador_id_key = a.jugador_id_key
  )) AS solo_en_a,
  (SELECT COUNT(*)::integer FROM b WHERE NOT EXISTS (
    SELECT 1 FROM a WHERE a.jugador_id_key = b.jugador_id_key
  )) AS solo_en_b,
  CASE
    WHEN (SELECT COUNT(*) FROM comun) = 0
      THEN 'EVENTOS_DISTINTOS — overrides independientes'
    WHEN (SELECT COUNT(*) FROM a) = (SELECT COUNT(*) FROM b)
     AND (SELECT COUNT(*) FROM comun) = (SELECT COUNT(*) FROM a)
      THEN 'MISMO_ROSTER — posible duplicado histórico; revisar fechas antes de override'
    ELSE 'SOLAPAMIENTO_PARCIAL — overrides independientes; revisar listas abajo'
  END AS interpretacion;

-- 3b) Nombres en común (si interpretacion lo requiere)
WITH base AS (
  SELECT DISTINCT
    jp.evento_id,
    jp.jugador_id::text AS jugador_id_key
  FROM public.jugador_participaciones jp
  WHERE jp.evento_id IN (
    '52d338ec-77a7-4b40-9714-8728db183974'::uuid,
    '99a9e83c-2fd5-4701-8602-7093235cbe8e'::uuid
  )
    AND lower(trim(jp.evento_nombre)) = 'remontada final'
    AND COALESCE(jp.puntos_obtenidos, 0) > 0
),
a AS (
  SELECT jugador_id_key FROM base
  WHERE evento_id = '52d338ec-77a7-4b40-9714-8728db183974'::uuid
),
b AS (
  SELECT jugador_id_key FROM base
  WHERE evento_id = '99a9e83c-2fd5-4701-8602-7093235cbe8e'::uuid
)
SELECT
  'en_comun' AS lista,
  rj.nombre AS jugador_nombre,
  a.jugador_id_key
FROM a
INNER JOIN b ON b.jugador_id_key = a.jugador_id_key
LEFT JOIN public.riviera_jugadores rj ON rj.id::text = a.jugador_id_key
ORDER BY rj.nombre;

-- 3c) Solo en A / solo en B
WITH base AS (
  SELECT DISTINCT
    jp.evento_id,
    jp.jugador_id::text AS jugador_id_key
  FROM public.jugador_participaciones jp
  WHERE jp.evento_id IN (
    '52d338ec-77a7-4b40-9714-8728db183974'::uuid,
    '99a9e83c-2fd5-4701-8602-7093235cbe8e'::uuid
  )
    AND lower(trim(jp.evento_nombre)) = 'remontada final'
    AND COALESCE(jp.puntos_obtenidos, 0) > 0
),
a AS (
  SELECT jugador_id_key FROM base
  WHERE evento_id = '52d338ec-77a7-4b40-9714-8728db183974'::uuid
),
b AS (
  SELECT jugador_id_key FROM base
  WHERE evento_id = '99a9e83c-2fd5-4701-8602-7093235cbe8e'::uuid
)
SELECT
  'solo_en_52d338ec' AS lista,
  rj.nombre AS jugador_nombre,
  a.jugador_id_key
FROM a
LEFT JOIN b ON b.jugador_id_key = a.jugador_id_key
LEFT JOIN public.riviera_jugadores rj ON rj.id::text = a.jugador_id_key
WHERE b.jugador_id_key IS NULL

UNION ALL

SELECT
  'solo_en_99a9e83c' AS lista,
  rj.nombre AS jugador_nombre,
  b.jugador_id_key
FROM b
LEFT JOIN a ON a.jugador_id_key = b.jugador_id_key
LEFT JOIN public.riviera_jugadores rj ON rj.id::text = b.jugador_id_key
WHERE a.jugador_id_key IS NULL

ORDER BY 1, 2;
