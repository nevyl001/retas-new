-- =============================================================================
-- 0065_coaching_class_ledger.sql
-- Riviera Coaching — Entrega C: Control de Clases y Saldo de Alumnos
--
-- REGLAS DEFINITIVAS DE NEGOCIO:
-- 1. EL ÚNICO QUE PUEDE ASIGNAR O AGREGAR CLASES DISPONIBLES ES EL CLUB O
--    PROPIETARIO DE LA CUENTA DONDE TRABAJA EL COACH. El coach es un empleado del club.
-- 2. El coach NO puede asignar, recargar ni aumentar clases directamente.
-- 3. El coach registra las clases impartidas, descontando exactamente 1 unidad.
-- 4. La RPC de clase impartida comprueba que el coach tiene membresía ACTIVE con el club.
-- 5. Saldos estrictamente separados por club, coach y alumno.
-- 6. Ledger inmutable (coach_class_ledger) para auditoría de movimientos.
-- 7. CERO manejo de dinero, pagos, pasarelas, precios ni suscripciones monetarias.
-- =============================================================================

-- ── 1) Tabla de Saldo por Club, Coach y Alumno ───────────────────────────────
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

-- ── 2) Ledger Inmutable de Movimientos de Clases ────────────────────────────
CREATE TABLE IF NOT EXISTS public.coach_class_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id uuid NOT NULL REFERENCES public.coach_player_relationships(id) ON DELETE CASCADE,
  organizador_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES public.riviera_coaches(id) ON DELETE CASCADE,
  jugador_id uuid NOT NULL REFERENCES public.riviera_jugadores(id) ON DELETE CASCADE,
  delta integer NOT NULL CHECK (delta <> 0),
  tipo text NOT NULL CHECK (tipo IN ('PACKAGE_CREDIT', 'CLASS_DEBIT', 'ADJUSTMENT')),
  notas text NULL,
  recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ccl_relationship_created
  ON public.coach_class_ledger(relationship_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ccl_org_created
  ON public.coach_class_ledger(organizador_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ccl_coach_created
  ON public.coach_class_ledger(coach_id, created_at DESC);

COMMENT ON TABLE public.coach_class_ledger IS
  'Riviera Coaching: Historial inmutable de asignaciones y deducciones de clases.';

-- ── 3) Habilitar RLS y Restringir Mutaciones Directas ───────────────────────
ALTER TABLE public.coach_player_class_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_class_ledger ENABLE ROW LEVEL SECURITY;

-- Toda mutación de saldo o ledger DEBE realizarse exclusivamente a través
-- de las funciones RPC autorizadas (assign_coach_classes / record_coach_class_session).
REVOKE INSERT, UPDATE, DELETE ON public.coach_player_class_balances FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.coach_class_ledger FROM anon, authenticated;

-- Balances: Admin Maestro y Organizador del Club (solo su club)
CREATE POLICY cpcb_organizador_select ON public.coach_player_class_balances
  FOR SELECT
  TO authenticated
  USING (
    organizador_id = auth.uid()
    OR (SELECT is_master_admin FROM public.users WHERE id = auth.uid()) IS TRUE
  );

-- Balances: Coach asignado puede consultar saldos de sus alumnos
CREATE POLICY cpcb_coach_select ON public.coach_player_class_balances
  FOR SELECT
  TO authenticated
  USING (
    coach_id IN (
      SELECT id FROM public.riviera_coaches WHERE auth_user_id = auth.uid()
    )
  );

-- Balances: Alumno puede consultar su propio saldo
CREATE POLICY cpcb_player_select ON public.coach_player_class_balances
  FOR SELECT
  TO authenticated
  USING (
    jugador_id IN (
      SELECT id FROM public.riviera_jugadores WHERE user_id = auth.uid()
    )
  );

-- Ledger: Admin Maestro y Organizador (solo su club)
CREATE POLICY ccl_organizador_select ON public.coach_class_ledger
  FOR SELECT
  TO authenticated
  USING (
    organizador_id = auth.uid()
    OR (SELECT is_master_admin FROM public.users WHERE id = auth.uid()) IS TRUE
  );

-- Ledger: Coach asignado puede consultar su historial
CREATE POLICY ccl_coach_select ON public.coach_class_ledger
  FOR SELECT
  TO authenticated
  USING (
    coach_id IN (
      SELECT id FROM public.riviera_coaches WHERE auth_user_id = auth.uid()
    )
  );

-- Ledger: Alumno puede consultar su propio historial
CREATE POLICY ccl_player_select ON public.coach_class_ledger
  FOR SELECT
  TO authenticated
  USING (
    jugador_id IN (
      SELECT id FROM public.riviera_jugadores WHERE user_id = auth.uid()
    )
  );

-- ── 4) RPC: Asignar Clases Disponibles (Exclusivo del Club) ─────────────────
CREATE OR REPLACE FUNCTION public.assign_coach_classes(
  p_relationship_id uuid,
  p_class_count integer,
  p_notas text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_rel record;
  v_is_master boolean := false;
  v_membership record;
  v_new_balance integer;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  IF p_class_count IS NULL OR p_class_count <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La cantidad de clases debe ser mayor a cero.');
  END IF;

  SELECT is_master_admin INTO v_is_master FROM public.users WHERE id = v_caller;

  -- 1. Obtener relación coach-alumno
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

  -- 2. REGLA DEFINITIVA: El único que puede asignar clases es el club propietario de la cuenta o Admin Maestro.
  -- El coach es un empleado del club y tiene estrictamente prohibido asignar o recargar saldo.
  IF v_rel.organizador_id <> v_caller AND v_is_master IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Solo el club o administrador autorizado donde trabaja el coach puede asignar clases.'
    );
  END IF;

  -- 3. Comprobar que el club tiene coaching habilitado
  IF NOT EXISTS (
    SELECT 1 FROM public.organizador_game_modes
    WHERE organizador_id = v_rel.organizador_id AND coaching_enabled = true
  ) AND v_is_master IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El club no tiene el servicio de Coaching habilitado.'
    );
  END IF;

  -- 4. Comprobar que el coach tiene membresía ACTIVE en este club
  SELECT id, status INTO v_membership
  FROM public.coach_club_memberships
  WHERE coach_id = v_rel.coach_id AND organizador_id = v_rel.organizador_id;

  IF NOT FOUND OR v_membership.status <> 'ACTIVE' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El coach no tiene una membresía activa en este club.'
    );
  END IF;

  -- 5. Upsert atómico del saldo con bloqueo
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

  -- 6. Registro inmutable en el ledger
  INSERT INTO public.coach_class_ledger (
    relationship_id,
    organizador_id,
    coach_id,
    jugador_id,
    delta,
    tipo,
    notas,
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
    v_caller
  );

  RETURN jsonb_build_object(
    'ok', true,
    'new_balance', v_new_balance,
    'assigned_classes', p_class_count
  );
