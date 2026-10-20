-- ==============================================================================
-- 0077_coaching_integrity_agenda_and_balances.sql
--
-- Riviera Coaching: Integridad de Clases, Agenda Real y Saldos Blindados
--
-- 1. Esquema y RLS en coach_sessions:
--    - idempotency_key único para programación idempotente de citas.
--    - RLS y permisos restringidos: Revocar INSERT, UPDATE, DELETE directos para
--      evitar que PostgREST eluda las reglas de negocio de los RPCs autorizados.
-- 2. Corrección de reversión en revert_coach_class_session:
--    - Elimina violación de unicidad en idx_ccl_session (session_id := NULL en el ADJUSTMENT).
--    - Vincula la compensación al débito original mediante reference_ledger_id.
--    - Blindaje contra doble reversión y restauración segura de saldos.
-- 3. Blindaje de agenda en schedule_coach_class:
--    - NO auto-creación ni auto-reactivación de relaciones: Exige relación ACTIVE previa.
--    - Exige membresía ACTIVE del coach en el club correspondiente.
--    - Serialización concurrente con pg_advisory_xact_lock (coach, alumno, cancha).
--    - Control estricto de capacidad: saldo_disponible - sesiones_SCHEDULED > 0.
--    - Control anti-solapamiento (overlap) para coach, alumno y cancha.
--    - Soporte de clave de idempotencia persistente.
-- 4. Reprogramación y Cancelación de Agenda:
--    - reschedule_coach_class: Anti-solapamiento excluyendo la cita actual.
--    - cancel_coach_class: Cancelación con motivo obligatorio y liberación de reserva.
-- 5. Control de ajuste de clases en adjust_coach_student_classes:
--    - Valida que new_balance >= sesiones_SCHEDULED pendientes para no invalidar reservas.
-- 6. Finalización estricta de sesiones en record_coach_class_session:
--    - Valida rigurosamente p_session_id: coach, club, alumno, relación y status = 'SCHEDULED'.
--    - Rechaza sesiones CANCELLED o ya COMPLETED.
-- 7. Privacidad total del seguimiento en get_student_coaching_overview:
--    - Oculta notas internas (notes_summary y ledger.notas) del alumno.
-- 8. Consultas de Agenda:
--    - fetch_club_coaching_agenda: Soporte de p_status_filter y acceso autorizado para coach.
--    - fetch_coach_agenda: RPC dedicado para consulta de agenda por el coach autenticado.
-- ==============================================================================

-- ── 1. ESQUEMA Y POLÍTICAS RLS EN coach_sessions ─────────────────────────────

ALTER TABLE public.coach_sessions
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_sessions_idempotency
  ON public.coach_sessions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Proteger coach_sessions de mutaciones directas vía PostgREST
REVOKE INSERT, UPDATE, DELETE ON public.coach_sessions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.coach_sessions FROM anon;
GRANT SELECT ON public.coach_sessions TO authenticated;

DROP POLICY IF EXISTS csess_all_coach ON public.coach_sessions;
DROP POLICY IF EXISTS csess_organizador_select ON public.coach_sessions;
DROP POLICY IF EXISTS csess_select_policy ON public.coach_sessions;

CREATE POLICY csess_select_policy ON public.coach_sessions
  FOR SELECT
  TO authenticated
  USING (
    organizador_id = auth.uid()
    OR coach_id = public.current_riviera_coach_id()
    OR jugador_id IN (
      SELECT jugador_id FROM public.coach_student_account_links WHERE auth_user_id = auth.uid()
      UNION
      SELECT jugador_id FROM public.rewards_player_links WHERE auth_user_id = auth.uid()
    )
    OR COALESCE(public.is_master_admin(), false)
  );

