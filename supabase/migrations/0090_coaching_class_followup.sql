-- Seguimiento pedagógico de una clase ya impartida.
-- No toca saldos, ledger, estado de la sesión ni la fecha real.
-- Las notas privadas viven aparte: el alumno puede leer coach_sessions,
-- así que no pueden guardarse en esa tabla.

BEGIN;

ALTER TABLE public.coach_sessions
  ADD COLUMN IF NOT EXISTS areas_to_improve text,
  ADD COLUMN IF NOT EXISTS recommendations text,
  ADD COLUMN IF NOT EXISTS followup_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_updated_by uuid;

CREATE TABLE IF NOT EXISTS public.coach_session_private_notes (
  session_id uuid PRIMARY KEY REFERENCES public.coach_sessions(id) ON DELETE CASCADE,
  body text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL
);

ALTER TABLE public.coach_session_private_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cspn_select_staff ON public.coach_session_private_notes;
CREATE POLICY cspn_select_staff ON public.coach_session_private_notes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.coach_sessions s
      WHERE s.id = coach_session_private_notes.session_id
        AND (
          s.organizador_id = auth.uid()
          OR s.coach_id = public.current_riviera_coach_id()
          OR COALESCE(public.is_master_admin(), false)
        )
    )
  );

REVOKE ALL ON public.coach_session_private_notes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.coach_session_private_notes TO authenticated;

