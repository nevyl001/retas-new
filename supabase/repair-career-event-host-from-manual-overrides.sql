-- Repair controlado: metadata host desde career_event_host_manual_overrides.
--
-- FUENTE ÚNICA: public.career_event_host_manual_overrides
-- DESTINO ÚNICO: public.jugador_participaciones.metadata (merge jsonb)
--
-- NO toca: puntos, rating, ranking_point_events, jugadores, riviera_id,
--          eventos padre, profile links, historial, results.
--
-- PREREQUISITOS:
--   1) career-event-host-manual-overrides.sql
--   2) seed / overrides aprobados en prod
--   3) diagnose-historical-orphan-parent-participaciones.sql (solo para VALIDATE post)
--
-- TIPOS (prod):
--   jp.tipo_evento  → enum jugador_tipo_evento  → cast ::text al join
--   o.tipo_evento   → text
--   jp.evento_id    → uuid                       → trim(jp.evento_id::text)
--   o.evento_id     → text
--
-- ═══════════════════════════════════════════════════════════════════════════
-- FLUJO EN SQL EDITOR
-- ═══════════════════════════════════════════════════════════════════════════
--   1) Ejecutar PREVIEW (sección A) — revisar WILL_UPDATE ≈ 31
--   2) BEGIN;
--   3) Ejecutar UPDATE (sección B)
--   4) Ejecutar VALIDATE (sección C) — OK_OVERRIDE_APPLIED ≈ 31, READY = 0
--   5) Si cuadra: COMMIT;   si no: ROLLBACK;
--
-- IMPORTANTE: PREVIEW fuera de transacción es seguro (solo lectura).
--             UPDATE + VALIDATE deben ir dentro del mismo BEGIN … COMMIT.

-- ── Gate: tabla y overrides ────────────────────────────────────────────────
SELECT
  COUNT(*)::integer AS override_rows,
  COUNT(DISTINCT (tipo_evento, evento_id))::integer AS override_events
FROM public.career_event_host_manual_overrides;

