-- Fecha y hora programados del partido (editables por el organizador)
-- Ejecutar en Supabase SQL Editor si ya tienes torneo_express_partidos.

ALTER TABLE torneo_express_partidos
  ADD COLUMN IF NOT EXISTS programado_en TIMESTAMPTZ;

COMMENT ON COLUMN torneo_express_partidos.programado_en IS
  'Día y hora programados del partido; si es NULL se muestra created_at hasta que el organizador lo define.';

UPDATE torneo_express_partidos
SET programado_en = created_at
WHERE programado_en IS NULL;
