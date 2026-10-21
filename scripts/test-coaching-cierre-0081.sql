-- ==============================================================================
-- scripts/test-coaching-cierre-0081.sql
-- Setup y Verificación de Cierre de Seguridad 0081 en Supabase
-- ==============================================================================

DO $$
DECLARE
  v_proc_count integer;
BEGIN
  RAISE NOTICE '── INICIO VERIFICACIÓN TEST FIXTURE 0081 ──';

  -- VERIFICAR ELIMINACIÓN DE RPCS ANTIGUAS
  SELECT count(*) INTO v_proc_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN ('create_or_invite_student_access', 'resend_student_invitation');

  IF v_proc_count > 0 THEN
    RAISE EXCEPTION 'TEST FALLÓ: Funciones obsoletas aún existen en pg_proc (% encontradas)', v_proc_count;
  END IF;
  RAISE NOTICE '✓ RPCs obsoletas create_or_invite_student_access y resend_student_invitation están eliminadas de PostgreSQL.';

  RAISE NOTICE '── FIXTURE 0081 VERIFICADO EXITOSAMENTE ──';
END $$;
