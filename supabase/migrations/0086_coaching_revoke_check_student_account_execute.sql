-- ==============================================================================
-- 0086_coaching_revoke_check_student_account_execute.sql
-- Riviera Coaching — Restricción estricta de check_student_invitation_account
-- Revoca EXECUTE a PUBLIC, anon y authenticated; exclusivo para service_role.
-- ==============================================================================

-- 1. REVOCAR EXECUTE A PUBLIC, anon Y authenticated
REVOKE ALL ON FUNCTION public.check_student_invitation_account(text, uuid) FROM PUBLIC, anon, authenticated;

-- 2. OTORGAR PERMISO DE EJECUCIÓN EXCLUSIVAMENTE A service_role
GRANT EXECUTE ON FUNCTION public.check_student_invitation_account(text, uuid) TO service_role;

-- 3. COMENTARIO DOCUMENTAL
COMMENT ON FUNCTION public.check_student_invitation_account(text, uuid) IS
  'Comprobación autorizada de cuentas para invitaciones de alumno. Restringida exclusivamente a service_role para prevenir exposición de cuentas a usuarios autenticados o anónimos.';
