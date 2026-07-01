-- Rating unificado para jugadores cedidos entre clubes.
-- Mismo patrón que riviera_participaciones_interno: SECURITY DEFINER + p_organizador_id.
-- Ejecutar TODO el archivo (incluye DROP al inicio).

DROP FUNCTION IF EXISTS public.riviera_rating_canonico_para_jugador(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.riviera_rating_historial_unificado(uuid, uuid, integer) CASCADE;
DROP FUNCTION IF EXISTS public.riviera_concedidos_ranking_enriquecimiento(uuid) CASCADE;

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

-- Ranking interno público (anon): metadata de cedidos sin leer organizer_player_access directo.
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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.riviera_rating_canonico_para_jugador(uuid, uuid)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.riviera_rating_historial_unificado(uuid, uuid, integer)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.riviera_concedidos_ranking_enriquecimiento(uuid)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