-- ── 2. RPC: revert_coach_class_session ────────────────────────────────────────
-- Corrige el error de unicidad en idx_ccl_session al fijar session_id := NULL en el ADJUSTMENT
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
  v_existing_adj record;
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

  -- 2. Localizar el débito original en el ledger
  SELECT *
  INTO v_debit_ledger
  FROM public.coach_class_ledger
  WHERE session_id = p_session_id AND tipo = 'CLASS_DEBIT'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No se encontró el descuento de clase asociado a esta sesión en el ledger.');
  END IF;

  -- 3. Idempotencia estricta
  IF v_trimmed_key IS NOT NULL THEN
    SELECT *
    INTO v_existing_adj
    FROM public.coach_class_ledger
    WHERE idempotency_key = v_trimmed_key;

    IF FOUND THEN
      IF v_existing_adj.recorded_by <> v_caller
         OR v_existing_adj.organizador_id <> p_organizador_id
         OR v_existing_adj.relationship_id <> v_sess.relationship_id
         OR v_existing_adj.reference_ledger_id <> v_debit_ledger.id
         OR v_existing_adj.tipo <> 'ADJUSTMENT'
         OR v_existing_adj.delta <> 1 THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'Conflicto de idempotencia: la clave ya fue utilizada en otra operación o con parámetros distintos.'
        );
      END IF;

      SELECT balance_classes, total_classes_given INTO v_bal
      FROM public.coach_player_class_balances
      WHERE relationship_id = v_sess.relationship_id;

      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'adjustment_id', v_existing_adj.id,
        'new_balance', COALESCE(v_bal.balance_classes, 0),
        'total_classes_given', COALESCE(v_bal.total_classes_given, 0),
        'message', 'Operación idempotente: la reversión de esta clase ya fue procesada previamente.'
      );
    END IF;
  END IF;

  -- 4. Validar estado y preexistencia de reversión
  IF v_sess.reverted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta clase impartida ya fue revertida anteriormente el ' || v_sess.reverted_at || '.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.coach_class_ledger
    WHERE reference_ledger_id = v_debit_ledger.id AND tipo = 'ADJUSTMENT'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta sesión ya cuenta con una reversión registrada en el historial.');
  END IF;

  IF v_sess.status <> 'COMPLETED' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo se pueden revertir clases que hayan sido marcadas como impartidas (COMPLETED).');
  END IF;

  -- 5. Bloquear y actualizar saldo (+1 disponible, -1 impartida con guarda GREATEST)
  SELECT id, balance_classes, total_classes_given
  INTO v_bal
  FROM public.coach_player_class_balances
  WHERE relationship_id = v_sess.relationship_id
  FOR UPDATE;

  v_new_balance := COALESCE(v_bal.balance_classes, 0) + 1;
  v_new_given := GREATEST(0, COALESCE(v_bal.total_classes_given, 0) - 1);

  UPDATE public.coach_player_class_balances
  SET balance_classes = v_new_balance,
      total_classes_given = v_new_given,
      updated_at = v_now
  WHERE id = v_bal.id;

  -- 6. Insertar movimiento compensatorio ADJUSTMENT
  -- NOTA CRÍTICA: session_id debe ser NULL para respetar el índice único idx_ccl_session
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
    NULL,
    v_debit_ledger.id,
    v_trimmed_key,
    v_caller,
    v_now
  )
  RETURNING id INTO v_adj_id;

  -- 7. Actualizar estado de la sesión
  UPDATE public.coach_sessions
  SET reverted_at = v_now,
      reverted_by = v_caller,
      cancellation_reason = v_trimmed_reason,
      status = 'CANCELLED',
      updated_at = v_now
  WHERE id = p_session_id;

  -- 8. Auditoría
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
      'adjustment_ledger_id', v_adj_id,
      'restored_classes', 1,
      'reason', v_trimmed_reason,
      'previous_balance', COALESCE(v_bal.balance_classes, 0),
      'new_balance', v_new_balance,
      'total_classes_given', v_new_given
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'adjustment_id', v_adj_id,
    'new_balance', v_new_balance,
    'total_classes_given', v_new_given,
    'message', 'Clase impartida revertida correctamente. Se restauró 1 clase disponible al alumno.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revert_coach_class_session(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revert_coach_class_session(uuid, uuid, text, text) TO authenticated, service_role;

