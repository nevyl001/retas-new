-- ═══════════════════════════════════════════════════════════════════════════
-- BACKUP — solo las 3 participaciones Test interclubes (lista explícita)
-- NO borra. NO usa BEGIN/ROLLBACK. NO incluye a Marco.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1) Corre list-test-interclubes-delete-candidates.sql
-- 2) Pega el ARRAY de 3 UUIDs en v_ids
-- 3) Ejecuta este script
-- 4) Guarda el NOTICE (nombres de tablas backup)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_marco uuid := 'c46767cf-74fd-4e03-9e39-5c5773319f20';

  -- >>> PEGAR LOS 3 participacion_id del list-…sql (pegar_en_v_ids) <<<
  v_ids uuid[] := ARRAY[
    -- 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    -- 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    -- 'cccccccc-cccc-cccc-cccc-cccccccccccc'
  ]::uuid[];

  v_suffix text := to_char(now() AT TIME ZONE 'utc', 'YYYYMMDD_HH24MISS');
  v_jp_backup text := 'jugador_participaciones_orphan_backup_' || v_suffix;
  v_ledger_backup text := 'riviera_official_points_ledger_orphan_backup_' || v_suffix;
  v_jp_count integer := 0;
  v_ledger_count integer := 0;
  v_marco_hit integer := 0;
BEGIN
  IF cardinality(v_ids) IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION
      'v_ids debe tener exactamente 3 UUIDs. Ahora: %. Usa list-test-interclubes-delete-candidates.sql',
      COALESCE(cardinality(v_ids), 0);
  END IF;

  IF v_marco = ANY (v_ids) THEN
    RAISE EXCEPTION 'ABORT: v_ids incluye a Marco (%). No respaldar/borrar.', v_marco;
  END IF;

  SELECT COUNT(*) INTO v_jp_count
  FROM public.jugador_participaciones
  WHERE id = ANY (v_ids);

  IF v_jp_count IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'ABORT: en vivo hay % de las 3 participaciones (esperado 3).', v_jp_count;
  END IF;

  SELECT COUNT(*) INTO v_ledger_count
  FROM public.riviera_official_points_ledger
  WHERE participacion_id = ANY (v_ids);

  IF v_ledger_count IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'ABORT: en vivo hay % filas ledger (esperado 3).', v_ledger_count;
  END IF;

  EXECUTE format(
    'CREATE TABLE public.%I AS
       SELECT * FROM public.jugador_participaciones WHERE id = ANY ($1)',
    v_jp_backup
  ) USING v_ids;

  EXECUTE format(
    'CREATE TABLE public.%I AS
       SELECT * FROM public.riviera_official_points_ledger
       WHERE participacion_id = ANY ($1)',
    v_ledger_backup
  ) USING v_ids;

  EXECUTE format('SELECT COUNT(*) FROM public.%I', v_jp_backup) INTO v_jp_count;
  EXECUTE format('SELECT COUNT(*) FROM public.%I', v_ledger_backup)
    INTO v_ledger_count;

  IF v_jp_count IS DISTINCT FROM 3 OR v_ledger_count IS DISTINCT FROM 3 THEN
    EXECUTE format('DROP TABLE IF EXISTS public.%I', v_jp_backup);
    EXECUTE format('DROP TABLE IF EXISTS public.%I', v_ledger_backup);
    RAISE EXCEPTION
      'ABORT: backup inconsistente jp=% ledger=% — tablas droppeadas.',
      v_jp_count, v_ledger_count;
  END IF;

  EXECUTE format(
    'SELECT COUNT(*) FROM public.%I WHERE id = $1',
    v_jp_backup
  ) INTO v_marco_hit USING v_marco;

  IF v_marco_hit > 0 THEN
    EXECUTE format('DROP TABLE IF EXISTS public.%I', v_jp_backup);
    EXECUTE format('DROP TABLE IF EXISTS public.%I', v_ledger_backup);
    RAISE EXCEPTION 'ABORT: backup contenía a Marco — tablas droppeadas.';
  END IF;

  RAISE NOTICE
    'BACKUP OK — jp_backup=% (3)  ledger_backup=% (3). Copia estos nombres al delete.',
    v_jp_backup, v_ledger_backup;
END $$;
