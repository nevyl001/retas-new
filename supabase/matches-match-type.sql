-- Tipo de partido para Remontada Final (opcional; sin columna se usa localStorage + round).
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS match_type text;

COMMENT ON COLUMN public.matches.match_type IS
  'roundrobin | championship — ronda regular vs remontada final';
