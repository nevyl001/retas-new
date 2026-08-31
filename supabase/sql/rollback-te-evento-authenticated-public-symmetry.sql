-- =============================================================================
-- ROLLBACK — te_evento_select_public_authenticated
--
-- Revierte fix-te-evento-authenticated-public-symmetry.sql.
-- Tras ejecutar, correr verify-te-evento-authenticated-symmetry.sql y confirmar
-- auth_select_policy_count = 1 y cross_club_published_rows = 0 (estado bug).
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS te_evento_select_public_authenticated
  ON public.torneo_express_evento;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'torneo_express_evento'
      AND policyname = 'te_evento_select_public_authenticated'
  ) THEN
    RAISE EXCEPTION 'Rollback incompleto: la policy sigue existiendo';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
