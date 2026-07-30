-- =============================================================================
-- VERIFICACIÓN POST-FIX -- Fase 3.5 (totales de ledger recalculados)
-- =============================================================================

-- 1. Cero totales desalineados respecto al ledger real.
SELECT count(*) AS totales_desalineados
FROM riviera_official_player_totals t
WHERE t.points_total <> (
  SELECT COALESCE(SUM(l.points), 0)
  FROM riviera_official_points_ledger l
  WHERE l.official_player_key = t.official_player_key
);
-- esperado: 0

-- 2. Las 4 filas específicas quedaron en el valor correcto.
SELECT official_player_key, points_total
FROM riviera_official_player_totals
WHERE official_player_key IN (
  'de07b9b3-0e86-4fea-859a-7fed5196c06d',
  'ee340f5b-eb86-4f72-b130-1730f9432aa7',
  '39bb743a-a0c2-43c0-abd8-9db5d2d55536',
  'af641bf7-702e-4427-b018-5f04b8a88d2c'
)
ORDER BY official_player_key;
-- esperado: 20, 50, 400, 890 respectivamente

-- 3. El ledger en sí no cambió (esta migración solo tocó el campo derivado).
SELECT count(*) AS filas_ledger FROM riviera_official_points_ledger;
