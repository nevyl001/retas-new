-- =============================================================================
-- Fix: grantee puede aplicar rating cuando los jugador_id son del club origen
-- =============================================================================
-- Tras rls-fase1-rating-rpc-hardening.sql, aplicar_rating_partido valida el
-- organizador_id de cada riviera_jugadores.id. Para cedidos/membresía el rating
-- canónico vive en el perfil origen (owner), pero el caller es el grantee.
-- Este parche extiende _assert_rating_rpc_organizador_caller.
-- Idempotente: CREATE OR REPLACE.
-- =============================================================================

CREATE OR REPLACE FUNCTION public._assert_rating_rpc_organizador_caller(p_organizador_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  IF p_organizador_id IS NULL THEN
    RAISE EXCEPTION 'organizador_id requerido'
      USING ERRCODE = '22023';
  END IF;

  v_uid := public._assert_rating_rpc_authenticated();

  IF public.is_master_admin() THEN
    RETURN;
  END IF;

  IF v_uid = p_organizador_id THEN
    RETURN;
  END IF;

  -- Grant activo: grantee autenticado operando datos de su club anfitrión
  IF EXISTS (
    SELECT 1
    FROM public.organizer_player_access opa
    WHERE opa.is_active = true
      AND opa.grantee_organizer_id = v_uid
      AND opa.grantee_organizer_id = p_organizador_id
  ) THEN
    RETURN;
  END IF;

  -- Grant activo: grantee autenticado con jugadores cuyo registro es del owner
  IF EXISTS (
    SELECT 1
    FROM public.organizer_player_access opa
    WHERE opa.is_active = true
      AND opa.grantee_organizer_id = v_uid
      AND opa.owner_organizador_id = p_organizador_id
  ) THEN
    RETURN;
  END IF;

  -- Grant activo: owner autenticado consultando su club origen
  IF EXISTS (
    SELECT 1
    FROM public.organizer_player_access opa
    WHERE opa.is_active = true
      AND opa.owner_organizador_id = v_uid
      AND opa.owner_organizador_id = p_organizador_id
  ) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'No autorizado para este organizador'
    USING ERRCODE = '42501';
END;
$$;

COMMENT ON FUNCTION public._assert_rating_rpc_organizador_caller(uuid) IS
  'PR2 + grantee fix: caller = organizador, master admin, o cuenta con grant activo '
  '(grantee u owner del perfil origen).';

REVOKE ALL ON FUNCTION public._assert_rating_rpc_organizador_caller(uuid) FROM PUBLIC;
