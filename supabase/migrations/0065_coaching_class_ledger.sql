-- =============================================================================
-- 0065_coaching_class_ledger.sql
-- Riviera Coaching — Entrega C: Control de Clases, Sesiones y Saldo de Alumnos
--
-- REGLAS DEFINITIVAS DE NEGOCIO:
-- 1. EL ÚNICO QUE PUEDE ASIGNAR O AGREGAR CLASES DISPONIBLES ES EL CLUB O
--    PROPIETARIO DE LA CUENTA DONDE TRABAJA EL COACH. El coach es un empleado del club.
-- 2. El coach NO puede asignar, recargar ni aumentar clases directamente.
-- 3. EXCLUSIVAMENTE el coach autorizado puede vincular alumnos por su Riviera ID
--    dentro de un club donde tenga membresía ACTIVE.
-- 4. El coach registra las clases impartidas, descontando exactamente 1 unidad.
-- 5. Cada clase impartida cuenta con identidad propia y se vincula a una sesión
--    real en public.coach_sessions. Una sesión solo puede generar un descuento.
-- 6. La RPC de clase impartida comprueba que el coach tiene membresía ACTIVE con el club.
-- 7. Saldos estrictamente separados por club, coach y alumno.
-- 8. Ledger inmutable (coach_class_ledger) para auditoría de movimientos, sin
--    cascadas destructivas (ON DELETE RESTRICT / SET NULL) para preservar el historial.
-- 9. Protección estricta de idempotencia contra doble clic y reintentos concurrentes.
--    La clave debe validarse DESPUÉS de la identidad y autorizaciones. Claves vacías
--    son rechazadas. Conflictos de parámetros con una misma clave son rechazados.
-- 10. CERO manejo de dinero, pagos, pasarelas, precios ni suscripciones monetarias.
-- =============================================================================

-- ── 1) Extensión y Protección de Sesiones (public.coach_sessions) ─────────────
ALTER TABLE public.coach_sessions
  ADD COLUMN IF NOT EXISTS jugador_id uuid REFERENCES public.riviera_jugadores(id) ON DELETE SET NULL;

ALTER TABLE public.coach_sessions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'COMPLETED';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'coach_sessions_status_check'
  ) THEN
    ALTER TABLE public.coach_sessions
      ADD CONSTRAINT coach_sessions_status_check
      CHECK (status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'));
  END IF;
END $$;

-- Permitir que el club organizador consulte todas las sesiones de su club
DROP POLICY IF EXISTS csess_organizador_select ON public.coach_sessions;
CREATE POLICY csess_organizador_select ON public.coach_sessions
  FOR SELECT
  TO authenticated
  USING (
    organizador_id = auth.uid()
    OR COALESCE(public.is_master_admin(), false)
  );

-- ── 2) Tabla de Saldo por Club, Coach y Alumno ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.coach_player_class_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id uuid NOT NULL REFERENCES public.coach_player_relationships(id) ON DELETE CASCADE,
  organizador_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES public.riviera_coaches(id) ON DELETE CASCADE,
  jugador_id uuid NOT NULL REFERENCES public.riviera_jugadores(id) ON DELETE CASCADE,
  balance_classes integer NOT NULL DEFAULT 0 CHECK (balance_classes >= 0),
  total_classes_given integer NOT NULL DEFAULT 0 CHECK (total_classes_given >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_cpcb_relationship UNIQUE (relationship_id),
  CONSTRAINT uq_cpcb_org_coach_player UNIQUE (organizador_id, coach_id, jugador_id)
);

CREATE INDEX IF NOT EXISTS idx_cpcb_org_coach
  ON public.coach_player_class_balances(organizador_id, coach_id);

CREATE INDEX IF NOT EXISTS idx_cpcb_jugador
  ON public.coach_player_class_balances(jugador_id);

COMMENT ON TABLE public.coach_player_class_balances IS
  'Riviera Coaching: Saldo de clases asignadas y disponibles por club, coach y alumno.';