-- ── 3. RPC: adjust_coach_student_classes ──────────────────────────────────────
-- Valida que una reducción de saldo no sea inferior a las citas SCHEDULED pendientes
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
  v_scheduled_count integer;
  v_trimmed_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_trimmed_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_existing_adj record;
  v_adj_id uuid;
  v_now timestamptz := now();
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  IF v_caller <> p_organizador_id AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo el administrador del club puede corregir saldos de clases.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organizador_game_modes
    WHERE organizador_id = p_organizador_id AND coaching_enabled = true
  ) AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El club no tiene habilitado el módulo de Coaching.');
  END IF;

  IF v_trimmed_reason IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El motivo de la corrección es obligatorio.');
  END IF;

  IF p_adjustment_delta IS NULL OR p_adjustment_delta = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El ajuste debe ser una cantidad distinta de cero.');
  END IF;

  SELECT *
  INTO v_orig
  FROM public.coach_class_ledger
  WHERE id = p_ledger_id AND organizador_id = p_organizador_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Movimiento original no encontrado o no pertenece a este club.');
  END IF;

  -- Idempotencia estricta
  IF v_trimmed_key IS NOT NULL THEN
    SELECT *
    INTO v_existing_adj
    FROM public.coach_class_ledger
    WHERE idempotency_key = v_trimmed_key;

    IF FOUND THEN
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

  IF v_new_balance < 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No es posible aplicar esta corrección porque provocaría un saldo negativo (' || v_new_balance || '). Saldo actual disponible: ' || v_cur_balance || '.'
    );
  END IF;

  -- Comprobar que el nuevo saldo cubra las clases ya agendadas pendientes (SCHEDULED)
  SELECT COUNT(*) INTO v_scheduled_count
  FROM public.coach_sessions
  WHERE relationship_id = v_orig.relationship_id
    AND status = 'SCHEDULED';

  IF v_new_balance < v_scheduled_count THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No es posible aplicar esta corrección: el alumno tiene ' || v_scheduled_count || ' clase(s) agendada(s) pendiente(s). El nuevo saldo (' || v_new_balance || ') no puede ser menor que las reservas activas.'
    );
  END IF;

  UPDATE public.coach_player_class_balances
  SET balance_classes = v_new_balance,
      updated_at = v_now
  WHERE id = v_bal.id;

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
      'pending_scheduled_classes', v_scheduled_count,
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

-- ── 4. RPC: schedule_coach_class ─────────────────────────────────────────────
-- Integridad completa: relación ACTIVE previa, capacidad garantizada, anti-solapamiento con locks
DROP FUNCTION IF EXISTS public.schedule_coach_class(uuid, uuid, uuid, timestamptz, integer, text, text, text);
DROP FUNCTION IF EXISTS public.schedule_coach_class(uuid, uuid, uuid, timestamptz, integer, text, text, text, text);