-- ═══════════════════════════════════════════════════════════════════════════
-- A) PREVIEW — solo lectura (ejecutar antes del BEGIN)
-- ═══════════════════════════════════════════════════════════════════════════
WITH scoped AS (
  SELECT
    jp.id AS participacion_id,
    jp.tipo_evento,
    jp.evento_id,
    jp.evento_nombre,
    jp.jugador_id,
    jp.puntos_obtenidos,
    COALESCE(jp.metadata, '{}'::jsonb) AS metadata,
    NULLIF(trim(jp.metadata->>'organizador_id'), '') AS metadata_org_actual,
    NULLIF(trim(jp.metadata->>'club_name'), '') AS metadata_club_actual,
    o.id AS override_id,
    o.organizador_id AS override_organizador_id,
    o.club_name AS override_club_name,
    to_char(o.approved_at AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      AS override_approved_at_iso
  FROM public.jugador_participaciones jp
  INNER JOIN public.career_event_host_manual_overrides o
    ON o.tipo_evento = jp.tipo_evento::text
   AND o.evento_id = trim(jp.evento_id::text)
),
classified AS (
  SELECT
    s.*,
    CASE
      WHEN COALESCE(s.puntos_obtenidos, 0) <= 0
        THEN 'SKIP'
      WHEN s.metadata_org_actual = s.override_organizador_id::text
       AND s.metadata_club_actual = s.override_club_name
       AND COALESCE(s.metadata->>'repaired_from_orphan_parent', '') = 'true'
       AND COALESCE(s.metadata->>'repair_reason', '') = 'manual_override_parent_deleted'
       AND COALESCE(s.metadata->>'integrity_status', '') = 'repaired_orphan_parent'
       AND COALESCE(s.metadata->>'repair_required', '') = 'false'
       AND COALESCE(s.metadata->>'manual_override_id', '') = s.override_id::text
       AND COALESCE(s.metadata->>'manual_override_approved_at', '') = s.override_approved_at_iso
        THEN 'ALREADY_OK'
      WHEN s.metadata_org_actual IS DISTINCT FROM s.override_organizador_id::text
        OR s.metadata_club_actual IS DISTINCT FROM s.override_club_name
        THEN 'WILL_UPDATE'
      ELSE 'WILL_UPDATE'
    END AS action
  FROM scoped s
)
SELECT
  participacion_id,
  tipo_evento,
  evento_id,
  evento_nombre,
  jugador_id,
  puntos_obtenidos,
  metadata_org_actual,
  metadata_club_actual,
  override_organizador_id,
  override_club_name,
  override_id,
  action
FROM classified
ORDER BY evento_nombre, participacion_id;

SELECT action, COUNT(*)::integer AS filas
FROM (
  WITH scoped AS (
    SELECT
      jp.puntos_obtenidos,
      COALESCE(jp.metadata, '{}'::jsonb) AS metadata,
      NULLIF(trim(jp.metadata->>'organizador_id'), '') AS metadata_org_actual,
      NULLIF(trim(jp.metadata->>'club_name'), '') AS metadata_club_actual,
      o.id AS override_id,
      o.organizador_id AS override_organizador_id,
      o.club_name AS override_club_name,
      to_char(o.approved_at AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
        AS override_approved_at_iso
    FROM public.jugador_participaciones jp
    INNER JOIN public.career_event_host_manual_overrides o
      ON o.tipo_evento = jp.tipo_evento::text
     AND o.evento_id = trim(jp.evento_id::text)
  )
  SELECT
    CASE
      WHEN COALESCE(puntos_obtenidos, 0) <= 0 THEN 'SKIP'
      WHEN metadata_org_actual = override_organizador_id::text
       AND metadata_club_actual = override_club_name
       AND COALESCE(metadata->>'repaired_from_orphan_parent', '') = 'true'
       AND COALESCE(metadata->>'repair_reason', '') = 'manual_override_parent_deleted'
       AND COALESCE(metadata->>'integrity_status', '') = 'repaired_orphan_parent'
       AND COALESCE(metadata->>'repair_required', '') = 'false'
       AND COALESCE(metadata->>'manual_override_id', '') = override_id::text
       AND COALESCE(metadata->>'manual_override_approved_at', '') = override_approved_at_iso
        THEN 'ALREADY_OK'
      ELSE 'WILL_UPDATE'
    END AS action
  FROM scoped
) preview_counts
GROUP BY action
ORDER BY action;

-- ═══════════════════════════════════════════════════════════════════════════
-- B) UPDATE — ejecutar dentro de BEGIN … COMMIT
-- ═══════════════════════════════════════════════════════════════════════════
/*
BEGIN;

WITH scoped AS (
  SELECT
    jp.id AS participacion_id,
    jp.puntos_obtenidos,
    COALESCE(jp.metadata, '{}'::jsonb) AS metadata,
    NULLIF(trim(jp.metadata->>'organizador_id'), '') AS metadata_org_actual,
    NULLIF(trim(jp.metadata->>'club_name'), '') AS metadata_club_actual,
    o.id AS override_id,
    o.organizador_id AS override_organizador_id,
    o.club_name AS override_club_name,
    o.approved_at,
    to_char(o.approved_at AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      AS override_approved_at_iso
  FROM public.jugador_participaciones jp
  INNER JOIN public.career_event_host_manual_overrides o
    ON o.tipo_evento = jp.tipo_evento::text
   AND o.evento_id = trim(jp.evento_id::text)
),
classified AS (
  SELECT
    s.*,
    CASE
      WHEN COALESCE(s.puntos_obtenidos, 0) <= 0
        THEN 'SKIP'
      WHEN s.metadata_org_actual = s.override_organizador_id::text
       AND s.metadata_club_actual = s.override_club_name
       AND COALESCE(s.metadata->>'repaired_from_orphan_parent', '') = 'true'
       AND COALESCE(s.metadata->>'repair_reason', '') = 'manual_override_parent_deleted'
       AND COALESCE(s.metadata->>'integrity_status', '') = 'repaired_orphan_parent'
       AND COALESCE(s.metadata->>'repair_required', '') = 'false'
       AND COALESCE(s.metadata->>'manual_override_id', '') = s.override_id::text
       AND COALESCE(s.metadata->>'manual_override_approved_at', '') = s.override_approved_at_iso
        THEN 'ALREADY_OK'
      ELSE 'WILL_UPDATE'
    END AS action
  FROM scoped s
),
target AS MATERIALIZED (
  SELECT
    participacion_id,
    override_id,
    override_organizador_id AS organizador_id,
    override_club_name AS club_name,
    approved_at
  FROM classified
  WHERE action = 'WILL_UPDATE'
)
UPDATE public.jugador_participaciones jp
SET metadata = COALESCE(jp.metadata, '{}'::jsonb)
  || jsonb_build_object(
    'organizador_id', t.organizador_id::text,
    'club_name', t.club_name,
    'repaired_from_orphan_parent', true,
    'repair_reason', 'manual_override_parent_deleted',
    'integrity_status', 'repaired_orphan_parent',
    'repair_required', false,
    'manual_override_id', t.override_id::text,
    'manual_override_approved_at',
      to_char(t.approved_at AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )
FROM target t
WHERE jp.id = t.participacion_id
RETURNING
  jp.id AS participacion_id,
  jp.evento_nombre,
  jp.tipo_evento,
  jp.evento_id,
  jp.jugador_id,
  jp.puntos_obtenidos,
  jp.metadata->>'organizador_id' AS new_organizador_id,
  jp.metadata->>'club_name' AS new_club_name;

-- Filas devueltas por RETURNING (debe ser ~31 la primera vez, 0 la segunda)

-- ═══════════════════════════════════════════════════════════════════════════
-- C) VALIDATE — misma transacción, antes del COMMIT
-- ═══════════════════════════════════════════════════════════════════════════

-- C1) Diagnóstico histórico (vista ya desplegada)
SELECT
  suggested_action,
  COUNT(*)::integer AS filas,
  COALESCE(SUM(puntos_obtenidos), 0) AS puntos
FROM public._historical_orphan_parent_participaciones
WHERE has_manual_override
GROUP BY suggested_action
ORDER BY suggested_action;

-- Esperado post-repair:
--   OK_OVERRIDE_APPLIED = 31
--   READY_MANUAL_OVERRIDE = 0

SELECT COUNT(*)::integer AS ok_override_applied
FROM public._historical_orphan_parent_participaciones
WHERE suggested_action = 'OK_OVERRIDE_APPLIED'
  AND has_manual_override;

SELECT COUNT(*)::integer AS ready_manual_override_remaining
FROM public._historical_orphan_parent_participaciones
WHERE suggested_action = 'READY_MANUAL_OVERRIDE';

-- C2) Participaciones en scope override sin metadata host (debe ser 0)
SELECT COUNT(*)::integer AS sin_metadata_organizador
FROM public.jugador_participaciones jp
INNER JOIN public.career_event_host_manual_overrides o
  ON o.tipo_evento = jp.tipo_evento::text
 AND o.evento_id = trim(jp.evento_id::text)
WHERE COALESCE(jp.puntos_obtenidos, 0) > 0
  AND NULLIF(trim(jp.metadata->>'organizador_id'), '') IS NULL;

SELECT COUNT(*)::integer AS sin_metadata_club_name
FROM public.jugador_participaciones jp
INNER JOIN public.career_event_host_manual_overrides o
  ON o.tipo_evento = jp.tipo_evento::text
 AND o.evento_id = trim(jp.evento_id::text)
WHERE COALESCE(jp.puntos_obtenidos, 0) > 0
  AND NULLIF(trim(jp.metadata->>'club_name'), '') IS NULL;

-- C3) Desglose por evento
SELECT
  o.tipo_evento,
  o.evento_id,
  o.evento_nombre,
  COUNT(jp.id)::integer AS participaciones,
  COUNT(*) FILTER (
    WHERE NULLIF(trim(jp.metadata->>'organizador_id'), '') = o.organizador_id::text
      AND NULLIF(trim(jp.metadata->>'club_name'), '') = o.club_name
      AND jp.metadata->>'repaired_from_orphan_parent' = 'true'
      AND jp.metadata->>'repair_reason' = 'manual_override_parent_deleted'
  )::integer AS metadata_ok
FROM public.career_event_host_manual_overrides o
LEFT JOIN public.jugador_participaciones jp
  ON o.tipo_evento = jp.tipo_evento::text
 AND o.evento_id = trim(jp.evento_id::text)
 AND COALESCE(jp.puntos_obtenidos, 0) > 0
GROUP BY o.tipo_evento, o.evento_id, o.evento_nombre, o.organizador_id
ORDER BY o.evento_nombre, o.evento_id;

-- Si VALIDATE cuadra:
COMMIT;

-- Si algo no cuadra (READY > 0, sin org > 0, metadata_ok < participaciones):
-- ROLLBACK;
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- D) Idempotencia — segunda ejecución (fuera de transacción, post-COMMIT)
-- ═══════════════════════════════════════════════════════════════════════════
-- Repetir PREVIEW (sección A): todas las filas deben ser ALREADY_OK.
-- Repetir UPDATE dentro de BEGIN: ROW_COUNT = 0.
-- VALIDATE: mismos conteos; OK_OVERRIDE_APPLIED = 31.
