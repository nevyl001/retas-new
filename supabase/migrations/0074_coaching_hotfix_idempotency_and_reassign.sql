-- ==============================================================================
-- 0074_coaching_hotfix_idempotency_and_reassign.sql
-- Riviera Coaching • Hotfix Final de Entrega 0073 y Blindaje Funcional:
-- 1. Protección de lookup_student_by_riviera_id con contexto de club y permisos
-- 2. Idempotencia estricta en assign_student_to_club_coach con verificación de 7 campos y variables explícitas
-- 3. Blindaje de finalize_coach_removal_from_club (exige REMOVED, FOR UPDATE, validación de saldos)
-- 4. Reasignación atómica de alumnos (reassign_student_coach) con variables explícitas e idempotencia
-- 5. Actualización de get_student_coaching_overview para mostrar relaciones históricas (ENDED/PAUSED) sin considerarlas activas
-- ==============================================================================

-- ── 1. RPC: lookup_student_by_riviera_id ──────────────────────────────────────
-- Requiere autorización del club con Coaching habilitado o Administrador Maestro.
-- Devuelve exclusivamente los campos deportivos permitidos.
DROP FUNCTION IF EXISTS public.lookup_student_by_riviera_id(text);
DROP FUNCTION IF EXISTS public.lookup_student_by_riviera_id(uuid, text);

CREATE OR REPLACE FUNCTION public.lookup_student_by_riviera_id(
  p_organizador_id uuid,
  p_riviera_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_norm_id text := upper(btrim(COALESCE(p_riviera_id, '')));
  v_student record;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  -- 1. Comprobar que el solicitante sea administrador autorizado del club o Master Admin
  IF v_caller <> p_organizador_id AND NOT v_is_master THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No tienes permisos para buscar alumnos en este club.'
    );
  END IF;

  -- 2. Comprobar que el club tiene el servicio de Coaching habilitado
  IF NOT EXISTS (
    SELECT 1 FROM public.organizador_game_modes
    WHERE organizador_id = p_organizador_id AND coaching_enabled = true
  ) AND NOT v_is_master THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El club no tiene habilitado el módulo de Coaching.'
    );
  END IF;

  -- 3. Validar formato canónico de Riviera ID
  IF v_norm_id !~ '^RIV-[0-9]{5,8}$' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Formato de Riviera ID inválido. Debe tener la estructura RIV-######## (ej. RIV-00000278).'
    );
  END IF;

  -- 4. Búsqueda canónica del jugador oficial
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

REVOKE ALL ON FUNCTION public.lookup_student_by_riviera_id(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_student_by_riviera_id(uuid, text) TO authenticated, service_role;

-- ── 2. RPC: assign_student_to_club_coach ──────────────────────────────────────
-- Corrige el uso de variables PL/pgSQL explícitas (v_relationship_id uuid)
-- e implementa verificación rigurosa de idempotencia (7 campos) y bloqueo de membresía.
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
  v_relationship_id uuid;
  v_initial_classes integer := COALESCE(p_initial_classes, 0);
  v_trimmed_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_existing_ledger record;
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

  -- 3. Validar clases iniciales e idempotencia obligatoria para saldos positivos
  IF v_initial_classes < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La cantidad inicial de clases no puede ser negativa.');
  END IF;

  IF v_initial_classes > 0 AND v_trimmed_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Clave de idempotencia requerida para registrar asignaciones de clases.');
  END IF;

  -- 4. Comprobar que el club tiene coaching habilitado
  IF NOT EXISTS (
    SELECT 1 FROM public.organizador_game_modes
    WHERE organizador_id = p_organizador_id AND coaching_enabled = true
  ) AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El club no tiene habilitado el servicio de Coaching.');
  END IF;

  -- 5. Comprobar que el coach tiene membresía activa en este club y bloquear para prevenir carreras
  SELECT id, status INTO v_membership
  FROM public.coach_club_memberships
  WHERE coach_id = p_coach_id AND organizador_id = p_organizador_id
  FOR SHARE;

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

  -- 7. Manejo estricto de Idempotencia: verificación de los 7 parámetros de operación
  IF v_trimmed_key IS NOT NULL AND v_initial_classes > 0 THEN
    SELECT id, relationship_id, organizador_id, coach_id, jugador_id, delta, tipo, idempotency_key, recorded_by
    INTO v_existing_ledger
    FROM public.coach_class_ledger
    WHERE idempotency_key = v_trimmed_key;

    IF FOUND THEN
      -- Comprobar coincidencia estricta de:
      -- 1) usuario autorizador, 2) club, 3) coach, 4) alumno, 5) tipo movimiento, 6) delta clases
      IF v_existing_ledger.recorded_by <> v_caller
         OR v_existing_ledger.organizador_id <> p_organizador_id
         OR v_existing_ledger.coach_id <> p_coach_id
         OR v_existing_ledger.jugador_id <> v_jugador.id
         OR v_existing_ledger.tipo <> 'PACKAGE_CREDIT'
         OR v_existing_ledger.delta <> v_initial_classes THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'Conflicto de idempotencia: la clave ya fue utilizada en otra operación o con parámetros distintos.'
        );
      END IF;

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

  -- 8. Upsert atómico de la relación coach-alumno usando variable explícita uuid
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
  RETURNING id INTO v_relationship_id;

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
    v_relationship_id,
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
      v_relationship_id,
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
    'relationship_id', v_relationship_id,
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

