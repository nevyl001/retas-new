-- Enable NULL = "Por asignar" on matches.court (Round Robin / Americano DB rows).
-- Preflight prod confirmed: is_nullable = NO. RPC update_tournament_courts_and_unassign
-- sets court = NULL; without this ALTER the RPC raises not_null_violation and rolls back.
--
-- Safe only after FE treats null as "Por asignar" and repairMatchCourtRotation skips null.
-- Do NOT use 0 / -1 as sentinel.
--
-- NO ejecutar desde el agente; aplicar manualmente en SQL Editor tras revisar FE.

ALTER TABLE public.matches
  ALTER COLUMN court DROP NOT NULL;

COMMENT ON COLUMN public.matches.court IS
  'Cancha 1..N. NULL = Por asignar (p.ej. tras reducir tournaments.courts).';
