-- =============================================================================
-- 0125_coaching_student_timeline_relationship_id.sql
--
-- Riviera Coaching — el timeline del alumno identifica cada sesión por
-- relationship_id y organizador_id, columnas que ya existen en coach_sessions
-- (también en el historial). El nombre comercial deja de ser la clave.
--
-- No reescribe sesiones, saldos ni schema_migrations.
-- No devuelve notas privadas ni notes_summary.
-- La autorización sigue siendo el vínculo activo coach_student_account_links
-- del alumno que llama, por organizador y jugador de esa sesión.
--
-- APLICACIÓN: ejecutar este archivo solo, a mano. No usar db push.
-- Después de aplicarla hay que registrar la versión 0125 en el historial
-- antes de cualquier db push futuro. CREATE OR REPLACE es idempotente.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_student_training_timeline()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'sessions', COALESCE((
      SELECT jsonb_agg(row_to_json(x) ORDER BY x.starts_at DESC)
      FROM (
        SELECT
          s.id,
          s.relationship_id,
          s.organizador_id,
          s.starts_at,
          s.duration_minutes,
          s.worked_on,
          s.improvements,
          s.areas_to_improve,
          s.recommendations,
          s.next_goals,
          s.motivational_message,
          s.followup_updated_at,
          c.nombre AS coach_nombre,
          public.get_organizador_display_name(s.organizador_id) AS club_nombre,
          nxt.starts_at AS next_scheduled_at
        FROM public.coach_sessions s
        JOIN public.coach_player_relationships r ON r.id = s.relationship_id
        JOIN public.riviera_coaches c ON c.id = s.coach_id
        JOIN public.coach_student_account_links al
          ON al.organizador_id = s.organizador_id
         AND al.jugador_id = s.jugador_id
         AND al.auth_user_id = v_caller
         AND al.is_active = true
        LEFT JOIN LATERAL (
          SELECT sch.starts_at
          FROM public.coach_sessions sch
          WHERE sch.relationship_id = r.id
            AND sch.status = 'SCHEDULED'
            AND sch.starts_at >= now() - interval '2 hours'
          ORDER BY sch.starts_at ASC
          LIMIT 1
        ) nxt ON true
        WHERE s.status = 'COMPLETED'
          AND s.reverted_at IS NULL
          AND s.relationship_id IS NOT NULL
          AND r.status IN ('ACTIVE', 'PAUSED', 'ENDED')
        ORDER BY s.starts_at DESC
        LIMIT 40
      ) x
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_training_timeline() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_training_timeline() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
