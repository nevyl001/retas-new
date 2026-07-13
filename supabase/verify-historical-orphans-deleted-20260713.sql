-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY — 30 huérfanas históricas eliminadas (SOLO LECTURA)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Edita v_backup abajo con el nombre real del backup, luego ejecuta.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  -- >>> MISMO NOMBRE QUE EN EL DELETE / NOTICE DEL BACKUP <<<
  v_backup text := 'jugador_participaciones_historical_orphan_backup_YYYYMMDD_HHMMSS';
  v_marco uuid := 'c46767cf-74fd-4e03-9e39-5c5773319f20';
  v_backup_n integer := 0;
  v_alive integer := 0;
  v_ledger integer := 0;
  v_marco_n integer := 0;
  v_marco_org text;
  v_orphan integer := 0;
  v_pass boolean := false;
BEGIN
  IF v_backup LIKE '%YYYYMMDD%' THEN
    RAISE EXCEPTION 'Edita v_backup con el nombre real del backup.';
  END IF;
  IF to_regclass(format('public.%I', v_backup)) IS NULL THEN
    RAISE EXCEPTION 'No existe backup: %', v_backup;
  END IF;

  EXECUTE format('SELECT COUNT(*) FROM public.%I', v_backup) INTO v_backup_n;

  EXECUTE format(
    'SELECT COUNT(*) FROM public.jugador_participaciones jp
     INNER JOIN public.%I b ON b.id = jp.id',
    v_backup
  ) INTO v_alive;

  EXECUTE format(
    'SELECT COUNT(*) FROM public.riviera_official_points_ledger l
     INNER JOIN public.%I b ON b.id = l.participacion_id',
    v_backup
  ) INTO v_ledger;

  SELECT COUNT(*) INTO v_marco_n
  FROM public.jugador_participaciones WHERE id = v_marco;

  SELECT metadata->>'organizador_id' INTO v_marco_org
  FROM public.jugador_participaciones WHERE id = v_marco;

  SELECT COUNT(*) INTO v_orphan
  FROM public.jugador_participaciones jp
  WHERE NULLIF(trim(COALESCE(jp.metadata->>'organizador_id', '')), '') IS NULL;

  v_pass :=
    v_backup_n = 30
    AND v_alive = 0
    AND v_ledger = 0
    AND v_marco_n = 1
    AND v_marco_org = 'e724de97-3552-4a01-a269-f621e6f1ed26';

  DROP TABLE IF EXISTS pg_temp._hist_orphan_verify_final;
  CREATE TEMP TABLE _hist_orphan_verify_final AS
  SELECT
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END AS estado,
    v_backup AS backup_name,
    v_backup_n AS backup_rows_esperado_30,
    v_alive AS backup_ids_aun_en_vivo_esperado_0,
    v_ledger AS ledger_de_backup_ids_esperado_0,
    v_marco_n AS marco_sigue_existiendo_esperado_1,
    v_marco_org AS marco_organizador_id,
    v_orphan AS orphan_total_sin_metadata_organizador;

  RAISE NOTICE 'Veredicto en SELECT * FROM _hist_orphan_verify_final';
END $$;

SELECT * FROM _hist_orphan_verify_final;
