-- =============================================================================
-- MIGRACIÓN 0084: CIERRE DEFINITIVO Y BLINDAJE DE RIVIERA COACHING
-- 
-- 1. assign_coach_classes: GUARDA ESTRICTA DE BACKEND para rechazar asignaciones
--    a relaciones en estado PAUSED o ENDED (evita bypass por API directa).
-- 2. adjust_coach_student_classes: GUARDA ESTRICTA para relaciones PAUSED/ENDED.
-- 3. reschedule_coach_class: RECHAZAR reprogramación de sesiones de alumnos PAUSED/ENDED.
-- 4. reassign_student_coach: RECHAZAR reasignación de relaciones ENDED.
-- 5. get_organizador_display_name: Resolución del NOMBRE COMERCIAL REAL del club
--    (Hack Pádel, Padelito Warehouse, etc.) nunca el correo del organizador.
-- 6. get_student_coaching_overview: AUTORIZACIÓN PRIVADA POR ALUMNO Y CLUB.
--    Elimina filtración por Rewards o coincidencia vaga de correo; exige vínculo
--    activo en coach_student_account_links para cada club. Resuelve nombres comerciales.
-- 7. is_student_only_account: Blindaje integral inspeccionando app_metadata y user_metadata.
-- =============================================================================

BEGIN;

