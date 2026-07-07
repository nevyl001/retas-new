-- ═══════════════════════════════════════════════════════════════════════════
-- AUDITORÍA READ-ONLY: paridad carrera global (todos los Riviera ID)
--
-- Reporta:
--   • perfiles vinculados por official_player_key
--   • participaciones por perfil vs globales esperadas
--   • puntos por perfil vs globales
--   • clubes donde jugó (metadata.organizador_id)
--   • perfiles sin profile_link
--   • mismo riviera_id con distinto official_player_key
--   • clasificación de riesgo ALTO / MEDIO / BAJO
--
-- Ejecutar en Supabase SQL Editor. Solo SELECT. Sin UPDATE.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── A) Resumen por Riviera ID ─────────────────────────────────────────────
WITH identity_profiles AS (
  SELECT
    i.riviera_id::text AS riviera_id,
    i.official_player_key::text AS official_player_key,
    COALESCE(
      i.canonical_riviera_jugador_id,
      (
        SELECT pl.riviera_jugador_id
        FROM public.riviera_official_player_profile_link pl
        WHERE pl.official_player_key = i.official_player_key
        ORDER BY pl.created_at NULLS LAST
        LIMIT 1
      )
    ) AS anchor_jugador_id,
    rj.id AS jugador_id,
    rj.nombre,
    rj.organizador_id,
    COALESCE(
      public.get_organizador_display_name(rj.organizador_id),
      rj.organizador_id::text
    ) AS club,
    rj.visible_publico,
    pl.riviera_jugador_id IS NOT NULL AS has_profile_link
  FROM public.riviera_official_player_identity i
  LEFT JOIN public.riviera_official_player_profile_link pl
    ON pl.official_player_key = i.official_player_key
  LEFT JOIN public.riviera_jugadores rj ON rj.id = pl.riviera_jugador_id
  WHERE rj.estado = 'activo' OR rj.id IS NULL
),

all_active_profiles AS (
  SELECT
    rj.id AS jugador_id,
    rj.nombre,
    rj.organizador_id,
    COALESCE(
      public.get_organizador_display_name(rj.organizador_id),
      rj.organizador_id::text
    ) AS club,
    pl.official_player_key::text AS official_player_key,
    i.riviera_id::text AS riviera_id
  FROM public.riviera_jugadores rj
  LEFT JOIN public.riviera_official_player_profile_link pl
    ON pl.riviera_jugador_id = rj.id
  LEFT JOIN public.riviera_official_player_identity i
    ON i.official_player_key = pl.official_player_key
  WHERE rj.estado = 'activo'
),

participaciones_por_perfil AS (
  SELECT
    ap.riviera_id,
    ap.official_player_key,
    ap.jugador_id,
    ap.nombre,
    ap.club,
    COUNT(jp.id) FILTER (
      WHERE NOT public.is_jugador_participacion_excluded(
        jp.jugador_id, jp.tipo_evento::text, jp.evento_id
      )
    ) AS participaciones_perfil,
    COALESCE(SUM(jp.puntos_obtenidos) FILTER (
      WHERE NOT public.is_jugador_participacion_excluded(
        jp.jugador_id, jp.tipo_evento::text, jp.evento_id
      )
    ), 0) AS puntos_perfil,
    string_agg(DISTINCT jp.evento_nombre, ' | ' ORDER BY jp.evento_nombre)
      FILTER (WHERE jp.id IS NOT NULL) AS eventos_perfil
  FROM all_active_profiles ap
  LEFT JOIN public.jugador_participaciones jp ON jp.jugador_id = ap.jugador_id
  WHERE ap.riviera_id IS NOT NULL
  GROUP BY ap.riviera_id, ap.official_player_key, ap.jugador_id, ap.nombre, ap.club
),

global_expected AS (
  SELECT
    pp.riviera_id,
    pp.official_player_key,
    COUNT(DISTINCT jp.id) AS participaciones_globales_esperadas,
    COALESCE(SUM(jp.puntos_obtenidos), 0) AS puntos_globales_esperados,
    string_agg(DISTINCT
      COALESCE(
        public.get_organizador_display_name(
          NULLIF(trim(jp.metadata->>'organizador_id'), '')::uuid
        ),
        jp.metadata->>'organizador_id',
        'sin_org'
      ),
      ' | '
    ) AS clubes_donde_jugo,
    string_agg(DISTINCT jp.evento_nombre, ' | ' ORDER BY jp.evento_nombre) AS eventos_globales
  FROM participaciones_por_perfil pp
  JOIN participaciones_por_perfil pp2
    ON pp2.riviera_id = pp.riviera_id
  JOIN public.jugador_participaciones jp
    ON jp.jugador_id = pp2.jugador_id
   AND NOT public.is_jugador_participacion_excluded(
     jp.jugador_id, jp.tipo_evento::text, jp.evento_id
   )
  GROUP BY pp.riviera_id, pp.official_player_key
),

