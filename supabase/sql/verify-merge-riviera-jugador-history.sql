-- verify-merge-riviera-jugador-history.sql
-- Post-condiciones tras admin_merge_riviera_jugador_history(source → target).
-- Solo lectura. Ejecutar con service role / postgres.
--
-- Capturar baseline_* del JSON de dry_run ANTES del merge real.
-- Si baseline_participaciones o baseline_points quedan en 0 (default sin snapshot),
-- los checks de conservación se reportan como NO VERIFICABLE — no como FAIL.

\set source_riviera_id 'RIV-00000003'
\set target_riviera_id 'RIV-00000312'
\set source_riviera_jugador_id '00000000-0000-0000-0000-000000000000'
\set baseline_participaciones 0
\set baseline_rating 0
\set baseline_points 0
\set expected_skipped_parts 0

WITH target_profile AS (
  SELECT
    rj.id AS jugador_id,
    rj.nombre,
    rj.organizador_id AS home_organizador_id,
    i.official_player_key,
    i.riviera_id
  FROM riviera_official_player_identity i
  JOIN riviera_official_player_profile_link pl
    ON pl.official_player_key = i.official_player_key
  JOIN riviera_jugadores rj ON rj.id = pl.riviera_jugador_id
  WHERE i.riviera_id = :'target_riviera_id'
  LIMIT 1
),
source_liga_jugador_ids AS (
  SELECT DISTINCT lj.id AS liga_jugador_id
  FROM riviera_jugadores rj
  JOIN liga_jugadores lj ON lj.id = rj.legacy_liga_jugador_id
  WHERE rj.id = :'source_riviera_jugador_id'::uuid
  UNION
  SELECT DISTINCT lj.id
  FROM liga_jugadores lj
  WHERE lj.id = :'source_riviera_jugador_id'::uuid
),
liga_orphans AS (
  SELECT 'liga_inscripciones' AS tabla, li.id::text AS row_id, li.jugador_id::text AS ref_id
  FROM liga_inscripciones li
  WHERE li.jugador_id IN (SELECT liga_jugador_id FROM source_liga_jugador_ids)
  UNION ALL
  SELECT 'liga_equipos', le.id::text, COALESCE(le.jugador1_id::text, le.jugador2_id::text)
  FROM liga_equipos le
  WHERE le.jugador1_id IN (SELECT liga_jugador_id FROM source_liga_jugador_ids)
     OR le.jugador2_id IN (SELECT liga_jugador_id FROM source_liga_jugador_ids)
  UNION ALL
  SELECT 'liga_jornada_parejas', ljp.id::text, COALESCE(ljp.jugador1_id::text, ljp.jugador2_id::text)
  FROM liga_jornada_parejas ljp
  WHERE ljp.jugador1_id IN (SELECT liga_jugador_id FROM source_liga_jugador_ids)
     OR ljp.jugador2_id IN (SELECT liga_jugador_id FROM source_liga_jugador_ids)
  UNION ALL
  SELECT 'liga_jugadores_sin_bridge', lj.id::text, lj.id::text
  FROM liga_jugadores lj
  WHERE lj.id IN (SELECT liga_jugador_id FROM source_liga_jugador_ids)
    AND NOT EXISTS (
      SELECT 1 FROM riviera_jugadores rj
      WHERE rj.legacy_liga_jugador_id = lj.id AND rj.estado = 'activo'
    )
),
cross_club_participaciones AS (
  SELECT
    jp.id,
    jp.evento_nombre,
    jp.puntos_obtenidos,
    NULLIF(trim(jp.metadata->>'organizador_id'), '')::uuid AS meta_org,
    t.home_organizador_id,
    t.nombre AS target_nombre
  FROM jugador_participaciones jp
  JOIN target_profile t ON t.jugador_id = jp.jugador_id
  WHERE NULLIF(trim(jp.metadata->>'organizador_id'), '') IS NOT NULL
    AND NULLIF(trim(jp.metadata->>'organizador_id'), '')::uuid
        IS DISTINCT FROM t.home_organizador_id
),
structural_checks AS (
  SELECT 'source_riviera_id_absent' AS check_name,
         NOT EXISTS (
           SELECT 1 FROM riviera_official_player_identity
           WHERE riviera_id = :'source_riviera_id'
         ) AS ok,
         'riviera_official_player_identity' AS scope,
         'structural' AS category

  UNION ALL SELECT 'source_riviera_jugador_absent',
         NOT EXISTS (
           SELECT 1 FROM riviera_jugadores WHERE id = :'source_riviera_jugador_id'::uuid
         ), 'riviera_jugadores', 'structural'

  UNION ALL SELECT 'no_duplicate_participaciones',
         NOT EXISTS (
           SELECT 1 FROM (
             SELECT tipo_evento, evento_id, resultado, count(*) c
             FROM jugador_participaciones jp
             JOIN target_profile t ON t.jugador_id = jp.jugador_id
             GROUP BY 1, 2, 3 HAVING count(*) > 1
           ) d
         ), 'jugador_participaciones', 'structural'

  UNION ALL SELECT 'no_orphan_rating',
         NOT EXISTS (
           SELECT 1 FROM rating_historial rh
           LEFT JOIN riviera_jugadores rj ON rj.id = rh.jugador_id
           WHERE rj.id IS NULL
         ), 'rating_historial', 'structural'

  UNION ALL SELECT 'totals_eq_ledger',
         COALESCE((
           SELECT tot.points_total = (
             SELECT coalesce(sum(l.points)::int, 0)
             FROM riviera_official_points_ledger l
             WHERE l.official_player_key = t.official_player_key
               AND l.counts_for_official_ranking = true
           )
           FROM target_profile t
           LEFT JOIN riviera_official_player_totals tot
             ON tot.official_player_key = t.official_player_key
         ), false), 'riviera_official_player_totals', 'structural'

  UNION ALL SELECT 'no_liga_orphans_after_merge',
         NOT EXISTS (SELECT 1 FROM liga_orphans), 'liga_*', 'structural'
),
baseline_checks AS (
  SELECT 'participaciones_count_conserved' AS check_name,
         CASE
           WHEN :baseline_participaciones::int = 0 THEN NULL
           ELSE (
             SELECT count(*) FROM jugador_participaciones jp
             JOIN target_profile t ON t.jugador_id = jp.jugador_id
           ) = (:baseline_participaciones::int - :expected_skipped_parts::int)
         END AS ok,
         'jugador_participaciones' AS scope,
         'baseline' AS category,
         CASE
           WHEN :baseline_participaciones::int = 0
           THEN 'NO VERIFICABLE - falta baseline (baseline_participaciones=0)'
           ELSE NULL
         END AS skip_reason

  UNION ALL SELECT 'points_conserved',
         CASE
           WHEN :baseline_points::int = 0 THEN NULL
           ELSE COALESCE((
             SELECT sum(l.points) FILTER (WHERE l.counts_for_official_ranking)
             FROM riviera_official_points_ledger l
             JOIN target_profile t ON t.official_player_key = l.official_player_key
           ), 0)::int = :baseline_points::int
         END,
         'riviera_official_points_ledger',
         'baseline',
         CASE
           WHEN :baseline_points::int = 0
           THEN 'NO VERIFICABLE - falta baseline (baseline_points=0)'
           ELSE NULL
         END
),
all_checks AS (
  SELECT check_name, ok, scope, category, NULL::text AS skip_reason
  FROM structural_checks
  UNION ALL
  SELECT check_name, ok, scope, category, skip_reason
  FROM baseline_checks
)

