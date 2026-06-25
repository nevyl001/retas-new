-- Solo el RPC que falta si ya ejecutaste jugador-interno-por-slug.sql antes.
-- Corrige el 404: riviera_ranking_interno_por_organizador

CREATE OR REPLACE FUNCTION public.riviera_ranking_interno_por_organizador(
  p_organizador_id uuid,
  p_categoria text DEFAULT NULL,
  p_genero text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  organizador_id uuid,
  nombre text,
  slug text,
  foto_url text,
  categoria text,
  genero text,
  pais_codigo text,
  club text,
  estado text,
  visible_publico boolean,
  suma_ranking boolean,
  rating numeric,
  rating_partidos integer,
  rating_fiabilidad numeric,
  created_at timestamptz,
  updated_at timestamptz,
  puntos_totales integer,
  total_partidos integer,
  victorias integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    rj.id,
    rj.organizador_id,
    rj.nombre,
    rj.slug,
    rj.foto_url,
    rj.categoria,
    rj.genero,
    rj.pais_codigo,
    rj.club,
    rj.estado,
    rj.visible_publico,
    rj.suma_ranking,
    rj.rating,
    rj.rating_partidos,
    rj.rating_fiabilidad,
    rj.created_at,
    rj.updated_at,
    COALESCE(js.puntos_totales, 0)::integer,
    COALESCE(js.total_partidos, 0)::integer,
    COALESCE(js.victorias, 0)::integer
  FROM public.riviera_jugadores rj
  LEFT JOIN public.jugador_stats js ON js.jugador_id = rj.id
  WHERE rj.organizador_id = p_organizador_id
    AND rj.estado = 'activo'
    AND (p_categoria IS NULL OR rj.categoria = p_categoria)
    AND (
      p_genero IS NULL
      OR (upper(p_genero) IN ('F', 'FEMENIL') AND rj.genero = 'F')
      OR (
        upper(p_genero) IN ('M', 'VARONIL')
        AND (rj.genero = 'M' OR rj.genero IS NULL)
      )
    )
  ORDER BY puntos_totales DESC, rj.nombre ASC;
$$;

GRANT EXECUTE ON FUNCTION public.riviera_ranking_interno_por_organizador(uuid, text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
