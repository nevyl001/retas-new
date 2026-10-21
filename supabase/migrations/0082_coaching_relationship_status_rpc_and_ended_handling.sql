-- ==============================================================================
-- 0082_coaching_relationship_status_rpc_and_ended_handling.sql
--
-- Riviera Coaching: Actualización Autorizada de Estado de Relación Coach-Alumno
-- 1. RPC update_coach_student_relationship_status:
--    - Permite transiciones seguras entre ACTIVE, PAUSED y ENDED.
--    - Restringe ejecución a administradores de club y master admin.
--    - Rechaza expresamente cuentas STUDENT_ONLY y coaches sin permiso administrativo.
--    - Al pasar a ENDED:
--        * Cancela clases agendadas futuras (SCHEDULED) bajo esa relación.
--        * Preserva el saldo de clases y el historial inmutable intactos.
--        * Actualiza ended_at = now() y desmarca is_primary.
--    - Al pasar a PAUSED:
--        * Desmarca is_primary para que no se use para deducciones de clases.
--    - Al pasar a ACTIVE:
--        * Restaura ended_at = NULL y reactiva la relación.
--    - Bitácora de auditoría detallada en public.coach_audit_log.
--    - Idempotente y con aislamiento multiclub estricto.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.update_coach_student_relationship_status(
  p_organizador_id uuid,
  p_relationship_id uuid,
  p_new_status text,
  p_reason text DEFAULT NULL,
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
  v_trimmed_status text := UPPER(btrim(COALESCE(p_new_status, '')));
  v_trimmed_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_trimmed_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_rel record;
  v_coach_id uuid;
  v_cancelled_count integer := 0;
  v_remaining_balance integer := 0;
  v_now timestamptz := now();
BEGIN
  -- 1. Autenticación y Autorización
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  -- Rechazar expresamente cuentas STUDENT_ONLY
  IF EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = v_caller
      AND (
        u.raw_app_meta_data->>'role' = 'STUDENT_ONLY'
        OR u.raw_app_meta_data->>'account_type' = 'STUDENT_ONLY'
        OR u.raw_user_meta_data->>'account_type' = 'STUDENT_ONLY'
      )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Las cuentas de alumno no están autorizadas para modificar relaciones de coaching.');
  END IF;

  -- Solo el organizador propietario del club o el administrador maestro pueden modificar la relación
  IF v_caller <> p_organizador_id AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado: solo la administración del club puede modificar el estado de sus alumnos.');
  END IF;

  -- Validar que el club tenga habilitado el módulo de Coaching
  IF NOT EXISTS (
    SELECT 1 FROM public.organizador_game_modes
    WHERE organizador_id = p_organizador_id AND coaching_enabled = true
  ) AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El club no tiene habilitado el módulo de Coaching.');
  END IF;

  -- 2. Validación de estado solicitado
  IF v_trimmed_status NOT IN ('ACTIVE', 'PAUSED', 'ENDED') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Estado inválido. Los estados permitidos son ACTIVE, PAUSED o ENDED.');
  END IF;

  -- 3. Búsqueda y Bloqueo Concurrente de la Relación en este Club
  SELECT *
  INTO v_rel
  FROM public.coach_player_relationships
  WHERE id = p_relationship_id AND organizador_id = p_organizador_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Relación coach-alumno no encontrada en este club.');
  END IF;

  -- Obtener saldo actual de clases para diagnóstico y advertencia informativa
  SELECT COALESCE(balance_classes, 0)
  INTO v_remaining_balance
  FROM public.coach_player_class_balances
  WHERE relationship_id = p_relationship_id;

  -- 4. Idempotencia: si ya está en el estado solicitado
  IF v_rel.status = v_trimmed_status THEN
    RETURN jsonb_build_object(
      'ok', true,
      'success', true,
      'relationship_id', p_relationship_id,
      'status', v_trimmed_status,
      'previous_status', v_rel.status,
      'already_applied', true,
      'cancelled_scheduled_count', 0,
      'remaining_balance', v_remaining_balance,
      'message', 'La relación ya se encontraba en estado ' || v_trimmed_status || '.'
    );
  END IF;

  -- 5. Ejecutar la Transición de Estado
  IF v_trimmed_status = 'ENDED' THEN
    -- Cancelar clases agendadas futuras (SCHEDULED) asociadas a esta relación
    UPDATE public.coach_sessions
    SET status = 'CANCELLED',
        cancellation_reason = COALESCE(v_trimmed_reason, 'Relación entrenador-alumno finalizada por la administración del club.'),
        reverted_at = v_now,
        reverted_by = v_caller,
        updated_at = v_now
    WHERE relationship_id = p_relationship_id
      AND status = 'SCHEDULED';

    GET DIAGNOSTICS v_cancelled_count = ROW_COUNT;

    -- Actualizar estado a ENDED
    UPDATE public.coach_player_relationships
    SET status = 'ENDED',
        ended_at = v_now,
        is_primary = false,
        updated_at = v_now
    WHERE id = p_relationship_id;

  ELSIF v_trimmed_status = 'PAUSED' THEN
    UPDATE public.coach_player_relationships
    SET status = 'PAUSED',
        is_primary = false,
        updated_at = v_now
    WHERE id = p_relationship_id;

  ELSIF v_trimmed_status = 'ACTIVE' THEN
    UPDATE public.coach_player_relationships
    SET status = 'ACTIVE',
        ended_at = NULL,
        updated_at = v_now
    WHERE id = p_relationship_id;
  END IF;

  -- 6. Registro en Bitácora de Auditoría
  SELECT c.id INTO v_coach_id
  FROM public.riviera_coaches c
  WHERE c.auth_user_id = v_caller
  LIMIT 1;

  INSERT INTO public.coach_audit_log (
    actor_coach_id,
    actor_auth_user_id,
    action,
    entity_type,
    entity_id,
    payload
  ) VALUES (
    v_coach_id,
    v_caller,
    'RELATIONSHIP_STATUS_UPDATE',
    'coach_player_relationships',
    p_relationship_id,
    jsonb_build_object(
      'relationship_id', p_relationship_id,
      'organizador_id', p_organizador_id,
      'coach_id', v_rel.coach_id,
      'jugador_id', v_rel.jugador_id,
      'old_status', v_rel.status,
      'new_status', v_trimmed_status,
      'reason', v_trimmed_reason,
      'idempotency_key', v_trimmed_key,
      'cancelled_scheduled_count', v_cancelled_count,
      'remaining_balance', v_remaining_balance,
      'updated_at', v_now
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'success', true,
    'relationship_id', p_relationship_id,
    'status', v_trimmed_status,
    'previous_status', v_rel.status,
    'cancelled_scheduled_count', v_cancelled_count,
    'remaining_balance', v_remaining_balance,
    'message', 'Estado de la relación actualizado a ' || v_trimmed_status || ' exitosamente.'
  );
END;
$$;

-- Permisos estrictos: solo usuarios autenticados autorizados y service_role
REVOKE ALL ON FUNCTION public.update_coach_student_relationship_status(uuid, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_coach_student_relationship_status(uuid, uuid, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_coach_student_relationship_status(uuid, uuid, text, text, text) TO authenticated, service_role;

