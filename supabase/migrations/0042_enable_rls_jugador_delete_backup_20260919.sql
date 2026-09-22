-- Security Advisor: RLS Disabled in Public (backup tables 2026-09-19).
--
-- Tablas creadas por delete_riviera_jugador cascade como respaldo permanente.
-- No son consultadas por la app (src/, Edge Functions, RPCs productivas).
-- Migración 0038 ya endureció backups anteriores; estas nacieron después
-- sin RLS.
--
-- Solo ENABLE ROW LEVEL SECURITY (sin FORCE, sin políticas, sin tocar grants).
-- Con RLS on y sin políticas, anon/authenticated no leen filas; service_role
-- sigue con bypass.
--
-- Rollback (manual, si hiciera falta):
--   ALTER TABLE ... DISABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.jugador_delete_backup_riviera_jugadores_20260919_014346
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.jugador_delete_backup_participaciones_20260919_014346
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.jugador_delete_backup_ledger_20260919_014346
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.jugador_delete_backup_opa_20260919_014346
  ENABLE ROW LEVEL SECURITY;
