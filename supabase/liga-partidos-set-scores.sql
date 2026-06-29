-- Marcador por sets en liga_partidos (parejas fijas: 2 de 3, set 3 super tie-break).
-- Ejecutar en Supabase SQL Editor una vez.

ALTER TABLE public.liga_partidos
  ADD COLUMN IF NOT EXISTS set_scores jsonb;

COMMENT ON COLUMN public.liga_partidos.set_scores IS
  'Parejas fijas: { "sets": [{ "p1": 6, "p2": 4, "kind": "regular" }, ...] }. score_pareja1/2 = games totales.';
