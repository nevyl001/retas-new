-- ==============================================================================
-- 0073_coaching_club_assign_students_and_finalize_removal.sql
-- Riviera Coaching — Administración Exclusiva del Club:
-- 1. Asignación directa de alumnos a entrenadores por el club (assign_student_to_club_coach)
-- 2. Búsqueda y verificación de alumnos por Riviera ID (lookup_student_by_riviera_id)
-- 3. Bloqueo definitivo de auto-vinculación por coaches (link_player_to_coach_by_riviera_id)
-- 4. Eliminación definitiva de coaches eliminados/archivados (finalize_coach_removal_from_club)
-- 5. Reasignación atómica de alumnos y saldos entre coaches (reassign_student_coach)
-- 6. Ampliación del ledger para soportar transferencias (TRANSFER_IN / TRANSFER_OUT)
-- ==============================================================================

-- ── 1. ACTUALIZAR CHECK CONSTRAINT EN coach_class_ledger ─────────────────────
ALTER TABLE public.coach_class_ledger
  DROP CONSTRAINT IF EXISTS coach_class_ledger_tipo_check;

ALTER TABLE public.coach_class_ledger
  ADD CONSTRAINT coach_class_ledger_tipo_check
  CHECK (tipo IN ('PACKAGE_CREDIT', 'CLASS_DEBIT', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT'));

-- ── 2. RPC: lookup_student_by_riviera_id ──────────────────────────────────────
-- Permite al club verificar instantáneamente la ficha deportiva de un alumno
-- antes de asignarlo a un entrenador.
CREATE OR REPLACE FUNCTION public.lookup_student_by_riviera_id(
  p_riviera_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_norm_id text := upper(btrim(COALESCE(p_riviera_id, '')));
  v_student record;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  IF v_norm_id !~ '^RIV-[0-9]{5,8}$' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Formato de Riviera ID inválido. Debe tener la estructura RIV-######## (ej. RIV-00000278).'
    );
  END IF;

  SELECT
    rj.id,
    rj.nombre,
    rj.foto_url,
    rj.categoria,
    rj.genero,
    rj.club as club_nombre,
    i.riviera_id
  INTO v_student
  FROM public.riviera_official_player_identity i
  JOIN public.riviera_jugadores rj ON rj.id = i.canonical_riviera_jugador_id
  WHERE upper(btrim(i.riviera_id)) = v_norm_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No se encontró ningún jugador registrado con el Riviera ID ' || v_norm_id || '.'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'student', jsonb_build_object(
      'id', v_student.id,
      'nombre', v_student.nombre,
      'fotoUrl', v_student.foto_url,
      'categoria', v_student.categoria,
      'genero', v_student.genero,
      'clubNombre', v_student.club_nombre,
      'rivieraId', v_student.riviera_id
    )
  );
END;
$$;

