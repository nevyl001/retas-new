-- Migración preparada (NO ejecutar en producción desde el agente).
-- Duelo 2 vs 2: slots vacíos para convocatoria abierta / borrador.
-- Idempotente. Orden: tras duelos-2v2.sql y convocatoria-riviera-generalize.sql

ALTER TABLE public.duelos_2v2
  ALTER COLUMN pareja_a_j1_nombre DROP NOT NULL,
  ALTER COLUMN pareja_a_j2_nombre DROP NOT NULL,
  ALTER COLUMN pareja_b_j1_nombre DROP NOT NULL,
  ALTER COLUMN pareja_b_j2_nombre DROP NOT NULL;

ALTER TABLE public.duelos_2v2
  ALTER COLUMN pareja_a_j1_nombre SET DEFAULT '',
  ALTER COLUMN pareja_a_j2_nombre SET DEFAULT '',
  ALTER COLUMN pareja_b_j1_nombre SET DEFAULT '',
  ALTER COLUMN pareja_b_j2_nombre SET DEFAULT '';

COMMENT ON COLUMN public.duelos_2v2.pareja_a_j1_id IS
  'Slot A1: FK riviera_jugadores. NULL permitido en estado configuracion (convocatoria).';

NOTIFY pgrst, 'reload schema';
