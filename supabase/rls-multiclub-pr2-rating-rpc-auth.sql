-- =============================================================================
-- RLS multi-club — PR2: autorización caller en RPCs de rating / cedidos
-- =============================================================================
-- Ejecutar después de: rating-unificado-cedidos.sql, organizer-player-access.sql,
--   admin-master-controls.sql (is_master_admin).
--
-- Cierra invocación anon y parámetros libres en SECURITY DEFINER.
-- =============================================================================

-- ── Helpers internos (no expuestos a anon) ──

CREATE OR REPLACE FUNCTION public._assert_rating_rpc_authenticated()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autorizado'
      USING ERRCODE = '42501';
  END IF;
  RETURN v_uid;
END;
$$;

COMMENT ON FUNCTION public._assert_rating_rpc_authenticated() IS
  'PR2: exige sesión authenticated (rechaza anon).';

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

  -- Grant activo: grantee autenticado consultando su club anfitrión
  IF EXISTS (
    SELECT 1
    FROM public.organizer_player_access opa
    WHERE opa.is_active = true
      AND opa.grantee_organizer_id = v_uid
      AND opa.grantee_organizer_id = p_organizador_id
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
  'PR2: caller = organizador, master admin, o cuenta con grant activo en ese club.';

CREATE OR REPLACE FUNCTION public._assert_concedidos_ranking_caller(p_grantee_organizer_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  IF p_grantee_organizer_id IS NULL THEN
    RAISE EXCEPTION 'grantee_organizer_id requerido'
      USING ERRCODE = '22023';
  END IF;

  v_uid := public._assert_rating_rpc_authenticated();

  IF public.is_master_admin() THEN
    RETURN;
  END IF;

  IF v_uid = p_grantee_organizer_id THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'No autorizado para el mapa de cedidos de este club'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public._assert_rating_rpc_authenticated() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._assert_rating_rpc_organizador_caller(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._assert_concedidos_ranking_caller(uuid) FROM PUBLIC;

-- ── riviera_rating_canonico_para_jugador ──

CREATE OR REPLACE FUNCTION public.riviera_rating_canonico_para_jugador(
  p_organizador_id uuid,
  p_jugador_id uuid
)
RETURNS TABLE (
  rating numeric,
  rating_partidos integer,
  rating_fiabilidad numeric,
  source_jugador_id uuid,
  local_jugador_id uuid,
  owner_organizador_id uuid,
  origen_puntos_totales integer,
  local_puntos_totales integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source uuid;
  v_local uuid;
  v_canon record;
BEGIN
  IF p_jugador_id IS NULL THEN
    RAISE EXCEPTION 'jugador_id requerido'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public._assert_rating_rpc_organizador_caller(p_organizador_id);

  SELECT opa.jugador_id, opa.local_jugador_id
  INTO v_source, v_local
  FROM public.organizer_player_access opa
  WHERE opa.is_active = true
    AND opa.grantee_organizer_id = p_organizador_id
    AND (
      opa.jugador_id = p_jugador_id
      OR opa.local_jugador_id = p_jugador_id
    )
  ORDER BY opa.updated_at DESC NULLS LAST
  LIMIT 1;

  IF v_source IS NOT NULL THEN
    SELECT r.rating, r.rating_partidos, r.rating_fiabilidad
    INTO v_canon
    FROM public.riviera_jugadores r
    WHERE r.id = v_source
       OR (v_local IS NOT NULL AND r.id = v_local)
    ORDER BY r.rating_partidos DESC NULLS LAST, r.rating DESC NULLS LAST
    LIMIT 1;

    RETURN QUERY
    SELECT
      v_canon.rating,
      v_canon.rating_partidos,
      v_canon.rating_fiabilidad,
      v_source,
      COALESCE(v_local, p_jugador_id),
      src.organizador_id,
      COALESCE(src_stats.puntos_totales, 0)::integer,
      COALESCE(local_stats.puntos_totales, 0)::integer
    FROM public.riviera_jugadores src
    LEFT JOIN public.jugador_stats src_stats ON src_stats.jugador_id = v_source
    LEFT JOIN public.jugador_stats local_stats
      ON local_stats.jugador_id = COALESCE(v_local, p_jugador_id)
    WHERE src.id = v_source
    LIMIT 1;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    r.rating,
    r.rating_partidos,
    r.rating_fiabilidad,
    r.id,
    r.id,
    r.organizador_id,
    COALESCE(js.puntos_totales, 0)::integer,
    COALESCE(js.puntos_totales, 0)::integer
  FROM public.riviera_jugadores r
  LEFT JOIN public.jugador_stats js ON js.jugador_id = r.id
  WHERE r.id = p_jugador_id
    AND r.organizador_id = p_organizador_id
    AND r.estado = 'activo';
END;
$$;

-- ── riviera_rating_historial_unificado ──

CREATE OR REPLACE FUNCTION public.riviera_rating_historial_unificado(
  p_organizador_id uuid,
  p_jugador_id uuid,
  p_limite integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  fecha timestamptz,
  rating_antes numeric,
  rating_despues numeric,
  delta numeric,
  modo_juego text,
  descripcion text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source uuid;
  v_local uuid;
BEGIN
  IF p_jugador_id IS NULL THEN
    RAISE EXCEPTION 'jugador_id requerido'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public._assert_rating_rpc_organizador_caller(p_organizador_id);

  SELECT opa.jugador_id, opa.local_jugador_id
  INTO v_source, v_local
  FROM public.organizer_player_access opa
  WHERE opa.is_active = true
    AND opa.grantee_organizer_id = p_organizador_id
    AND (
      opa.jugador_id = p_jugador_id
      OR opa.local_jugador_id = p_jugador_id
    )
  ORDER BY opa.updated_at DESC NULLS LAST
  LIMIT 1;

  IF v_source IS NULL THEN
    IF NOT public.is_master_admin()
       AND auth.uid() IS DISTINCT FROM p_organizador_id THEN
      RAISE EXCEPTION 'No autorizado para historial de este jugador'
        USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.riviera_jugadores r
      WHERE r.id = p_jugador_id
        AND r.organizador_id = p_organizador_id
        AND r.estado = 'activo'
    ) THEN
      RETURN;
    END IF;

    v_source := p_jugador_id;
    v_local := p_jugador_id;
  END IF;

  RETURN QUERY
  SELECT
    rh.id,
    rh.fecha,
    rh.rating_antes,
    rh.rating_despues,
    rh.delta,
    rh.modo_juego,
    rh.descripcion
  FROM public.rating_historial rh
  WHERE rh.jugador_id = v_source
     OR (v_local IS NOT NULL AND rh.jugador_id = v_local)
  ORDER BY rh.fecha DESC
  LIMIT GREATEST(COALESCE(p_limite, 10), 1);
END;
$$;

-- ── riviera_concedidos_ranking_enriquecimiento ──

CREATE OR REPLACE FUNCTION public.riviera_concedidos_ranking_enriquecimiento(
  p_grantee_organizer_id uuid
)
RETURNS TABLE (
  local_jugador_id uuid,
  source_jugador_id uuid,
  owner_organizador_id uuid,
  origen_puntos_totales integer,
  local_puntos_totales integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._assert_concedidos_ranking_caller(p_grantee_organizer_id);

  RETURN QUERY
  SELECT
    opa.local_jugador_id,
    opa.jugador_id AS source_jugador_id,
    opa.owner_organizador_id,
    COALESCE(src_stats.puntos_totales, 0)::integer AS origen_puntos_totales,
    COALESCE(local_stats.puntos_totales, 0)::integer AS local_puntos_totales
  FROM public.organizer_player_access opa
  LEFT JOIN public.jugador_stats src_stats ON src_stats.jugador_id = opa.jugador_id
  LEFT JOIN public.jugador_stats local_stats ON local_stats.jugador_id = opa.local_jugador_id
  WHERE opa.is_active = true
    AND opa.grantee_organizer_id = p_grantee_organizer_id
    AND opa.local_jugador_id IS NOT NULL
    AND opa.jugador_id IS DISTINCT FROM opa.local_jugador_id;
END;
$$;

-- ── Permisos: solo authenticated ──

REVOKE ALL ON FUNCTION public.riviera_rating_canonico_para_jugador(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.riviera_rating_canonico_para_jugador(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.riviera_rating_historial_unificado(uuid, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.riviera_rating_historial_unificado(uuid, uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.riviera_concedidos_ranking_enriquecimiento(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.riviera_concedidos_ranking_enriquecimiento(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.riviera_rating_canonico_para_jugador(uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.riviera_rating_historial_unificado(uuid, uuid, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.riviera_concedidos_ranking_enriquecimiento(uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
