-- ==============================================================================
-- 0069_fix_coaching_rls_infinite_recursion.sql
-- Riviera Coaching — Eliminación definitiva de recursión RLS infinita en riviera_coaches
-- ==============================================================================

-- 1. ASEGURAR QUE EL HELPER current_riviera_coach_id SEA ESTABLE, SECURITY DEFINER Y SIN RECURSIÓN
CREATE OR REPLACE FUNCTION public.current_riviera_coach_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.id FROM public.riviera_coaches c WHERE c.auth_user_id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_riviera_coach_id() TO authenticated, anon, service_role;

-- 2. CORREGIR POLÍTICAS EN coach_club_memberships (Rompe Ciclo 1)
-- Elimina ccm_select_parties (legado redundante de 0039) y define ccm_select limpio
DROP POLICY IF EXISTS ccm_select_parties ON public.coach_club_memberships;
DROP POLICY IF EXISTS ccm_select ON public.coach_club_memberships;

CREATE POLICY ccm_select ON public.coach_club_memberships
  FOR SELECT
  TO authenticated
  USING (
    organizador_id = auth.uid()
    OR coach_id = public.current_riviera_coach_id()
    OR COALESCE(public.is_master_admin(), false)
  );

-- 3. CORREGIR POLÍTICAS EN coach_player_relationships (Rompe Ciclo 2)
-- Sustituye subquery recursiva por comparación directa con current_riviera_coach_id()
DROP POLICY IF EXISTS cpr_select_parties ON public.coach_player_relationships;

CREATE POLICY cpr_select_parties ON public.coach_player_relationships
  FOR SELECT
  TO authenticated
  USING (
    organizador_id = auth.uid()
    OR coach_id = public.current_riviera_coach_id()
    OR COALESCE(public.is_master_admin(), false)
  );

-- 4. CORREGIR POLÍTICAS EN coach_player_class_balances
DROP POLICY IF EXISTS cpcb_coach_select ON public.coach_player_class_balances;

CREATE POLICY cpcb_coach_select ON public.coach_player_class_balances
  FOR SELECT
  TO authenticated
  USING (
    coach_id = public.current_riviera_coach_id()
  );

-- 5. CORREGIR POLÍTICAS EN coach_sessions
DROP POLICY IF EXISTS csess_all_coach ON public.coach_sessions;

CREATE POLICY csess_all_coach ON public.coach_sessions
  FOR ALL
  TO authenticated
  USING (
    coach_id = public.current_riviera_coach_id()
    OR organizador_id = auth.uid()
    OR COALESCE(public.is_master_admin(), false)
  )
  WITH CHECK (
    coach_id = public.current_riviera_coach_id()
    OR organizador_id = auth.uid()
    OR COALESCE(public.is_master_admin(), false)
  );

-- 6. CORREGIR POLÍTICAS EN TABLAS SECUNDARIAS DE COACHING (Evaluaciones, Objetivos, Mensajes, Notas, Recomendaciones)
DROP POLICY IF EXISTS ceval_all_coach ON public.coach_evaluations;
CREATE POLICY ceval_all_coach ON public.coach_evaluations
  FOR ALL
  TO authenticated
  USING (
    coach_id = public.current_riviera_coach_id()
    OR COALESCE(public.is_master_admin(), false)
  )
  WITH CHECK (
    coach_id = public.current_riviera_coach_id()
    OR COALESCE(public.is_master_admin(), false)
  );

DROP POLICY IF EXISTS cobj_all_coach ON public.coach_objectives;
CREATE POLICY cobj_all_coach ON public.coach_objectives
  FOR ALL
  TO authenticated
  USING (
    coach_id = public.current_riviera_coach_id()
    OR COALESCE(public.is_master_admin(), false)
  )
  WITH CHECK (
    coach_id = public.current_riviera_coach_id()
    OR COALESCE(public.is_master_admin(), false)
  );

DROP POLICY IF EXISTS cpm_all_author ON public.coach_player_messages;
CREATE POLICY cpm_all_author ON public.coach_player_messages
  FOR ALL
  TO authenticated
  USING (
    coach_id = public.current_riviera_coach_id()
    OR COALESCE(public.is_master_admin(), false)
  )
  WITH CHECK (
    coach_id = public.current_riviera_coach_id()
    OR COALESCE(public.is_master_admin(), false)
  );

DROP POLICY IF EXISTS cpn_all_author ON public.coach_private_notes;
CREATE POLICY cpn_all_author ON public.coach_private_notes
  FOR ALL
  TO authenticated
  USING (
    coach_id = public.current_riviera_coach_id()
    OR COALESCE(public.is_master_admin(), false)
  )
  WITH CHECK (
    coach_id = public.current_riviera_coach_id()
    OR COALESCE(public.is_master_admin(), false)
  );

DROP POLICY IF EXISTS cprec_all_author ON public.coach_public_recommendations;
CREATE POLICY cprec_all_author ON public.coach_public_recommendations
  FOR ALL
  TO authenticated
  USING (
    coach_id = public.current_riviera_coach_id()
    OR COALESCE(public.is_master_admin(), false)
  )
  WITH CHECK (
    coach_id = public.current_riviera_coach_id()
    OR COALESCE(public.is_master_admin(), false)
  );

