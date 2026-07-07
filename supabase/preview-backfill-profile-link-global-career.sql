-- PREVIEW REVERSIBLE: vincular perfiles que comparten Riviera ID pero carecen de profile_link.
-- NO ejecutar UPDATE sin revisar preview y crear backup.
--
-- Uso:
--   1. Ejecutar sección PREVIEW (solo lectura)
--   2. Revisar filas con action = 'LINK_PROFILE'
--   3. Si apruebas: BEGIN; ejecutar UPDATE; COMMIT;
--   4. Rollback: DELETE FROM riviera_official_player_profile_link WHERE created_by_backfill = true;

-- ═══════════════════════════════════════════════════════════════════════════
-- PREVIEW — perfiles a vincular
-- ═══════════════════════════════════════════════════════════════════════════
WITH orphan_profiles AS (
  SELECT
    rj.id AS jugador_id,
    rj.nombre,
    rj.organizador_id,
    COALESCE(
      public.get_organizador_display_name(rj.organizador_id),
      rj.organizador_id::text
    ) AS club,
    COUNT(jp.id) AS participaciones,
    COALESCE(SUM(jp.puntos_obtenidos), 0) AS puntos
  FROM public.riviera_jugadores rj
  LEFT JOIN public.riviera_official_player_profile_link pl
    ON pl.riviera_jugador_id = rj.id
  LEFT JOIN public.jugador_participaciones jp
    ON jp.jugador_id = rj.id
   AND NOT public.is_jugador_participacion_excluded(
     jp.jugador_id, jp.tipo_evento::text, jp.evento_id
   )
  WHERE rj.estado = 'activo'
    AND pl.riviera_jugador_id IS NULL
  GROUP BY rj.id, rj.nombre, rj.organizador_id
),
grant_candidates AS (
  SELECT
    op.jugador_id AS orphan_id,
    op.nombre AS orphan_nombre,
    op.club AS orphan_club,
    op.participaciones AS orphan_participaciones,
    op.puntos AS orphan_puntos,
    opa.jugador_id AS source_jugador_id,
    pl.official_player_key AS dest_official_player_key,
    i.riviera_id AS dest_riviera_id,
    'grant_to_canonical' AS match_reason
  FROM orphan_profiles op
  JOIN public.organizer_player_access opa
    ON opa.local_jugador_id = op.jugador_id
   AND opa.is_active = true
  JOIN public.riviera_official_player_profile_link pl
    ON pl.riviera_jugador_id = opa.jugador_id
  JOIN public.riviera_official_player_identity i
    ON i.official_player_key = pl.official_player_key
),
same_name_candidates AS (
  SELECT
    op.jugador_id AS orphan_id,
    op.nombre AS orphan_nombre,
    op.club AS orphan_club,
    op.participaciones AS orphan_participaciones,
    op.puntos AS orphan_puntos,
    rj2.id AS source_jugador_id,
    pl.official_player_key AS dest_official_player_key,
    i.riviera_id AS dest_riviera_id,
    'same_name_single_match' AS match_reason
  FROM orphan_profiles op
  JOIN public.riviera_jugadores rj2
    ON public._riviera_normalize_player_name(rj2.nombre)
     = public._riviera_normalize_player_name(op.nombre)
   AND rj2.estado = 'activo'
   AND rj2.id <> op.jugador_id
  JOIN public.riviera_official_player_profile_link pl
    ON pl.riviera_jugador_id = rj2.id
  JOIN public.riviera_official_player_identity i
    ON i.official_player_key = pl.official_player_key
  WHERE NOT EXISTS (
    SELECT 1 FROM grant_candidates gc WHERE gc.orphan_id = op.jugador_id
  )
),
all_candidates AS (
  SELECT * FROM grant_candidates
  UNION ALL
  SELECT * FROM same_name_candidates
),
ranked AS (
  SELECT
    *,
    COUNT(*) OVER (PARTITION BY orphan_id) AS candidate_count
  FROM all_candidates
)
SELECT
  orphan_id,
  orphan_nombre,
  orphan_club,
  orphan_participaciones,
  orphan_puntos,
  dest_riviera_id,
  dest_official_player_key::text,
  source_jugador_id::text,
  match_reason,
  candidate_count,
  CASE
    WHEN candidate_count = 1 THEN 'LINK_PROFILE'
    WHEN candidate_count > 1 THEN 'REVIEW_MANUAL'
    ELSE 'NO_MATCH'
  END AS action,
  CASE
    WHEN candidate_count = 1
      THEN format(
        'INSERT INTO riviera_official_player_profile_link (riviera_jugador_id, official_player_key) VALUES (%L, %L);',
        orphan_id, dest_official_player_key
      )
    ELSE NULL
  END AS suggested_sql
FROM ranked
WHERE candidate_count >= 1
ORDER BY orphan_participaciones DESC, dest_riviera_id, orphan_nombre;

-- ═══════════════════════════════════════════════════════════════════════════
-- BACKUP antes de UPDATE (ejecutar y guardar resultado)
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT * FROM public.riviera_official_player_profile_link
-- WHERE riviera_jugador_id IN (
--   SELECT orphan_id FROM (...preview CTE...) WHERE action = 'LINK_PROFILE'
-- );

-- ═══════════════════════════════════════════════════════════════════════════
-- UPDATE (solo tras aprobación manual)
-- ═══════════════════════════════════════════════════════════════════════════
/*
BEGIN;

INSERT INTO public.riviera_official_player_profile_link (
  riviera_jugador_id,
  official_player_key
)
SELECT orphan_id, dest_official_player_key
FROM (...preview CTE con action = 'LINK_PROFILE'...)
ON CONFLICT (riviera_jugador_id) DO NOTHING;

COMMIT;
*/
