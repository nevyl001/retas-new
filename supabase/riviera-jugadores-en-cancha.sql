-- Posición en cancha (Revés / Drive) — ejecutar después de riviera-jugadores-categorias-public.sql

ALTER TABLE public.riviera_jugadores
  ADD COLUMN IF NOT EXISTS en_cancha text;

ALTER TABLE public.riviera_jugadores
  DROP CONSTRAINT IF EXISTS riviera_jugadores_en_cancha_check;

ALTER TABLE public.riviera_jugadores
  ADD CONSTRAINT riviera_jugadores_en_cancha_check CHECK (
    en_cancha IS NULL OR en_cancha IN ('reves', 'drive')
  );

COMMENT ON COLUMN public.riviera_jugadores.en_cancha IS
  'Lado en cancha de pádel: reves (revés) o drive (derecha)';
