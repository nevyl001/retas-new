-- ==============================================================================
-- 0083_coaching_idempotency_safe_cancellation_and_snapshot_fix.sql
--
-- Riviera Coaching: Idempotencia Real, Cancelación Segura y Corrección de Historial
-- 1. Tabla public.coach_relationship_status_idempotency:
--    - Registra claves de idempotencia con actor, club, relación, estado solicitado
--      y payload de respuesta para garantizar que reintentos tardíos jamás alteren
--      un estado posterior (ej. ACTIVE -> PAUSED -> ACTIVE con reintento de PAUSED).
-- 2. RPC update_coach_student_relationship_status (revisada y robustecida):
--    - Idempotencia estricta: reintento devuelve payload previo sin mutar estado actual.
--    - Tratamiento diferenciado de sesiones futuras frente a sesiones pasadas no impartidas.
--    - Auditoría individual en coach_audit_log por cada sesión cancelada (CLASS_CANCELLED).
--    - Uso riguroso de columnas de cancelación (sin reverted_at/reverted_by en SCHEDULED).
--    - Bloqueo FOR UPDATE para relaciones y sesiones para prevenir condiciones de carrera.
--    - Consistencia total de balance y créditos intactos al terminar.
-- ==============================================================================

-- 1. Tabla de Idempotencia de Estados de Relación
CREATE TABLE IF NOT EXISTS public.coach_relationship_status_idempotency (
  idempotency_key text PRIMARY KEY,
  organizador_id uuid NOT NULL,
  relationship_id uuid NOT NULL REFERENCES public.coach_player_relationships(id) ON DELETE CASCADE,
  actor_auth_user_id uuid NOT NULL,
  status_requested text NOT NULL,
  status_applied text NOT NULL,
  cancelled_scheduled_count integer NOT NULL DEFAULT 0,
  response_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cpr_status_idempotency_lookup
  ON public.coach_relationship_status_idempotency (organizador_id, relationship_id, idempotency_key);

ALTER TABLE public.coach_relationship_status_idempotency ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Organizador gestiona idempotencia de coaching de su club" ON public.coach_relationship_status_idempotency;
CREATE POLICY "Organizador gestiona idempotencia de coaching de su club"
  ON public.coach_relationship_status_idempotency
  FOR ALL
  TO authenticated
  USING (organizador_id = auth.uid() OR public.is_master_admin())
  WITH CHECK (organizador_id = auth.uid() OR public.is_master_admin());

-- 2. RPC Definitiva: update_coach_student_relationship_status
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
  v_sess_row record;
  v_coach_id uuid;
  v_cancelled_count integer := 0;
  v_remaining_balance integer := 0;
  v_now timestamptz := now();
  v_session_cancel_reason text;
  v_idem record;
  v_response jsonb;
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

  -- 4. Comprobación de Idempotencia Estricta por Clave
  IF v_trimmed_key IS NOT NULL THEN
    SELECT *
    INTO v_idem
    FROM public.coach_relationship_status_idempotency
    WHERE idempotency_key = v_trimmed_key;

    IF FOUND THEN
      -- Validar que no haya conflicto de parámetros
      IF v_idem.organizador_id <> p_organizador_id
         OR v_idem.relationship_id <> p_relationship_id
         OR v_idem.actor_auth_user_id <> v_caller
         OR v_idem.status_requested <> v_trimmed_status THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'Conflicto de idempotencia: la clave ya fue utilizada con otros parámetros.'
        );
      END IF;

      -- Replay idempotente: devuelve el resultado registrado previamente
      -- SIN alterar el estado actual de la relación (evitando que un reintento tardío
      -- sobrescriba una transición posterior como ACTIVE -> PAUSED -> ACTIVE).
      RETURN v_idem.response_payload || jsonb_build_object(
        'idempotent_replay', true,
        'already_processed', true,
        'current_relationship_status', v_rel.status
      );
    END IF;
  END IF;

  -- Obtener saldo actual de clases para diagnóstico y confirmación
  SELECT COALESCE(balance_classes, 0)
  INTO v_remaining_balance
  FROM public.coach_player_class_balances
  WHERE relationship_id = p_relationship_id;

  -- 5. Si la relación ya se encuentra en el estado solicitado
  IF v_rel.status = v_trimmed_status THEN
    v_response := jsonb_build_object(
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

    IF v_trimmed_key IS NOT NULL THEN
      INSERT INTO public.coach_relationship_status_idempotency (
        idempotency_key,
        organizador_id,
        relationship_id,
        actor_auth_user_id,
        status_requested,
        status_applied,
        cancelled_scheduled_count,
        response_payload,
        created_at
      ) VALUES (
        v_trimmed_key,
        p_organizador_id,
        p_relationship_id,
        v_caller,
        v_trimmed_status,
        v_trimmed_status,
        0,
        v_response,
        v_now
      ) ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    RETURN v_response;
  END IF;

  -- 6. Ejecutar Transición de Estado
  IF v_trimmed_status = 'ENDED' THEN
    -- Cancelación segura de sesiones programadas con tratamiento diferenciado
    FOR v_sess_row IN
      SELECT id, starts_at, court, coach_id, jugador_id
      FROM public.coach_sessions
      WHERE relationship_id = p_relationship_id
        AND status = 'SCHEDULED'
      FOR UPDATE
    LOOP
      IF v_sess_row.starts_at >= v_now THEN
        v_session_cancel_reason := 'Relación finalizada por la administración del club: clase futura cancelada'
          || CASE WHEN v_trimmed_reason IS NOT NULL THEN ' (' || v_trimmed_reason || ')' ELSE '.' END;
      ELSE
        v_session_cancel_reason := 'Relación finalizada por la administración del club: clase programada pasada no impartida'
          || CASE WHEN v_trimmed_reason IS NOT NULL THEN ' (' || v_trimmed_reason || ')' ELSE '.' END;
      END IF;

      -- Actualizar sesión a CANCELLED (sin tocar reverted_at/reverted_by, exclusivo de sesiones completadas revertidas)
      UPDATE public.coach_sessions
      SET status = 'CANCELLED',
          cancellation_reason = v_session_cancel_reason,
          updated_at = v_now
      WHERE id = v_sess_row.id;

      v_cancelled_count := v_cancelled_count + 1;

      -- Auditoría individual por cada sesión cancelada
      INSERT INTO public.coach_audit_log (
        actor_auth_user_id,
        action,
        entity_type,
        entity_id,
        payload,
        created_at
      ) VALUES (
        v_caller,
        'CLASS_CANCELLED',
        'coach_sessions',
        v_sess_row.id,
        jsonb_build_object(
          'coach_id', v_sess_row.coach_id,
          'student_id', v_sess_row.jugador_id,
          'relationship_id', p_relationship_id,
          'starts_at', v_sess_row.starts_at,
          'court', v_sess_row.court,
          'reason', v_session_cancel_reason,
          'trigger', 'RELATIONSHIP_ENDED'
        ),
        v_now
      );
    END LOOP;

    -- Actualizar estado de la relación a ENDED
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

  -- 7. Registro en Bitácora de Auditoría para la Relación
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
    payload,
    created_at
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
      'remaining_balance', v_remaining_balance
    ),
    v_now
  );

  -- 8. Construir Respuesta y Guardar Registro de Idempotencia
  v_response := jsonb_build_object(
    'ok', true,
    'success', true,
    'relationship_id', p_relationship_id,
    'status', v_trimmed_status,
    'previous_status', v_rel.status,
    'cancelled_scheduled_count', v_cancelled_count,
    'remaining_balance', v_remaining_balance,
    'message', 'Estado de la relación actualizado a ' || v_trimmed_status || ' exitosamente.'
  );

  IF v_trimmed_key IS NOT NULL THEN
    INSERT INTO public.coach_relationship_status_idempotency (
      idempotency_key,
      organizador_id,
      relationship_id,
      actor_auth_user_id,
      status_requested,
      status_applied,
      cancelled_scheduled_count,
      response_payload,
      created_at
    ) VALUES (
      v_trimmed_key,
      p_organizador_id,
      p_relationship_id,
      v_caller,
      v_trimmed_status,
      v_trimmed_status,
      v_cancelled_count,
      v_response,
      v_now
    ) ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  RETURN v_response;
END;
$$;

-- Permisos
REVOKE ALL ON FUNCTION public.update_coach_student_relationship_status(uuid, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_coach_student_relationship_status(uuid, uuid, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_coach_student_relationship_status(uuid, uuid, text, text, text) TO authenticated, service_role;