REVOKE ALL ON FUNCTION public.assign_student_to_club_coach(uuid, uuid, text, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_student_to_club_coach(uuid, uuid, text, integer, text, text) TO authenticated, service_role;

-- ── 3. RPC: finalize_coach_removal_from_club ──────────────────────────────────
-- Blindaje:
-- - Exige estrictamente status = 'REMOVED'
-- - Bloquea la fila de membresía con FOR UPDATE
-- - Verifica y bloquea saldos pendientes
-- - Idempotente: si ya no existe, devuelve éxito
-- - Conserva histórico y bitácora de auditoría inmutable
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
  v_pending_balance integer := 0;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  -- 1. Autorización administrativa
  IF v_caller <> p_organizador_id AND NOT v_is_master THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No tienes permisos para eliminar entrenadores de este club.'
    );
  END IF;

  -- 2. Localizar y bloquear la membresía
  SELECT id, status, organizador_id, coach_id
  INTO v_membership
  FROM public.coach_club_memberships
  WHERE coach_id = p_coach_id AND organizador_id = p_organizador_id
  FOR UPDATE;

  -- 3. Idempotencia: si ya no existe, devolver éxito
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'message', 'El entrenador ya no está registrado en este club.'
    );
  END IF;

  -- 4. Exigir que la membresía esté previamente en estado 'REMOVED'
  IF v_membership.status <> 'REMOVED' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Solo se pueden eliminar definitivamente entrenadores dados de baja previamente (estado REMOVED). Realiza primero la baja del entrenador.'
    );
  END IF;

  -- 5. Comprobar si existen saldos activos pendientes
  SELECT COALESCE(SUM(balance_classes), 0)
  INTO v_pending_balance
  FROM public.coach_player_class_balances
  WHERE organizador_id = p_organizador_id
    AND coach_id = p_coach_id;

  IF v_pending_balance > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El entrenador aún tiene ' || v_pending_balance || ' clases asignadas pendientes con alumnos. Reasigna los saldos a otro entrenador antes de eliminarlo definitivamente.'
    );
  END IF;

  -- 6. Registrar en la bitácora de auditoría inmutable
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

  -- 7. Finalizar cualquier relación restante en este club
  UPDATE public.coach_player_relationships
  SET
    status = 'ENDED',
    updated_at = v_now
  WHERE organizador_id = p_organizador_id
    AND coach_id = p_coach_id;

  -- 8. Eliminar notas privadas del club sobre este coach
  DELETE FROM public.coach_club_private_notes
  WHERE organizador_id = p_organizador_id
    AND coach_id = p_coach_id;

  -- 9. Eliminar la membresía del club
  DELETE FROM public.coach_club_memberships
  WHERE id = v_membership.id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'message', 'Entrenador eliminado definitivamente de tu club. Se ha conservado todo el historial de auditoría y registros deportivos.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_coach_removal_from_club(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_coach_removal_from_club(uuid, uuid, text) TO authenticated, service_role;

