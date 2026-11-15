-- =============================================================================
-- 0134_coaching_save_session_preparation.sql
--
-- Causa: el frontend llama save_coach_session_preparation, pero la RPC nunca
-- llegó a Production (el archivo local 0133 de preparación quedó sin aplicar;
-- la versión remota 0133 es otra migración).
--
-- Esta migración:
-- 1) Añade prep_message_to_student (mensaje visible para el alumno).
-- 2) Conserva notes_summary como nota privada del coach (sin SELECT al alumno).
-- 3) Crea save_coach_session_preparation (solo coach asignado / master).
-- 4) Extiende fetch_coach_agenda, fetch_club_coaching_agenda y
--    get_student_coaching_overview para devolver el mensaje público.
-- 5) No descuenta saldo ni marca la clase como impartida.
-- =============================================================================

BEGIN;

ALTER TABLE public.coach_sessions
  ADD COLUMN IF NOT EXISTS prep_message_to_student text NULL;

COMMENT ON COLUMN public.coach_sessions.prep_message_to_student IS
  'Mensaje del entrenador visible para el alumno en la preparación de la clase programada. Distinto de notes_summary (privado).';

-- Column privileges: notes_summary sigue oculto; prep_message_to_student sí es legible.
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
  followup_updated_by,
  prep_message_to_student
) ON TABLE public.coach_sessions TO authenticated;

CREATE OR REPLACE FUNCTION public.save_coach_session_preparation(
  p_session_id uuid,
  p_focus text DEFAULT NULL,
  p_notes_summary text DEFAULT NULL,
  p_message_to_student text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_coach_id uuid;
  v_sess public.coach_sessions%ROWTYPE;
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_trimmed_focus text := NULLIF(btrim(COALESCE(p_focus, '')), '');
  v_trimmed_notes text := NULLIF(btrim(COALESCE(p_notes_summary, '')), '');
  v_trimmed_message text := NULLIF(btrim(COALESCE(p_message_to_student, '')), '');
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_sess
  FROM public.coach_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sesión de coaching no encontrada.');
  END IF;

  IF v_sess.status <> 'SCHEDULED' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Solo se puede preparar una clase en estado programada (SCHEDULED). Estado actual: ' || v_sess.status
    );
  END IF;

  v_coach_id := public.current_riviera_coach_id();
  IF (v_coach_id IS NULL OR v_sess.coach_id <> v_coach_id) AND NOT v_is_master THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No tienes autorización para preparar esta clase. Solo el entrenador asignado puede definir la preparación técnica.'
    );
  END IF;

  UPDATE public.coach_sessions
  SET
    focus = v_trimmed_focus,
    notes_summary = v_trimmed_notes,
    prep_message_to_student = v_trimmed_message,
    updated_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'ok', true,
    'session_id', v_sess.id,
    'focus', v_trimmed_focus,
    'notes_summary', v_trimmed_notes,
    'prep_message_to_student', v_trimmed_message,
    'message', 'Preparación guardada exitosamente.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_coach_session_preparation(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_coach_session_preparation(uuid, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.save_coach_session_preparation(uuid, text, text, text) IS
  'Guarda tema, mensaje al alumno y notas privadas de una clase SCHEDULED. No descuenta saldo.';

