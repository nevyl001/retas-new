-- =============================================================================
-- SOLO LECTURA — sonda de conciliación Coaching 0082–0091
-- Ejecutar en SQL Editor de Production. No escribe. No toca schema_migrations.
-- =============================================================================

-- A) Historial registrado
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version IN (
  '0082','0083','0084','0085','0086','0087','0088','0089','0090','0091'
)
ORDER BY version;

-- B) Objetos esperados por 0082–0089
SELECT
  to_regprocedure('public.update_coach_student_relationship_status(uuid,uuid,text,text,text)') AS rpc_0082_0083,
  to_regclass('public.coach_relationship_status_idempotency') AS table_0083,
  to_regprocedure('public.is_student_only_account(uuid)') AS rpc_0084_is_student,
  to_regprocedure('public.get_organizador_display_name(uuid)') AS rpc_0084_display_name,
  to_regprocedure('public.check_student_invitation_account(text,uuid)') AS rpc_0085_check,
  to_regprocedure('public.claim_student_invitation(text)') AS rpc_0085_claim,
  to_regprocedure('public.verify_student_invitation(text)') AS rpc_0085_0087_verify,
  to_regprocedure('public.resolve_student_login_identifier(text)') AS rpc_0088_resolve;

-- C) Efectos 0090 / 0091
SELECT
  to_regclass('public.coach_session_private_notes') AS private_notes_table,
  to_regprocedure('public.update_coach_class_followup(uuid,text[],text,text,text,text,text,text)') AS rpc_followup_update,
  to_regprocedure('public.get_coach_class_followup(uuid)') AS rpc_followup_get,
  to_regprocedure('public.get_coach_followup_digest(uuid)') AS rpc_followup_digest,
  to_regprocedure('public.get_student_training_timeline()') AS rpc_student_timeline;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'coach_sessions'
  AND column_name IN (
    'areas_to_improve','recommendations','followup_updated_at','followup_updated_by','notes_summary'
  )
ORDER BY column_name;

-- D) Privilegio notes_summary (0091 revoca SELECT de esa columna a authenticated)
SELECT
  has_column_privilege('authenticated', 'public.coach_sessions', 'notes_summary', 'SELECT') AS auth_can_select_notes_summary,
  has_column_privilege('authenticated', 'public.coach_sessions', 'areas_to_improve', 'SELECT') AS auth_can_select_areas;

-- E) EXECUTE de resolve_student_login_identifier (0089: solo service_role)
SELECT
  has_function_privilege('anon', 'public.resolve_student_login_identifier(text)', 'EXECUTE') AS anon_resolve,
  has_function_privilege('authenticated', 'public.resolve_student_login_identifier(text)', 'EXECUTE') AS auth_resolve,
  has_function_privilege('service_role', 'public.resolve_student_login_identifier(text)', 'EXECUTE') AS service_resolve;

-- F) EXECUTE de check_student_invitation_account (0086: solo service_role)
SELECT
  has_function_privilege('anon', 'public.check_student_invitation_account(text,uuid)', 'EXECUTE') AS anon_check,
  has_function_privilege('authenticated', 'public.check_student_invitation_account(text,uuid)', 'EXECUTE') AS auth_check,
  has_function_privilege('service_role', 'public.check_student_invitation_account(text,uuid)', 'EXECUTE') AS service_check;