-- ── 4. RPC: reassign_student_coach ────────────────────────────────────────────
-- Variables explícitas PL/pgSQL (v_to_rel_id uuid) e idempotencia para transferencias.
DROP FUNCTION IF EXISTS public.reassign_student_coach(uuid, uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.reassign_student_coach(uuid, uuid, uuid, uuid, text, text);

CREATE OR REPLACE FUNCTION public.reassign_student_coach(
  p_organizador_id uuid,
  p_student_id uuid,
  p_from_coach_id uuid,
  p_to_coach_id uuid,
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
  v_from_mem record;
  v_to_mem record;
  v_from_rel record;
  v_to_rel_id uuid;
  v_balance record;
  v_transferred_balance integer := 0;
  v_new_target_balance integer := 0;
  v_trimmed_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_existing_out record;
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

  -- 1. Validar que ambos coaches pertenezcan a este club y que el destino esté activo
  SELECT id, status INTO v_from_mem
  FROM public.coach_club_memberships
  WHERE coach_id = p_from_coach_id AND organizador_id = p_organizador_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El entrenador de origen no pertenece a este club.');
  END IF;

  SELECT id, status INTO v_to_mem
  FROM public.coach_club_memberships
  WHERE coach_id = p_to_coach_id AND organizador_id = p_organizador_id;

  IF NOT FOUND OR v_to_mem.status <> 'ACTIVE' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El entrenador de destino no tiene una membresía activa en este club.');
  END IF;

  -- 2. Buscar relación de origen
  SELECT id, coach_id, jugador_id, organizador_id, status
  INTO v_from_rel
  FROM public.coach_player_relationships
  WHERE coach_id = p_from_coach_id
    AND jugador_id = p_student_id
    AND organizador_id = p_organizador_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No se encontró la relación del alumno con el entrenador de origen.');
  END IF;

  -- 3. Idempotencia en reasignación: si la clave ya se procesó, devolver snapshot sin duplicar
  IF v_trimmed_key IS NOT NULL THEN
    SELECT id, relationship_id, delta, tipo, idempotency_key, recorded_by
    INTO v_existing_out
    FROM public.coach_class_ledger
    WHERE idempotency_key = v_trimmed_key || '-out';

    IF FOUND THEN
      -- Obtener saldo destino
      SELECT balance_classes INTO v_new_target_balance
      FROM public.coach_player_class_balances
      WHERE organizador_id = p_organizador_id
        AND coach_id = p_to_coach_id
        AND jugador_id = p_student_id;

      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'transferred_classes', ABS(v_existing_out.delta),
        'new_target_balance', COALESCE(v_new_target_balance, 0),
        'message', 'Operación idempotente: la reasignación ya fue completada previamente.'
      );
    END IF;
  END IF;

  -- 4. Buscar y bloquear saldo actual de origen
  SELECT id, balance_classes, total_classes_given
  INTO v_balance
  FROM public.coach_player_class_balances
  WHERE relationship_id = v_from_rel.id
  FOR UPDATE;

  v_transferred_balance := COALESCE(v_balance.balance_classes, 0);

  -- 5. Finalizar relación origen y poner saldo en 0
  UPDATE public.coach_player_relationships
  SET status = 'ENDED', updated_at = v_now
  WHERE id = v_from_rel.id;

  IF v_balance.id IS NOT NULL THEN
    UPDATE public.coach_player_class_balances
    SET balance_classes = 0, updated_at = v_now
    WHERE id = v_balance.id;
  END IF;

  -- 6. Crear o activar relación destino usando variable explícita v_to_rel_id
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
  RETURNING id INTO v_to_rel_id;

  -- 7. Upsert saldo en destino sumando las clases transferidas
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
    v_to_rel_id,
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

  -- 8. Registrar movimientos en el ledger inmutable si se transfirieron clases
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
      idempotency_key,
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
      COALESCE(NULLIF(btrim(p_notes), ''), 'Transferencia de saldo por cambio de entrenador.'),
      CASE WHEN v_trimmed_key IS NOT NULL THEN v_trimmed_key || '-out' ELSE NULL END,
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
      idempotency_key,
      recorded_by,
      created_at
    )
    VALUES (
      v_to_rel_id,
      p_organizador_id,
      p_to_coach_id,
      p_student_id,
      v_transferred_balance,
      'TRANSFER_IN',
      COALESCE(NULLIF(btrim(p_notes), ''), 'Recepción de saldo por cambio de entrenador.'),
      CASE WHEN v_trimmed_key IS NOT NULL THEN v_trimmed_key || '-in' ELSE NULL END,
      v_caller,
      v_now
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'transferred_classes', v_transferred_balance,
    'new_target_balance', v_new_target_balance,
    'message', 'Alumno y ' || v_transferred_balance || ' clases transferidos exitosamente al nuevo entrenador.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_student_coach(uuid, uuid, uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reassign_student_coach(uuid, uuid, uuid, uuid, text, text) TO authenticated, service_role;

-- ── 5. ACTUALIZAR get_student_coaching_overview ───────────────────────────────
-- Permite al alumno consultar tanto sus relaciones activas como históricas (ENDED/PAUSED),
-- sin marcar a los entrenadores anteriores como activos, conservando todas sus sesiones y comentarios.
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

  -- 1. Identidades verificadas explícitas (coach_student_account_links y rewards_player_links)
  SELECT COALESCE(array_agg(DISTINCT jugador_id), '{}')
  INTO v_verified_jugador_ids
  FROM (
    SELECT jugador_id FROM public.coach_student_account_links WHERE auth_user_id = v_caller
    UNION
    SELECT jugador_id FROM public.rewards_player_links WHERE user_id = v_caller
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

  -- 4. Construir resumen con detalle completo: incluye relaciones ACTIVE, PAUSED y ENDED (históricas)
  -- Ordena para que el coach activo actual aparezca primero
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
      'ledger', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', l.id,
            'delta', l.delta,
            'tipo', l.tipo,
            'notas', l.notas,
            'created_at', l.created_at,
            'session', CASE WHEN s.id IS NOT NULL THEN jsonb_build_object(
              'id', s.id,
              'starts_at', s.starts_at,
              'duration_minutes', s.duration_minutes,
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
          SELECT id, delta, tipo, notas, created_at, session_id
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
