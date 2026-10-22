-- Riviera Coaching — Protección contra enumeración y revocación de acceso público a resolve_student_login_identifier
-- Migración: 0089_coaching_student_secure_login.sql
-- Propósito:
-- 1. Revocar permisos EXECUTE a PUBLIC, anon y authenticated en public.resolve_student_login_identifier(text).
-- 2. Conceder EXECUTE únicamente a service_role para que la resolución de Riviera ID a correo
--    se ejecute exclusivamente dentro del backend seguro (Edge Function coaching-activate-student)
--    sin exponer direcciones de correo ni permitir enumeración de cuentas por usuarios no autenticados.

BEGIN;

REVOKE ALL ON FUNCTION public.resolve_student_login_identifier(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_student_login_identifier(text) TO service_role;

COMMENT ON FUNCTION public.resolve_student_login_identifier(text) IS
'Resuelve el correo de un alumno a partir de su Riviera ID o correo registrado. Acceso restringido exclusivamente a service_role para evitar enumeración y proteger datos personales.';

COMMIT;