-- ── 3. RPC: assign_student_to_club_coach ──────────────────────────────────────
-- REGLA DEFINITIVA: Exclusiva del club. Asigna un alumno existente a un entrenador
-- activo del club y le abona opcionalmente un paquete inicial de clases contratadas.
CREATE OR REPLACE FUNCTION public.assign_student_to_club_coach(
  p_organizador_id uuid,
  p_coach_id uuid,
  p_riviera_id text,
  p_initial_classes integer DEFAULT 0,
  p_idempotency_key text DEFAULT NULL,
  p_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_membership record;
  v_norm_riviera_id text;
  v_jugador record;
  v_relationship record;
  v_initial_classes integer := COALESCE(p_initial_classes, 0);
  v_trimmed_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_existing_ledger record;
  v_balance record;
  v_new_balance integer := 0;
  v_now timestamptz := now();
BEGIN
  -- 1. Validar autenticación
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  -- 2. REGLA INALTERABLE: Solo el club propietario o Master Admin puede asignar alumnos
  IF v_caller <> p_organizador_id AND NOT v_is_master THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Solo el club o administrador autorizado puede asignar alumnos a los entrenadores.'
    );
  END IF;

  -- 3. Validar clases iniciales
  IF v_initial_classes < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La cantidad inicial de clases no puede ser negativa.');
  END IF;

  -- 4. Comprobar que el club tiene coaching habilitado
  IF NOT EXISTS (
    SELECT 1 FROM public.organizador_game_modes
    WHERE organizador_id = p_organizador_id AND coaching_enabled = true
  ) AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El club no tiene habilitado el servicio de Coaching.');
  END IF;

  -- 5. Comprobar que el coach tiene membresía activa en este club
  SELECT id, status INTO v_membership
  FROM public.coach_club_memberships
  WHERE coach_id = p_coach_id AND organizador_id = p_organizador_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El entrenador no tiene asociación registrada en este club.');
  END IF;

  IF v_membership.status <> 'ACTIVE' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No se pueden asignar alumnos a un entrenador que no esté activo en este club (estado actual: ' || v_membership.status || ').'
    );
  END IF;

  -- 6. Resolver alumno canónico por Riviera ID
  v_norm_riviera_id := upper(btrim(COALESCE(p_riviera_id, '')));
  IF v_norm_riviera_id !~ '^RIV-[0-9]{5,8}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Formato de Riviera ID inválido. Debe ser RIV-########');
  END IF;

  SELECT rj.id, rj.nombre, rj.foto_url, rj.categoria, i.riviera_id
  INTO v_jugador
  FROM public.riviera_official_player_identity i
  JOIN public.riviera_jugadores rj ON rj.id = i.canonical_riviera_jugador_id
  WHERE upper(btrim(i.riviera_id)) = v_norm_riviera_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No se encontró ningún jugador registrado con el Riviera ID ' || v_norm_riviera_id || '.'
    );
  END IF;

  -- 7. Manejo estricto de Idempotencia para prevenir doble asignación por reintentos de red
  IF v_trimmed_key IS NOT NULL AND v_initial_classes > 0 THEN
    SELECT id, relationship_id, delta, tipo, idempotency_key
    INTO v_existing_ledger
    FROM public.coach_class_ledger
    WHERE idempotency_key = v_trimmed_key;

    IF FOUND THEN
      SELECT balance_classes INTO v_new_balance
      FROM public.coach_player_class_balances
      WHERE relationship_id = v_existing_ledger.relationship_id;

      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'relationship_id', v_existing_ledger.relationship_id,
        'student', jsonb_build_object(
          'id', v_jugador.id,
          'nombre', v_jugador.nombre,
          'rivieraId', v_jugador.riviera_id
        ),
        'initial_classes', v_initial_classes,
        'balance_classes', COALESCE(v_new_balance, 0),
        'message', 'Operación idempotente: el alumno y paquete de clases ya fueron registrados previamente.'
      );
    END IF;
  END IF;

  -- 8. Upsert atómico de la relación coach-alumno
  INSERT INTO public.coach_player_relationships (
    coach_id,
    jugador_id,
    organizador_id,
    status,
    is_primary,
    started_at,
    updated_at
  )
  VALUES (
    p_coach_id,
    v_jugador.id,
    p_organizador_id,
    'ACTIVE',
    true,
    v_now,
    v_now
  )
  ON CONFLICT (coach_id, jugador_id, organizador_id) DO UPDATE
  SET
    status = 'ACTIVE',
    updated_at = v_now
  RETURNING id INTO v_relationship.id;

  -- 9. Upsert atómico de saldo en coach_player_class_balances
  INSERT INTO public.coach_player_class_balances (
    relationship_id,
    organizador_id,
    coach_id,
    jugador_id,
    balance_classes,
    total_classes_given,
    updated_at
  )
  VALUES (
    v_relationship.id,
    p_organizador_id,
    p_coach_id,
    v_jugador.id,
    v_initial_classes,
    0,
    v_now
  )
  ON CONFLICT (relationship_id) DO UPDATE
  SET
    balance_classes = public.coach_player_class_balances.balance_classes + EXCLUDED.balance_classes,
    updated_at = v_now
  RETURNING balance_classes INTO v_new_balance;

  -- 10. Si se contrataron clases iniciales, registrar en el ledger inmutable
  IF v_initial_classes > 0 THEN
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
    )
    VALUES (
      v_relationship.id,
      p_organizador_id,
      p_coach_id,
      v_jugador.id,
      v_initial_classes,
      'PACKAGE_CREDIT',
      COALESCE(NULLIF(btrim(p_reference), ''), 'Asignación inicial al vincular alumno al coach por el club.'),
      v_trimmed_key,
      v_caller,
      v_now
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'relationship_id', v_relationship.id,
    'student', jsonb_build_object(
      'id', v_jugador.id,
      'nombre', v_jugador.nombre,
      'fotoUrl', v_jugador.foto_url,
      'categoria', v_jugador.categoria,
      'rivieraId', v_jugador.riviera_id
    ),
    'initial_classes', v_initial_classes,
    'balance_classes', v_new_balance,
    'message', 'Alumno asignado exitosamente al entrenador con ' || v_initial_classes || ' clases disponibles.'
  );
END;
$$;

