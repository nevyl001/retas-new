-- Timers por ronda (organizer inicia minutos; vista pública muestra restante).
-- Ejecutar en Supabase SQL Editor si la columna aún no existe.

ALTER TABLE public.tournament_public_config
  ADD COLUMN IF NOT EXISTS round_timers jsonb;

COMMENT ON COLUMN public.tournament_public_config.round_timers IS
  'Timers por ronda: { version: 1, rounds: { "1": { durationMinutes, startedAt, endsAt } } }';
