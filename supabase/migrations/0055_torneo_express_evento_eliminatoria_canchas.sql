-- Canchas disponibles para la proyección de eliminatoria a nivel evento.

ALTER TABLE public.torneo_express_evento
  ADD COLUMN IF NOT EXISTS eliminatoria_canchas text[];

COMMENT ON COLUMN public.torneo_express_evento.eliminatoria_canchas IS
  'Nombres de canchas disponibles para eliminatoria. NULL/vacío = por definir.';
