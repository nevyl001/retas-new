-- Ficha interna del club: incluye cedidos sin perfil local (jugador origen de otro club).
-- Ejecutar en Supabase SQL Editor.

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

  UNION ALL

  SELECT
    src.id,
    p_organizador_id,
    coalesce(nullif(trim(opa.local_display_name), ''), src.nombre),
    src.slug,
    src.foto_url,
    src.email,
    src.telefono,
    src.whatsapp,
    src.nivel,
    coalesce(nullif(trim(opa.local_category), ''), src.categoria),
    src.edad,
    src.mano_dominante,
    src.en_cancha,
    src.pais_codigo,
    src.instagram_url,
    src.facebook_url,
    src.tiktok_url,
    src.visible_publico,
    src.suma_ranking,
    src.genero,
    src.fecha_nacimiento,
    src.club,
    src.estado,
    src.legacy_player_id,
    src.legacy_liga_jugador_id,
    src.created_at,
    src.updated_at,
    src.rating,
    src.rating_partidos,
    src.rating_fiabilidad,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    '',
    null::timestamptz,
    null::timestamptz
  FROM public.organizer_player_access opa
  INNER JOIN public.riviera_jugadores src ON src.id = opa.jugador_id
  WHERE opa.grantee_organizer_id = p_organizador_id
    AND opa.is_active = true
    AND opa.jugador_id = p_jugador_id
    AND opa.local_jugador_id IS NULL
    AND src.estado = 'activo'
    AND NOT EXISTS (
      SELECT 1
      FROM public.riviera_jugadores local_rj
      WHERE local_rj.organizador_id = p_organizador_id
        AND local_rj.id = p_jugador_id
        AND local_rj.estado = 'activo'
    )
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.riviera_jugador_interno_por_id(uuid, uuid) IS
  'Ficha interna del club por ID. Incluye cedidos sin perfil local (origen de otro club).';

GRANT EXECUTE ON FUNCTION public.riviera_jugador_interno_por_id(uuid, uuid) TO anon, authenticated;
