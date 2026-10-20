-- =============================================================================
-- 0065_coaching_class_ledger.sql
-- Riviera Coaching — Entrega C: Control de Clases y Saldo de Alumnos
--
-- REGLAS ESTRICTAS DE NEGOCIO:
-- 1. NO maneja pagos, dinero, pasarelas, precios ni suscripciones monetarias.
-- 2. El saldo es exclusivamente en UNIDADES DE CLASE (clases disponibles y dadas).
-- 3. Vinculación y auditoría estricta de cada clase impartida con timestamp y notas.
-- 4. Registro atómico y ledger inmutable (coach_class_ledger) con balance proyectado.
-- =============================================================================

-- ── 1) Tabla de Saldo por Relación Alumno-Coach ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.coach_player_class_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id uuid NOT NULL REFERENCES public.coach_player_relationships(id) ON DELETE CASCADE,
  organizador_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES public.riviera_coaches(id) ON DELETE CASCADE,
  jugador_id uuid NOT NULL REFERENCES public.riviera_jugadores(id) ON DELETE CASCADE,
  balance_classes integer NOT NULL DEFAULT 0 CHECK (balance_classes >= 0),
  total_classes_given integer NOT NULL DEFAULT 0 CHECK (total_classes_given >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_cpcb_relationship UNIQUE (relationship_id)
);

CREATE INDEX IF NOT EXISTS idx_cpcb_org_coach
  ON public.coach_player_class_balances(organizador_id, coach_id);

CREATE INDEX IF NOT EXISTS idx_cpcb_jugador
  ON public.coach_player_class_balances(jugador_id);

COMMENT ON TABLE public.coach_player_class_balances IS
  'Riviera Coaching: Saldo vigente de clases por alumno vinculado al coach dentro del club.';

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

CREATE INDEX IF NOT EXISTS idx_ccl_coach_created
  ON public.coach_class_ledger(coach_id, created_at DESC);

COMMENT ON TABLE public.coach_class_ledger IS
  'Riviera Coaching: Historial inmutable de asignaciones y deducciones de clases.';

-- ── 3) Habilitar RLS ────────────────────────────────────────────────────────
ALTER TABLE public.coach_player_class_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_class_ledger ENABLE ROW LEVEL SECURITY;

-- Balances: Admin Maestro y Organizador del Club
CREATE POLICY cpcb_organizador_all ON public.coach_player_class_balances
  FOR ALL
  TO authenticated
  USING (
    organizador_id = auth.uid()
    OR (SELECT is_master_admin FROM public.users WHERE id = auth.uid()) IS TRUE
  )
  WITH CHECK (
    organizador_id = auth.uid()
    OR (SELECT is_master_admin FROM public.users WHERE id = auth.uid()) IS TRUE
  );

-- Balances: Coach asignado puede consultar
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

-- Ledger: Admin Maestro y Organizador
CREATE POLICY ccl_organizador_all ON public.coach_class_ledger
  FOR ALL
  TO authenticated
  USING (
    organizador_id = auth.uid()
    OR (SELECT is_master_admin FROM public.users WHERE id = auth.uid()) IS TRUE
  )
  WITH CHECK (
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

-- ── 4) RPC: Asignar Paquete de Clases (Acreditar Saldo) ──────────────────────
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
DECLARE
  v_caller uuid := auth.uid();
  v_rel record;
  v_is_master boolean := false;
  v_new_balance integer;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  IF p_class_count IS NULL OR p_class_count <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La cantidad de clases debe ser mayor a cero.');
  END IF;

  SELECT is_master_admin INTO v_is_master FROM public.users WHERE id = v_caller;

  -- Obtener relación activa
  SELECT r.id, r.organizador_id, r.coach_id, r.jugador_id, r.status
  INTO v_rel
  FROM public.coach_player_relationships r
  WHERE r.id = p_relationship_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Relación coach-alumno no encontrada.');
  END IF;

  IF v_rel.status <> 'ACTIVE' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No se pueden acreditar clases a una relación inactiva o finalizada.');
  END IF;

  -- Autorización: Organizador del club o Master Admin
  IF v_rel.organizador_id <> v_caller AND v_is_master IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo el organizador del club puede asignar paquetes de clases.');
  END IF;

  -- Upsert del saldo con bloqueo
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

  -- Registrar en ledger
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
    'credited', p_class_count
  );
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
  v_is_master boolean := false;
  v_balance record;
  v_new_balance integer;
  v_new_total integer;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT is_master_admin INTO v_is_master FROM public.users WHERE id = v_caller;

  -- Obtener relación activa
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

  -- Obtener coach vinculado
  SELECT id, auth_user_id INTO v_coach
  FROM public.riviera_coaches
  WHERE id = v_rel.coach_id;

  -- Autorización: El coach que imparte la clase, el organizador del club o Master Admin
  IF v_coach.auth_user_id <> v_caller AND v_rel.organizador_id <> v_caller AND v_is_master IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No tienes autorización para registrar clases para este alumno.');
  END IF;

  -- Bloquear y verificar saldo disponible
  SELECT id, balance_classes, total_classes_given
  INTO v_balance
  FROM public.coach_player_class_balances
  WHERE relationship_id = v_rel.id
  FOR UPDATE;

  IF NOT FOUND OR v_balance.balance_classes < 1 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El alumno no tiene saldo disponible de clases. Solicita al club asignar un nuevo paquete.'
    );
  END IF;

  -- Descontar saldo e incrementar clases dadas
  UPDATE public.coach_player_class_balances
  SET balance_classes = balance_classes - 1,
      total_classes_given = total_classes_given + 1,
      updated_at = now()
  WHERE id = v_balance.id
  RETURNING balance_classes, total_classes_given INTO v_new_balance, v_new_total;

  -- Registrar en ledger
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
REVOKE ALL ON FUNCTION public.credit_coach_class_package(uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_coach_class_session(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.credit_coach_class_package(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.credit_coach_class_package(uuid, integer, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.record_coach_class_session(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_coach_class_session(uuid, text) TO service_role;

