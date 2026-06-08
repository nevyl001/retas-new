-- Remontada Final: config pública para vista anónima (enlace público).
-- Ejecutar en Supabase SQL Editor si la columna aún no existe.

ALTER TABLE public.tournament_public_config
  ADD COLUMN IF NOT EXISTS championship_config jsonb;

COMMENT ON COLUMN public.tournament_public_config.championship_config IS
  'Round Robin — remontada final: { championshipEnabled, championshipRounds, championshipRoundsGenerated }';