-- ── 3) Ledger Inmutable de Movimientos de Clases (Sin Cascadas Destructivas) ──
CREATE TABLE IF NOT EXISTS public.coach_class_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id uuid NULL REFERENCES public.coach_player_relationships(id) ON DELETE SET NULL,
  organizador_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  coach_id uuid NOT NULL REFERENCES public.riviera_coaches(id) ON DELETE RESTRICT,
  jugador_id uuid NOT NULL REFERENCES public.riviera_jugadores(id) ON DELETE RESTRICT,
  session_id uuid NULL REFERENCES public.coach_sessions(id) ON DELETE SET NULL,
  delta integer NOT NULL CHECK (delta <> 0),
  tipo text NOT NULL CHECK (tipo IN ('PACKAGE_CREDIT', 'CLASS_DEBIT', 'ADJUSTMENT')),
  notas text NULL,
  idempotency_key text NULL,
  recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Asegurar columnas si la tabla fue precreada sin ellas
ALTER TABLE public.coach_class_ledger
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.coach_sessions(id) ON DELETE SET NULL;

ALTER TABLE public.coach_class_ledger
  ADD COLUMN IF NOT EXISTS idempotency_key text NULL;

CREATE INDEX IF NOT EXISTS idx_ccl_relationship_created
  ON public.coach_class_ledger(relationship_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ccl_org_created
  ON public.coach_class_ledger(organizador_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ccl_coach_created
  ON public.coach_class_ledger(coach_id, created_at DESC);

-- Índice único para que una sesión impartida solo genere exactamente un descuento
CREATE UNIQUE INDEX IF NOT EXISTS idx_ccl_session
  ON public.coach_class_ledger(session_id)
  WHERE session_id IS NOT NULL;

-- Índice único parcial para evitar cobros duplicados en reintentos o doble clic
CREATE UNIQUE INDEX IF NOT EXISTS idx_ccl_idempotency
  ON public.coach_class_ledger(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON TABLE public.coach_class_ledger IS
  'Riviera Coaching: Historial inmutable de asignaciones y deducciones de clases.';

-- ── 4) Habilitar RLS y Restringir Mutaciones Directas ───────────────────────
ALTER TABLE public.coach_player_class_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_class_ledger ENABLE ROW LEVEL SECURITY;

-- Toda mutación de saldo o ledger DEBE realizarse exclusivamente a través
-- de las funciones RPC autorizadas (assign_coach_classes / record_coach_class_session).
REVOKE INSERT, UPDATE, DELETE ON public.coach_player_class_balances FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.coach_class_ledger FROM anon, authenticated;

-- Balances: Admin Maestro y Organizador del Club (solo su club)
DROP POLICY IF EXISTS cpcb_organizador_select ON public.coach_player_class_balances;
CREATE POLICY cpcb_organizador_select ON public.coach_player_class_balances
  FOR SELECT
  TO authenticated
  USING (
    organizador_id = auth.uid()
    OR COALESCE(public.is_master_admin(), false)
  );

-- Balances: Coach asignado puede consultar saldos de sus alumnos
DROP POLICY IF EXISTS cpcb_coach_select ON public.coach_player_class_balances;
CREATE POLICY cpcb_coach_select ON public.coach_player_class_balances
  FOR SELECT
  TO authenticated
  USING (
    coach_id IN (
      SELECT id FROM public.riviera_coaches WHERE auth_user_id = auth.uid()
    )
  );

-- Ledger: Admin Maestro y Organizador (solo su club)
DROP POLICY IF EXISTS ccl_organizador_select ON public.coach_class_ledger;
CREATE POLICY ccl_organizador_select ON public.coach_class_ledger
  FOR SELECT
  TO authenticated
  USING (
    organizador_id = auth.uid()
    OR COALESCE(public.is_master_admin(), false)
  );

-- Ledger: Coach asignado puede consultar su historial
DROP POLICY IF EXISTS ccl_coach_select ON public.coach_class_ledger;
CREATE POLICY ccl_coach_select ON public.coach_class_ledger
  FOR SELECT
  TO authenticated
  USING (
    coach_id IN (
      SELECT id FROM public.riviera_coaches WHERE auth_user_id = auth.uid()
    )
  );

-- ── 5) RPC: Vinculación Canónica de Alumno a Coach por Riviera ID ─────────────
-- Sustituye la versión provisional bloqueada en 0064
DROP FUNCTION IF EXISTS public.link_player_to_coach_by_riviera_id(uuid, text);

CREATE OR REPLACE FUNCTION public.link_player_to_coach_by_riviera_id(
  p_coach_id uuid,
  p_riviera_id text,
  p_organizador_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_coach record;
  v_org_id uuid := p_organizador_id;
  v_norm_riviera_id text;
  v_jugador_id uuid;
  v_jugador_nombre text;
  v_rel_id uuid;
  v_status text;
  v_is_primary boolean;
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_membership_count int;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  -- 1. Resolver y verificar perfil de coach
  SELECT id, auth_user_id, nombre INTO v_coach
  FROM public.riviera_coaches
  WHERE id = p_coach_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Perfil de coach no encontrado.');
  END IF;

  -- REGLA DEFINITIVA: Exclusivamente el coach asignado o Master Admin puede vincular alumnos
  IF v_coach.auth_user_id <> v_caller AND v_is_master IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Solo el coach asignado puede vincular alumnos a su perfil.'
    );
  END IF;

  -- 2. Normalizar y validar estructura de Riviera ID
  v_norm_riviera_id := upper(btrim(COALESCE(p_riviera_id, '')));
  IF v_norm_riviera_id !~ '^RIV-[0-9]{5,8}$' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Formato de Riviera ID inválido. Debe tener la estructura RIV-########'
    );
  END IF;

  -- 3. Resolver y validar el club ancla (organizador_id)
  IF v_org_id IS NULL THEN
    SELECT count(*) INTO v_membership_count
    FROM public.coach_club_memberships
    WHERE coach_id = p_coach_id AND status = 'ACTIVE';

    IF v_membership_count = 0 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'El coach no cuenta con membresía activa en ningún club.'
      );
    ELSIF v_membership_count > 1 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'El coach pertenece a múltiples clubes. Debes especificar el club al que se vinculará el alumno.'
      );
    ELSE
      SELECT organizador_id INTO v_org_id
      FROM public.coach_club_memberships
      WHERE coach_id = p_coach_id AND status = 'ACTIVE'
      LIMIT 1;
    END IF;
  ELSE
    -- Comprobar que el coach tenga membresía ACTIVE en este club específico
    IF NOT EXISTS (
      SELECT 1 FROM public.coach_club_memberships
      WHERE coach_id = p_coach_id
        AND organizador_id = v_org_id
        AND status = 'ACTIVE'
    ) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'El coach no cuenta con membresía activa en el club especificado.'
      );
    END IF;
  END IF;

  -- 4. Comprobar que el club tiene coaching habilitado
  IF NOT EXISTS (
    SELECT 1 FROM public.organizador_game_modes
    WHERE organizador_id = v_org_id AND coaching_enabled = true
  ) AND v_is_master IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El club no tiene el servicio de Coaching habilitado.'
    );
  END IF;

  -- 5. Resolver identidad deportiva oficial a partir del Riviera ID
  SELECT rj.id, rj.nombre
  INTO v_jugador_id, v_jugador_nombre
  FROM public.riviera_official_player_identity i
  JOIN public.riviera_jugadores rj ON rj.id = i.canonical_riviera_jugador_id
  WHERE upper(trim(i.riviera_id)) = v_norm_riviera_id
  LIMIT 1;

  IF v_jugador_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No se encontró un jugador registrado con ese Riviera ID.'
    );
  END IF;

  -- 6. Insertar o reactivar vínculo en coach_player_relationships
  INSERT INTO public.coach_player_relationships (
    coach_id,
    jugador_id,
    organizador_id,
    status
  )
  VALUES (
    p_coach_id,
    v_jugador_id,
    v_org_id,
    'ACTIVE'
  )
  ON CONFLICT (organizador_id, coach_id, jugador_id)
  DO UPDATE SET
    status = 'ACTIVE',
    ended_at = NULL,
    updated_at = now()
  RETURNING id, status, is_primary INTO v_rel_id, v_status, v_is_primary;

  -- 7. Asegurar que exista el registro de saldo inicial en 0 para este alumno y club
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
    v_rel_id,
    v_org_id,
    p_coach_id,
    v_jugador_id,
    0,
    0,
    now()
  )
  ON CONFLICT (relationship_id) DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'relationship_id', v_rel_id,
    'organizador_id', v_org_id,
    'coach_id', p_coach_id,
    'jugador_id', v_jugador_id,
    'jugador_nombre', v_jugador_nombre,
    'riviera_id', v_norm_riviera_id,
    'status', v_status,
    'is_primary', v_is_primary
  );