END;
$$;

-- Alias retrocompatible: credit_coach_class_package
CREATE OR REPLACE FUNCTION public.credit_coach_class_package(
  p_relationship_id uuid,
  p_class_count integer,
  p_notas text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.assign_coach_classes(p_relationship_id, p_class_count, p_notas);
END;
$$;

-- ── 5) RPC: Registrar Clase Impartida (Deducción Atómica de Saldo) ────────────
CREATE OR REPLACE FUNCTION public.record_coach_class_session(
  p_relationship_id uuid,
  p_notas text DEFAULT NULL
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
  v_is_master boolean := false;
  v_balance record;
  v_new_balance integer;
  v_new_total integer;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT is_master_admin INTO v_is_master FROM public.users WHERE id = v_caller;

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

  -- 4. OBLIGATORIO: Comprobar que el coach tiene una asociación ACTIVE con el club correspondiente
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

  -- 6. Bloquear y verificar saldo disponible (FOR UPDATE previene condiciones de carrera)
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

  -- 7. Descontar exactamente 1 clase e incrementar total impartidas
  UPDATE public.coach_player_class_balances
  SET balance_classes = balance_classes - 1,
      total_classes_given = total_classes_given + 1,
      updated_at = now()
  WHERE id = v_balance.id
  RETURNING balance_classes, total_classes_given INTO v_new_balance, v_new_total;

  -- 8. Registrar movimiento inmutable en el ledger
  INSERT INTO public.coach_class_ledger (
    relationship_id,
    organizador_id,
    coach_id,
    jugador_id,
    delta,
    tipo,
    notas,
    recorded_by
  )
  VALUES (
    v_rel.id,
    v_rel.organizador_id,
    v_rel.coach_id,
    v_rel.jugador_id,
    -1,
    'CLASS_DEBIT',
    p_notas,
    v_caller
  );

  RETURN jsonb_build_object(
    'ok', true,
    'remaining_balance', v_new_balance,
    'total_classes_given', v_new_total
  );
END;
$$;

-- Permisos RPC
REVOKE ALL ON FUNCTION public.assign_coach_classes(uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.credit_coach_class_package(uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_coach_class_session(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.assign_coach_classes(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_coach_classes(uuid, integer, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.credit_coach_class_package(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.credit_coach_class_package(uuid, integer, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.record_coach_class_session(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_coach_class_session(uuid, text) TO service_role;
