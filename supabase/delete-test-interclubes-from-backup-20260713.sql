-- ═══════════════════════════════════════════════════════════════════════════
-- PRODUCCIÓN — DELETE Test interclubes desde backup existente
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Backup (ya creado):
--   public.jugador_participaciones_orphan_backup_20260713_160744
--   public.riviera_official_points_ledger_orphan_backup_20260713_160744
--
-- Qué hace:
--   1) Valida que cada backup tenga exactamente 3 filas
--   2) Valida que Marco (c46767cf-…) NO esté en el backup
--   3) Borra SOLO esas 3 filas de ledger (por participacion_id del backup)
--   4) Borra SOLO esas 3 participaciones (por id del backup)
--   5) Aborta la tx si algún DELETE ≠_COUNT ≠ 3
--   6) SELECT de verificación (Test interclubes = 0)
--   7) COMMIT
--
-- NO toca: Marco, otras huérfanas, career, rating, ranking, identidad.
-- NO ejecutes hasta revisar. Preferible dry-run: cambia COMMIT → ROLLBACK
--   la primera vez y mira el SELECT de verificación dentro de la tx.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  v_marco uuid := 'c46767cf-74fd-4e03-9e39-5c5773319f20';
  v_jp_backup text := 'jugador_participaciones_orphan_backup_20260713_160744';
  v_ledger_backup text := 'riviera_official_points_ledger_orphan_backup_20260713_160744';
  v_jp_n integer := 0;
  v_ledger_n integer := 0;
  v_marco_hit integer := 0;
  v_live_jp integer := 0;
  v_live_ledger integer := 0;
  v_del_ledger integer := 0;
  v_del_jp integer := 0;
BEGIN
  IF to_regclass(format('public.%I', v_jp_backup)) IS NULL THEN
    RAISE EXCEPTION 'No existe backup jp: %', v_jp_backup;
  END IF;
  IF to_regclass(format('public.%I', v_ledger_backup)) IS NULL THEN
    RAISE EXCEPTION 'No existe backup ledger: %', v_ledger_backup;
  END IF;

  EXECUTE format('SELECT COUNT(*) FROM public.%I', v_jp_backup) INTO v_jp_n;
  EXECUTE format('SELECT COUNT(*) FROM public.%I', v_ledger_backup) INTO v_ledger_n;

  IF v_jp_n IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'ABORT: backup jp debe tener 3 filas; tiene %', v_jp_n;
  END IF;
  IF v_ledger_n IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'ABORT: backup ledger debe tener 3 filas; tiene %', v_ledger_n;
  END IF;

  EXECUTE format(
    'SELECT COUNT(*) FROM public.%I WHERE id = $1',
    v_jp_backup
  ) INTO v_marco_hit USING v_marco;

  IF v_marco_hit > 0 THEN
    RAISE EXCEPTION 'ABORT: el backup jp incluye a Marco (%) — no borrar', v_marco;
  END IF;

  -- Las 3 del backup deben seguir vivas (si ya se borraron, abortar)
  EXECUTE format(
    'SELECT COUNT(*) FROM public.jugador_participaciones jp
     INNER JOIN public.%I b ON b.id = jp.id',
    v_jp_backup
  ) INTO v_live_jp;

  EXECUTE format(
    'SELECT COUNT(*) FROM public.riviera_official_points_ledger l
     INNER JOIN public.%I b ON b.id = l.participacion_id',
    v_jp_backup
  ) INTO v_live_ledger;

  IF v_live_jp IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION
      'ABORT: se esperaban 3 participaciones vivas del backup; hay %. ¿Ya se borraron?',
      v_live_jp;
  END IF;
  IF v_live_ledger IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION
      'ABORT: se esperaban 3 ledger vivos del backup; hay %',
      v_live_ledger;
  END IF;

  -- 1) Ledger primero (RESTRICT)
  EXECUTE format(
    'DELETE FROM public.riviera_official_points_ledger l
     USING public.%I b
     WHERE l.participacion_id = b.id',
    v_jp_backup
  );
  GET DIAGNOSTICS v_del_ledger = ROW_COUNT;

  IF v_del_ledger IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION
      'ABORT: DELETE ledger borró % filas (esperado 3) — ROLLBACK automático',
      v_del_ledger;
  END IF;

  -- 2) Participaciones
  EXECUTE format(
    'DELETE FROM public.jugador_participaciones jp
     USING public.%I b
     WHERE jp.id = b.id',
    v_jp_backup
  );
  GET DIAGNOSTICS v_del_jp = ROW_COUNT;

  IF v_del_jp IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION
      'ABORT: DELETE participaciones borró % filas (esperado 3) — ROLLBACK automático',
      v_del_jp;
  END IF;

  -- Guard: Marco intacto
  IF NOT EXISTS (
    SELECT 1 FROM public.jugador_participaciones
    WHERE id = v_marco
  ) THEN
    RAISE EXCEPTION 'ABORT: Marco desapareció — no debió tocarse';
  END IF;

  RAISE NOTICE 'DELETE OK — ledger=3 participaciones=3. Marco intacto.';
END $$;

-- Verificación (dentro de la misma tx, antes del COMMIT)
SELECT
  (SELECT COUNT(*) FROM public.jugador_participaciones
   WHERE evento_nombre ILIKE '%Test interclubes%') AS test_interclubes_jp_restantes,
  (SELECT COUNT(*) FROM public.riviera_official_points_ledger
   WHERE event_name ILIKE '%Test interclubes%') AS test_interclubes_ledger_restantes,
  (SELECT COUNT(*) FROM public.jugador_participaciones jp
   INNER JOIN public.jugador_participaciones_orphan_backup_20260713_160744 b
     ON b.id = jp.id) AS backup_ids_aun_en_vivo,
  (SELECT COUNT(*) FROM public.jugador_participaciones
   WHERE id = 'c46767cf-74fd-4e03-9e39-5c5773319f20') AS marco_sigue_existiendo,
  (SELECT metadata->>'organizador_id' FROM public.jugador_participaciones
   WHERE id = 'c46767cf-74fd-4e03-9e39-5c5773319f20') AS marco_organizador_id;

-- Esperado: 0, 0, 0, 1, e724de97-3552-4a01-a269-f621e6f1ed26
-- Si el SELECT no cuadra: cambia la línea siguiente a ROLLBACK y no confirmes.

COMMIT;
-- ROLLBACK;