CREATE OR REPLACE FUNCTION public.update_coach_class_followup(
  p_session_id uuid,
  p_worked_on text[] DEFAULT '{}',
  p_improvements text DEFAULT NULL,
  p_areas_to_improve text DEFAULT NULL,
  p_recommendations text DEFAULT NULL,
  p_next_goals text DEFAULT NULL,
  p_motivational_message text DEFAULT NULL,
  p_private_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_sess public.coach_sessions%ROWTYPE;
  v_rel_status text;
  v_membership_status text;
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_is_coach boolean := false;
  v_private text := NULLIF(btrim(COALESCE(p_private_notes, '')), '');
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_sess
  FROM public.coach_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sesión no encontrada.');
  END IF;

  IF v_sess.status <> 'COMPLETED' OR v_sess.reverted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo se puede editar el seguimiento de una clase impartida.');
  END IF;

  SELECT r.status INTO v_rel_status
  FROM public.coach_player_relationships r
  WHERE r.id = v_sess.relationship_id;

  IF v_rel_status IS NULL OR v_rel_status NOT IN ('ACTIVE', 'PAUSED') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La relación con el alumno no permite editar este seguimiento.');
  END IF;

  v_is_coach := v_sess.coach_id = public.current_riviera_coach_id();

  IF NOT v_is_coach AND v_sess.organizador_id <> v_caller AND v_is_master IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No tienes autorización para editar el seguimiento de esta clase.');
  END IF;

  SELECT m.status INTO v_membership_status
  FROM public.coach_club_memberships m
  WHERE m.coach_id = v_sess.coach_id
    AND m.organizador_id = v_sess.organizador_id;

  IF v_membership_status IS DISTINCT FROM 'ACTIVE' AND v_is_master IS NOT TRUE AND v_sess.organizador_id <> v_caller THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El coach no tiene una asociación activa con este club.');
  END IF;

  UPDATE public.coach_sessions
  SET
    worked_on = COALESCE(p_worked_on, '{}'),
    improvements = NULLIF(btrim(COALESCE(p_improvements, '')), ''),
    areas_to_improve = NULLIF(btrim(COALESCE(p_areas_to_improve, '')), ''),
    recommendations = NULLIF(btrim(COALESCE(p_recommendations, '')), ''),
    next_goals = NULLIF(btrim(COALESCE(p_next_goals, '')), ''),
    motivational_message = NULLIF(btrim(COALESCE(p_motivational_message, '')), ''),
    followup_updated_at = now(),
    followup_updated_by = v_caller,
    updated_at = now()
  WHERE id = v_sess.id;

  IF v_private IS NULL THEN
    DELETE FROM public.coach_session_private_notes WHERE session_id = v_sess.id;
  ELSE
    INSERT INTO public.coach_session_private_notes (session_id, body, updated_at, updated_by)
    VALUES (v_sess.id, v_private, now(), v_caller)
    ON CONFLICT (session_id) DO UPDATE
      SET body = EXCLUDED.body,
          updated_at = EXCLUDED.updated_at,
          updated_by = EXCLUDED.updated_by;
  END IF;

  PERFORM public.coach_audit_write(
    'update_class_followup',
    'coach_session',
    v_sess.id,
    jsonb_build_object(
      'relationship_id', v_sess.relationship_id,
      'organizador_id', v_sess.organizador_id,
      'coach_id', v_sess.coach_id
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'session_id', v_sess.id,
    'followup_updated_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_coach_class_followup(uuid, text[], text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_coach_class_followup(uuid, text[], text, text, text, text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_coach_class_followup(p_relationship_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_rel record;
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT r.id, r.coach_id, r.organizador_id, r.jugador_id, r.status
  INTO v_rel
  FROM public.coach_player_relationships r
  WHERE r.id = p_relationship_id;

  IF NOT FOUND OR v_rel.status NOT IN ('ACTIVE', 'PAUSED') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Relación no disponible.');
  END IF;

  IF v_rel.coach_id IS DISTINCT FROM public.current_riviera_coach_id()
     AND v_rel.organizador_id IS DISTINCT FROM v_caller
     AND v_is_master IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No tienes autorización para consultar este seguimiento.');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'sessions', COALESCE((
      SELECT jsonb_agg(row_to_json(x) ORDER BY x.starts_at DESC)
      FROM (
        SELECT
          s.id,
          s.starts_at,
          s.duration_minutes,
          s.status,
          s.worked_on,
          s.improvements,
          s.areas_to_improve,
          s.recommendations,
          s.next_goals,
          s.motivational_message,
          s.followup_updated_at,
          pn.body AS private_notes
        FROM public.coach_sessions s
        LEFT JOIN public.coach_session_private_notes pn ON pn.session_id = s.id
        WHERE s.relationship_id = v_rel.id
          AND s.status = 'COMPLETED'
          AND s.reverted_at IS NULL
        ORDER BY s.starts_at DESC
        LIMIT 40
      ) x
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_coach_class_followup(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_coach_class_followup(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_coach_followup_digest(p_organizador_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_coach_id uuid := public.current_riviera_coach_id();
BEGIN
  IF v_caller IS NULL OR v_coach_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado como coach.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.coach_club_memberships m
    WHERE m.coach_id = v_coach_id
      AND m.organizador_id = p_organizador_id
      AND m.status = 'ACTIVE'
  ) AND NOT COALESCE(public.is_master_admin(), false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin asociación activa en este club.');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'students', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'relationship_id', r.id,
        'foto_url', j.foto_url,
        'categoria', j.categoria,
        'last_session_at', (
          SELECT s.starts_at FROM public.coach_sessions s
          WHERE s.relationship_id = r.id AND s.status = 'COMPLETED' AND s.reverted_at IS NULL
          ORDER BY s.starts_at DESC LIMIT 1
        ),
        'last_goal', (
          SELECT s.next_goals FROM public.coach_sessions s
          WHERE s.relationship_id = r.id AND s.status = 'COMPLETED' AND s.reverted_at IS NULL
            AND NULLIF(btrim(COALESCE(s.next_goals, '')), '') IS NOT NULL
          ORDER BY s.starts_at DESC LIMIT 1
        ),
        'next_session_at', (
          SELECT s.starts_at FROM public.coach_sessions s
          WHERE s.relationship_id = r.id AND s.status = 'SCHEDULED' AND s.starts_at >= now() - interval '2 hours'
          ORDER BY s.starts_at ASC LIMIT 1
        )
      ))
      FROM public.coach_player_relationships r
      JOIN public.riviera_jugadores j ON j.id = r.jugador_id
      WHERE r.coach_id = v_coach_id
        AND r.organizador_id = p_organizador_id
        AND r.status IN ('ACTIVE', 'PAUSED')
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_coach_followup_digest(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_coach_followup_digest(uuid) TO authenticated, service_role;

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
          AND r.status IN ('ACTIVE', 'PAUSED', 'ENDED')
        ORDER BY s.starts_at DESC
        LIMIT 40
      ) x
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_training_timeline() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_training_timeline() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