-- ── 1. ACTUALIZAR get_organizador_display_name ─────────────────────────────
CREATE OR REPLACE FUNCTION public.get_organizador_display_name(p_organizador_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_branding_key text;
  v_user_name text;
BEGIN
  IF p_organizador_id IS NULL THEN
    RETURN 'Club Deportivo Riviera';
  END IF;

  -- 1. Consultar branding_key en organizador_game_modes
  SELECT lower(btrim(branding_key)) INTO v_branding_key
  FROM public.organizador_game_modes
  WHERE organizador_id = p_organizador_id;

  IF v_branding_key = 'hack-padel' THEN
    RETURN 'Hack Pádel';
  ELSIF v_branding_key = 'padelito-warehouse' THEN
    RETURN 'Padelito Warehouse';
  ELSIF v_branding_key = 'padel-court-series' THEN
    RETURN 'Padel Court Series';
  ELSIF v_branding_key = 'valvidub-sports' THEN
    RETURN 'Valvidub Sports';
  ELSIF v_branding_key = 'acapulco-padel-tour' THEN
    RETURN 'Acapulco Padel Tour';
  END IF;

  -- 2. Consultar nombre en users (solo si no es correo electrónico)
  SELECT btrim(name) INTO v_user_name
  FROM public.users
  WHERE id = p_organizador_id;

  IF v_user_name IS NOT NULL AND v_user_name <> '' AND v_user_name NOT LIKE '%@%' THEN
    RETURN v_user_name;
  END IF;

  RETURN 'Club Deportivo Riviera';
END;
$$;

COMMENT ON FUNCTION public.get_organizador_display_name(uuid) IS
  'Nombre comercial visible del club organizador. Nunca devuelve correos electrónicos.';

GRANT EXECUTE ON FUNCTION public.get_organizador_display_name(uuid) TO anon, authenticated, service_role;


-- ── 2. BLINDAJE is_student_only_account ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_student_only_account(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (
      SELECT (
        COALESCE(u.raw_app_meta_data->>'account_type', '') = 'STUDENT_ONLY'
        OR COALESCE(u.raw_user_meta_data->>'account_type', '') = 'STUDENT_ONLY'
        OR (
          (COALESCE(u.raw_app_meta_data->>'role', '') = 'student' OR COALESCE(u.raw_user_meta_data->>'role', '') = 'student')
          AND COALESCE(u.raw_app_meta_data->>'account_type', '') <> 'CLUB_ADMIN'
          AND NOT COALESCE(public.is_master_admin(), false)
        )
      )
      FROM auth.users u
      WHERE u.id = COALESCE(p_user_id, auth.uid())
    ),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_student_only_account(uuid) TO authenticated, service_role, anon;


-- ── 3. ACTUALIZAR assign_coach_classes CON GUARDA DE ESTADO ACTIVE ─────────
DROP FUNCTION IF EXISTS public.assign_coach_classes(uuid, integer, text, text);

CREATE OR REPLACE FUNCTION public.assign_coach_classes(
  p_relationship_id uuid,
  p_class_count integer,
  p_notas text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_rel record;
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_new_balance integer;
  v_trimmed_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_trimmed_notas text := NULLIF(btrim(COALESCE(p_notas, '')), '');
  v_existing_op record;
  v_ledger_id uuid;
  v_now timestamptz := now();
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  PERFORM public.check_student_only_restriction();

  IF p_class_count <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La cantidad de clases debe ser mayor a 0');
  END IF;

  -- Bloquear y validar relación
  SELECT * INTO v_rel
  FROM public.coach_player_relationships
  WHERE id = p_relationship_id
  FOR UPDATE;

  IF v_rel.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Relación coach-alumno no encontrada');
  END IF;

  IF v_caller <> v_rel.organizador_id AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo el club puede asignar clases');
  END IF;

  -- GUARDA CRÍTICA DE BACKEND: La relación debe estar estrictamente ACTIVE
  IF v_rel.status <> 'ACTIVE' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No se pueden asignar clases a una relación en pausa o terminada. El estado actual es: ' || COALESCE(v_rel.status, 'DESCONOCIDO') || '.'
    );
  END IF;

  -- Comprobar que el coach mantiene membresía activa en este club
  IF NOT EXISTS (
    SELECT 1 FROM public.coach_club_memberships
    WHERE organizador_id = v_rel.organizador_id
      AND coach_id = v_rel.coach_id
      AND status = 'ACTIVE'
  ) AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El coach ya no tiene una membresía activa en este club.');
  END IF;

  -- Comprobar que el club tiene coaching habilitado
  IF NOT EXISTS (
    SELECT 1 FROM public.organizador_game_modes
    WHERE organizador_id = v_rel.organizador_id AND coaching_enabled = true
  ) AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El club no tiene habilitado el módulo Riviera Coaching.');
  END IF;

  -- Idempotencia estricta
  IF v_trimmed_key IS NOT NULL THEN
    SELECT id, relationship_id, delta INTO v_existing_op
    FROM public.coach_class_ledger
    WHERE idempotency_key = v_trimmed_key
    LIMIT 1;

    IF v_existing_op.id IS NOT NULL THEN
      SELECT balance_classes INTO v_new_balance
      FROM public.coach_player_class_balances
      WHERE relationship_id = p_relationship_id;

      RETURN jsonb_build_object(
        'ok', true,
        'relationship_id', p_relationship_id,
        'balance_classes', v_new_balance,
        'delta', v_existing_op.delta,
        'idempotent', true,
        'message', 'Operación completada previamente (idempotente)'
      );
    END IF;
  END IF;

  -- Upsert de balance
  INSERT INTO public.coach_player_class_balances (
    relationship_id,
    organizador_id,
    coach_id,
    jugador_id,
    balance_classes,
    total_classes_given,
    updated_at
  ) VALUES (
    v_rel.id,
    v_rel.organizador_id,
    v_rel.coach_id,
    v_rel.jugador_id,
    p_class_count,
    0,
    v_now
  ) ON CONFLICT (relationship_id) DO UPDATE
  SET balance_classes = public.coach_player_class_balances.balance_classes + p_class_count,
      updated_at = v_now
  RETURNING balance_classes INTO v_new_balance;

  -- Registrar en ledger inmutable
  INSERT INTO public.coach_class_ledger (
    relationship_id,
    organizador_id,
    coach_id,
    jugador_id,
    delta,
    tipo,
    notas,
    idempotency_key,
    recorded_by,
    created_at
  ) VALUES (
    v_rel.id,
    v_rel.organizador_id,
    v_rel.coach_id,
    v_rel.jugador_id,
    p_class_count,
    'PACKAGE_CREDIT',
    v_trimmed_notas,
    v_trimmed_key,
    v_caller,
    v_now
  ) RETURNING id INTO v_ledger_id;

  -- Auditoría
  INSERT INTO public.coach_audit_log (
    actor_auth_user_id,
    action,
    entity_type,
    entity_id,
    payload,
    created_at
  ) VALUES (
    v_caller,
    'CLASSES_ASSIGNED',
    'coach_player_relationships',
    v_rel.id,
    jsonb_build_object(
      'delta', p_class_count,
      'new_balance', v_new_balance,
      'ledger_id', v_ledger_id,
      'idempotency_key', v_trimmed_key,
      'organizador_id', v_rel.organizador_id,
      'coach_id', v_rel.coach_id,
      'jugador_id', v_rel.jugador_id
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'ok', true,
    'relationship_id', v_rel.id,
    'balance_classes', v_new_balance,
    'delta', p_class_count,
    'ledger_id', v_ledger_id,
    'message', 'Se asignaron +' || p_class_count || ' clases exitosamente.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_coach_classes(uuid, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_coach_classes(uuid, integer, text, text) TO authenticated, service_role;


-- ── 4. ACTUALIZAR adjust_coach_student_classes CON GUARDA DE ESTADO ACTIVE ──
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
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  PERFORM public.check_student_only_restriction();

  IF v_caller <> p_organizador_id AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo el administrador del club puede corregir saldos de clases.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organizador_game_modes
    WHERE organizador_id = p_organizador_id AND coaching_enabled = true
  ) AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El club no tiene habilitado el módulo de Coaching.');
  END IF;

  IF v_trimmed_motivo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El motivo de la corrección es obligatorio.');
  END IF;

  IF p_delta IS NULL OR p_delta = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El ajuste debe ser una cantidad distinta de cero.');
  END IF;

  IF p_reference_ledger_id IS NOT NULL THEN
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

  SELECT id, status, coach_id, jugador_id
  INTO v_rel
  FROM public.coach_player_relationships
  WHERE id = v_relationship_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Relación coach-alumno no encontrada.');
  END IF;

  -- GUARDA DE BACKEND: No permitir sumar créditos a relaciones pausadas o terminadas
  IF v_rel.status <> 'ACTIVE' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No se pueden ajustar saldos en una relación en pausa o terminada. El estado actual es: ' || COALESCE(v_rel.status, 'DESCONOCIDO') || '.'
    );
  END IF;

  IF v_trimmed_key IS NOT NULL THEN
    SELECT *
    INTO v_existing_adj
    FROM public.coach_class_ledger
    WHERE idempotency_key = v_trimmed_key;

    IF FOUND THEN
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
        'previous_balance', v_cur_balance - v_existing_adj.delta,
        'new_balance', v_cur_balance,
        'message', 'Ajuste completado previamente (idempotente).'
      );
    END IF;
  END IF;

  SELECT *
  INTO v_bal
  FROM public.coach_player_class_balances
  WHERE relationship_id = v_relationship_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.coach_player_class_balances (
      relationship_id, organizador_id, coach_id, jugador_id, balance_classes, total_classes_given, updated_at
    ) VALUES (
      v_relationship_id, p_organizador_id, p_coach_id, p_student_id, 0, 0, v_now
    ) RETURNING * INTO v_bal;
  END IF;

  v_cur_balance := COALESCE(v_bal.balance_classes, 0);

  IF p_expected_current_balance IS NOT NULL AND v_cur_balance <> p_expected_current_balance THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El saldo actual (' || v_cur_balance || ') no coincide con el esperado (' || p_expected_current_balance || '). Refresca los datos antes de continuar.'
    );
  END IF;

  v_new_balance := v_cur_balance + p_delta;
  IF v_new_balance < 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El ajuste resultaría en un saldo negativo (' || v_new_balance || '). El saldo actual es ' || v_cur_balance || '.'
    );
  END IF;

  SELECT count(*)
  INTO v_scheduled_count
  FROM public.coach_sessions
  WHERE relationship_id = v_relationship_id AND status = 'SCHEDULED';

  IF v_new_balance < v_scheduled_count THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El nuevo saldo (' || v_new_balance || ') no puede ser menor a las ' || v_scheduled_count || ' clases agendadas pendientes.'
    );
  END IF;

  UPDATE public.coach_player_class_balances
  SET balance_classes = v_new_balance,
      updated_at = v_now
  WHERE relationship_id = v_relationship_id;

  INSERT INTO public.coach_class_ledger (
    relationship_id,
    organizador_id,
    coach_id,
    jugador_id,
    delta,
    tipo,
    notas,
    reference_ledger_id,
    idempotency_key,
    recorded_by,
    created_at
  ) VALUES (
    v_relationship_id,
    p_organizador_id,
    p_coach_id,
    p_student_id,
    p_delta,
    'ADJUSTMENT',
    v_trimmed_motivo,
    p_reference_ledger_id,
    v_trimmed_key,
    v_caller,
    v_now
  ) RETURNING id INTO v_adj_id;

  INSERT INTO public.coach_audit_log (
    actor_auth_user_id,
    action,
    entity_type,
    entity_id,
    payload,
    created_at
  ) VALUES (
    v_caller,
    'BALANCE_ADJUSTED',
    'coach_player_class_balances',
    v_relationship_id,
    jsonb_build_object(
      'delta', p_delta,
      'previous_balance', v_cur_balance,
      'new_balance', v_new_balance,
      'motivo', v_trimmed_motivo,
      'reference_ledger_id', p_reference_ledger_id,
      'adjustment_id', v_adj_id,
      'idempotency_key', v_trimmed_key
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'ok', true,
    'adjustment_id', v_adj_id,
    'delta', p_delta,
    'previous_balance', v_cur_balance,
    'new_balance', v_new_balance,
    'message', 'Saldo corregido exitosamente (' || (CASE WHEN p_delta > 0 THEN '+' ELSE '' END) || p_delta || ' clases).'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_coach_student_classes(uuid, uuid, uuid, integer, text, uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_coach_student_classes(uuid, uuid, uuid, integer, text, uuid, text, integer) TO authenticated, service_role;


-- ── 5. ACTUALIZAR reschedule_coach_class CON GUARDA DE ESTADO ACTIVE ────────
CREATE OR REPLACE FUNCTION public.reschedule_coach_class(
  p_organizador_id uuid,
  p_session_id uuid,
  p_new_starts_at timestamptz,
  p_duration_minutes integer DEFAULT NULL,
  p_court text DEFAULT NULL,
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

  PERFORM public.check_student_only_restriction();

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

  -- GUARDA DE BACKEND: No reprogramar sesiones si la relación deportiva fue pausada o terminada
  IF v_sess.relationship_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.coach_player_relationships
      WHERE id = v_sess.relationship_id AND status <> 'ACTIVE'
    ) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'No se puede reprogramar una clase de un alumno con relación deportiva en pausa o terminada.'
      );
    END IF;
  END IF;

  v_duration := COALESCE(p_duration_minutes, v_sess.duration_minutes, 60);
  v_new_ends_at := p_new_starts_at + (v_duration || ' minutes')::interval;
  v_effective_court := COALESCE(NULLIF(btrim(COALESCE(p_court, '')), ''), v_sess.court);

  PERFORM pg_advisory_xact_lock(hashtext('coach_schedule:' || v_sess.coach_id::text)::bigint);
  PERFORM pg_advisory_xact_lock(hashtext('student_schedule:' || v_sess.jugador_id::text)::bigint);
  IF v_effective_court IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('court_schedule:' || p_organizador_id::text || ':' || lower(v_effective_court))::bigint);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.coach_sessions
    WHERE coach_id = v_sess.coach_id
      AND id <> p_session_id
      AND status = 'SCHEDULED'
      AND tstzrange(starts_at, ends_at) && tstzrange(p_new_starts_at, v_new_ends_at)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El entrenador ya tiene otra clase agendada en ese horario.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.coach_sessions
    WHERE jugador_id = v_sess.jugador_id
      AND id <> p_session_id
      AND status = 'SCHEDULED'
      AND tstzrange(starts_at, ends_at) && tstzrange(p_new_starts_at, v_new_ends_at)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El alumno ya tiene otra clase agendada en ese horario.');
  END IF;

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
  ) VALUES (
    v_caller,
    'CLASS_RESCHEDULED',
    'coach_sessions',
    p_session_id,
    jsonb_build_object(
      'previous_starts_at', v_sess.starts_at,
      'new_starts_at', p_new_starts_at,
      'previous_court', v_sess.court,
      'new_court', v_effective_court,
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


-- ── 6. ACTUALIZAR get_student_coaching_overview (AUTORIZACIÓN PRIVADA) ─────
DROP FUNCTION IF EXISTS public.get_student_coaching_overview();

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
  v_authorized_count integer;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario no autenticado.');
  END IF;

  -- Comprobar si el alumno está desactivado en todos los clubes donde tiene vínculo
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

  -- Contar vínculos explícitos activos en este club/cuenta
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

  -- Obtener Riviera ID canónico exclusivamente de los jugadores autorizados en los vínculos activos
  SELECT i.riviera_id
  INTO v_user_riviera_id
  FROM public.coach_student_account_links al
  JOIN public.riviera_official_player_identity i ON i.canonical_riviera_jugador_id = al.jugador_id
  WHERE al.auth_user_id = v_caller AND al.is_active = true
  LIMIT 1;

  -- Construir resumen con PRIVACIDAD ESTRICTA y MULTICLUB INDEPENDIENTE:
  -- Cada relación r requiere estrictamente un vínculo activo en coach_student_account_links
  -- para ese organizador_id y jugador_id exactos.
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
  -- AUTORIZACIÓN PRIVADA ESTRICTA POR ALUMNO Y POR CLUB:
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
    'relationships', COALESCE(v_results, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_coaching_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_coaching_overview() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
