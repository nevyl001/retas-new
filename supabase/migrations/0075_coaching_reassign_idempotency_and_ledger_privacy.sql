-- ==============================================================================
-- 0075_coaching_reassign_idempotency_and_ledger_privacy.sql
--
-- Cierre de Calidad 0074:
-- 1. Tabla persistente de auditoría de reasignaciones (coach_student_reassignment_log)
--    para blindar la idempotencia con verificación estricta de parámetros (caller, club,
--    alumno, coach origen, coach destino) y soportar transferencias de 0 clases sin
--    inventar movimientos económicos ficticios en el ledger.
-- 2. Bloqueo de concurrencia FOR UPDATE en reasignaciones para evitar carreras o doble crédito.
-- 3. Protección de privacidad en get_student_coaching_overview: no devolver notas administrativas
--    o referencias de pago internas del club al alumno en sesión.
-- ==============================================================================

-- ── 1. TABLA DE REASIGNACIONES IDEMPOTENTES ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coach_student_reassignment_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizador_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.riviera_jugadores(id) ON DELETE CASCADE,
  from_coach_id uuid NOT NULL REFERENCES public.riviera_coaches(id) ON DELETE CASCADE,
  to_coach_id uuid NOT NULL REFERENCES public.riviera_coaches(id) ON DELETE CASCADE,
  from_relationship_id uuid REFERENCES public.coach_player_relationships(id) ON DELETE SET NULL,
  to_relationship_id uuid REFERENCES public.coach_player_relationships(id) ON DELETE SET NULL,
  transferred_classes integer NOT NULL DEFAULT 0,
  notes text,
  idempotency_key text UNIQUE,
  recorded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reassign_log_club_student
  ON public.coach_student_reassignment_log (organizador_id, student_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reassign_log_idempotency
  ON public.coach_student_reassignment_log (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.coach_student_reassignment_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "csrl_select_org" ON public.coach_student_reassignment_log;
CREATE POLICY "csrl_select_org"
  ON public.coach_student_reassignment_log
  FOR SELECT
  TO authenticated
  USING (
    organizador_id = auth.uid()
    OR COALESCE(public.is_master_admin(), false)
  );

GRANT SELECT ON public.coach_student_reassignment_log TO authenticated, service_role;
GRANT ALL ON public.coach_student_reassignment_log TO service_role;

-- ── 2. BLINDAR reassign_student_coach ─────────────────────────────────────────
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
  v_existing_op record;
  v_now timestamptz := now();
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  -- 1. Autorización administrativa
  IF v_caller <> p_organizador_id AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo el club puede reasignar alumnos entre entrenadores.');
  END IF;

  -- 2. Comprobar que el club tiene el módulo de Coaching activo
  IF NOT EXISTS (
    SELECT 1 FROM public.organizador_game_modes
    WHERE organizador_id = p_organizador_id AND coaching_enabled = true
  ) AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El club no tiene habilitado el módulo de Coaching.');
  END IF;

  IF p_from_coach_id = p_to_coach_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El entrenador de origen y de destino no pueden ser el mismo.');
  END IF;

  -- 3. Idempotencia estricta mediante coach_student_reassignment_log
  IF v_trimmed_key IS NOT NULL THEN
    SELECT *
    INTO v_existing_op
    FROM public.coach_student_reassignment_log
    WHERE idempotency_key = v_trimmed_key;

    IF FOUND THEN
      -- Verificar coincidencia estricta de todos los parámetros de operación:
      -- a) usuario que autorizó
      -- b) club organizador
      -- c) alumno
      -- d) coach origen
      -- e) coach destino
      IF v_existing_op.recorded_by <> v_caller
         OR v_existing_op.organizador_id <> p_organizador_id
         OR v_existing_op.student_id <> p_student_id
         OR v_existing_op.from_coach_id <> p_from_coach_id
         OR v_existing_op.to_coach_id <> p_to_coach_id THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'Conflicto de idempotencia: la clave ya fue utilizada en otra operación o con parámetros distintos.'
        );
      END IF;

      -- Obtener saldo actual en destino
      SELECT balance_classes INTO v_new_target_balance
      FROM public.coach_player_class_balances
      WHERE organizador_id = p_organizador_id
        AND coach_id = p_to_coach_id
        AND jugador_id = p_student_id;

      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'transferred_classes', v_existing_op.transferred_classes,
        'new_target_balance', COALESCE(v_new_target_balance, 0),
        'to_relationship_id', v_existing_op.to_relationship_id,
        'message', 'Operación idempotente: la reasignación ya fue completada previamente.'
      );
    END IF;
  END IF;

  -- 4. Validar que ambos coaches pertenezcan a este club y que el destino esté activo
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

  -- 5. Buscar y bloquear la relación de origen para evitar carreras concurrentes
  SELECT id, coach_id, jugador_id, organizador_id, status
  INTO v_from_rel
  FROM public.coach_player_relationships
  WHERE coach_id = p_from_coach_id
    AND jugador_id = p_student_id
    AND organizador_id = p_organizador_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No se encontró la relación del alumno con el entrenador de origen.');
  END IF;

  IF v_from_rel.status <> 'ACTIVE' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'La relación del alumno con el entrenador de origen no está activa (estado actual: ' || v_from_rel.status || ').'
    );
  END IF;

  -- 6. Buscar y bloquear saldo actual de origen
  SELECT id, balance_classes, total_classes_given
  INTO v_balance
  FROM public.coach_player_class_balances
  WHERE relationship_id = v_from_rel.id
  FOR UPDATE;

  v_transferred_balance := COALESCE(v_balance.balance_classes, 0);

  -- 7. Finalizar relación origen y poner saldo en 0
  UPDATE public.coach_player_relationships
  SET status = 'ENDED', ended_at = v_now, updated_at = v_now
  WHERE id = v_from_rel.id;

  IF v_balance.id IS NOT NULL THEN
    UPDATE public.coach_player_class_balances
    SET balance_classes = 0, updated_at = v_now
    WHERE id = v_balance.id;
  END IF;

  -- 8. Crear o activar relación destino
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

  -- 9. Upsert saldo en destino sumando las clases transferidas
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

  -- 10. Registrar movimientos en el ledger inmutable SOLO si se transfirieron clases (> 0)
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

  -- 11. Registrar la operación persistente para auditoría e idempotencia (incluso si transferred_classes = 0)
  INSERT INTO public.coach_student_reassignment_log (
    organizador_id,
    student_id,
    from_coach_id,
    to_coach_id,
    from_relationship_id,
    to_relationship_id,
    transferred_classes,
    notes,
    idempotency_key,
    recorded_by,
    created_at
  )
  VALUES (
    p_organizador_id,
    p_student_id,
    p_from_coach_id,
    p_to_coach_id,
    v_from_rel.id,
    v_to_rel_id,
    v_transferred_balance,
    p_notes,
    v_trimmed_key,
    v_caller,
    v_now
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'transferred_classes', v_transferred_balance,
    'new_target_balance', v_new_target_balance,
    'to_relationship_id', v_to_rel_id,
    'message', 'Alumno y ' || v_transferred_balance || ' clases transferidos exitosamente al nuevo entrenador.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_student_coach(uuid, uuid, uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reassign_student_coach(uuid, uuid, uuid, uuid, text, text) TO authenticated, service_role;

-- ── 3. PROTEGER NOTAS ADMINISTRATIVAS EN get_student_coaching_overview ────────
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

  -- 4. Construir resumen con detalle completo: incluye relaciones ACTIVE, PAUSED y ENDED (históricas)
  -- PROTECCIÓN: NO se expone l.notas (notas administrativas/referencias de pago internas del club).
  -- Se conservan únicamente las notas pedagógicas y de retroalimentación de la sesión (focus, worked_on, etc.).
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
