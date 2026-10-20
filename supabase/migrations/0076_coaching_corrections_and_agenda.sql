-- ==============================================================================
-- 0076_coaching_corrections_and_agenda.sql
--
-- Riviera Coaching: Corrección de Clases, Agenda Real y Control Administrativo
-- 1. Modificaciones de esquema en coach_class_ledger y coach_sessions:
--    - reference_ledger_id para ajustes compensatorios
--    - court, reverted_at, reverted_by, cancellation_reason para agenda y reversiones
-- 2. RPC adjust_coach_student_classes:
--    - Corrección administrativa de saldo mediante movimientos compensatorios inmutables (ADJUSTMENT).
--    - Previene saldos negativos y mantiene trazabilidad con el movimiento original.
-- 3. RPC revert_coach_class_session:
--    - Reversión autorizada de una clase marcada como impartida por error (CLASS_DEBIT).
--    - Restaura el saldo (+1) y corrige el contador de clases impartidas.
-- 4. RPCs de Agenda Real:
--    - schedule_coach_class: Programación de citas entre coach y alumno en cancha.
--    - reschedule_coach_class: Reprogramación autorizada de clases.
--    - cancel_coach_class: Cancelación con motivo obligatorio.
--    - fetch_club_coaching_agenda: Consulta de agenda con filtros de fecha y coach.
-- 5. Actualización de get_student_coaching_overview:
--    - Incluye próximas clases agendadas (SCHEDULED) para el alumno.
-- ==============================================================================

-- ── 1. MODIFICACIONES DE ESQUEMA ─────────────────────────────────────────────