career_rpc_coverage AS (
  SELECT
    pp.riviera_id,
    pp.jugador_id,
    COUNT(DISTINCT jp.id) AS participaciones_career_rpc
  FROM participaciones_por_perfil pp
  CROSS JOIN LATERAL (
    SELECT g.jugador_id
    FROM public.get_public_career_jugador_ids(pp.jugador_id) AS g(jugador_id)
  ) career_ids
  JOIN public.jugador_participaciones jp
    ON jp.jugador_id = career_ids.jugador_id
   AND NOT public.is_jugador_participacion_excluded(
     jp.jugador_id, jp.tipo_evento::text, jp.evento_id
   )
  GROUP BY pp.riviera_id, pp.jugador_id
),

profile_summary AS (
  SELECT
    riviera_id,
    official_player_key,
    COUNT(DISTINCT jugador_id) AS total_perfiles_vinculados,
    string_agg(DISTINCT jugador_id::text, ', ' ORDER BY jugador_id::text) AS jugador_ids,
    string_agg(DISTINCT club, ' | ' ORDER BY club) AS clubes_perfil,
    MAX(nombre) AS nombre,
    MAX(participaciones_perfil) AS max_part_perfil,
    MIN(participaciones_perfil) AS min_part_perfil,
    SUM(participaciones_perfil) AS sum_part_perfiles
  FROM participaciones_por_perfil
  GROUP BY riviera_id, official_player_key
)

SELECT
  ps.riviera_id,
  ps.official_player_key,
  ps.nombre,
  ps.total_perfiles_vinculados,
  ps.jugador_ids,
  ps.clubes_perfil,
  ge.participaciones_globales_esperadas,
  ge.puntos_globales_esperados,
  ge.clubes_donde_jugo,
  ge.eventos_globales,
  ps.max_part_perfil,
  ps.min_part_perfil,
  MAX(crc.participaciones_career_rpc) AS max_career_rpc_por_perfil,
  MIN(crc.participaciones_career_rpc) AS min_career_rpc_por_perfil,
  ge.participaciones_globales_esperadas - MAX(crc.participaciones_career_rpc) AS faltantes_career_rpc,
  CASE
    WHEN ps.total_perfiles_vinculados > 1
     AND ps.max_part_perfil <> ps.min_part_perfil
     AND ge.participaciones_globales_esperadas > ps.max_part_perfil
      THEN 'ALTO'
    WHEN ps.total_perfiles_vinculados > 1
     AND ps.max_part_perfil = ps.min_part_perfil
     AND ps.max_part_perfil > 0
      THEN 'MEDIO'
    WHEN ps.total_perfiles_vinculados = 1
      THEN 'BAJO'
    WHEN ge.participaciones_globales_esperadas > COALESCE(MAX(crc.participaciones_career_rpc), 0)
      THEN 'ALTO'
    ELSE 'REVISAR'
  END AS riesgo,
  CASE
    WHEN ps.max_part_perfil <> ps.min_part_perfil
      THEN 'Participaciones repartidas en varios perfiles'
    WHEN ge.participaciones_globales_esperadas > COALESCE(MAX(crc.participaciones_career_rpc), 0)
      THEN 'Career RPC no incluye todas las participaciones'
    WHEN ps.total_perfiles_vinculados > 1 AND ps.max_part_perfil = ps.min_part_perfil
      THEN 'Varios perfiles pero solo uno con participaciones'
    ELSE 'OK'
  END AS motivo
FROM profile_summary ps
JOIN global_expected ge
  ON ge.riviera_id = ps.riviera_id
 AND ge.official_player_key = ps.official_player_key
LEFT JOIN career_rpc_coverage crc ON crc.riviera_id = ps.riviera_id
GROUP BY
  ps.riviera_id, ps.official_player_key, ps.nombre, ps.total_perfiles_vinculados,
  ps.jugador_ids, ps.clubes_perfil, ge.participaciones_globales_esperadas,
  ge.puntos_globales_esperados, ge.clubes_donde_jugo, ge.eventos_globales,
  ps.max_part_perfil, ps.min_part_perfil
ORDER BY
  CASE
    WHEN ps.total_perfiles_vinculados > 1
     AND ps.max_part_perfil <> ps.min_part_perfil THEN 0
    ELSE 1
  END,
  faltantes_career_rpc DESC NULLS LAST,
  ps.riviera_id;

-- ── B) Perfiles activos sin profile_link ──────────────────────────────────
-- SELECT rj.id, rj.nombre, rj.organizador_id,
--        COUNT(jp.id) AS participaciones
-- FROM public.riviera_jugadores rj
-- LEFT JOIN public.riviera_official_player_profile_link pl ON pl.riviera_jugador_id = rj.id
-- LEFT JOIN public.jugador_participaciones jp ON jp.jugador_id = rj.id
-- WHERE rj.estado = 'activo' AND pl.riviera_jugador_id IS NULL
-- GROUP BY rj.id, rj.nombre, rj.organizador_id
-- HAVING COUNT(jp.id) > 0
-- ORDER BY participaciones DESC;

-- ── C) Casos obligatorios ─────────────────────────────────────────────────
-- Filtrar sección A:
-- WHERE ps.riviera_id IN (
--   'RIV-00000071', 'RIV-00000003', 'RIV-00000031', 'RIV-00000011',
--   'RIV-00000009', 'RIV-00000024', 'RIV-00000019', 'RIV-00000041'
-- );
