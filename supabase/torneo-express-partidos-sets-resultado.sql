-- Torneo Express: columna sets_resultado en partidos de fase de grupos.
-- Misma semántica que torneo_express_eliminatoria_partidos.sets_resultado:
--   JSON array [{ "local": number, "visitante": number }, ...] (máx. 3 sets).
-- Ejecutar en Supabase SQL Editor una vez.
-- Fuente de verdad del marcador detallado; puntos_local/puntos_visitante
-- se mantienen por compatibilidad (games si 1 set; sets ganados si BO3).

ALTER TABLE public.torneo_express_partidos
  ADD COLUMN IF NOT EXISTS sets_resultado jsonb;

COMMENT ON COLUMN public.torneo_express_partidos.sets_resultado IS
  'Marcador por sets: [{local, visitante}, ...]. NULL = legacy (usar puntos_* como 1 set).';

-- También en eliminatoria por si faltara en algún entorno legacy.
ALTER TABLE public.torneo_express_eliminatoria_partidos
  ADD COLUMN IF NOT EXISTS sets_resultado jsonb;

COMMENT ON COLUMN public.torneo_express_eliminatoria_partidos.sets_resultado IS
  'Marcador por sets: [{local, visitante}, ...]. NULL = legacy (usar puntos_*).';