CREATE OR REPLACE FUNCTION public.schedule_coach_class(
  p_organizador_id uuid,
  p_coach_id uuid,
  p_student_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer DEFAULT 60,
  p_court text DEFAULT NULL,
  p_focus text DEFAULT NULL,
  p_notes text DEFAULT NULL,
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
  v_mem record;
  v_rel record;
  v_bal record;
  v_duration integer := COALESCE(p_duration_minutes, 60);
  v_ends_at timestamptz;
  v_session_id uuid;
  v_scheduled_count integer;
  v_available_to_schedule integer;
  v_trimmed_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_trimmed_court text := NULLIF(btrim(COALESCE(p_court, '')), '');
  v_trimmed_focus text := NULLIF(btrim(COALESCE(p_focus, '')), '');
  v_trimmed_notes text := NULLIF(btrim(COALESCE(p_notes, '')), '');
  v_existing_session record;
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

  -- 1. Validar que el coach pertenezca al club y esté ACTIVO
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

  -- 3. Exigir relación técnica ACTIVA previa (PROHIBIDO auto-crear o reactivar relaciones)
  SELECT id, status INTO v_rel
  FROM public.coach_player_relationships
  WHERE coach_id = p_coach_id AND jugador_id = p_student_id AND organizador_id = p_organizador_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El alumno no está asignado a este entrenador en tu club. Asígnalo primero desde la sección de Alumnos.'
    );
  END IF;

  IF v_rel.status <> 'ACTIVE' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'La relación entre el entrenador y el alumno no está activa (estado actual: ' || v_rel.status || '). Solo se pueden agendar clases con alumnos en estado ACTIVO.'
    );
  END IF;

  -- 4. Idempotencia estricta antes de adquirir cerraduras transaccionales
  IF v_trimmed_key IS NOT NULL THEN
    SELECT *
    INTO v_existing_session
    FROM public.coach_sessions
    WHERE idempotency_key = v_trimmed_key;

    IF FOUND THEN
      IF v_existing_session.organizador_id <> p_organizador_id
         OR v_existing_session.coach_id <> p_coach_id
         OR v_existing_session.jugador_id <> p_student_id
         OR v_existing_session.starts_at <> p_starts_at
         OR v_existing_session.duration_minutes <> v_duration THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'Conflicto de idempotencia: la clave ya fue utilizada con parámetros distintos.'
        );
      END IF;

      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'session_id', v_existing_session.id,
        'starts_at', v_existing_session.starts_at,
        'ends_at', v_existing_session.ends_at,
        'duration_minutes', v_existing_session.duration_minutes,
        'court', v_existing_session.court,
        'message', 'Operación idempotente: la clase ya fue agendada previamente.'
      );
    END IF;
  END IF;

  -- 5. Cerraduras transaccionales (pg_advisory_xact_lock) para evitar carreras concurrentes
  PERFORM pg_advisory_xact_lock(hashtext('coach_schedule:' || p_coach_id::text)::bigint);
  PERFORM pg_advisory_xact_lock(hashtext('student_schedule:' || p_student_id::text)::bigint);
  IF v_trimmed_court IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('court_schedule:' || p_organizador_id::text || ':' || lower(v_trimmed_court))::bigint);
  END IF;

  -- 6. Verificación de capacidad: saldo_disponible - sesiones_SCHEDULED > 0
  SELECT id, balance_classes INTO v_bal
  FROM public.coach_player_class_balances
  WHERE relationship_id = v_rel.id
  FOR UPDATE;

  SELECT COUNT(*) INTO v_scheduled_count
  FROM public.coach_sessions
  WHERE relationship_id = v_rel.id
    AND status = 'SCHEDULED';

  v_available_to_schedule := COALESCE(v_bal.balance_classes, 0) - v_scheduled_count;

  IF v_available_to_schedule <= 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El alumno no cuenta con clases disponibles suficientes para agendar. Saldo contratado: ' || COALESCE(v_bal.balance_classes, 0) || ', clases ya reservadas pendientes: ' || v_scheduled_count || '. Asigna o abona más clases antes de agendar.'
    );
  END IF;

  -- 7. Comprobación de anti-solapamiento (Overlaps)
  -- A. Coach
  IF EXISTS (
    SELECT 1 FROM public.coach_sessions
    WHERE coach_id = p_coach_id
      AND status = 'SCHEDULED'
      AND tstzrange(starts_at, ends_at) && tstzrange(p_starts_at, v_ends_at)
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El entrenador ya tiene otra clase agendada que se solapa con este horario.'
    );
  END IF;

  -- B. Alumno
  IF EXISTS (
    SELECT 1 FROM public.coach_sessions
    WHERE jugador_id = p_student_id
      AND status = 'SCHEDULED'
      AND tstzrange(starts_at, ends_at) && tstzrange(p_starts_at, v_ends_at)
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El alumno ya tiene otra clase agendada que se solapa con este horario.'
    );
  END IF;

  -- C. Cancha (si fue especificada)
  IF v_trimmed_court IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.coach_sessions
      WHERE organizador_id = p_organizador_id
        AND lower(btrim(court)) = lower(v_trimmed_court)
        AND status = 'SCHEDULED'
        AND tstzrange(starts_at, ends_at) && tstzrange(p_starts_at, v_ends_at)
    ) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'La cancha "' || v_trimmed_court || '" ya está reservada para otra clase en este club durante ese horario.'
      );
    END IF;
  END IF;

  -- 8. Insertar sesión programada (sin descontar balance aún; se reserva capacidad)
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
    idempotency_key,
    created_at,
    updated_at
  )
  VALUES (
    p_coach_id,
    v_rel.id,
    p_organizador_id,
    p_student_id,
    p_starts_at,
    v_ends_at,
    v_duration,
    v_trimmed_court,
    v_trimmed_focus,
    v_trimmed_notes,
    'SCHEDULED',
    '{}',
    v_trimmed_key,
    v_now,
    v_now
  )
  RETURNING id INTO v_session_id;

  -- 9. Auditoría
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
    'CLASS_SCHEDULED',
    'coach_sessions',
    v_session_id,
    jsonb_build_object(
      'coach_id', p_coach_id,
      'student_id', p_student_id,
      'starts_at', p_starts_at,
      'ends_at', v_ends_at,
      'duration_minutes', v_duration,
      'court', v_trimmed_court,
      'remaining_reservable', (v_available_to_schedule - 1)
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'session_id', v_session_id,
    'starts_at', p_starts_at,
    'ends_at', v_ends_at,
    'duration_minutes', v_duration,
    'court', v_trimmed_court,
    'remaining_reservable', (v_available_to_schedule - 1),
    'message', 'Clase agendada exitosamente.'
  );
