-- ═══════════════════════════════════════════════════════════════════════════
-- DELETE — 30 huérfanas históricas desde backup (DESTRUCTIVO)
-- Usa EXCLUSIVAMENTE la tabla de backup del paso anterior.
-- No recalcula candidatas por regla general en el DELETE.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- PREREQUISITO: ya corriste backup-historical-orphans-no-parent-no-ledger-20260713.sql
-- y copiaste el NOTICE (o el SELECT final backup_table).
--
-- 1) Edita SOLO v_backup abajo con ese nombre real.
-- 2) Ejecuta con ROLLBACK (default) y revisa SELECT * FROM _hist_orphan_verify.
-- 3) Si cuadra: cambia a COMMIT.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  v_marco uuid := 'c46767cf-74fd-4e03-9e39-5c5773319f20';
  -- >>> PEGAR NOMBRE REAL DEL BACKUP (una sola edición) <<<
  -- Ejemplo: 'jugador_participaciones_historical_orphan_backup_20260713_162944'
  v_backup text := 'jugador_participaciones_historical_orphan_backup_20260713_16253';
  v_backup_n integer := 0;
  v_marco_hit integer := 0;
  v_ledger_hit integer := 0;
  v_live_n integer := 0;
  v_del integer := 0;
  v_alive_after integer := 0;
  v_orphan_after integer := 0;
  v_marco_alive integer := 0;
  v_marco_org text;
BEGIN
  IF v_backup LIKE '%YYYYMMDD%' OR v_backup LIKE '%HHMMSS%' THEN
    RAISE EXCEPTION
      'Edita v_backup con el nombre real del NOTICE. '
      'Si aún no tienes backup, ejecuta primero '
      'backup-historical-orphans-no-parent-no-ledger-20260713.sql '
      'y copia el nombre de la tabla (SELECT final backup_table).';
  END IF;

  IF to_regclass(format('public.%I', v_backup)) IS NULL THEN
    RAISE EXCEPTION 'No existe backup: %. ¿Corriste el script de backup?', v_backup;
  END IF;

  EXECUTE format('SELECT COUNT(*) FROM public.%I', v_backup) INTO v_backup_n;
  IF v_backup_n IS DISTINCT FROM 30 THEN
    RAISE EXCEPTION 'ABORT: backup debe tener 30 filas; tiene %', v_backup_n;
  END IF;

  EXECUTE format(
    'SELECT COUNT(*) FROM public.%I WHERE id = $1',
    v_backup
  ) INTO v_marco_hit USING v_marco;
  IF v_marco_hit > 0 THEN
    RAISE EXCEPTION 'ABORT: backup incluye a Marco (%)', v_marco;
  END IF;

  EXECUTE format(
    'SELECT COUNT(*) FROM public.riviera_official_points_ledger l
     INNER JOIN public.%I b ON b.id = l.participacion_id',
    v_backup
  ) INTO v_ledger_hit;
  IF v_ledger_hit > 0 THEN
    RAISE EXCEPTION
      'ABORT: % IDs del backup tienen ledger — no borrar este set.', v_ledger_hit;
  END IF;

  EXECUTE format(
    'SELECT COUNT(*) FROM public.jugador_participaciones jp
     INNER JOIN public.%I b ON b.id = jp.id',
    v_backup
  ) INTO v_live_n;
  IF v_live_n IS DISTINCT FROM 30 THEN
    RAISE EXCEPTION
      'ABORT: se esperaban 30 IDs vivos del backup; hay %',
      v_live_n;
  END IF;

  -- DELETE solo por IDs del backup
  EXECUTE format(
    'DELETE FROM public.jugador_participaciones jp
     WHERE jp.id IN (SELECT b.id FROM public.%I b)',
    v_backup
  );
  GET DIAGNOSTICS v_del = ROW_COUNT;

  IF v_del IS DISTINCT FROM 30 THEN
    RAISE EXCEPTION
      'ABORT: DELETE afectó % filas (esperado 30)',
      v_del;
  END IF;

  EXECUTE format(
    'SELECT COUNT(*) FROM public.jugador_participaciones jp
     INNER JOIN public.%I b ON b.id = jp.id',
    v_backup
  ) INTO v_alive_after;

  IF v_alive_after IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION
      'ABORT: tras DELETE quedan % IDs del backup en vivo', v_alive_after;
  END IF;

  SELECT COUNT(*) INTO v_marco_alive
  FROM public.jugador_participaciones WHERE id = v_marco;
  IF v_marco_alive IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'ABORT: Marco no está intacto (count=%)', v_marco_alive;
  END IF;

  SELECT metadata->>'organizador_id' INTO v_marco_org
  FROM public.jugador_participaciones WHERE id = v_marco;

  SELECT COUNT(*) INTO v_orphan_after
  FROM public.jugador_participaciones jp
  WHERE NULLIF(trim(COALESCE(jp.metadata->>'organizador_id', '')), '') IS NULL;

  DROP TABLE IF EXISTS pg_temp._hist_orphan_verify;
  CREATE TEMP TABLE _hist_orphan_verify (
    backup_name text,
    backup_rows integer,
    backup_ids_aun_en_vivo integer,
    orphan_total_restante integer,
    marco_sigue_existiendo integer,
    marco_organizador_id text,
    deleted_rows integer
  );
  INSERT INTO _hist_orphan_verify VALUES (
    v_backup,
    v_backup_n,
    v_alive_after,
    v_orphan_after,
    v_marco_alive,
    v_marco_org,
    v_del
  );

  RAISE NOTICE 'DELETE OK — 30 filas. Revisa SELECT * FROM _hist_orphan_verify';
END $$;

SELECT * FROM _hist_orphan_verify;
-- Esperado:
--   backup_rows = 30
--   backup_ids_aun_en_vivo = 0
--   marco_sigue_existiendo = 1
--   marco_organizador_id = e724de97-3552-4a01-a269-f621e6f1ed26
--   deleted_rows = 30

ROLLBACK;
-- COMMIT;