-- ── 4. NEUTRALIZAR link_player_to_coach_by_riviera_id ────────────────────────
-- Los entrenadores ya no pueden auto-vincular alumnos por API ni RPC.
-- La asignación es 100% administrativa del club.
CREATE OR REPLACE FUNCTION public.link_player_to_coach_by_riviera_id(
  p_coach_id uuid,
  p_riviera_id text,
  p_organizador_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN jsonb_build_object(
    'ok', false,
    'error', 'La asignación de alumnos es responsabilidad exclusiva de la administración del club. Contacta al administrador del club para asignar alumnos y paquetes de clases.'
  );
END;
$$;

-- ── 5. RPC: finalize_coach_removal_from_club ──────────────────────────────────
-- Permite al club borrar definitivamente de su lista a entrenadores en estado REMOVED.
-- Conserva el historial de auditoría y registros deportivos pasados, pero elimina la membresía del club.
CREATE OR REPLACE FUNCTION public.finalize_coach_removal_from_club(
  p_organizador_id uuid,
  p_coach_id uuid,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_membership record;
  v_now timestamptz := now();
  v_has_pending_balance boolean;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  IF v_caller <> p_organizador_id AND NOT v_is_master THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No tienes permisos para eliminar entrenadores de este club.'
    );
  END IF;

  -- Localizar la membresía correspondiente
  SELECT id, status, organizador_id, coach_id
  INTO v_membership
  FROM public.coach_club_memberships
  WHERE coach_id = p_coach_id AND organizador_id = p_organizador_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'message', 'El entrenador ya no está registrado en este club.'
    );
  END IF;

  -- Comprobar si existen saldos activos pendientes que requieran reasignación
  SELECT EXISTS (
    SELECT 1 FROM public.coach_player_class_balances
    WHERE organizador_id = p_organizador_id
      AND coach_id = p_coach_id
      AND balance_classes > 0
  ) INTO v_has_pending_balance;

  IF v_has_pending_balance THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El entrenador tiene alumnos con clases disponibles pendientes. Reasigna los saldos a otro entrenador antes de eliminarlo definitivamente.'
    );
  END IF;

  -- Registrar en la bitácora de auditoría inmutable
  -- membership_id se establece en NULL para permitir la eliminación limpia de la fila sin violar la FK
  INSERT INTO public.coach_club_membership_audit_log (
    membership_id,
    coach_id,
    organizador_id,
    action,
    performed_by,
    previous_status,
    new_status,
    details
  ) VALUES (
    NULL,
    p_coach_id,
    p_organizador_id,
    'FINALIZE_REMOVAL',
    v_caller,
    v_membership.status,
    'PURGED',
    jsonb_build_object(
      'motivo', NULLIF(trim(p_motivo), ''),
      'previous_membership_id', v_membership.id,
      'finalized_at', v_now
    )
  );

  -- Finalizar cualquier relación restante en este club
  UPDATE public.coach_player_relationships
  SET
    status = 'ENDED',
    updated_at = v_now
  WHERE organizador_id = p_organizador_id
    AND coach_id = p_coach_id;

  -- Eliminar notas privadas del club sobre este coach
  DELETE FROM public.coach_club_private_notes
  WHERE organizador_id = p_organizador_id
    AND coach_id = p_coach_id;

  -- Eliminar la membresía del club
  DELETE FROM public.coach_club_memberships
  WHERE id = v_membership.id;

  RETURN jsonb_build_object(
    'ok', true,
    'message', 'Entrenador eliminado definitivamente de tu club. Se ha conservado todo el historial de auditoría y registros deportivos.'
  );
END;
$$;

