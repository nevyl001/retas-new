-- Sets al mejor de 3 — partidos eliminatorios Torneo Express
-- Ejecutar en Supabase SQL Editor después de torneo-express-bracket.sql

ALTER TABLE torneo_express_eliminatoria_partidos
  ADD COLUMN IF NOT EXISTS sets_resultado JSONB;

COMMENT ON COLUMN torneo_express_eliminatoria_partidos.sets_resultado IS
  'Marcador por set [{local, visitante}, ...]. Null si solo hay un set (usa puntos_local/puntos_visitante).';
