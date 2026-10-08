-- Horario de inicio de eliminatorias y orden de categorías a nivel evento.
-- No altera clasificación ni genera el cuadro: solo proyección pública y config.

ALTER TABLE public.torneo_express_evento
  ADD COLUMN IF NOT EXISTS eliminatoria_inicio timestamptz;

ALTER TABLE public.torneo_express_evento
  ADD COLUMN IF NOT EXISTS eliminatoria_categoria_orden uuid[];

COMMENT ON COLUMN public.torneo_express_evento.eliminatoria_inicio IS
  'Hora de inicio de la fase eliminatoria del evento (primera categoría). NULL = por definir.';

COMMENT ON COLUMN public.torneo_express_evento.eliminatoria_categoria_orden IS
  'Orden de arranque de categorías (torneo_express.id). NULL = orden por nivel (más baja primero).';
