-- ═══════════════════════════════════════════════════════════════════════════
-- AUDITORÍA ARQUITECTÓNICA FINAL — carrera global multiclub
-- READ-ONLY. Ejecutar en Supabase SQL Editor.
--
-- Valida TODOS los Riviera ID:
--   • paridad career RPC entre perfiles (HP = RO = admin = público a nivel datos)
--   • conteo eventos vs jugador_participaciones
--   • puntos globales vs suma participaciones
--   • perfiles huérfanos con participaciones
--   • riviera_id duplicado / profile_link inconsistente
--   • participaciones fuera de get_public_career_jugador_ids
--   • carrera parcial
--
-- Resultado: filas con severity = 'FAIL' indican inconsistencia.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) Resumen ejecutivo (ejecutar primero) ───────────────────────────────
WITH identities AS (
  SELECT
    i.riviera_id::text AS riviera_id,
    i.official_player_key::text AS official_player_key,
    i.canonical_riviera_jugador_id AS canonical_id
  FROM public.riviera_official_player_identity i
  WHERE i.riviera_id IS NOT NULL
),
linked_profiles AS (
  SELECT
    id.riviera_id,
    id.official_player_key,
    pl.riviera_jugador_id AS jugador_id,
    rj.organizador_id,
    rj.nombre,
    rj.estado
  FROM identities id
  JOIN public.riviera_official_player_profile_link pl
    ON pl.official_player_key = id.official_player_key::uuid
  JOIN public.riviera_jugadores rj ON rj.id = pl.riviera_jugador_id
  WHERE rj.estado = 'activo'
),
participaciones_reales AS (
  SELECT
    lp.riviera_id,
    lp.official_player_key,
    COUNT(DISTINCT jp.id) AS eventos_db,
    COALESCE(SUM(jp.puntos_obtenidos), 0) AS puntos_db
  FROM linked_profiles lp
  JOIN public.jugador_participaciones jp ON jp.jugador_id = lp.jugador_id
  WHERE NOT public.is_jugador_participacion_excluded(
    jp.jugador_id, jp.tipo_evento::text, jp.evento_id
  )
  GROUP BY lp.riviera_id, lp.official_player_key
),
career_por_ancla AS (
  SELECT
    lp.riviera_id,
    lp.jugador_id AS anchor_id,
    lp.organizador_id,
    COUNT(DISTINCT jp.id) AS eventos_career_rpc,
    COALESCE(SUM(jp.puntos_obtenidos), 0) AS puntos_career_rpc
  FROM linked_profiles lp
  CROSS JOIN LATERAL (
    SELECT g.jugador_id
    FROM public.get_public_career_jugador_ids(lp.jugador_id) AS g(jugador_id)
  ) career_ids
  JOIN public.jugador_participaciones jp ON jp.jugador_id = career_ids.jugador_id
  WHERE NOT public.is_jugador_participacion_excluded(
    jp.jugador_id, jp.tipo_evento::text, jp.evento_id
  )
  GROUP BY lp.riviera_id, lp.jugador_id, lp.organizador_id
),
career_spread AS (
  SELECT
    riviera_id,
    MIN(eventos_career_rpc) AS min_eventos_por_ancla,
    MAX(eventos_career_rpc) AS max_eventos_por_ancla,
    MIN(puntos_career_rpc) AS min_puntos_por_ancla,
    MAX(puntos_career_rpc) AS max_puntos_por_ancla,
    COUNT(DISTINCT anchor_id) AS perfiles_auditados
  FROM career_por_ancla
  GROUP BY riviera_id
),
multiclub AS (
  SELECT riviera_id, COUNT(DISTINCT jugador_id) AS perfiles
  FROM linked_profiles
  GROUP BY riviera_id
  HAVING COUNT(DISTINCT organizador_id) > 1
     OR COUNT(DISTINCT jugador_id) > 1
),
issues AS (
  -- riviera_id duplicado en identity
  SELECT 'DUPLICATE_RIVIERA_ID' AS issue_code, riviera_id, 'FAIL' AS severity,
    jsonb_build_object('count', cnt) AS details
  FROM (
    SELECT riviera_id, COUNT(*) AS cnt
    FROM identities GROUP BY riviera_id HAVING COUNT(*) > 1
  ) d

  UNION ALL

  -- official_player_key con riviera_id distinto (inconsistencia link)
  SELECT 'INCONSISTENT_PROFILE_LINK', lp.riviera_id, 'FAIL',
    jsonb_build_object(
      'jugador_id', lp.jugador_id,
      'expected_key', lp.official_player_key,
      'actual_key', pl2.official_player_key::text
    )
  FROM linked_profiles lp
  JOIN public.riviera_official_player_profile_link pl2
    ON pl2.riviera_jugador_id = lp.jugador_id
  WHERE pl2.official_player_key::text <> lp.official_player_key

  UNION ALL

  -- participación fuera del career RPC
  SELECT 'PARTICIPACION_OUTSIDE_CAREER_RPC', lp.riviera_id, 'FAIL',
    jsonb_build_object('participacion_id', jp.id, 'jugador_id', jp.jugador_id)
  FROM linked_profiles lp
  JOIN public.jugador_participaciones jp ON jp.jugador_id = lp.jugador_id
  WHERE NOT public.is_jugador_participacion_excluded(
    jp.jugador_id, jp.tipo_evento::text, jp.evento_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.get_public_career_jugador_ids(lp.jugador_id) AS g(jugador_id)
    WHERE g.jugador_id = jp.jugador_id
  )

  UNION ALL

  -- carrera parcial: RPC devuelve menos que DB
  SELECT 'PARTIAL_CAREER_RPC', pr.riviera_id, 'FAIL',
    jsonb_build_object(
      'eventos_db', pr.eventos_db,
      'max_eventos_rpc', cs.max_eventos_por_ancla,
      'puntos_db', pr.puntos_db,
      'max_puntos_rpc', cs.max_puntos_por_ancla
    )
  FROM participaciones_reales pr
  JOIN career_spread cs ON cs.riviera_id = pr.riviera_id
  WHERE pr.eventos_db > COALESCE(cs.max_eventos_por_ancla, 0)
     OR pr.puntos_db > COALESCE(cs.max_puntos_por_ancla, 0)

  UNION ALL

  -- historial distinto entre anclas (HP vs RO / admin vs público a nivel RPC)
  SELECT 'HISTORIAL_CAMBIA_POR_ANCLA', cs.riviera_id, 'FAIL',
    jsonb_build_object(
      'min_eventos', cs.min_eventos_por_ancla,
      'max_eventos', cs.max_eventos_por_ancla,
      'perfiles', cs.perfiles_auditados
    )
  FROM career_spread cs
  WHERE cs.min_eventos_por_ancla IS DISTINCT FROM cs.max_eventos_por_ancla

  UNION ALL

  -- puntos distintos entre anclas
  SELECT 'PUNTOS_CAMBIAN_POR_ANCLA', cs.riviera_id, 'FAIL',
    jsonb_build_object(
      'min_puntos', cs.min_puntos_por_ancla,
      'max_puntos', cs.max_puntos_por_ancla
    )
  FROM career_spread cs
  WHERE cs.min_puntos_por_ancla IS DISTINCT FROM cs.max_puntos_por_ancla

  UNION ALL

  -- eventos DB vs puntos RPC no coinciden en conteo
  SELECT 'EVENTOS_DB_VS_RPC', pr.riviera_id, 'FAIL',
    jsonb_build_object(
      'eventos_db', pr.eventos_db,
      'max_eventos_rpc', cs.max_eventos_por_ancla
    )
  FROM participaciones_reales pr
  JOIN career_spread cs ON cs.riviera_id = pr.riviera_id
  WHERE pr.eventos_db IS DISTINCT FROM cs.max_eventos_por_ancla

  UNION ALL

  -- puntos DB vs RPC
  SELECT 'PUNTOS_DB_VS_RPC', pr.riviera_id, 'FAIL',
    jsonb_build_object('puntos_db', pr.puntos_db, 'max_puntos_rpc', cs.max_puntos_por_ancla)
  FROM participaciones_reales pr
  JOIN career_spread cs ON cs.riviera_id = pr.riviera_id
  WHERE pr.puntos_db IS DISTINCT FROM cs.max_puntos_por_ancla
),
orphan_profiles AS (
  SELECT
    rj.id AS jugador_id,
    rj.nombre,
    rj.organizador_id,
    COUNT(jp.id) AS participaciones
  FROM public.riviera_jugadores rj
  LEFT JOIN public.riviera_official_player_profile_link pl ON pl.riviera_jugador_id = rj.id
  JOIN public.jugador_participaciones jp ON jp.jugador_id = rj.id
  WHERE rj.estado = 'activo'
    AND pl.riviera_jugador_id IS NULL
    AND COALESCE(jp.puntos_obtenidos, 0) > 0
    AND NOT public.is_jugador_participacion_excluded(
      jp.jugador_id, jp.tipo_evento::text, jp.evento_id
    )
  GROUP BY rj.id, rj.nombre, rj.organizador_id
)
SELECT
  (SELECT COUNT(DISTINCT riviera_id) FROM identities) AS total_riviera_ids_auditados,
  (SELECT COUNT(*) FROM multiclub) AS total_multiclub,
  (SELECT COUNT(*) FROM issues) AS total_inconsistencias,
  (SELECT COUNT(*) FROM orphan_profiles) AS total_perfiles_huerfanos,
  CASE
    WHEN (SELECT COUNT(*) FROM issues) = 0
     AND (SELECT COUNT(*) FROM orphan_profiles) = 0
      THEN 'PASS'
    ELSE 'FAIL'
  END AS resultado_final;

-- ── 2) Detalle de inconsistencias por Riviera ID ──────────────────────────
-- (descomentar para ver filas individuales)
/*
WITH ... same CTEs as above ...
SELECT issue_code, riviera_id, severity, details FROM issues ORDER BY riviera_id, issue_code;
*/

-- ── 3) Perfiles huérfanos con participaciones ─────────────────────────────
/*
SELECT * FROM orphan_profiles ORDER BY participaciones DESC;
*/
