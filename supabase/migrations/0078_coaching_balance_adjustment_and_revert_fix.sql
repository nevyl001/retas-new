-- ==============================================================================
-- 0078_coaching_balance_adjustment_and_revert_fix.sql
--
-- Riviera Coaching: Hotfix definitivo para Corrección de Saldos y Reversión de Clases
--
-- 1. Unificación Canónica de adjust_coach_student_classes:
--    - Admite corrección desde la ficha del alumno (p_reference_ledger_id = NULL)
--      resolviendo internamente la relación club-coach-alumno.
--    - Admite corrección vinculada a un movimiento específico (p_reference_ledger_id != NULL)
--      validando coincidencia de club, coach y alumno.
--    - Control de concurrencia optimista opcional con p_expected_current_balance.
--    - Idempotencia estricta por idempotency_key verificando todos los parámetros.
--    - Bloqueo FOR UPDATE sobre balances y relaciones; previene saldo negativo
--      y protege sesiones SCHEDULED pendientes.
--    - Registro inmutable en coach_class_ledger (tipo ADJUSTMENT) y auditoría en coach_audit_log.
--
-- 2. Corrección de Firma en revert_coach_class_session:
--    - Alinea parámetro p_motivo con el frontend para evitar error de schema cache.
--    - Blindaje contra doble reversión y preservación de contadores e historial.
--
-- 3. Notificación a PostgREST:
--    - NOTIFY pgrst, 'reload schema' para recargar el caché inmediatamente.
-- ==============================================================================

-- ── 1. RPC: adjust_coach_student_classes ──────────────────────────────────────

DROP FUNCTION IF EXISTS public.adjust_coach_student_classes(uuid, uuid, integer, text, text);
DROP FUNCTION IF EXISTS public.adjust_coach_student_classes(uuid, uuid, uuid, integer, text, uuid, text);
DROP FUNCTION IF EXISTS public.adjust_coach_student_classes(uuid, uuid, uuid, integer, text, uuid, text, integer);