-- ── 6. RPC: reassign_student_coach ────────────────────────────────────────────
-- Transfiere un alumno y su saldo restante de clases desde un entrenador a otro dentro del mismo club.
CREATE OR REPLACE FUNCTION public.reassign_student_coach(
  p_organizador_id uuid,
  p_student_id uuid,
  p_from_coach_id uuid,
  p_to_coach_id uuid,
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
  v_from_mem record;
  v_to_mem record;
  v_from_rel record;
  v_to_rel record;
  v_balance record;
  v_transferred_balance integer := 0;
  v_new_target_balance integer := 0;
  v_now timestamptz := now();
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  IF v_caller <> p_organizador_id AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo el club puede reasignar alumnos entre entrenadores.');
  END IF;

  IF p_from_coach_id = p_to_coach_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El entrenador de origen y de destino no pueden ser el mismo.');
  END IF;

  -- 1. Validar que el coach de destino esté activo en el club
  SELECT id, status INTO v_to_mem
  FROM public.coach_club_memberships
  WHERE coach_id = p_to_coach_id AND organizador_id = p_organizador_id;

  IF NOT FOUND OR v_to_mem.status <> 'ACTIVE' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El entrenador de destino no tiene una membresía activa en este club.');
  END IF;

  -- 2. Buscar relación origen
  SELECT id, coach_id, jugador_id, organizador_id, status
  INTO v_from_rel
  FROM public.coach_player_relationships
  WHERE coach_id = p_from_coach_id
    AND jugador_id = p_student_id
    AND organizador_id = p_organizador_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No se encontró la relación con el entrenador de origen.');
  END IF;

  -- 3. Buscar y bloquear saldo actual origen
  SELECT id, balance_classes, total_classes_given
  INTO v_balance
  FROM public.coach_player_class_balances
  WHERE relationship_id = v_from_rel.id
  FOR UPDATE;

  v_transferred_balance := COALESCE(v_balance.balance_classes, 0);

  -- 4. Finalizar relación origen y dejar saldo en 0
  UPDATE public.coach_player_relationships
  SET status = 'ENDED', updated_at = v_now
  WHERE id = v_from_rel.id;

  IF v_balance.id IS NOT NULL THEN
    UPDATE public.coach_player_class_balances
    SET balance_classes = 0, updated_at = v_now
    WHERE id = v_balance.id;
  END IF;

  -- 5. Crear o activar relación destino
  INSERT INTO public.coach_player_relationships (
    coach_id,
    jugador_id,
    organizador_id,
    status,
    is_primary,
    started_at,
    updated_at
  )
  VALUES (
    p_to_coach_id,
    p_student_id,
    p_organizador_id,
    'ACTIVE',
    true,
    v_now,
    v_now
  )
  ON CONFLICT (coach_id, jugador_id, organizador_id) DO UPDATE
  SET
    status = 'ACTIVE',
    updated_at = v_now
  RETURNING id INTO v_to_rel.id;

  -- 6. Upsert saldo en destino sumando las clases transferidas
  INSERT INTO public.coach_player_class_balances (
    relationship_id,
    organizador_id,
    coach_id,
    jugador_id,
    balance_classes,
    total_classes_given,
    updated_at
  )
  VALUES (
    v_to_rel.id,
    p_organizador_id,
    p_to_coach_id,
    p_student_id,
    v_transferred_balance,
    0,
    v_now
  )
  ON CONFLICT (relationship_id) DO UPDATE
  SET
    balance_classes = public.coach_player_class_balances.balance_classes + EXCLUDED.balance_classes,
    updated_at = v_now
  RETURNING balance_classes INTO v_new_target_balance;

  -- 7. Registrar movimientos en el ledger si se transfirieron clases
  IF v_transferred_balance > 0 THEN
    -- TRANSFER_OUT en origen
    INSERT INTO public.coach_class_ledger (
      relationship_id,
      organizador_id,
      coach_id,
      jugador_id,
      delta,
      tipo,
      notas,
      recorded_by,
      created_at
    )
    VALUES (
      v_from_rel.id,
      p_organizador_id,
      p_from_coach_id,
      p_student_id,
      -v_transferred_balance,
      'TRANSFER_OUT',
      COALESCE(NULLIF(btrim(p_notes), ''), 'Transferencia de saldo por reasignación de coach.'),
      v_caller,
      v_now
    );

    -- TRANSFER_IN en destino
    INSERT INTO public.coach_class_ledger (
      relationship_id,
      organizador_id,
      coach_id,
      jugador_id,
      delta,
      tipo,
      notas,
      recorded_by,
      created_at
    )
    VALUES (
      v_to_rel.id,
      p_organizador_id,
      p_to_coach_id,
      p_student_id,
      v_transferred_balance,
      'TRANSFER_IN',
      COALESCE(NULLIF(btrim(p_notes), ''), 'Recepción de saldo por reasignación de coach.'),
      v_caller,
      v_now
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'transferred_classes', v_transferred_balance,
    'new_target_balance', v_new_target_balance,
    'message', 'Alumno y clases transferidos exitosamente al nuevo entrenador.'
  );
END;
$$;

-- ── 7. PERMISOS Y PRIVILEGIOS DE EJECUCIÓN ────────────────────────────────────
REVOKE ALL ON FUNCTION public.lookup_student_by_riviera_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_student_by_riviera_id(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.assign_student_to_club_coach(uuid, uuid, text, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_student_to_club_coach(uuid, uuid, text, integer, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.finalize_coach_removal_from_club(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_coach_removal_from_club(uuid, uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reassign_student_coach(uuid, uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reassign_student_coach(uuid, uuid, uuid, uuid, text) TO authenticated, service_role;

