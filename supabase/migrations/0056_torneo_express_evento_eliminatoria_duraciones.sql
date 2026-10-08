-- Minutos por ronda de eliminatoria a nivel evento (octavos, cuartos, semis, final).

ALTER TABLE public.torneo_express_evento
  ADD COLUMN IF NOT EXISTS eliminatoria_duraciones jsonb;

COMMENT ON COLUMN public.torneo_express_evento.eliminatoria_duraciones IS
  'Minutos por ronda: {octavos, cuartos, semifinal, final}. NULL = 60 min cada una.';
