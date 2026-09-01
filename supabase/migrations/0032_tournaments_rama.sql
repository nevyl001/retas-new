-- 0032 — Rama del encuentro (varonil / femenil / mixta) en tournaments
-- Idempotente.

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS rama text NULL;

COMMENT ON COLUMN public.tournaments.rama IS
  'Rama del encuentro: varonil, femenil o mixta. Se publica en convocatoria WhatsApp cuando está definida.';
