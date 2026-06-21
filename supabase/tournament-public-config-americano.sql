-- Americano Dinámico — estado en vivo en Supabase (multi-dispositivo)
-- Ejecutar en Supabase → SQL Editor (una vez por proyecto).

ALTER TABLE public.tournament_public_config
  ADD COLUMN IF NOT EXISTS americano_live jsonb;

COMMENT ON COLUMN public.tournament_public_config.americano_live IS
  'Americano Dinámico: snapshot { version, savedAt, tournamentPhase, ranking, rounds }';

-- Realtime opcional (vista pública más reactiva)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_public_config;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
