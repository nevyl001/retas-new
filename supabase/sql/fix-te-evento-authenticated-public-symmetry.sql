-- =============================================================================
-- Fix — simetría authenticated en torneo_express_evento (TE evento público)
--
-- Problema (prod 2026-08-30):
--   te_evento_select_anon permite leer eventos published/in_progress/completed.
--   te_evento_select_auth solo permite organizador_id = auth.uid().
--   Un organizador logueado (JWT authenticated) que visita /eventos/{slug} de
--   OTRO club recibe 0 filas — fetchEventoBySlug usa el singleton supabase con
--   sesión activa, no rol anon. Anon sin sesión sí ve el evento.
--
-- Fix: espejo de te_select_public_authenticated (SEC-001, fix-rls-open-policies)
--   FOR SELECT TO authenticated USING (is_torneo_express_evento_public(id)).
--   Aditivo / PERMISSIVE — no altera anon ni mutate (te_evento_mutate_auth).
--
-- Idempotente: DROP POLICY IF EXISTS + CREATE.
-- Rollback: rollback-te-evento-authenticated-public-symmetry.sql
-- Verify:   verify-te-evento-authenticated-symmetry.sql (ANTES y DESPUÉS)
-- =============================================================================

BEGIN;

-- Guard: helper debe existir (torneo-express-evento-fase1.sql)
DO $$
BEGIN
  IF to_regprocedure('public.is_torneo_express_evento_public(uuid)') IS NULL THEN
    RAISE EXCEPTION
      'Prerrequisito: public.is_torneo_express_evento_public(uuid) no existe';
  END IF;
END $$;

-- Snapshot anon (no debe cambiar tras este fix)
CREATE TEMP TABLE te_evento_symmetry_anon_snapshot ON COMMIT DROP AS
SELECT id, estado, slug, organizador_id
FROM public.torneo_express_evento
WHERE public.is_torneo_express_evento_public(id);

-- Confirmar estado pre-fix: la policy nueva no debe existir aún
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'torneo_express_evento'
      AND policyname = 'te_evento_select_public_authenticated'
  ) THEN
    RAISE NOTICE
      'te_evento_select_public_authenticated ya existía — recreando (idempotente)';
  END IF;
END $$;

DROP POLICY IF EXISTS te_evento_select_public_authenticated
  ON public.torneo_express_evento;

CREATE POLICY te_evento_select_public_authenticated
  ON public.torneo_express_evento
  FOR SELECT
  TO authenticated
  USING (public.is_torneo_express_evento_public(id));

-- ── Verificación intra-transacción ───────────────────────────────────────────
DO $$
DECLARE
  v_policy_exists boolean;
  v_auth_select_count int;
  v_anon_select_count int;
  v_anon_public_rows int;
  v_anon_snapshot_rows int;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'torneo_express_evento'
      AND policyname = 'te_evento_select_public_authenticated'
      AND cmd = 'SELECT'
      AND roles::text LIKE '%authenticated%'
  ) INTO v_policy_exists;

  IF NOT v_policy_exists THEN
    RAISE EXCEPTION
      'Fix incompleto: te_evento_select_public_authenticated no quedó creada';
  END IF;

  SELECT count(*) INTO v_auth_select_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'torneo_express_evento'
    AND cmd = 'SELECT'
    AND roles::text LIKE '%authenticated%';

  IF v_auth_select_count <> 2 THEN
    RAISE EXCEPTION
      'Esperadas 2 policies SELECT authenticated (auth + public_authenticated), hay %',
      v_auth_select_count;
  END IF;

  SELECT count(*) INTO v_anon_select_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'torneo_express_evento'
    AND cmd = 'SELECT'
    AND roles::text LIKE '%anon%';

  IF v_anon_select_count <> 1 THEN
    RAISE EXCEPTION
      'Anon SELECT policies cambiaron (esperado 1 te_evento_select_anon, hay %)',
      v_anon_select_count;
  END IF;

  -- Anon legible vía helper: mismo conteo que snapshot pre-fix
  SELECT count(*) INTO v_anon_public_rows
  FROM public.torneo_express_evento
  WHERE public.is_torneo_express_evento_public(id);

  SELECT count(*) INTO v_anon_snapshot_rows
  FROM te_evento_symmetry_anon_snapshot;

  IF v_anon_public_rows IS DISTINCT FROM v_anon_snapshot_rows THEN
    RAISE EXCEPTION
      'Conteo is_torneo_express_evento_public cambió (% → %) — no debería',
      v_anon_snapshot_rows, v_anon_public_rows;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