-- Referencia de compensación en ledger
ALTER TABLE public.coach_class_ledger
  ADD COLUMN IF NOT EXISTS reference_ledger_id uuid REFERENCES public.coach_class_ledger(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ledger_reference_id
  ON public.coach_class_ledger (reference_ledger_id)
  WHERE reference_ledger_id IS NOT NULL;

-- Campos adicionales en coach_sessions para agenda y reversiones
ALTER TABLE public.coach_sessions
  ADD COLUMN IF NOT EXISTS court text,
  ADD COLUMN IF NOT EXISTS reverted_at timestamptz,
  ADD COLUMN IF NOT EXISTS reverted_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

CREATE INDEX IF NOT EXISTS idx_coach_sessions_org_starts
  ON public.coach_sessions (organizador_id, starts_at DESC);

CREATE INDEX IF NOT EXISTS idx_coach_sessions_coach_starts
  ON public.coach_sessions (coach_id, starts_at DESC);

CREATE INDEX IF NOT EXISTS idx_coach_sessions_status
  ON public.coach_sessions (status);

-- ── 2. RPC: adjust_coach_student_classes ──────────────────────────────────────
DROP FUNCTION IF EXISTS public.adjust_coach_student_classes(uuid, uuid, integer, text, text);

CREATE OR REPLACE FUNCTION public.adjust_coach_student_classes(
  p_organizador_id uuid,
  p_ledger_id uuid,
  p_adjustment_delta integer,
  p_reason text,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_orig record;
  v_rel record;
  v_bal record;
  v_cur_balance integer;
  v_new_balance integer;
  v_trimmed_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_trimmed_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_existing_adj record;
  v_adj_id uuid;
  v_now timestamptz := now();
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  -- 1. Autorización administrativa
  IF v_caller <> p_organizador_id AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo el administrador del club puede corregir saldos de clases.');
  END IF;

  -- 2. Comprobar que el club tiene el módulo de Coaching activo
  IF NOT EXISTS (
    SELECT 1 FROM public.organizador_game_modes
    WHERE organizador_id = p_organizador_id AND coaching_enabled = true
  ) AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El club no tiene habilitado el módulo de Coaching.');
  END IF;

  -- 3. Validar motivo obligatorio y delta no nulo
  IF v_trimmed_reason IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El motivo de la corrección es obligatorio.');
  END IF;

  IF p_adjustment_delta IS NULL OR p_adjustment_delta = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El ajuste debe ser una cantidad distinta de cero.');
  END IF;

  -- 4. Localizar movimiento original en el ledger
  SELECT *
  INTO v_orig
  FROM public.coach_class_ledger
  WHERE id = p_ledger_id AND organizador_id = p_organizador_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Movimiento original no encontrado o no pertenece a este club.');
  END IF;

  -- 5. Manejo de Idempotencia estricta
  IF v_trimmed_key IS NOT NULL THEN
    SELECT *
    INTO v_existing_adj
    FROM public.coach_class_ledger
    WHERE idempotency_key = v_trimmed_key;

    IF FOUND THEN
      -- Comprobar que los parámetros coincidan exactamente
      IF v_existing_adj.recorded_by <> v_caller
         OR v_existing_adj.organizador_id <> p_organizador_id
         OR v_existing_adj.relationship_id <> v_orig.relationship_id
         OR v_existing_adj.reference_ledger_id <> p_ledger_id
         OR v_existing_adj.delta <> p_adjustment_delta THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'Conflicto de idempotencia: la clave ya fue utilizada en otra operación o con parámetros distintos.'
        );
      END IF;

      SELECT balance_classes INTO v_cur_balance
      FROM public.coach_player_class_balances
      WHERE relationship_id = v_orig.relationship_id;

      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'adjustment_id', v_existing_adj.id,
        'delta', v_existing_adj.delta,
        'new_balance', COALESCE(v_cur_balance, 0),
        'message', 'Operación idempotente: la corrección ya fue registrada previamente.'
      );
    END IF;
  END IF;

  -- 6. Bloquear relación y saldo con FOR UPDATE
  SELECT id, status, coach_id, jugador_id
  INTO v_rel
  FROM public.coach_player_relationships
  WHERE id = v_orig.relationship_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Relación coach-alumno no encontrada.');
  END IF;

  SELECT id, balance_classes, total_classes_given
  INTO v_bal
  FROM public.coach_player_class_balances
  WHERE relationship_id = v_orig.relationship_id
  FOR UPDATE;

  v_cur_balance := COALESCE(v_bal.balance_classes, 0);
  v_new_balance := v_cur_balance + p_adjustment_delta;

  -- 7. Prevenir saldos negativos
  IF v_new_balance < 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No es posible aplicar esta corrección porque provocaría un saldo negativo (' || v_new_balance || '). Saldo actual disponible: ' || v_cur_balance || '.'
    );
  END IF;

  -- 8. Actualizar saldo en coach_player_class_balances
  UPDATE public.coach_player_class_balances
  SET balance_classes = v_new_balance,
      updated_at = v_now
  WHERE id = v_bal.id;

  -- 9. Registrar movimiento compensatorio ADJUSTMENT en coach_class_ledger
  INSERT INTO public.coach_class_ledger (
    relationship_id,
    organizador_id,
    coach_id,
    jugador_id,
    delta,
    tipo,
    notas,
    idempotency_key,
    reference_ledger_id,
    recorded_by,
    created_at
  )
  VALUES (
    v_orig.relationship_id,
    p_organizador_id,
    v_orig.coach_id,
    v_orig.jugador_id,
    p_adjustment_delta,
    'ADJUSTMENT',
    'Corrección administrativa: ' || v_trimmed_reason,
    v_trimmed_key,
    p_ledger_id,
    v_caller,
    v_now
  )
  RETURNING id INTO v_adj_id;

  -- 10. Auditoría en coach_audit_log
  INSERT INTO public.coach_audit_log (
    actor_auth_user_id,
    action,
    entity_type,
    entity_id,
    payload,
    created_at
  )
  VALUES (
    v_caller,
    'CLASS_BALANCE_ADJUSTMENT',
    'coach_player_class_balances',
    v_orig.relationship_id,
    jsonb_build_object(
      'original_ledger_id', p_ledger_id,
      'original_delta', v_orig.delta,
      'adjustment_delta', p_adjustment_delta,
      'previous_balance', v_cur_balance,
      'new_balance', v_new_balance,
      'reason', v_trimmed_reason
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'adjustment_id', v_adj_id,
    'delta', p_adjustment_delta,
    'new_balance', v_new_balance,
    'message', 'Saldo corregido exitosamente. Nuevo saldo disponible: ' || v_new_balance || ' clases.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_coach_student_classes(uuid, uuid, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_coach_student_classes(uuid, uuid, integer, text, text) TO authenticated, service_role;

-- ── 3. RPC: revert_coach_class_session ────────────────────────────────────────
DROP FUNCTION IF EXISTS public.revert_coach_class_session(uuid, uuid, text, text);

CREATE OR REPLACE FUNCTION public.revert_coach_class_session(
  p_organizador_id uuid,
  p_session_id uuid,
  p_reason text,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_sess record;
  v_debit_ledger record;
  v_bal record;
  v_new_balance integer;
  v_new_given integer;
  v_trimmed_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_trimmed_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_adj_id uuid;
  v_now timestamptz := now();
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  IF v_caller <> p_organizador_id AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo el club puede revertir clases registradas por error.');
  END IF;

  IF v_trimmed_reason IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El motivo de la reversión es obligatorio.');
  END IF;

  -- 1. Localizar y bloquear la sesión
  SELECT *
  INTO v_sess
  FROM public.coach_sessions
  WHERE id = p_session_id AND organizador_id = p_organizador_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sesión no encontrada o no pertenece a este club.');
  END IF;

  IF v_sess.status <> 'COMPLETED' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo se pueden revertir clases que hayan sido marcadas como impartidas (COMPLETED).');
  END IF;

  IF v_sess.reverted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta clase impartida ya fue revertida anteriormente el ' || v_sess.reverted_at || '.');
  END IF;

  -- 2. Localizar el descuento en el ledger (CLASS_DEBIT)
  SELECT *
  INTO v_debit_ledger
  FROM public.coach_class_ledger
  WHERE session_id = p_session_id AND tipo = 'CLASS_DEBIT'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No se encontró el descuento de clase asociado a esta sesión en el ledger.');
  END IF;

  -- 3. Bloquear saldo de la relación
  SELECT id, balance_classes, total_classes_given
  INTO v_bal
  FROM public.coach_player_class_balances
  WHERE relationship_id = v_sess.relationship_id
  FOR UPDATE;

  v_new_balance := COALESCE(v_bal.balance_classes, 0) + 1;
  v_new_given := GREATEST(0, COALESCE(v_bal.total_classes_given, 0) - 1);

  -- 4. Actualizar saldo (+1 disponible, -1 impartida)
  UPDATE public.coach_player_class_balances
  SET balance_classes = v_new_balance,
      total_classes_given = v_new_given,
      updated_at = v_now
  WHERE id = v_bal.id;

  -- 5. Registrar movimiento compensatorio en ledger (+1 ADJUSTMENT)
  INSERT INTO public.coach_class_ledger (
    relationship_id,
    organizador_id,
    coach_id,
    jugador_id,
    delta,
    tipo,
    notas,
    session_id,
    reference_ledger_id,
    idempotency_key,
    recorded_by,
    created_at
  )
  VALUES (
    v_sess.relationship_id,
    p_organizador_id,
    v_sess.coach_id,
    v_sess.jugador_id,
    1,
    'ADJUSTMENT',
    'Reversión autorizada de clase impartida por error: ' || v_trimmed_reason,
    p_session_id,
    v_debit_ledger.id,
    v_trimmed_key,
    v_caller,
    v_now
  )
  RETURNING id INTO v_adj_id;

  -- 6. Marcar sesión como revertida
  UPDATE public.coach_sessions
  SET reverted_at = v_now,
      reverted_by = v_caller,
      cancellation_reason = v_trimmed_reason,
      status = 'CANCELLED',
      updated_at = v_now
  WHERE id = p_session_id;

  -- 7. Auditoría
  INSERT INTO public.coach_audit_log (
    actor_auth_user_id,
    action,
    entity_type,
    entity_id,
    payload,
    created_at
  )
  VALUES (
    v_caller,
    'SESSION_REVERSAL',
    'coach_sessions',
    p_session_id,
    jsonb_build_object(
      'session_id', p_session_id,
      'debit_ledger_id', v_debit_ledger.id,
      'restored_classes', 1,
      'reason', v_trimmed_reason,
      'new_balance', v_new_balance
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'ok', true,
    'adjustment_id', v_adj_id,
    'new_balance', v_new_balance,
    'total_classes_given', v_new_given,
    'message', 'Clase impartida revertida correctamente. Se restauró 1 clase disponible al alumno.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revert_coach_class_session(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revert_coach_class_session(uuid, uuid, text, text) TO authenticated, service_role;

-- ── 4. RPCs DE AGENDA REAL ────────────────────────────────────────────────────

-- A. Programar clase (schedule_coach_class)
DROP FUNCTION IF EXISTS public.schedule_coach_class(uuid, uuid, uuid, timestamptz, integer, text, text, text);

CREATE OR REPLACE FUNCTION public.schedule_coach_class(
  p_organizador_id uuid,
  p_coach_id uuid,
  p_student_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer DEFAULT 60,
  p_court text DEFAULT NULL,
  p_focus text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_mem record;
  v_rel record;
  v_rel_id uuid;
  v_duration integer := COALESCE(p_duration_minutes, 60);
  v_ends_at timestamptz;
  v_session_id uuid;
  v_now timestamptz := now();
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  IF v_caller <> p_organizador_id AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo el club puede agendar clases de entrenamiento.');
  END IF;

  IF p_starts_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La fecha y hora de inicio son obligatorias.');
  END IF;

  IF v_duration < 15 OR v_duration > 360 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La duración debe ser entre 15 y 360 minutos.');
  END IF;

  v_ends_at := p_starts_at + (v_duration || ' minutes')::interval;

  -- 1. Validar que el coach pertenezca al club y esté activo
  SELECT id, status INTO v_mem
  FROM public.coach_club_memberships
  WHERE coach_id = p_coach_id AND organizador_id = p_organizador_id;

  IF NOT FOUND OR v_mem.status <> 'ACTIVE' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El entrenador no tiene membresía activa en este club.');
  END IF;

  -- 2. Validar que el alumno exista
  IF NOT EXISTS (SELECT 1 FROM public.riviera_jugadores WHERE id = p_student_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Alumno no encontrado.');
  END IF;

  -- 3. Obtener o crear relación activa entre coach y alumno en este club
  SELECT id, status INTO v_rel
  FROM public.coach_player_relationships
  WHERE coach_id = p_coach_id AND jugador_id = p_student_id AND organizador_id = p_organizador_id;

  IF NOT FOUND THEN
    INSERT INTO public.coach_player_relationships (
      coach_id, jugador_id, organizador_id, status, is_primary, started_at, updated_at
    )
    VALUES (
      p_coach_id, p_student_id, p_organizador_id, 'ACTIVE', true, v_now, v_now
    )
    RETURNING id INTO v_rel_id;
  ELSE
    v_rel_id := v_rel.id;
    IF v_rel.status <> 'ACTIVE' THEN
      UPDATE public.coach_player_relationships
      SET status = 'ACTIVE', updated_at = v_now
      WHERE id = v_rel_id;
    END IF;
  END IF;

  -- 4. Comprobar solapamiento de horarios del coach para sesiones SCHEDULED
  IF EXISTS (
    SELECT 1 FROM public.coach_sessions
    WHERE coach_id = p_coach_id
      AND status = 'SCHEDULED'
      AND tstzrange(starts_at, ends_at) && tstzrange(p_starts_at, v_ends_at)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El entrenador ya tiene otra clase agendada que se solapa con este horario.');
  END IF;

  -- 5. Insertar sesión programada
  INSERT INTO public.coach_sessions (
    coach_id,
    relationship_id,
    organizador_id,
    jugador_id,
    starts_at,
    ends_at,
    duration_minutes,
    court,
    focus,
    notes_summary,
    status,
    worked_on,
    created_at,
    updated_at
  )
  VALUES (
    p_coach_id,
    v_rel_id,
    p_organizador_id,
    p_student_id,
    p_starts_at,
    v_ends_at,
    v_duration,
    NULLIF(btrim(p_court), ''),
    NULLIF(btrim(p_focus), ''),
    NULLIF(btrim(p_notes), ''),
    'SCHEDULED',
    '{}',
    v_now,
    v_now
  )
  RETURNING id INTO v_session_id;

  RETURN jsonb_build_object(
    'ok', true,
    'session_id', v_session_id,
    'starts_at', p_starts_at,
    'ends_at', v_ends_at,
    'duration_minutes', v_duration,
    'court', NULLIF(btrim(p_court), ''),
    'message', 'Clase agendada exitosamente.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_coach_class(uuid, uuid, uuid, timestamptz, integer, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.schedule_coach_class(uuid, uuid, uuid, timestamptz, integer, text, text, text) TO authenticated, service_role;

-- B. Reprogramar clase (reschedule_coach_class)
DROP FUNCTION IF EXISTS public.reschedule_coach_class(uuid, uuid, timestamptz, integer, text, text);

CREATE OR REPLACE FUNCTION public.reschedule_coach_class(
  p_organizador_id uuid,
  p_session_id uuid,
  p_new_starts_at timestamptz,
  p_new_duration_minutes integer DEFAULT NULL,
  p_new_court text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_sess record;
  v_duration integer;
  v_new_ends_at timestamptz;
  v_now timestamptz := now();
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  IF v_caller <> p_organizador_id AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo el club puede reprogramar clases.');
  END IF;

  IF p_new_starts_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La nueva fecha y hora son requeridas.');
  END IF;

  SELECT *
  INTO v_sess
  FROM public.coach_sessions
  WHERE id = p_session_id AND organizador_id = p_organizador_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sesión no encontrada.');
  END IF;

  IF v_sess.status <> 'SCHEDULED' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo se pueden reprogramar clases en estado programada (SCHEDULED).');
  END IF;

  v_duration := COALESCE(p_new_duration_minutes, v_sess.duration_minutes, 60);
  v_new_ends_at := p_new_starts_at + (v_duration || ' minutes')::interval;

  -- Comprobar solapamientos excepto la sesión misma
  IF EXISTS (
    SELECT 1 FROM public.coach_sessions
    WHERE coach_id = v_sess.coach_id
      AND id <> p_session_id
      AND status = 'SCHEDULED'
      AND tstzrange(starts_at, ends_at) && tstzrange(p_new_starts_at, v_new_ends_at)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El entrenador ya tiene otra clase agendada en ese horario.');
  END IF;

  UPDATE public.coach_sessions
  SET starts_at = p_new_starts_at,
      ends_at = v_new_ends_at,
      duration_minutes = v_duration,
      court = COALESCE(NULLIF(btrim(p_new_court), ''), court),
      notes_summary = CASE
        WHEN p_reason IS NOT NULL AND btrim(p_reason) <> ''
        THEN COALESCE(notes_summary || ' | ', '') || 'Reprogramada: ' || btrim(p_reason)
        ELSE notes_summary
      END,
      updated_at = v_now
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'ok', true,
    'session_id', p_session_id,
    'starts_at', p_new_starts_at,
    'ends_at', v_new_ends_at,
    'duration_minutes', v_duration,
    'court', COALESCE(NULLIF(btrim(p_new_court), ''), v_sess.court),
    'message', 'Clase reprogramada exitosamente.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_coach_class(uuid, uuid, timestamptz, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reschedule_coach_class(uuid, uuid, timestamptz, integer, text, text) TO authenticated, service_role;

-- C. Cancelar clase (cancel_coach_class)
DROP FUNCTION IF EXISTS public.cancel_coach_class(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.cancel_coach_class(
  p_organizador_id uuid,
  p_session_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_sess record;
  v_trimmed_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_now timestamptz := now();
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  IF v_caller <> p_organizador_id AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo el club puede cancelar clases agendadas.');
  END IF;

  IF v_trimmed_reason IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El motivo de la cancelación es obligatorio.');
  END IF;

  SELECT *
  INTO v_sess
  FROM public.coach_sessions
  WHERE id = p_session_id AND organizador_id = p_organizador_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sesión no encontrada.');
  END IF;

  IF v_sess.status <> 'SCHEDULED' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo se pueden cancelar clases que estén en estado programada (SCHEDULED).');
  END IF;

  UPDATE public.coach_sessions
  SET status = 'CANCELLED',
      cancellation_reason = v_trimmed_reason,
      updated_at = v_now
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'ok', true,
    'session_id', p_session_id,
    'message', 'Clase cancelada exitosamente.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_coach_class(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_coach_class(uuid, uuid, text) TO authenticated, service_role;

-- D. Consultar agenda de coaching del club (fetch_club_coaching_agenda)
DROP FUNCTION IF EXISTS public.fetch_club_coaching_agenda(uuid, uuid, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.fetch_club_coaching_agenda(
  p_organizador_id uuid,
  p_coach_id uuid DEFAULT NULL,
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
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_from timestamptz := COALESCE(p_from_date, now() - interval '30 days');
  v_to timestamptz := COALESCE(p_to_date, now() + interval '90 days');
  v_sessions jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  IF v_caller <> p_organizador_id AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo el club puede consultar la agenda.');
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
    AND s.starts_at >= v_from
    AND s.starts_at <= v_to;

  RETURN jsonb_build_object(
    'ok', true,
    'sessions', v_sessions
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fetch_club_coaching_agenda(uuid, uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_club_coaching_agenda(uuid, uuid, timestamptz, timestamptz) TO authenticated, service_role;

-- ── 5. ACTUALIZAR get_student_coaching_overview (con próximas clases) ─────────
CREATE OR REPLACE FUNCTION public.get_student_coaching_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_email text;
  v_email_confirmed_at timestamptz;
  v_verified_jugador_ids uuid[] := '{}';
  v_official_keys uuid[] := '{}';
  v_user_riviera_id text;
  v_results jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Usuario no autenticado.'
    );
  END IF;

  SELECT lower(btrim(email)), email_confirmed_at
  INTO v_caller_email, v_email_confirmed_at
  FROM auth.users
  WHERE id = v_caller;

  -- 1. Identidades verificadas explícitas
  SELECT COALESCE(array_agg(DISTINCT jugador_id), '{}')
  INTO v_verified_jugador_ids
  FROM (
    SELECT jugador_id FROM public.coach_student_account_links WHERE auth_user_id = v_caller
    UNION
    SELECT jugador_id FROM public.rewards_player_links WHERE auth_user_id = v_caller
  ) verified;

  -- 2. Match de correo exacto (solo si el email está confirmado y no colisiona con otros perfiles)
  IF (v_verified_jugador_ids IS NULL OR array_length(v_verified_jugador_ids, 1) IS NULL)
     AND v_caller_email IS NOT NULL AND v_caller_email <> ''
     AND v_email_confirmed_at IS NOT NULL THEN

    SELECT COALESCE(array_agg(id), '{}')
    INTO v_verified_jugador_ids
    FROM public.riviera_jugadores
    WHERE lower(btrim(email)) = v_caller_email;

    IF array_length(v_verified_jugador_ids, 1) > 1 THEN
      v_verified_jugador_ids := '{}';
    END IF;
  END IF;

  -- Si no hay perfiles verificados, devolver no vinculado limpiamente
  IF v_verified_jugador_ids IS NULL OR array_length(v_verified_jugador_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'linked', false,
      'message', 'Tu cuenta no tiene una credencial oficial de jugador vinculada.',
      'relationships', '[]'::jsonb
    );
  END IF;

  -- 3. Expansión a todos los perfiles de la misma identidad oficial
  SELECT COALESCE(array_agg(DISTINCT official_player_key), '{}')
  INTO v_official_keys
  FROM public.riviera_official_player_identity
  WHERE canonical_riviera_jugador_id = ANY(v_verified_jugador_ids);

  IF v_official_keys IS NOT NULL AND array_length(v_official_keys, 1) > 0 THEN
    SELECT COALESCE(array_agg(DISTINCT canonical_riviera_jugador_id), v_verified_jugador_ids)
    INTO v_verified_jugador_ids
    FROM public.riviera_official_player_identity
    WHERE official_player_key = ANY(v_official_keys);
  END IF;

  SELECT riviera_id INTO v_user_riviera_id
  FROM public.riviera_official_player_identity
  WHERE canonical_riviera_jugador_id = ANY(v_verified_jugador_ids)
  LIMIT 1;

  -- 4. Construir resumen con detalle completo:
  -- - No expone notas administrativas
  -- - Incluye próximas clases agendadas (upcoming_sessions)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'relationship_id', r.id,
      'status', r.status,
      'is_primary', (r.status = 'ACTIVE' AND r.is_primary),
      'started_at', r.started_at,
      'ended_at', r.ended_at,
      'club', jsonb_build_object(
        'organizador_id', r.organizador_id,
        'nombre', COALESCE(u.name, ogm.branding_key, 'Club Riviera'),
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
              'motivational_message', s.motivational_message,
              'notes_summary', s.notes_summary
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
  LEFT JOIN public.users u ON u.id = r.organizador_id
  LEFT JOIN public.organizador_game_modes ogm ON ogm.organizador_id = r.organizador_id
  LEFT JOIN public.coach_player_class_balances b ON b.relationship_id = r.id
  WHERE r.jugador_id = ANY(v_verified_jugador_ids)
    AND r.status IN ('ACTIVE', 'PAUSED', 'ENDED');

  RETURN jsonb_build_object(
    'ok', true,
    'linked', true,
    'riviera_id', v_user_riviera_id,
    'relationships', COALESCE(v_results, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_coaching_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_coaching_overview() TO authenticated, service_role;
