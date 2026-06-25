-- Perfil de jugador en ranking interno del club (appriviera).
-- No filtra visible_publico; valida organizador + slug + activo.
-- Ejecutar en Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.riviera_jugador_interno_por_slug(
  p_organizador_id uuid,
  p_slug text
)
RETURNS TABLE (
  id uuid,
  organizador_id uuid,
  nombre text,
  slug text,
  foto_url text,
  email text,
  telefono text,
  whatsapp text,
  nivel text,
  categoria text,
  edad integer,
  mano_dominante text,
  en_cancha text,
  pais_codigo text,
  instagram_url text,
  facebook_url text,
  tiktok_url text,
  visible_publico boolean,
  suma_ranking boolean,
  genero text,
  fecha_nacimiento date,
  club text,
  estado text,
  legacy_player_id uuid,
  legacy_liga_jugador_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  rating numeric,
  rating_partidos integer,
  rating_fiabilidad numeric,
  puntos_totales integer,
  total_partidos integer,
  victorias integer,
  derrotas integer,
  empates integer,
  participaciones_solo integer,
  pct_victorias numeric,
  total_retas integer,
  total_torneos_express integer,
  total_ligas integer,
  total_americanos integer,
  sets_favor_total integer,
  sets_contra_total integer,
  racha_actual text,
  ultima_actividad timestamptz,
  stats_updated_at timestamptz
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
    rj.email,
    rj.telefono,
    rj.whatsapp,
    rj.nivel,
    rj.categoria,
    rj.edad,
    rj.mano_dominante,
    rj.en_cancha,
    rj.pais_codigo,
    rj.instagram_url,
    rj.facebook_url,
    rj.tiktok_url,
    rj.visible_publico,
    rj.suma_ranking,
    rj.genero,
    rj.fecha_nacimiento,
    rj.club,
    rj.estado,
    rj.legacy_player_id,
    rj.legacy_liga_jugador_id,
    rj.created_at,
    rj.updated_at,
    rj.rating,
    rj.rating_partidos,
    rj.rating_fiabilidad,
    COALESCE(js.puntos_totales, 0)::integer,
    COALESCE(js.total_partidos, 0)::integer,
    COALESCE(js.victorias, 0)::integer,
    COALESCE(js.derrotas, 0)::integer,
    COALESCE(js.empates, 0)::integer,
    COALESCE(js.participaciones_solo, 0)::integer,
    COALESCE(js.pct_victorias, 0)::numeric,
    COALESCE(js.total_retas, 0)::integer,
    COALESCE(js.total_torneos_express, 0)::integer,
    COALESCE(js.total_ligas, 0)::integer,
    COALESCE(js.total_americanos, 0)::integer,
    COALESCE(js.sets_favor_total, 0)::integer,
    COALESCE(js.sets_contra_total, 0)::integer,
    COALESCE(js.racha_actual, '')::text,
    js.ultima_actividad,
    js.updated_at
  FROM public.riviera_jugadores rj
  LEFT JOIN public.jugador_stats js ON js.jugador_id = rj.id
  WHERE rj.organizador_id = p_organizador_id
    AND lower(rj.slug) = lower(trim(p_slug))
    AND rj.estado = 'activo'
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.riviera_jugador_interno_por_slug(uuid, text) IS
  'Ficha de jugador para ranking interno del club. Sin filtro visible_publico.';

GRANT EXECUTE ON FUNCTION public.riviera_jugador_interno_por_slug(uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.riviera_jugador_interno_por_id(
  p_organizador_id uuid,
  p_jugador_id uuid
)
RETURNS TABLE (
  id uuid,
  organizador_id uuid,
  nombre text,
  slug text,
  foto_url text,
  email text,
  telefono text,
  whatsapp text,
  nivel text,
  categoria text,
  edad integer,
  mano_dominante text,
  en_cancha text,
  pais_codigo text,
  instagram_url text,
  facebook_url text,
  tiktok_url text,
  visible_publico boolean,
  suma_ranking boolean,
  genero text,
  fecha_nacimiento date,
  club text,
  estado text,
  legacy_player_id uuid,
  legacy_liga_jugador_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  rating numeric,
  rating_partidos integer,
  rating_fiabilidad numeric,
  puntos_totales integer,
  total_partidos integer,
  victorias integer,
  derrotas integer,
  empates integer,
  participaciones_solo integer,
  pct_victorias numeric,
  total_retas integer,
  total_torneos_express integer,
  total_ligas integer,
  total_americanos integer,
  sets_favor_total integer,
  sets_contra_total integer,
  racha_actual text,
  ultima_actividad timestamptz,
  stats_updated_at timestamptz
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
    rj.email,
    rj.telefono,
    rj.whatsapp,
    rj.nivel,
    rj.categoria,
    rj.edad,
    rj.mano_dominante,
    rj.en_cancha,
    rj.pais_codigo,
    rj.instagram_url,
    rj.facebook_url,
    rj.tiktok_url,
    rj.visible_publico,
    rj.suma_ranking,
    rj.genero,
    rj.fecha_nacimiento,
    rj.club,
    rj.estado,
    rj.legacy_player_id,
    rj.legacy_liga_jugador_id,
    rj.created_at,
    rj.updated_at,
    rj.rating,
    rj.rating_partidos,
    rj.rating_fiabilidad,
    COALESCE(js.puntos_totales, 0)::integer,
    COALESCE(js.total_partidos, 0)::integer,
    COALESCE(js.victorias, 0)::integer,
    COALESCE(js.derrotas, 0)::integer,
    COALESCE(js.empates, 0)::integer,
    COALESCE(js.participaciones_solo, 0)::integer,
    COALESCE(js.pct_victorias, 0)::numeric,
    COALESCE(js.total_retas, 0)::integer,
    COALESCE(js.total_torneos_express, 0)::integer,
    COALESCE(js.total_ligas, 0)::integer,
    COALESCE(js.total_americanos, 0)::integer,
    COALESCE(js.sets_favor_total, 0)::integer,
    COALESCE(js.sets_contra_total, 0)::integer,
    COALESCE(js.racha_actual, '')::text,
    js.ultima_actividad,
    js.updated_at
  FROM public.riviera_jugadores rj
  LEFT JOIN public.jugador_stats js ON js.jugador_id = rj.id
  WHERE rj.organizador_id = p_organizador_id
    AND rj.id = p_jugador_id
    AND rj.estado = 'activo'
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.riviera_jugador_interno_por_id(uuid, uuid) IS
  'Ficha de jugador por ID para ranking interno del club. Sin filtro visible_publico.';

GRANT EXECUTE ON FUNCTION public.riviera_jugador_interno_por_id(uuid, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.riviera_participaciones_interno(
  p_organizador_id uuid,
  p_jugador_id uuid,
  p_limit integer DEFAULT 100
)
RETURNS SETOF public.jugador_participaciones
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jp.*
  FROM public.jugador_participaciones jp
  INNER JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
  WHERE rj.organizador_id = p_organizador_id
    AND rj.id = p_jugador_id
    AND rj.estado = 'activo'
  ORDER BY jp.fecha DESC, jp.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));
$$;

COMMENT ON FUNCTION public.riviera_participaciones_interno(uuid, uuid, integer) IS
  'Historial de participaciones para ficha en ranking interno del club.';

GRANT EXECUTE ON FUNCTION public.riviera_participaciones_interno(uuid, uuid, integer) TO anon, authenticated;

-- ── Ranking interno (lista + posición # en ficha) ──
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
