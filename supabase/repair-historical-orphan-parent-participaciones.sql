-- Reparación idempotente: deuda histórica — evento padre eliminado.
--
-- NO borra participaciones. NO modifica puntos, rating ni jugadores.
-- SOLO actualiza metadata (merge jsonb).
--
-- PREREQUISITOS (en orden):
--   1) riviera_participacion_expected_host_org (repair-career-event-host-organizer.sql)
--   2) diagnose-historical-orphan-parent-participaciones.sql
--   3) Este script
--
-- Opción A — host inferible: organizador_id + club_name + repaired_from_orphan_parent
-- Opción B — host NO inferible: integrity_status = orphan_parent_review

DO $$
BEGIN
  IF to_regclass('public._historical_orphan_parent_participaciones') IS NULL THEN
    RAISE EXCEPTION
      'Falta vista _historical_orphan_parent_participaciones — ejecutar diagnose-historical-orphan-parent-participaciones.sql primero';
  END IF;
END $$;

-- ── Opción A: host conocido ─────────────────────────────────────────────────
DO $$
DECLARE
  v_fixed_a integer := 0;
BEGIN
  UPDATE public.jugador_participaciones jp
  SET metadata = COALESCE(jp.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'organizador_id', t.inferred_organizador_id::text,
      'club_name', COALESCE(NULLIF(trim(t.inferred_club_name), ''), 'Hackpadel'),
      'repaired_from_orphan_parent', true,
      'repair_reason', 'parent_event_deleted_but_host_known',
      'integrity_status', 'repaired_orphan_parent',
      'repair_required', false,
      'repaired_at', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )
  FROM public._historical_orphan_parent_participaciones t
  WHERE jp.id = t.participacion_id
    AND t.repair_action = 'REPAIR_A'
    AND t.inferred_organizador_id IS NOT NULL
    AND COALESCE(jp.metadata->>'repaired_from_orphan_parent', '') IS DISTINCT FROM 'true';

  GET DIAGNOSTICS v_fixed_a = ROW_COUNT;
  RAISE NOTICE 'historical-orphan-parent repair A: % participaciones', v_fixed_a;
END $$;

-- ── Opción B: host desconocido — marcar REVIEW histórico ────────────────────
DO $$
DECLARE
  v_marked_b integer := 0;
BEGIN
  UPDATE public.jugador_participaciones jp
  SET metadata = COALESCE(jp.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'integrity_status', 'orphan_parent_review',
      'repair_required', true,
      'repair_reason', 'parent_event_deleted_host_unknown',
      'marked_at', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )
  FROM public._historical_orphan_parent_participaciones t
  WHERE jp.id = t.participacion_id
    AND t.repair_action = 'REPAIR_B'
    AND COALESCE(jp.metadata->>'integrity_status', '') IS DISTINCT FROM 'orphan_parent_review';

  GET DIAGNOSTICS v_marked_b = ROW_COUNT;
  RAISE NOTICE 'historical-orphan-parent repair B: % participaciones', v_marked_b;
END $$;

-- ── Validación post-repair ──────────────────────────────────────────────────

-- Participaciones con puntos sin metadata.organizador_id (debe bajar a 0 o solo REPAIR_B)
SELECT
  jp.id,
  jp.evento_nombre,
  jp.puntos_obtenidos,
  jp.metadata->>'integrity_status' AS integrity_status,
  jp.metadata->>'organizador_id' AS organizador_id
FROM public.jugador_participaciones jp
WHERE COALESCE(jp.puntos_obtenidos, 0) > 0
  AND (
    jp.metadata->>'organizador_id' IS NULL
    OR trim(jp.metadata->>'organizador_id') = ''
  )
  AND COALESCE(jp.metadata->>'integrity_status', '') <> 'orphan_parent_review'
ORDER BY jp.evento_nombre;

-- Padre ausente pero metadata OK (deuda cerrada — no error)
SELECT
  evento_nombre,
  tipo_evento,
  COUNT(*) AS filas,
  BOOL_OR(metadata_organizador_id <> '') AS any_have_org,
  BOOL_OR(integrity_status IN ('repaired_orphan_parent', 'orphan_parent_review')) AS any_marked
FROM public._historical_orphan_parent_participaciones
WHERE NOT parent_exists
GROUP BY evento_nombre, tipo_evento
ORDER BY evento_nombre;

NOTIFY pgrst, 'reload schema';
