-- Torneo Express — columnas de programación en partidos de fase de grupos.
-- Idempotente y aditivo: no modifica filas existentes ni constraints deportivos.

ALTER TABLE public.torneo_express_partidos
  ADD COLUMN IF NOT EXISTS cancha text NULL;

ALTER TABLE public.torneo_express_partidos
  ADD COLUMN IF NOT EXISTS programado_en timestamptz NULL;

COMMENT ON COLUMN public.torneo_express_partidos.cancha IS
  'Etiqueta de cancha asignada al partido (texto libre, ej. Central, Cancha 1).';

COMMENT ON COLUMN public.torneo_express_partidos.programado_en IS
  'Inicio programado del partido (timestamptz). Fuente de verdad para fecha/hora en vistas públicas y admin.';
