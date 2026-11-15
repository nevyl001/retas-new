-- =============================================================================
-- 0133_coaching_coach_session_preparation.sql
--
-- Riviera Coaching — Separación de responsabilidades:
-- EL CLUB SIEMPRE AGENDA LAS CLASES. EL COACH PREPARA Y DOCUMENTA SUS ENTRENAMIENTOS.
--
-- Esta RPC permite al coach asignado guardar o actualizar el tema pedagógico (focus)
-- y las notas previas (notes_summary) de una sesión programada (status = 'SCHEDULED'),
-- sin descontar saldo ni registrar la clase como impartida.
--
-- El coach no puede alterar la fecha, hora, duración, pista, club ni alumno.
-- Sólo el coach asignado o Master Admin pueden preparar la clase.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.save_coach_session_preparation(
  p_session_id uuid,
  p_focus text DEFAULT NULL,
  p_notes_summary text DEFAULT NULL
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
    updated_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'ok', true,
    'session_id', v_sess.id,
    'focus', v_trimmed_focus,
    'notes_summary', v_trimmed_notes,
    'message', 'Preparación guardada exitosamente.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_coach_session_preparation(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_coach_session_preparation(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.save_coach_session_preparation(uuid, text, text) IS
  'Permite al coach asignado guardar el tema y notas de su entrenamiento para una clase programada.';

COMMIT;