END;
$$;

-- ── 6) RPC: Asignar Clases Disponibles (Exclusivo del Club) ─────────────────
CREATE OR REPLACE FUNCTION public.assign_coach_classes(
  p_relationship_id uuid,
  p_class_count integer,
  p_notas text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_rel record;
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_membership record;
  v_new_balance integer;
  v_trimmed_key text := NULLIF(trim(p_idempotency_key), '');
  v_existing_op record;
BEGIN
  -- 1. Validar identidad del invocador
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  -- 2. Exigir referencia única obligatoria por operación real (no aceptar claves vacías)
  IF v_trimmed_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Clave de idempotencia requerida para registrar la asignación.');
  END IF;

  -- 3. Validar parámetros de negocio
  IF p_class_count IS NULL OR p_class_count <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La cantidad de clases debe ser mayor a cero.');
  END IF;

  -- 4. Obtener y validar relación coach-alumno
  SELECT r.id, r.organizador_id, r.coach_id, r.jugador_id, r.status
  INTO v_rel
  FROM public.coach_player_relationships r
  WHERE r.id = p_relationship_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Relación coach-alumno no encontrada.');
  END IF;

  IF v_rel.status <> 'ACTIVE' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No se pueden asignar clases a una relación inactiva o finalizada.');
  END IF;

  -- 5. REGLA DEFINITIVA: El único que puede asignar clases es el club propietario de la cuenta o Admin Maestro.
  -- El coach es un empleado del club y tiene estrictamente prohibido asignar o recargar saldo.
  IF v_rel.organizador_id <> v_caller AND v_is_master IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Solo el club o administrador autorizado donde trabaja el coach puede asignar clases.'
    );
  END IF;

  -- 6. Comprobar que el club tiene coaching habilitado
  IF NOT EXISTS (
    SELECT 1 FROM public.organizador_game_modes
    WHERE organizador_id = v_rel.organizador_id AND coaching_enabled = true
  ) AND v_is_master IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El club no tiene el servicio de Coaching habilitado.'
    );
  END IF;

  -- 7. Comprobar que el coach tiene membresía ACTIVE en este club
  SELECT id, status INTO v_membership
  FROM public.coach_club_memberships
  WHERE coach_id = v_rel.coach_id AND organizador_id = v_rel.organizador_id;

  IF NOT FOUND OR v_membership.status <> 'ACTIVE' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El coach no tiene una membresía activa en este club.'
    );
  END IF;

  -- 8. Validar Idempotencia después de autorizaciones y dentro de operación protegida
  SELECT id, tipo, relationship_id, organizador_id, recorded_by, delta
  INTO v_existing_op
  FROM public.coach_class_ledger
  WHERE idempotency_key = v_trimmed_key;

  IF FOUND THEN
    -- La clave reutilizada debe corresponder exactamente al mismo usuario, operación y relación
    IF v_existing_op.recorded_by <> v_caller
       OR v_existing_op.relationship_id <> p_relationship_id
       OR v_existing_op.tipo <> 'PACKAGE_CREDIT'
       OR v_existing_op.delta <> p_class_count THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'Conflicto de idempotencia: la clave ya fue utilizada en otra operación o con parámetros distintos.'
      );
    END IF;

    SELECT balance_classes INTO v_new_balance
    FROM public.coach_player_class_balances
    WHERE relationship_id = p_relationship_id;

    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'new_balance', COALESCE(v_new_balance, 0),
      'assigned_classes', p_class_count,
      'message', 'Operación idempotente: las clases ya fueron asignadas previamente.'
    );
  END IF;

  -- 9. Upsert atómico del saldo con bloqueo
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
    v_rel.id,
    v_rel.organizador_id,
    v_rel.coach_id,
    v_rel.jugador_id,
    p_class_count,
    0,
    now()
  )
  ON CONFLICT (relationship_id) DO UPDATE
    SET balance_classes = public.coach_player_class_balances.balance_classes + EXCLUDED.balance_classes,
        updated_at = now()
  RETURNING balance_classes INTO v_new_balance;

  -- 10. Registro inmutable en el ledger
  INSERT INTO public.coach_class_ledger (
    relationship_id,
    organizador_id,
    coach_id,
    jugador_id,
    delta,
    tipo,
    notas,
    idempotency_key,
    recorded_by
  )
  VALUES (
    v_rel.id,
    v_rel.organizador_id,
    v_rel.coach_id,
    v_rel.jugador_id,
    p_class_count,
    'PACKAGE_CREDIT',
    p_notas,
    v_trimmed_key,
    v_caller
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'new_balance', v_new_balance,
    'assigned_classes', p_class_count
  );
