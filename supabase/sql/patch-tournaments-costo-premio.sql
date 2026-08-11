-- Espejo operativo de 0027_tournaments_costo_premio.sql
-- NO ejecutar automáticamente. Revisar → SQL Editor (staging → prod). Idempotente.

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS costo text NULL;

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS mostrar_costo boolean NOT NULL DEFAULT false;

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS premio text NULL;

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS mostrar_premio boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tournaments.costo IS
  'Texto libre de costo/inscripción (ej. $200 por jugador). Solo se publica si mostrar_costo.';

COMMENT ON COLUMN public.tournaments.mostrar_costo IS
  'Si true, incluir costo en el mensaje de convocatoria WhatsApp. Default false.';

COMMENT ON COLUMN public.tournaments.premio IS
  'Texto libre de premio (ej. Trofeo + pelotas). Solo se publica si mostrar_premio.';

COMMENT ON COLUMN public.tournaments.mostrar_premio IS
  'Si true, incluir premio en el mensaje de convocatoria WhatsApp. Default false.';