-- 1) Resumen estructural (PASS / FAIL)
SELECT check_name, ok, scope, category
FROM all_checks
WHERE category = 'structural'
ORDER BY check_name;

-- 2) Baseline (PASS / FAIL / NO VERIFICABLE)
SELECT
  check_name,
  CASE
    WHEN skip_reason IS NOT NULL THEN skip_reason
    WHEN ok THEN 'PASS'
    ELSE 'FAIL'
  END AS result,
  scope,
  category
FROM all_checks
WHERE category = 'baseline'
ORDER BY check_name;

-- 3) Fallos estructurales
SELECT 'FAIL' AS severity, check_name, scope
FROM all_checks
WHERE category = 'structural' AND NOT ok;

-- 4) Fallos baseline (solo cuando hay snapshot real)
SELECT 'FAIL' AS severity, check_name, scope
FROM all_checks
WHERE category = 'baseline' AND skip_reason IS NULL AND NOT ok;

-- 5) Huérfanos liga (debe estar vacío)
SELECT 'liga_orphan' AS kind, * FROM liga_orphans;

-- 6) Cross-club metadata (informativo)
SELECT
  'cross_club_metadata' AS kind,
  id AS participacion_id,
  evento_nombre,
  puntos_obtenidos,
  meta_org,
  home_organizador_id AS target_home_org,
  target_nombre
FROM cross_club_participaciones
ORDER BY evento_nombre;
