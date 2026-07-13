-- ═══════════════════════════════════════════════════════════════════════════
-- DELETE — solo las 3 participaciones Test interclubes (lista explícita)
-- DESTRUCTIVO. BEGIN + ROLLBACK por defecto. DELETE comentado.
-- NO toca Marco ni otras huérfanas.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Prerrequisito: backup-…sql con NOTICE de tablas.
-- Edita: v_ids (mismos 3), v_jp_backup, v_ledger_backup.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  v_marco uuid := 'c46767cf-74fd-4e03-9e39-5c5773319f20';

  -- >>> Mismos 3 UUIDs del backup <<<
  v_ids uuid[] := ARRAY[
    -- 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    -- 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    -- 'cccccccc-cccc-cccc-cccc-cccccccccccc'
  ]::uuid[];

  -- >>> Nombres del NOTICE del backup <<<
  v_jp_backup text := 'jugador_participaciones_orphan_backup_YYYYMMDD_HHMMSS';
  v_ledger_backup text := 'riviera_official_points_ledger_orphan_backup_YYYYMMDD_HHMMSS';

  v_jp_backup_count integer := 0;
  v_ledger_backup_count integer := 0;
  v_match integer := 0;
  v_del_ledger integer := 0;
  v_del_jp integer := 0;
BEGIN
  IF cardinality(v_ids) IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'v_ids debe tener exactamente 3 UUIDs. Ahora: %',
      COALESCE(cardinality(v_ids), 0);
  END IF;

  IF v_marco = ANY (v_ids) THEN
    RAISE EXCEPTION 'ABORT: v_ids incluye a Marco (%).', v_marco;
  END IF;

  IF v_jp_backup LIKE '%YYYYMMDD%' OR v_ledger_backup LIKE '%YYYYMMDD%' THEN
    RAISE EXCEPTION 'Edita v_jp_backup y v_ledger_backup con los nombres reales del backup.';
  END IF;

  IF to_regclass(format('public.%I', v_jp_backup)) IS NULL THEN
    RAISE EXCEPTION 'No existe %', v_jp_backup;
  END IF;
  IF to_regclass(format('public.%I', v_ledger_backup)) IS NULL THEN
    RAISE EXCEPTION 'No existe %', v_ledger_backup;
  END IF;

  EXECUTE format('SELECT COUNT(*) FROM public.%I', v_jp_backup)
    INTO v_jp_backup_count;
  EXECUTE format('SELECT COUNT(*) FROM public.%I', v_ledger_backup)
    INTO v_ledger_backup_count;

  IF v_jp_backup_count IS DISTINCT FROM 3
     OR v_ledger_backup_count IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION
      'ABORT: backup debe ser 3+3. jp_backup=% ledger_backup=%',
      v_jp_backup_count, v_ledger_backup_count;
  END IF;

  EXECUTE format(
    'SELECT COUNT(*) FROM public.%I WHERE id = ANY ($1)',
    v_jp_backup
  ) INTO v_match USING v_ids;

  IF v_match IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION
      'ABORT: v_ids no coincide exactamente con backup jp (match=%).', v_match;
  END IF;

  EXECUTE format(
    'SELECT COUNT(*) FROM public.%I WHERE participacion_id = ANY ($1)',
    v_ledger_backup
  ) INTO v_match USING v_ids;

  IF v_match IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION
      'ABORT: v_ids no coincide exactamente con backup ledger (match=%).', v_match;
  END IF;

  EXECUTE format(
    'SELECT COUNT(*) FROM public.%I WHERE id = $1',
    v_jp_backup
  ) INTO v_match USING v_marco;

  IF v_match > 0 THEN
    RAISE EXCEPTION 'ABORT: backup jp contiene a Marco.';
  END IF;

  RAISE NOTICE
    'PREVIEW OK — borraría 3 ledger + 3 jp. DELETE comentado; tx en ROLLBACK.';

  -- >>> DESTRUCTIVO: descomentar solo tras PREVIEW OK <<<
  -- Orden: ledger primero (ON DELETE RESTRICT), luego participaciones.
  /*
  DELETE FROM public.riviera_official_points_ledger
  WHERE participacion_id = ANY (v_ids);
  GET DIAGNOSTICS v_del_ledger = ROW_COUNT;

  DELETE FROM public.jugador_participaciones
  WHERE id = ANY (v_ids);
  GET DIAGNOSTICS v_del_jp = ROW_COUNT;

  IF v_del_ledger IS DISTINCT FROM 3 OR v_del_jp IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION
      'DELETE inesperado ledger=% jp=% — haz ROLLBACK de la tx exterior.',
      v_del_ledger, v_del_jp;
  END IF;

  RAISE NOTICE 'DELETE aplicado ledger=% jp=%', v_del_ledger, v_del_jp;
  */
END $$;

-- Verificación dentro de la misma tx (si descomentaste DELETE):
SELECT
  (SELECT COUNT(*) FROM public.jugador_participaciones
   WHERE evento_nombre ILIKE '%Test interclubes%') AS test_jp_restantes,
  (SELECT COUNT(*) FROM public.riviera_official_points_ledger
   WHERE event_name ILIKE '%Test interclubes%') AS test_ledger_restantes,
  (SELECT metadata->>'organizador_id'
   FROM public.jugador_participaciones
   WHERE id = 'c46767cf-74fd-4e03-9e39-5c5773319f20') AS marco_organizador_id;

-- 1ª corrida (DELETE comentado): ROLLBACK
-- Cuando DELETE esté descomentado y conteos = 0 / Marco OK: COMMIT
ROLLBACK;
-- COMMIT;
