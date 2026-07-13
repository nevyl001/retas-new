-- ═══════════════════════════════════════════════════════════════════════════
-- REPAIR — Marco M / Reta 5ta Fuerza  (APARTE del delete de Test interclubes)
-- Solo agrega metadata.organizador_id
-- ═══════════════════════════════════════════════════════════════════════════
--
-- participacion_id: c46767cf-74fd-4e03-9e39-5c5773319f20
-- organizador_id:   e724de97-3552-4a01-a269-f621e6f1ed26
--
-- Ejecuta el script ENTERO de una vez (no solo el DIFF).
-- 1ª corrida: ROLLBACK (default) → revisa BEFORE / AFTER / DIFF
-- 2ª corrida si DIFF OK: COMMIT
--
-- Nota: no usamos TEMP … ON COMMIT DROP (el SQL Editor hace commit
-- por statement y la tabla desaparecía → error 42P01).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- BEFORE
SELECT
  'BEFORE' AS fase,
  jp.id AS participacion_id,
  jp.jugador_id,
  rj.nombre AS jugador_nombre,
  jp.tipo_evento::text AS tipo_evento,
  jp.evento_id,
  jp.evento_nombre,
  jp.puntos_obtenidos,
  jp.metadata AS metadata_completo,
  jp.metadata->>'organizador_id' AS metadata_organizador_id,
  l.id AS ledger_id,
  l.points AS ledger_points,
  l.source_organizer_id AS ledger_source_organizer_id
FROM public.jugador_participaciones jp
LEFT JOIN public.riviera_official_points_ledger l
  ON l.participacion_id = jp.id
LEFT JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
WHERE jp.id = 'c46767cf-74fd-4e03-9e39-5c5773319f20';

-- Snapshot BEFORE en tabla TEMP de sesión (sobrevive commits intermedios)
DROP TABLE IF EXISTS pg_temp._marco_repair_before;
CREATE TEMP TABLE _marco_repair_before AS
SELECT
  jp.id,
  jp.jugador_id,
  jp.tipo_evento,
  jp.evento_id,
  jp.evento_nombre,
  jp.puntos_obtenidos,
  jp.metadata AS metadata_before,
  jp.metadata->>'organizador_id' AS organizador_id_before,
  l.id AS ledger_id,
  l.points AS ledger_points,
  l.source_organizer_id AS ledger_source_organizer_id
FROM public.jugador_participaciones jp
LEFT JOIN public.riviera_official_points_ledger l
  ON l.participacion_id = jp.id
WHERE jp.id = 'c46767cf-74fd-4e03-9e39-5c5773319f20';

-- UPDATE: únicamente metadata.organizador_id
UPDATE public.jugador_participaciones jp
SET metadata = jsonb_set(
  COALESCE(jp.metadata, '{}'::jsonb),
  '{organizador_id}',
  to_jsonb('e724de97-3552-4a01-a269-f621e6f1ed26'::text),
  true
)
WHERE jp.id = 'c46767cf-74fd-4e03-9e39-5c5773319f20'
  AND (
    NULLIF(trim(COALESCE(jp.metadata->>'organizador_id', '')), '') IS NULL
    OR trim(jp.metadata->>'organizador_id')
         IS DISTINCT FROM 'e724de97-3552-4a01-a269-f621e6f1ed26'
  );

-- AFTER
SELECT
  'AFTER' AS fase,
  jp.id AS participacion_id,
  jp.jugador_id,
  rj.nombre AS jugador_nombre,
  jp.tipo_evento::text AS tipo_evento,
  jp.evento_id,
  jp.evento_nombre,
  jp.puntos_obtenidos,
  jp.metadata AS metadata_completo,
  jp.metadata->>'organizador_id' AS metadata_organizador_id,
  l.id AS ledger_id,
  l.points AS ledger_points,
  l.source_organizer_id AS ledger_source_organizer_id
FROM public.jugador_participaciones jp
LEFT JOIN public.riviera_official_points_ledger l
  ON l.participacion_id = jp.id
LEFT JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
WHERE jp.id = 'c46767cf-74fd-4e03-9e39-5c5773319f20';

-- DIFF (esperado: solo organizador_id)
SELECT
  'DIFF' AS fase,
  b.organizador_id_before,
  jp.metadata->>'organizador_id' AS organizador_id_after,
  (b.organizador_id_before IS DISTINCT FROM (jp.metadata->>'organizador_id'))
    AS organizador_id_cambio,
  (b.puntos_obtenidos IS NOT DISTINCT FROM jp.puntos_obtenidos)
    AS puntos_iguales,
  (b.jugador_id IS NOT DISTINCT FROM jp.jugador_id) AS jugador_igual,
  (b.tipo_evento IS NOT DISTINCT FROM jp.tipo_evento) AS tipo_evento_igual,
  (b.evento_id IS NOT DISTINCT FROM jp.evento_id) AS evento_id_igual,
  (b.evento_nombre IS NOT DISTINCT FROM jp.evento_nombre) AS evento_nombre_igual,
  (b.ledger_id IS NOT DISTINCT FROM l.id) AS ledger_id_igual,
  (b.ledger_points IS NOT DISTINCT FROM l.points) AS ledger_points_igual,
  (b.ledger_source_organizer_id IS NOT DISTINCT FROM l.source_organizer_id)
    AS ledger_source_igual,
  (
    (COALESCE(b.metadata_before, '{}'::jsonb) - 'organizador_id')
    IS NOT DISTINCT FROM
    (COALESCE(jp.metadata, '{}'::jsonb) - 'organizador_id')
  ) AS resto_metadata_igual,
  jp.metadata->>'organizador_id'
    = 'e724de97-3552-4a01-a269-f621e6f1ed26' AS organizador_id_esperado
FROM public.jugador_participaciones jp
INNER JOIN pg_temp._marco_repair_before b ON b.id = jp.id
LEFT JOIN public.riviera_official_points_ledger l
  ON l.participacion_id = jp.id
WHERE jp.id = 'c46767cf-74fd-4e03-9e39-5c5773319f20';

DROP TABLE IF EXISTS pg_temp._marco_repair_before;

-- 1ª corrida: ROLLBACK | 2ª (si DIFF OK): COMMIT
ROLLBACK;
-- COMMIT;
