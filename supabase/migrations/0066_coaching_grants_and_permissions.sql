-- ==============================================================================
-- Migración 0066: Permisos explícitos SELECT a authenticated en balances y ledger
-- Fecha: 2026-10-20
-- ==============================================================================

-- 1. Asegurar privilegios estrictos en coach_player_class_balances
-- Permite lectura protegida por RLS a usuarios autenticados.
-- Revoca cualquier mutación directa (INSERT/UPDATE/DELETE/TRUNCATE).
REVOKE ALL ON public.coach_player_class_balances FROM anon;
REVOKE ALL ON public.coach_player_class_balances FROM authenticated;
GRANT SELECT ON public.coach_player_class_balances TO authenticated;

-- 2. Asegurar privilegios estrictos en coach_class_ledger
-- Permite lectura del historial inmutable protegida por RLS a usuarios autenticados.
-- Revoca cualquier mutación directa; la inserción ocurre exclusivamente mediante RPC SECURITY DEFINER.
REVOKE ALL ON public.coach_class_ledger FROM anon;
REVOKE ALL ON public.coach_class_ledger FROM authenticated;
GRANT SELECT ON public.coach_class_ledger TO authenticated;

-- Mantener privilegios plenos en service_role para funciones internas y triggers
GRANT ALL ON public.coach_player_class_balances TO service_role;
GRANT ALL ON public.coach_class_ledger TO service_role;
