-- =============================================================================
-- 0124_coaching_record_class_with_followup_atomic.sql
--
-- Riviera Coaching — registro atómico de clase + seguimiento pedagógico.
--
-- Problema: el portal llamaba record_coach_class_session y luego
-- update_coach_class_followup. Si el segundo fallaba, el saldo ya estaba
-- descontado y el seguimiento (áreas, recomendaciones, notas privadas)
-- quedaba incompleto.
--
-- Solución: nueva RPC que ejecuta ambas operaciones en UNA sola transacción.
-- Si el seguimiento no puede guardarse, se hace RAISE y se revierte el
-- descuento / la finalización de la sesión.
--
-- No altera firmas de record_coach_class_session ni update_coach_class_followup.
-- La edición posterior de seguimiento sigue usando update_coach_class_followup.
--
-- APLICACIÓN: ejecutar este archivo solo, a mano. No usar db push.
-- No toca schema_migrations. Después de aplicarla hay que registrar la
-- versión 0124 en el historial antes de cualquier db push futuro; si no,
-- el CLI la verá pendiente y volverá a ejecutarla. CREATE OR REPLACE es
-- idempotente, pero no debe reaplicarse por accidente junto con 0082–0123.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.record_coach_class_session_with_followup(
  p_relationship_id uuid,
  p_notas text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_session_id uuid DEFAULT NULL,
  p_worked_on text[] DEFAULT '{}',
  p_improvements text DEFAULT NULL,
  p_next_goals text DEFAULT NULL,
  p_motivational_message text DEFAULT NULL,
  p_duration_minutes integer DEFAULT 60,
  p_areas_to_improve text DEFAULT NULL,
  p_recommendations text DEFAULT NULL,
  p_private_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_record jsonb;
  v_followup jsonb;
  v_session_id uuid;
  v_ok boolean;
  v_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_constraint text;
  v_existing record;
  v_balance record;
BEGIN
  v_record := public.record_coach_class_session(
    p_relationship_id,
    p_notas,
    p_idempotency_key,
    p_session_id,
    COALESCE(p_worked_on, '{}'::text[]),
    p_improvements,
    p_next_goals,
    p_motivational_message,
    p_duration_minutes
  );

  v_ok := COALESCE((v_record->>'ok')::boolean, false);
  IF NOT v_ok THEN
    RETURN v_record;
  END IF;

  -- La clave ya confirmó clase y seguimiento en una transacción anterior.
  -- No se vuelve a descontar ni se reescribe el seguimiento, aunque el
  -- reintento traiga recomendaciones o notas distintas.
  IF COALESCE((v_record->>'idempotent')::boolean, false) THEN
    RETURN v_record || jsonb_build_object(
      'followup_ok', true,
      'followup_preserved', true
    );
  END IF;

  v_session_id := NULLIF(v_record->>'session_id', '')::uuid;
  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'Registro de clase sin session_id; se revierte la operación.';
  END IF;

  -- Misma unidad de trabajo: cualquier fallo aquí revierte el CLASS_DEBIT.
  v_followup := public.update_coach_class_followup(
    v_session_id,
    COALESCE(p_worked_on, '{}'::text[]),
    p_improvements,
    p_areas_to_improve,
    p_recommendations,
    p_next_goals,
    p_motivational_message,
    p_private_notes
  );

  IF NOT COALESCE((v_followup->>'ok')::boolean, false) THEN
    RAISE EXCEPTION '%',
      COALESCE(
        NULLIF(btrim(v_followup->>'error'), ''),
        'No se pudo guardar el seguimiento de la clase; se revierte el registro.'
      );
  END IF;

  RETURN v_record || jsonb_build_object(
    'followup_ok', true,
    'followup_updated_at', v_followup->'followup_updated_at'
  );
EXCEPTION
  WHEN unique_violation THEN
    -- Dos peticiones simultáneas con la misma clave: el índice único
    -- idx_ccl_idempotency aborta la perdedora. No hay segundo descuento
    -- ni se reescribe el seguimiento que ya confirmó la ganadora.
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint IS DISTINCT FROM 'idx_ccl_idempotency' OR v_key IS NULL THEN
      RAISE;
    END IF;

    SELECT id, tipo, relationship_id, recorded_by, delta, session_id
    INTO v_existing
    FROM public.coach_class_ledger
    WHERE idempotency_key = v_key;

    IF NOT FOUND
       OR v_existing.recorded_by IS DISTINCT FROM auth.uid()
       OR v_existing.relationship_id IS DISTINCT FROM p_relationship_id
       OR v_existing.tipo IS DISTINCT FROM 'CLASS_DEBIT'
       OR v_existing.delta IS DISTINCT FROM -1
       OR v_existing.session_id IS NULL THEN
      RAISE EXCEPTION 'Conflicto de idempotencia: la clave ya fue utilizada en otra operación o con parámetros distintos.';
    END IF;

    -- La transacción ganadora ya confirmó clase y seguimiento. No se reescribe.
    SELECT balance_classes, total_classes_given
    INTO v_balance
    FROM public.coach_player_class_balances
    WHERE relationship_id = p_relationship_id;

    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'followup_ok', true,
      'followup_preserved', true,
      'session_id', v_existing.session_id,
      'remaining_balance', COALESCE(v_balance.balance_classes, 0),
      'total_classes_given', COALESCE(v_balance.total_classes_given, 0),
      'message', 'Operación idempotente: esta clase ya había sido registrada previamente.'
    );
END;
$$;

COMMENT ON FUNCTION public.record_coach_class_session_with_followup(
  uuid, text, text, uuid, text[], text, text, text, integer, text, text, text
) IS
  'Registra clase impartida + seguimiento (incl. notas privadas) en una sola transacción. Si el seguimiento falla, revierte el descuento.';

REVOKE ALL ON FUNCTION public.record_coach_class_session_with_followup(
  uuid, text, text, uuid, text[], text, text, text, integer, text, text, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.record_coach_class_session_with_followup(
  uuid, text, text, uuid, text[], text, text, text, integer, text, text, text
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