-- ── Agenda del coach: incluir mensaje público ───────────────────────────────
CREATE OR REPLACE FUNCTION public.fetch_coach_agenda(
  p_organizador_id uuid DEFAULT NULL,
  p_status_filter text DEFAULT NULL,
  p_from_date timestamptz DEFAULT NULL,
  p_to_date timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_coach_id uuid;
  v_from timestamptz := COALESCE(p_from_date, now() - interval '24 hours');
  v_to timestamptz := COALESCE(p_to_date, now() + interval '90 days');
  v_sessions jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  v_coach_id := public.current_riviera_coach_id();
  IF v_coach_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El usuario no tiene credencial de entrenador activa.');
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'coach_id', s.coach_id,
      'coach_nombre', rc.nombre,
      'coach_code', rc.coach_code,
      'coach_foto', rc.foto_url,
      'jugador_id', s.jugador_id,
      'jugador_nombre', rj.nombre,
      'jugador_foto', rj.foto_url,
      'riviera_id', COALESCE(
        (SELECT i.riviera_id FROM public.riviera_official_player_identity i WHERE i.canonical_riviera_jugador_id = rj.id LIMIT 1),
        ''
      ),
      'relationship_id', s.relationship_id,
      'organizador_id', s.organizador_id,
      'club_nombre', COALESCE(u.name, ogm.branding_key, 'Club Riviera'),
      'starts_at', s.starts_at,
      'ends_at', s.ends_at,
      'duration_minutes', s.duration_minutes,
      'court', s.court,
      'focus', s.focus,
      'notes_summary', s.notes_summary,
      'prep_message_to_student', s.prep_message_to_student,
      'status', s.status,
      'worked_on', s.worked_on,
      'cancellation_reason', s.cancellation_reason,
      'reverted_at', s.reverted_at,
      'balance_classes', COALESCE(b.balance_classes, 0),
      'created_at', s.created_at
    ) ORDER BY s.starts_at ASC
  ), '[]'::jsonb)
  INTO v_sessions
  FROM public.coach_sessions s
  JOIN public.riviera_coaches rc ON rc.id = s.coach_id
  LEFT JOIN public.riviera_jugadores rj ON rj.id = s.jugador_id
  LEFT JOIN public.coach_player_class_balances b ON b.relationship_id = s.relationship_id
  LEFT JOIN public.users u ON u.id = s.organizador_id
  LEFT JOIN public.organizador_game_modes ogm ON ogm.organizador_id = s.organizador_id
  WHERE s.coach_id = v_coach_id
    AND (p_organizador_id IS NULL OR s.organizador_id = p_organizador_id)
    AND (p_status_filter IS NULL OR s.status = p_status_filter)
    AND s.starts_at >= v_from
    AND s.starts_at <= v_to;

  RETURN jsonb_build_object(
    'ok', true,
    'sessions', v_sessions
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fetch_coach_agenda(uuid, text, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_coach_agenda(uuid, text, timestamptz, timestamptz) TO authenticated, service_role;

-- ── Agenda del club: incluir mensaje público ────────────────────────────────
CREATE OR REPLACE FUNCTION public.fetch_club_coaching_agenda(
  p_organizador_id uuid,
  p_coach_id uuid DEFAULT NULL,
  p_from_date timestamptz DEFAULT NULL,
  p_to_date timestamptz DEFAULT NULL,
  p_status_filter text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_coach_id uuid := public.current_riviera_coach_id();
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_from timestamptz := COALESCE(p_from_date, now() - interval '30 days');
  v_to timestamptz := COALESCE(p_to_date, now() + interval '90 days');
  v_sessions jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  IF v_caller <> p_organizador_id
     AND NOT v_is_master
     AND NOT (v_caller_coach_id IS NOT NULL AND (p_coach_id = v_caller_coach_id OR p_coach_id IS NULL)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No tienes autorización para consultar la agenda de este club.');
  END IF;

  IF v_caller <> p_organizador_id AND NOT v_is_master THEN
    p_coach_id := v_caller_coach_id;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'coach_id', s.coach_id,
      'coach_nombre', rc.nombre,
      'coach_code', rc.coach_code,
      'coach_foto', rc.foto_url,
      'jugador_id', s.jugador_id,
      'jugador_nombre', rj.nombre,
      'jugador_foto', rj.foto_url,
      'riviera_id', COALESCE(
        (SELECT i.riviera_id FROM public.riviera_official_player_identity i WHERE i.canonical_riviera_jugador_id = rj.id LIMIT 1),
        ''
      ),
      'relationship_id', s.relationship_id,
      'starts_at', s.starts_at,
      'ends_at', s.ends_at,
      'duration_minutes', s.duration_minutes,
      'court', s.court,
      'focus', s.focus,
      'notes_summary', s.notes_summary,
      'prep_message_to_student', s.prep_message_to_student,
      'status', s.status,
      'worked_on', s.worked_on,
      'cancellation_reason', s.cancellation_reason,
      'reverted_at', s.reverted_at,
      'balance_classes', COALESCE(b.balance_classes, 0),
      'created_at', s.created_at
    ) ORDER BY s.starts_at ASC
  ), '[]'::jsonb)
  INTO v_sessions
  FROM public.coach_sessions s
  JOIN public.riviera_coaches rc ON rc.id = s.coach_id
  LEFT JOIN public.riviera_jugadores rj ON rj.id = s.jugador_id
  LEFT JOIN public.coach_player_class_balances b ON b.relationship_id = s.relationship_id
  WHERE s.organizador_id = p_organizador_id
    AND (p_coach_id IS NULL OR s.coach_id = p_coach_id)
    AND (p_status_filter IS NULL OR s.status = p_status_filter)
    AND s.starts_at >= v_from
    AND s.starts_at <= v_to;

  RETURN jsonb_build_object(
    'ok', true,
    'sessions', v_sessions
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fetch_club_coaching_agenda(uuid, uuid, timestamptz, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_club_coaching_agenda(uuid, uuid, timestamptz, timestamptz, text) TO authenticated, service_role;

-- ── Overview del alumno: tema + mensaje público (sin notes_summary) ─────────
CREATE OR REPLACE FUNCTION public.get_student_coaching_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_user_riviera_id text;
  v_results jsonb;
  v_student_profile jsonb;
  v_authorized_count integer;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario no autenticado.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.coach_student_account_links
    WHERE auth_user_id = v_caller AND is_active = false
  ) AND NOT EXISTS (
    SELECT 1 FROM public.coach_student_account_links
    WHERE auth_user_id = v_caller AND is_active = true
  ) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'linked', false,
      'is_deactivated', true,
      'message', 'Tu acceso a Riviera Coaching ha sido desactivado temporalmente por tu club. Consulta con la administración de tu club.'
    );
  END IF;

  SELECT count(*)
  INTO v_authorized_count
  FROM public.coach_student_account_links
  WHERE auth_user_id = v_caller AND is_active = true;

  IF v_authorized_count = 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'linked', false,
      'message', 'Tu cuenta no tiene una credencial oficial de alumno vinculada a ningún club.',
      'relationships', '[]'::jsonb
    );
  END IF;

  SELECT i.riviera_id
  INTO v_user_riviera_id
  FROM public.coach_student_account_links al
  JOIN public.riviera_official_player_identity i ON i.canonical_riviera_jugador_id = al.jugador_id
  WHERE al.auth_user_id = v_caller AND al.is_active = true
  LIMIT 1;

  SELECT jsonb_build_object(
    'id', rj.id,
    'organizador_id', rj.organizador_id,
    'nombre', rj.nombre,
    'foto_url', rj.foto_url,
    'riviera_id', COALESCE(i.riviera_id, v_user_riviera_id),
    'edad', rj.edad,
    'en_cancha', rj.en_cancha,
    'instagram_url', rj.instagram_url,
    'facebook_url', rj.facebook_url,
    'tiktok_url', rj.tiktok_url
  )
  INTO v_student_profile
  FROM public.coach_student_account_links al
  JOIN public.riviera_jugadores rj ON rj.id = al.jugador_id
  LEFT JOIN public.riviera_official_player_identity i ON i.canonical_riviera_jugador_id = rj.id
  WHERE al.auth_user_id = v_caller AND al.is_active = true
  ORDER BY (rj.foto_url IS NOT NULL) DESC, al.updated_at DESC NULLS LAST, rj.id
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'relationship_id', r.id,
      'status', r.status,
      'is_primary', (r.status = 'ACTIVE' AND r.is_primary),
      'started_at', r.started_at,
      'ended_at', r.ended_at,
      'club', jsonb_build_object(
        'organizador_id', r.organizador_id,
        'nombre', public.get_organizador_display_name(r.organizador_id),
        'branding_key', ogm.branding_key
      ),
      'coach', jsonb_build_object(
        'id', c.id,
        'nombre', c.nombre,
        'coach_code', c.coach_code,
        'foto_url', c.foto_url,
        'especialidades', c.especialidades
      ),
      'player', jsonb_build_object(
        'id', rj.id,
        'nombre', rj.nombre,
        'foto_url', rj.foto_url,
        'riviera_id', COALESCE(
          (SELECT i.riviera_id FROM public.riviera_official_player_identity i
           WHERE i.canonical_riviera_jugador_id = rj.id LIMIT 1),
          v_user_riviera_id
        ),
        'rivieraId', COALESCE(
          (SELECT i.riviera_id FROM public.riviera_official_player_identity i
           WHERE i.canonical_riviera_jugador_id = rj.id LIMIT 1),
          v_user_riviera_id
        )
      ),
      'balance', jsonb_build_object(
        'balance_classes', COALESCE(b.balance_classes, 0),
        'total_classes_given', COALESCE(b.total_classes_given, 0),
        'updated_at', b.updated_at
      ),
      'upcoming_sessions', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', sch.id,
            'starts_at', sch.starts_at,
            'ends_at', sch.ends_at,
            'duration_minutes', sch.duration_minutes,
            'court', sch.court,
            'focus', sch.focus,
            'prep_message_to_student', sch.prep_message_to_student,
            'status', sch.status
          ) ORDER BY sch.starts_at ASC
        )
        FROM public.coach_sessions sch
        WHERE sch.relationship_id = r.id
          AND sch.status = 'SCHEDULED'
          AND sch.starts_at >= now() - interval '2 hours'
      ), '[]'::jsonb),
      'ledger', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', l.id,
            'delta', l.delta,
            'tipo', l.tipo,
            'created_at', l.created_at,
            'session', CASE WHEN s.id IS NOT NULL THEN jsonb_build_object(
              'id', s.id,
              'starts_at', s.starts_at,
              'duration_minutes', s.duration_minutes,
              'court', s.court,
              'focus', s.focus,
              'worked_on', s.worked_on,
              'improvements', s.improvements,
              'next_goals', s.next_goals,
              'motivational_message', s.motivational_message
            ) ELSE NULL END
          ) ORDER BY l.created_at DESC
        )
        FROM (
          SELECT id, delta, tipo, created_at, session_id
          FROM public.coach_class_ledger
          WHERE relationship_id = r.id
          ORDER BY created_at DESC
          LIMIT 50
        ) l
        LEFT JOIN public.coach_sessions s ON s.id = l.session_id
      ), '[]'::jsonb)
    ) ORDER BY (CASE WHEN r.status = 'ACTIVE' THEN 0 WHEN r.status = 'PAUSED' THEN 1 ELSE 2 END), r.is_primary DESC, r.created_at DESC
  ), '[]'::jsonb)
  INTO v_results
  FROM public.coach_player_relationships r
  JOIN public.riviera_coaches c ON c.id = r.coach_id
  JOIN public.riviera_jugadores rj ON rj.id = r.jugador_id
  LEFT JOIN public.organizador_game_modes ogm ON ogm.organizador_id = r.organizador_id
  LEFT JOIN public.coach_player_class_balances b ON b.relationship_id = r.id
  JOIN public.coach_student_account_links al
    ON al.organizador_id = r.organizador_id
   AND al.jugador_id = r.jugador_id
   AND al.auth_user_id = v_caller
   AND al.is_active = true
  WHERE r.status IN ('ACTIVE', 'PAUSED', 'ENDED');

  RETURN jsonb_build_object(
    'ok', true,
    'linked', true,
    'riviera_id', v_user_riviera_id,
    'rivieraId', v_user_riviera_id,
    'student_profile', v_student_profile,
    'relationships', COALESCE(v_results, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_coaching_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_coaching_overview() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