END;
$$;

DROP FUNCTION IF EXISTS public.schedule_coach_class(uuid, uuid, uuid, timestamptz, integer, text, text, text);

REVOKE ALL ON FUNCTION public.schedule_coach_class(uuid, uuid, uuid, timestamptz, integer, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.schedule_coach_class(uuid, uuid, uuid, timestamptz, integer, text, text, text, text) TO authenticated, service_role;

-- ── 5. RPC: reschedule_coach_class ───────────────────────────────────────────
-- Reprograma cita validando solapamientos de coach, alumno y cancha
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
  v_effective_court text;
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
    RETURN jsonb_build_object('ok', false, 'error', 'Sesión no encontrada o no pertenece a este club.');
  END IF;

  IF v_sess.status <> 'SCHEDULED' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo se pueden reprogramar clases en estado programada (SCHEDULED). Estado actual: ' || v_sess.status || '.');
  END IF;

  v_duration := COALESCE(p_new_duration_minutes, v_sess.duration_minutes, 60);
  v_new_ends_at := p_new_starts_at + (v_duration || ' minutes')::interval;
  v_effective_court := COALESCE(NULLIF(btrim(COALESCE(p_new_court, '')), ''), v_sess.court);

  -- Cerraduras de transacción
  PERFORM pg_advisory_xact_lock(hashtext('coach_schedule:' || v_sess.coach_id::text)::bigint);
  PERFORM pg_advisory_xact_lock(hashtext('student_schedule:' || v_sess.jugador_id::text)::bigint);
  IF v_effective_court IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('court_schedule:' || p_organizador_id::text || ':' || lower(v_effective_court))::bigint);
  END IF;

  -- Comprobar solapamientos excluyendo la sesión actual
  -- A. Coach
  IF EXISTS (
    SELECT 1 FROM public.coach_sessions
    WHERE coach_id = v_sess.coach_id
      AND id <> p_session_id
      AND status = 'SCHEDULED'
      AND tstzrange(starts_at, ends_at) && tstzrange(p_new_starts_at, v_new_ends_at)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El entrenador ya tiene otra clase agendada en ese horario.');
  END IF;

  -- B. Alumno
  IF EXISTS (
    SELECT 1 FROM public.coach_sessions
    WHERE jugador_id = v_sess.jugador_id
      AND id <> p_session_id
      AND status = 'SCHEDULED'
      AND tstzrange(starts_at, ends_at) && tstzrange(p_new_starts_at, v_new_ends_at)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El alumno ya tiene otra clase agendada en ese horario.');
  END IF;

  -- C. Cancha
  IF v_effective_court IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.coach_sessions
      WHERE organizador_id = p_organizador_id
        AND id <> p_session_id
        AND lower(btrim(court)) = lower(v_effective_court)
        AND status = 'SCHEDULED'
        AND tstzrange(starts_at, ends_at) && tstzrange(p_new_starts_at, v_new_ends_at)
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'La cancha "' || v_effective_court || '" ya está reservada en ese horario.');
    END IF;
  END IF;

  UPDATE public.coach_sessions
  SET starts_at = p_new_starts_at,
      ends_at = v_new_ends_at,
      duration_minutes = v_duration,
      court = v_effective_court,
      notes_summary = CASE
        WHEN p_reason IS NOT NULL AND btrim(p_reason) <> ''
        THEN COALESCE(notes_summary || ' | ', '') || 'Reprogramada: ' || btrim(p_reason)
        ELSE notes_summary
      END,
      updated_at = v_now
  WHERE id = p_session_id;

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
    'CLASS_RESCHEDULED',
    'coach_sessions',
    p_session_id,
    jsonb_build_object(
      'previous_starts_at', v_sess.starts_at,
      'new_starts_at', p_new_starts_at,
      'duration_minutes', v_duration,
      'court', v_effective_court,
      'reason', p_reason
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'ok', true,
    'session_id', p_session_id,
    'starts_at', p_new_starts_at,
    'ends_at', v_new_ends_at,
    'duration_minutes', v_duration,
    'court', v_effective_court,
    'message', 'Clase reprogramada exitosamente.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_coach_class(uuid, uuid, timestamptz, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reschedule_coach_class(uuid, uuid, timestamptz, integer, text, text) TO authenticated, service_role;

-- ── 6. RPC: cancel_coach_class ───────────────────────────────────────────────
-- Cancela cita programada y libera la reserva de capacidad
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
    RETURN jsonb_build_object('ok', false, 'error', 'Sesión no encontrada o no pertenece a este club.');
  END IF;

  IF v_sess.status <> 'SCHEDULED' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo se pueden cancelar clases que estén en estado programada (SCHEDULED). Estado actual: ' || v_sess.status || '.');
  END IF;

  UPDATE public.coach_sessions
  SET status = 'CANCELLED',
      cancellation_reason = v_trimmed_reason,
      updated_at = v_now
  WHERE id = p_session_id;

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
    'CLASS_CANCELLED',
    'coach_sessions',
    p_session_id,
    jsonb_build_object(
      'coach_id', v_sess.coach_id,
      'student_id', v_sess.jugador_id,
      'reason', v_trimmed_reason
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'ok', true,
    'session_id', p_session_id,
    'message', 'Clase cancelada exitosamente y reserva liberada.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_coach_class(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_coach_class(uuid, uuid, text) TO authenticated, service_role;

-- ── 7. RPC: record_coach_class_session ────────────────────────────────────────
-- Blindaje total: valida rigurosamente p_session_id (debe estar SCHEDULED y coincidir exactamente)
DROP FUNCTION IF EXISTS public.record_coach_class_session(uuid, text, text, uuid, text[], text, text, text, integer);

CREATE OR REPLACE FUNCTION public.record_coach_class_session(
  p_relationship_id uuid,
  p_notas text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_session_id uuid DEFAULT NULL,
  p_worked_on text[] DEFAULT '{}',
  p_improvements text DEFAULT NULL,
  p_next_goals text DEFAULT NULL,
  p_motivational_message text DEFAULT NULL,
  p_duration_minutes integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_rel record;
  v_coach record;
  v_membership record;
  v_sess record;
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_balance record;
  v_new_balance integer;
  v_new_total integer;
  v_trimmed_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_session_id uuid := p_session_id;
  v_existing_op record;
  v_effective_duration integer := COALESCE(p_duration_minutes, 60);
  v_now timestamptz := now();
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  IF v_trimmed_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Clave de idempotencia requerida para registrar la clase impartida.');
  END IF;

  -- 1. Obtener relación coach-alumno
  SELECT r.id, r.organizador_id, r.coach_id, r.jugador_id, r.status
  INTO v_rel
  FROM public.coach_player_relationships r
  WHERE r.id = p_relationship_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Relación coach-alumno no encontrada.');
  END IF;

  IF v_rel.status <> 'ACTIVE' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No se puede registrar una clase en una relación inactiva o finalizada.');
  END IF;

  -- 2. Obtener datos del coach asignado
  SELECT id, auth_user_id, nombre INTO v_coach
  FROM public.riviera_coaches
  WHERE id = v_rel.coach_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Perfil de coach no encontrado.');
  END IF;

  -- 3. Autorización: El coach que imparte la clase, el organizador del club o Master Admin
  IF v_coach.auth_user_id <> v_caller AND v_rel.organizador_id <> v_caller AND v_is_master IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No tienes autorización para registrar clases para este alumno.');
  END IF;

  -- 4. Comprobar que el coach tiene membresía ACTIVE en el club
  SELECT id, status INTO v_membership
  FROM public.coach_club_memberships
  WHERE coach_id = v_rel.coach_id AND organizador_id = v_rel.organizador_id;

  IF NOT FOUND OR v_membership.status <> 'ACTIVE' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El coach no cuenta con una asociación activa con el club correspondiente.'
    );
  END IF;

  -- 5. Comprobar que el club tiene coaching habilitado
  IF NOT EXISTS (
    SELECT 1 FROM public.organizador_game_modes
    WHERE organizador_id = v_rel.organizador_id AND coaching_enabled = true
  ) AND v_is_master IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El club no tiene el servicio de Coaching habilitado.'
    );
  END IF;

  -- 6. Validar Idempotencia estricta
  SELECT id, tipo, relationship_id, organizador_id, recorded_by, delta, session_id
  INTO v_existing_op
  FROM public.coach_class_ledger
  WHERE idempotency_key = v_trimmed_key;

  IF FOUND THEN
    IF v_existing_op.recorded_by <> v_caller
       OR v_existing_op.relationship_id <> p_relationship_id
       OR v_existing_op.tipo <> 'CLASS_DEBIT'
       OR v_existing_op.delta <> -1 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'Conflicto de idempotencia: la clave ya fue utilizada en otra operación o con parámetros distintos.'
      );
    END IF;

    SELECT balance_classes, total_classes_given INTO v_balance
    FROM public.coach_player_class_balances
    WHERE relationship_id = p_relationship_id;

    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'session_id', v_existing_op.session_id,
      'remaining_balance', COALESCE(v_balance.balance_classes, 0),
      'total_classes_given', COALESCE(v_balance.total_classes_given, 0),
      'message', 'Operación idempotente: esta clase ya había sido registrada previamente.'
    );
  END IF;

  -- 7. Bloquear y verificar saldo disponible
  SELECT id, balance_classes, total_classes_given
  INTO v_balance
  FROM public.coach_player_class_balances
  WHERE relationship_id = v_rel.id
  FOR UPDATE;

  IF NOT FOUND OR v_balance.balance_classes < 1 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El alumno no tiene clases disponibles. Solicita al club asignar nuevas clases.'
    );
  END IF;

  -- 8. Validación rigurosa de la sesión existente (si se especificó p_session_id)
  IF v_session_id IS NOT NULL THEN
    SELECT id, coach_id, organizador_id, jugador_id, relationship_id, status, duration_minutes
    INTO v_sess
    FROM public.coach_sessions
    WHERE id = v_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Sesión de coaching no encontrada.');
    END IF;

    IF v_sess.coach_id <> v_rel.coach_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'La sesión programada pertenece a otro entrenador.');
    END IF;

    IF v_sess.organizador_id <> v_rel.organizador_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'La sesión programada pertenece a otro club.');
    END IF;

    IF v_sess.jugador_id <> v_rel.jugador_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'La sesión programada está asignada a otro alumno.');
    END IF;

    IF v_sess.relationship_id IS NOT NULL AND v_sess.relationship_id <> v_rel.id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'La sesión programada no coincide con la relación técnica coach-alumno.');
    END IF;

    IF v_sess.status = 'CANCELLED' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Esta clase fue cancelada y no puede ser marcada como impartida.');
    END IF;

    IF v_sess.status = 'COMPLETED' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Esta clase ya fue impartida y registrada previamente.');
    END IF;

    IF v_sess.status <> 'SCHEDULED' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Solo se pueden finalizar sesiones en estado programada (SCHEDULED). Estado actual: ' || v_sess.status || '.');
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.coach_class_ledger WHERE session_id = v_session_id
    ) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'Esta sesión ya generó un descuento de clase previamente en el historial.'
      );
    END IF;

    -- Actualizar la sesión programada a COMPLETED
    UPDATE public.coach_sessions
    SET status = 'COMPLETED',
        relationship_id = v_rel.id,
        duration_minutes = COALESCE(v_effective_duration, v_sess.duration_minutes, 60),
        worked_on = COALESCE(p_worked_on, worked_on),
        improvements = COALESCE(p_improvements, improvements),
        next_goals = COALESCE(p_next_goals, next_goals),
        motivational_message = COALESCE(p_motivational_message, motivational_message),
        notes_summary = COALESCE(p_notas, notes_summary),
        updated_at = v_now
    WHERE id = v_session_id;
  ELSE
    -- Crear sesión completada ad-hoc
    INSERT INTO public.coach_sessions (
      coach_id,
      relationship_id,
      organizador_id,
      jugador_id,
      starts_at,
      ends_at,
      duration_minutes,
      status,
      worked_on,
      improvements,
      next_goals,
      motivational_message,
      notes_summary,
      created_at,
      updated_at
    )
    VALUES (
      v_rel.coach_id,
      v_rel.id,
      v_rel.organizador_id,
      v_rel.jugador_id,
      v_now - (v_effective_duration || ' minutes')::interval,
      v_now,
      v_effective_duration,
      'COMPLETED',
      COALESCE(p_worked_on, '{}'::text[]),
      p_improvements,
      p_next_goals,
      p_motivational_message,
      p_notas,
      v_now,
      v_now
    )
    RETURNING id INTO v_session_id;
  END IF;

  -- 9. Descontar exactamente 1 clase e incrementar total impartidas
  UPDATE public.coach_player_class_balances
  SET balance_classes = balance_classes - 1,
      total_classes_given = total_classes_given + 1,
      updated_at = v_now
  WHERE id = v_balance.id
  RETURNING balance_classes, total_classes_given INTO v_new_balance, v_new_total;

  -- 10. Registrar CLASS_DEBIT inmutable en el ledger vinculado a la sesión
  INSERT INTO public.coach_class_ledger (
    relationship_id,
    organizador_id,
    coach_id,
    jugador_id,
    session_id,
    delta,
    tipo,
    notas,
    idempotency_key,
    recorded_by,
    created_at
  )
  VALUES (
    v_rel.id,
    v_rel.organizador_id,
    v_rel.coach_id,
    v_rel.jugador_id,
    v_session_id,
    -1,
    'CLASS_DEBIT',
    COALESCE(p_motivational_message, p_notas),
    v_trimmed_key,
    v_caller,
    v_now
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'session_id', v_session_id,
    'remaining_balance', v_new_balance,
    'total_classes_given', v_new_total
  );
