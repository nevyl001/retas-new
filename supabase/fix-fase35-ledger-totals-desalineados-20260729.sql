-- =============================================================================
-- FASE 3.5 -- saneamiento de datos: recalcula riviera_official_player_totals
-- desde la suma real de riviera_official_points_ledger para las 4 filas
-- donde divergían (auditoría de solo lectura 2026-07-29, ver
-- backup-fase35-ledger-totals-desalineados-20260729.sql).
--
-- Único hallazgo de esta ronda clasificado como AUTO-REPARABLE: es un
-- recálculo mecánico desde una fuente autoritativa (el ledger), sin
-- ambigüedad de intención y sin problema de encadenamiento (a diferencia
-- del rating, points_total es una suma agregada simple). No se pierde
-- información: el ledger en sí no se toca, solo el campo derivado.
--
-- Todo lo demás encontrado en la auditoría de saneamiento (participaciones/
-- rating_historial huérfanos de eventos ya eliminados) se clasificó como
-- REQUIERE DECISIÓN MANUAL y se documenta aparte, sin tocar en este archivo.
--
-- Idempotente: recalcular dos veces el mismo valor no cambia nada (UPDATE
-- con el mismo resultado es un no-op funcional). WHERE ... IS DISTINCT FROM
-- evita incluso escribir la fila si ya está correcta.
--
-- Rollback: rollback-fase35-ledger-totals-desalineados-20260729.sql
-- Verificación: verify-fase35-ledger-totals-desalineados-20260729.sql
-- =============================================================================

BEGIN;

UPDATE riviera_official_player_totals t
SET
  points_total = sub.suma_real,
  updated_at = now()
FROM (
  SELECT official_player_key, COALESCE(SUM(points), 0) AS suma_real
  FROM riviera_official_points_ledger
  GROUP BY official_player_key
) sub
WHERE t.official_player_key = sub.official_player_key
  AND t.points_total IS DISTINCT FROM sub.suma_real;

-- ── Verificación final dentro de la misma transacción ─────────────────────
DO $$
DECLARE
  v_desalineados int;
BEGIN
  SELECT count(*) INTO v_desalineados
  FROM riviera_official_player_totals t
  WHERE t.points_total <> (
    SELECT COALESCE(SUM(l.points), 0)
    FROM riviera_official_points_ledger l
    WHERE l.official_player_key = t.official_player_key
  );
  IF v_desalineados <> 0 THEN
    RAISE EXCEPTION 'Fix incompleto: % total(es) siguen desalineados del ledger', v_desalineados;
  END IF;
END $$;

-- Revisar el resultado con calma antes de aceptar. Cuando estés conforme:
--   COMMIT;
-- Si algo se ve mal:
--   ROLLBACK;