CREATE OR REPLACE FUNCTION public.adjust_coach_student_classes(
  p_organizador_id uuid,
  p_coach_id uuid,
  p_student_id uuid,
  p_delta integer,
  p_motivo text,
  p_reference_ledger_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_expected_current_balance integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_trimmed_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_trimmed_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_orig record;
  v_rel record;
  v_bal record;
  v_relationship_id uuid;
  v_cur_balance integer;
  v_new_balance integer;
  v_scheduled_count integer;
  v_existing_adj record;
  v_adj_id uuid;
  v_now timestamptz := now();
BEGIN
  -- 1. Autenticación y Autorización
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

  -- 2. Validaciones básicas de entrada
  IF v_trimmed_motivo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El motivo de la corrección es obligatorio.');
  END IF;

  IF p_delta IS NULL OR p_delta = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El ajuste debe ser una cantidad distinta de cero.');
  END IF;

  -- 3. Resolución y validación de la relación
  IF p_reference_ledger_id IS NOT NULL THEN
    -- Modalidad con movimiento original de referencia
    SELECT *
    INTO v_orig
    FROM public.coach_class_ledger
    WHERE id = p_reference_ledger_id AND organizador_id = p_organizador_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Movimiento original referenciado no encontrado o no pertenece a este club.');
    END IF;

    IF v_orig.coach_id <> p_coach_id OR v_orig.jugador_id <> p_student_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'El movimiento referenciado no coincide con el entrenador y alumno especificados.');
    END IF;

    v_relationship_id := v_orig.relationship_id;
  ELSE
    -- Modalidad directa desde la ficha del alumno: resolver relación coach-alumno en el club
    SELECT id, status, coach_id, jugador_id
    INTO v_rel
    FROM public.coach_player_relationships
    WHERE organizador_id = p_organizador_id
      AND coach_id = p_coach_id
      AND jugador_id = p_student_id
    ORDER BY (status = 'ACTIVE') DESC, created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'No se encontró la asignación entre este alumno y el entrenador en el club.');
    END IF;

    v_relationship_id := v_rel.id;
  END IF;

  -- Bloqueo atómico de la relación para serialización concurrente
  SELECT id, status, coach_id, jugador_id
  INTO v_rel
  FROM public.coach_player_relationships
  WHERE id = v_relationship_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Relación coach-alumno no encontrada.');
  END IF;

  -- 4. Idempotencia estricta
  IF v_trimmed_key IS NOT NULL THEN
    SELECT *
    INTO v_existing_adj
    FROM public.coach_class_ledger
    WHERE idempotency_key = v_trimmed_key;

    IF FOUND THEN
      -- Validar que la operación coincida exactamente
      IF v_existing_adj.recorded_by <> v_caller
         OR v_existing_adj.organizador_id <> p_organizador_id
         OR v_existing_adj.relationship_id <> v_relationship_id
         OR v_existing_adj.coach_id <> p_coach_id
         OR v_existing_adj.jugador_id <> p_student_id
         OR COALESCE(v_existing_adj.reference_ledger_id, '00000000-0000-0000-0000-000000000000'::uuid) <> COALESCE(p_reference_ledger_id, '00000000-0000-0000-0000-000000000000'::uuid)
         OR v_existing_adj.delta <> p_delta
         OR v_existing_adj.tipo <> 'ADJUSTMENT' THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'Conflicto de idempotencia: la clave ya fue utilizada en otra operación o con parámetros distintos.'
        );
      END IF;

      SELECT balance_classes INTO v_cur_balance
      FROM public.coach_player_class_balances
      WHERE relationship_id = v_relationship_id;

      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'adjustment_id', v_existing_adj.id,
        'delta', v_existing_adj.delta,
        'previous_balance', COALESCE(v_cur_balance, 0) - v_existing_adj.delta,
        'new_balance', COALESCE(v_cur_balance, 0),
        'message', 'Operación idempotente: la corrección ya fue registrada previamente.'
      );
    END IF;
  END IF;

  -- 5. Consulta y bloqueo del saldo actual
  SELECT id, balance_classes, total_classes_given
  INTO v_bal
  FROM public.coach_player_class_balances
  WHERE relationship_id = v_relationship_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.coach_player_class_balances (
      relationship_id,
      organizador_id,
      coach_id,
      jugador_id,
      balance_classes,
      total_classes_given,
      updated_at
    ) VALUES (
      v_relationship_id,
      p_organizador_id,
      p_coach_id,
      p_student_id,
      0,
      0,
      v_now
    )
    RETURNING id, balance_classes, total_classes_given INTO v_bal;
  END IF;

  v_cur_balance := COALESCE(v_bal.balance_classes, 0);

  -- Control de concurrencia optimista
  IF p_expected_current_balance IS NOT NULL AND p_expected_current_balance <> v_cur_balance THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El saldo actual en el servidor (' || v_cur_balance || ') difiere del saldo esperado (' || p_expected_current_balance || '). Por favor recarga e intenta de nuevo.',
      'current_balance', v_cur_balance
    );
  END IF;

  v_new_balance := v_cur_balance + p_delta;

  IF v_new_balance < 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No es posible aplicar esta corrección porque provocaría un saldo negativo (' || v_new_balance || '). Saldo actual disponible: ' || v_cur_balance || '.'
    );
  END IF;

  -- 6. Comprobar que el nuevo saldo cubra las citas SCHEDULED activas
  SELECT COUNT(*) INTO v_scheduled_count
  FROM public.coach_sessions
  WHERE relationship_id = v_relationship_id
    AND status = 'SCHEDULED';

  IF v_new_balance < v_scheduled_count THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No es posible aplicar esta corrección: el alumno tiene ' || v_scheduled_count || ' clase(s) agendada(s) pendiente(s). El nuevo saldo (' || v_new_balance || ') no puede ser menor que las reservas activas.'
    );
  END IF;

  -- 7. Actualización del saldo disponible
  UPDATE public.coach_player_class_balances
  SET balance_classes = v_new_balance,
      updated_at = v_now
  WHERE id = v_bal.id;

  -- 8. Registro del movimiento compensatorio inmutable
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
    v_relationship_id,
    p_organizador_id,
    p_coach_id,
    p_student_id,
    p_delta,
    'ADJUSTMENT',
    'Corrección administrativa: ' || v_trimmed_motivo,
    v_trimmed_key,
    p_reference_ledger_id,
    v_caller,
    v_now
  )
  RETURNING id INTO v_adj_id;

  -- 9. Registro en bitácora de auditoría
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
    v_relationship_id,
    jsonb_build_object(
      'coach_id', p_coach_id,
      'student_id', p_student_id,
      'reference_ledger_id', p_reference_ledger_id,
      'delta', p_delta,
      'previous_balance', v_cur_balance,
      'new_balance', v_new_balance,
      'pending_scheduled_classes', v_scheduled_count,
      'reason', v_trimmed_motivo
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'adjustment_id', v_adj_id,
    'delta', p_delta,
    'previous_balance', v_cur_balance,
    'new_balance', v_new_balance,
    'message', 'Saldo corregido exitosamente. Saldo anterior: ' || v_cur_balance || ' clases. Ajuste: ' || (CASE WHEN p_delta > 0 THEN '+' || p_delta ELSE p_delta::text END) || ' clases. Saldo actual: ' || v_new_balance || ' clases.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_coach_student_classes(uuid, uuid, uuid, integer, text, uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_coach_student_classes(uuid, uuid, uuid, integer, text, uuid, text, integer) TO authenticated, service_role;

-- ── 2. RPC: revert_coach_class_session ────────────────────────────────────────

DROP FUNCTION IF EXISTS public.revert_coach_class_session(uuid, uuid, text, text);

CREATE OR REPLACE FUNCTION public.revert_coach_class_session(
  p_organizador_id uuid,
  p_session_id uuid,
  p_motivo text,
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
  v_trimmed_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_adj_id uuid;
  v_now timestamptz := now();
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  IF v_caller <> p_organizador_id AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo el club puede revertir clases registradas por error.');
  END IF;

  IF v_trimmed_motivo IS NULL THEN
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
    RETURN jsonb_build_object('ok', false, 'error', 'Solo se pueden revertir sesiones que hayan sido marcadas como impartidas (COMPLETED).');
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

  -- 3. Idempotencia estricta (se evalúa antes de verificar reverted_at para permitir reintentos seguros)
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

      SELECT balance_classes, total_classes_given
      INTO v_bal
      FROM public.coach_player_class_balances
      WHERE relationship_id = v_sess.relationship_id;

      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'adjustment_id', v_existing_adj.id,
        'new_balance', COALESCE(v_bal.balance_classes, 0),
        'total_classes_given', COALESCE(v_bal.total_classes_given, 0),
        'message', 'Operación idempotente: la clase ya fue revertida previamente.'
      );
    END IF;
  END IF;

  -- 4. Validación de no-doble reversión para nuevas claves / operaciones
  IF v_sess.reverted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta clase ya fue revertida previamente el ' || to_char(v_sess.reverted_at, 'DD/MM/YYYY HH24:MI') || '. No se puede revertir dos veces.');
  END IF;

  -- 4. Actualizar saldo y contador de impartidas
  SELECT *
  INTO v_bal
  FROM public.coach_player_class_balances
  WHERE relationship_id = v_sess.relationship_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Saldo de clases no encontrado para esta relación.');
  END IF;

  v_new_balance := COALESCE(v_bal.balance_classes, 0) + 1;
  v_new_given := GREATEST(0, COALESCE(v_bal.total_classes_given, 0) - 1);

  UPDATE public.coach_player_class_balances
  SET balance_classes = v_new_balance,
      total_classes_given = v_new_given,
      updated_at = v_now
  WHERE id = v_bal.id;

  -- 5. Marcar sesión como revertida
  UPDATE public.coach_sessions
  SET reverted_at = v_now,
      reverted_by = v_caller,
      cancellation_reason = 'Reversión: ' || v_trimmed_motivo
  WHERE id = p_session_id;

  -- 6. Insertar movimiento compensatorio en el ledger (session_id := NULL para no violar idx_ccl_session)
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
    session_id,
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
    'Reversión de clase impartida: ' || v_trimmed_motivo,
    v_trimmed_key,
    v_debit_ledger.id,
    NULL,
    v_caller,
    v_now
  )
  RETURNING id INTO v_adj_id;

  -- 7. Registrar en bitácora de auditoría
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
    'CLASS_SESSION_REVERT',
    'coach_sessions',
    p_session_id,
    jsonb_build_object(
      'session_id', p_session_id,
      'debit_ledger_id', v_debit_ledger.id,
      'revert_reason', v_trimmed_motivo,
      'previous_balance', v_bal.balance_classes,
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

-- ── 3. RECARGA DE CACHÉ DE POSTGREST ──────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