END;
$$;

DROP FUNCTION IF EXISTS public.record_coach_class_session(uuid, text, text, uuid);

REVOKE ALL ON FUNCTION public.record_coach_class_session(uuid, text, text, uuid, text[], text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_coach_class_session(uuid, text, text, uuid, text[], text, text, text, integer) TO authenticated, service_role;

-- ── 8. RPC: get_student_coaching_overview ─────────────────────────────────────
-- Oculta estrictamente las notas internas (notes_summary y ledger.notas) del alumno
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

  -- 2. Match de correo exacto (solo confirmado y no ambiguo)
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

  IF v_verified_jugador_ids IS NULL OR array_length(v_verified_jugador_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'linked', false,
      'message', 'Tu cuenta no tiene una credencial oficial de jugador vinculada.',
      'relationships', '[]'::jsonb
    );
  END IF;

  -- 3. Expansión canónica por clave oficial
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

  -- 4. Construir resumen con privacidad estricta
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

-- ── 9. CONSULTAS DE AGENDA ───────────────────────────────────────────────────

-- A. fetch_club_coaching_agenda: con p_status_filter y acceso autorizado para coach
DROP FUNCTION IF EXISTS public.fetch_club_coaching_agenda(uuid, uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.fetch_club_coaching_agenda(uuid, uuid, timestamptz, timestamptz, text);

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

  -- Autorización: Administrador del club, Master Admin, o el coach asignado
  IF v_caller <> p_organizador_id 
     AND NOT v_is_master 
     AND NOT (v_caller_coach_id IS NOT NULL AND (p_coach_id = v_caller_coach_id OR p_coach_id IS NULL)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No tienes autorización para consultar la agenda de este club.');
  END IF;

  -- Si el invocador es un coach, acotar a sus propias clases
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

-- B. fetch_coach_agenda: Consulta directa para el coach autenticado
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
