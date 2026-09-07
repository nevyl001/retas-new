-- ══════════════════════════════════════════════════════════════════════════════
-- Costo / premio opcionales en duelos 2 vs 2 (misma semántica que tournaments)
--
-- Solo se publican en convocatoria WhatsApp cuando mostrar_* = true.
-- Idempotente. Revisar → SQL Editor (staging → prod) o migraciones.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.duelos_2v2
  ADD COLUMN IF NOT EXISTS costo text NULL;

ALTER TABLE public.duelos_2v2
  ADD COLUMN IF NOT EXISTS mostrar_costo boolean NOT NULL DEFAULT false;

ALTER TABLE public.duelos_2v2
  ADD COLUMN IF NOT EXISTS premio text NULL;

ALTER TABLE public.duelos_2v2
  ADD COLUMN IF NOT EXISTS mostrar_premio boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.duelos_2v2.costo IS
  'Texto libre de precio/inscripción (ej. $200 por jugador). Solo se publica si mostrar_costo.';

COMMENT ON COLUMN public.duelos_2v2.mostrar_costo IS
  'Si true, incluir costo/precio en el mensaje de convocatoria WhatsApp. Default false.';

COMMENT ON COLUMN public.duelos_2v2.premio IS
  'Texto libre de premio (ej. Trofeo + pelotas). Solo se publica si mostrar_premio.';

COMMENT ON COLUMN public.duelos_2v2.mostrar_premio IS
  'Si true, incluir premio en el mensaje de convocatoria WhatsApp. Default false.';
