BEGIN;

-- El alumno puede hacer SELECT de sus coach_sessions (csess_select_policy).
-- notes_summary es nota interna de agenda; se conserva el valor histórico
-- y la agenda la sigue leyendo por SECURITY DEFINER (owner postgres).

REVOKE SELECT ON TABLE public.coach_sessions FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  coach_id,
  relationship_id,
  organizador_id,
  starts_at,
  ends_at,
  duration_minutes,
  focus,
  worked_on,
  created_at,
  updated_at,
  jugador_id,
  status,
  improvements,
  next_goals,
  motivational_message,
  court,
  reverted_at,
  reverted_by,
  cancellation_reason,
  idempotency_key,
  areas_to_improve,
  recommendations,
  followup_updated_at,
  followup_updated_by
) ON TABLE public.coach_sessions TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
