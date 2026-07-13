-- ═══════════════════════════════════════════════════════════════════════════
-- AUDITORÍA FINAL DE CIERRE — SOLO LECTURA
-- Backup conocido:
--   jugador_participaciones_orphan_backup_20260713_160744
--   riviera_official_points_ledger_orphan_backup_20260713_160744
-- ═══════════════════════════════════════════════════════════════════════════

WITH
orphan AS (
  SELECT COUNT(*)::int AS n
  FROM public.jugador_participaciones jp
  WHERE NULLIF(trim(COALESCE(jp.metadata->>'organizador_id', '')), '') IS NULL
),
test_jp AS (
  SELECT COUNT(*)::int AS n
  FROM public.jugador_participaciones jp
  WHERE jp.evento_nombre ILIKE '%Test interclubes%'
),
test_ledger AS (
  SELECT COUNT(*)::int AS n
  FROM public.riviera_official_points_ledger l
  WHERE l.event_name ILIKE '%Test interclubes%'
),
backup_jp AS (
  SELECT COUNT(*)::int AS n
  FROM public.jugador_participaciones_orphan_backup_20260713_160744
),
backup_ledger AS (
  SELECT COUNT(*)::int AS n
  FROM public.riviera_official_points_ledger_orphan_backup_20260713_160744
),
backup_still_live AS (
  SELECT COUNT(*)::int AS n
  FROM public.jugador_participaciones jp
  INNER JOIN public.jugador_participaciones_orphan_backup_20260713_160744 b
    ON b.id = jp.id
),
marco AS (
  SELECT
    jp.id IS NOT NULL AS existe,
    jp.evento_nombre,
    jp.metadata->>'organizador_id' AS metadata_organizador_id,
    l.id AS ledger_id,
    l.source_organizer_id::text AS ledger_source_organizer_id,
    jp.puntos_obtenidos,
    l.points AS ledger_points
  FROM public.jugador_participaciones jp
  LEFT JOIN public.riviera_official_points_ledger l
    ON l.participacion_id = jp.id
  WHERE jp.id = 'c46767cf-74fd-4e03-9e39-5c5773319f20'
)
SELECT
  o.n AS orphan_total,
  tjp.n AS test_interclubes_jp,
  tl.n AS test_interclubes_ledger,
  bjp.n AS backup_jp_rows,
  bl.n AS backup_ledger_rows,
  bsl.n AS backup_ids_aun_en_vivo,
  m.existe AS marco_existe,
  m.evento_nombre AS marco_evento,
  m.metadata_organizador_id AS marco_organizador_id,
  m.ledger_id AS marco_ledger_id,
  m.ledger_source_organizer_id AS marco_ledger_source,
  m.puntos_obtenidos AS marco_puntos,
  m.ledger_points AS marco_ledger_points,
  CASE
    WHEN o.n = 0
     AND tjp.n = 0
     AND tl.n = 0
     AND bjp.n = 3
     AND bl.n = 3
     AND bsl.n = 0
     AND m.existe
     AND m.evento_nombre = 'Reta 5ta Fuerza'
     AND m.metadata_organizador_id = 'e724de97-3552-4a01-a269-f621e6f1ed26'
     AND m.ledger_source_organizer_id = 'e724de97-3552-4a01-a269-f621e6f1ed26'
    THEN 'CERRADO'
    ELSE 'NO_CERRADO'
  END AS incidente
FROM orphan o, test_jp tjp, test_ledger tl, backup_jp bjp, backup_ledger bl,
     backup_still_live bsl, marco m;
