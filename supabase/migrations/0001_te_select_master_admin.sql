-- ══════════════════════════════════════════════════════════════════════════════
-- BLK-07 — Admin Maestro sin policy SELECT propia en torneo_express
--
-- Problema (confirmado por grep exhaustivo sobre los 161+35 archivos SQL del
-- repo, 2026-08-03): a diferencia de sus tablas hermanas (`users`,
-- `tournaments`, `tournament_public_config`, todas con una policy
-- `..._select_master_admin USING (public.is_master_admin())`), `torneo_express`
-- SOLO tiene:
--   - te_select_anon      (FOR SELECT TO anon,          is_torneo_express_public(id))
--   - te_select_auth      (FOR SELECT TO authenticated,  organizador_id = auth.uid())
--   - te_select_public_authenticated (authenticated,      is_torneo_express_public(id))
-- Ninguna cubre "authenticated + is_master_admin() sobre torneo AJENO no
-- público". El panel de Admin Maestro (src/lib/admin/fetchAdminUserDetail.ts,
-- src/components/admin/UserManagement.tsx) lee esta tabla con el JWT propio
-- del admin (no service_role) sin ningún .eq() de filtro, confiando 100% en
-- RLS — sin esta policy, esa lectura devuelve solo lo que el admin sería
-- dueño (normalmente nada) más lo público, es decir: el panel probablemente
-- muestra Torneo Express vacío/incompleto para cualquier organizador inspeccionado
-- cuyos torneos no sean públicos. No es una fuga de datos (RLS protegía
-- correctamente contra terceros) — es un hallazgo funcional, no de seguridad.
--
-- Fix: migración puramente aditiva, SOLO SELECT, análoga byte-a-byte a
-- `tournaments_select_master_admin` (supabase/admin-master-controls.sql) y
-- `tpc_select_master_admin` (supabase/rls-multiclub-pr1-public-read-helpers.sql).
-- No se revoca ni amplía ningún permiso de INSERT/UPDATE/DELETE (esos ya están
-- cubiertos por `te_mutate_auth`, dueño). Al ser PERMISSIVE (default), se
-- combina con OR sobre las policies SELECT ya vigentes sin afectarlas.
--
-- Idempotente: DROP POLICY IF EXISTS + CREATE POLICY, repetible sin error.
-- Rollback: DROP POLICY IF EXISTS te_select_master_admin ON public.torneo_express;
-- ══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS te_select_master_admin ON public.torneo_express;
CREATE POLICY te_select_master_admin
  ON public.torneo_express
  FOR SELECT
  TO authenticated
  USING (public.is_master_admin());

-- ── Verificación en la misma transacción implícita del statement anterior ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'torneo_express'
      AND policyname = 'te_select_master_admin'
      AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'Fix incompleto: te_select_master_admin no quedó creada';
  END IF;
END $$;
