-- Event-level classification mode + match format for Torneo Express.
-- Applies to every category/group under the event.

ALTER TABLE public.torneo_express_evento
  ADD COLUMN IF NOT EXISTS clasificacion_modo text NOT NULL DEFAULT 'dif_puntos';

ALTER TABLE public.torneo_express_evento
  ADD COLUMN IF NOT EXISTS partido_formato text NOT NULL DEFAULT 'flexible';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'torneo_express_evento_clasificacion_modo_check'
  ) THEN
    ALTER TABLE public.torneo_express_evento
      ADD CONSTRAINT torneo_express_evento_clasificacion_modo_check
      CHECK (clasificacion_modo IN ('dif_puntos', 'setto_pg'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'torneo_express_evento_partido_formato_check'
  ) THEN
    ALTER TABLE public.torneo_express_evento
      ADD CONSTRAINT torneo_express_evento_partido_formato_check
      CHECK (partido_formato IN ('flexible', 'bo3_super_muerte'));
  END IF;
END $$;

COMMENT ON COLUMN public.torneo_express_evento.clasificacion_modo IS
  'Preset de desempate de grupos: dif_puntos (DIF→FAV→PG→H2H) o setto_pg (PG→H2H→sets→games).';

COMMENT ON COLUMN public.torneo_express_evento.partido_formato IS
  'Formato de captura: flexible (0–99) o bo3_super_muerte (mejor de 3, 3er set super TB).';