END;
$$;

-- Alias retrocompatible: credit_coach_class_package
CREATE OR REPLACE FUNCTION public.credit_coach_class_package(
  p_relationship_id uuid,
  p_class_count integer,
  p_notas text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.assign_coach_classes(p_relationship_id, p_class_count, p_notas, p_idempotency_key);
END;
$$;

-- ── 7) RPC: Registrar Clase Impartida (Deducción Atómica y Sesión Real) ───────
DROP FUNCTION IF EXISTS public.record_coach_class_session(uuid, text, text);

CREATE OR REPLACE FUNCTION public.record_coach_class_session(
  p_relationship_id uuid,
  p_notas text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_session_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_trimmed_key text := NULLIF(trim(p_idempotency_key), '');
  v_session_id uuid := p_session_id;
  v_existing_op record;
BEGIN
  -- 1. Validar identidad del invocador
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  -- 2. Exigir clave de idempotencia obligatoria (previene ejecuciones descontroladas o duplicadas)
  IF v_trimmed_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Clave de idempotencia requerida para registrar la clase impartida.');
  END IF;

  -- 3. Obtener relación coach-alumno
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

  -- 4. Obtener datos del coach asignado
  SELECT id, auth_user_id, nombre INTO v_coach
  FROM public.riviera_coaches
  WHERE id = v_rel.coach_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Perfil de coach no encontrado.');
  END IF;

  -- 5. Autorización: El coach que imparte la clase, el organizador del club o Master Admin
  IF v_coach.auth_user_id <> v_caller AND v_rel.organizador_id <> v_caller AND v_is_master IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No tienes autorización para registrar clases para este alumno.');
  END IF;

  -- 6. OBLIGATORIO: Comprobar que el coach tiene una asociación ACTIVE con el club correspondiente
  SELECT id, status INTO v_membership
  FROM public.coach_club_memberships
  WHERE coach_id = v_rel.coach_id AND organizador_id = v_rel.organizador_id;

  IF NOT FOUND OR v_membership.status <> 'ACTIVE' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El coach no cuenta con una asociación activa con el club correspondiente.'
    );
  END IF;

  -- 7. Comprobar que el club tiene coaching habilitado
  IF NOT EXISTS (
    SELECT 1 FROM public.organizador_game_modes
    WHERE organizador_id = v_rel.organizador_id AND coaching_enabled = true
  ) AND v_is_master IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El club no tiene el servicio de Coaching habilitado.'
    );
  END IF;

  -- 8. Validar Idempotencia después de autorizaciones y verificar coincidencia estricta
  SELECT id, tipo, relationship_id, organizador_id, recorded_by, delta, session_id
  INTO v_existing_op
  FROM public.coach_class_ledger
  WHERE idempotency_key = v_trimmed_key;

  IF FOUND THEN
    -- La clave reutilizada debe corresponder exactamente al mismo usuario, operación y relación
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

  -- 9. Bloquear y verificar saldo disponible (FOR UPDATE previene condiciones de carrera concurrentes)
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

  -- 10. Gestión de la Sesión Real (Identidad propia y regla: 1 sesión = 1 descuento)
  IF v_session_id IS NOT NULL THEN
    SELECT id, coach_id, organizador_id, status INTO v_sess
    FROM public.coach_sessions
    WHERE id = v_session_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Sesión de coaching no encontrada.');
    END IF;

    IF v_sess.coach_id <> v_rel.coach_id OR v_sess.organizador_id <> v_rel.organizador_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'La sesión no coincide con el coach o el club correspondiente.');
    END IF;

    -- REGLA DEFINITIVA: Una sesión impartida solamente puede generar un descuento
    IF EXISTS (
      SELECT 1 FROM public.coach_class_ledger WHERE session_id = v_session_id
    ) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'Esta sesión ya generó un descuento de clase previamente.'
      );
    END IF;

    UPDATE public.coach_sessions
    SET status = 'COMPLETED',
        relationship_id = v_rel.id,
        jugador_id = v_rel.jugador_id,
        notes_summary = COALESCE(p_notas, notes_summary),
        updated_at = now()
    WHERE id = v_session_id;
  ELSE
    -- Crear automáticamente la sesión real vinculada
    INSERT INTO public.coach_sessions (
      coach_id,
      relationship_id,
      organizador_id,
      jugador_id,
      starts_at,
      ends_at,
      status,
      notes_summary
    )
    VALUES (
      v_rel.coach_id,
      v_rel.id,
      v_rel.organizador_id,
      v_rel.jugador_id,
      now(),
      now() + interval '1 hour',
      'COMPLETED',
      p_notas
    )
    RETURNING id INTO v_session_id;
  END IF;

  -- 11. Descontar exactamente 1 clase e incrementar total impartidas
  UPDATE public.coach_player_class_balances
  SET balance_classes = balance_classes - 1,
      total_classes_given = total_classes_given + 1,
      updated_at = now()
  WHERE id = v_balance.id
  RETURNING balance_classes, total_classes_given INTO v_new_balance, v_new_total;

  -- 12. Registrar movimiento inmutable en el ledger con enlace a la sesión
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
    recorded_by
  )
  VALUES (
    v_rel.id,
    v_rel.organizador_id,
    v_rel.coach_id,
    v_rel.jugador_id,
    v_session_id,
    -1,
    'CLASS_DEBIT',
    p_notas,
    v_trimmed_key,
    v_caller
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

-- Permisos RPC
REVOKE ALL ON FUNCTION public.link_player_to_coach_by_riviera_id(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_coach_classes(uuid, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.credit_coach_class_package(uuid, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_coach_class_session(uuid, text, text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.link_player_to_coach_by_riviera_id(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_player_to_coach_by_riviera_id(uuid, text, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.assign_coach_classes(uuid, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_coach_classes(uuid, integer, text, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.credit_coach_class_package(uuid, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.credit_coach_class_package(uuid, integer, text, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.record_coach_class_session(uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_coach_class_session(uuid, text, text, uuid) TO service_role;
