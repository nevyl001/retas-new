-- Ranking sitio oficial (rivieraopen.com): visibilidad SOLO por jugador (visible_publico).
-- Ya no depende de visible_ranking_oficial del club — funciona igual para todos los organizadores.
-- Ejecutar en Supabase SQL Editor (producción).

-- ── ¿Este jugador aparece en el sitio oficial? ──
CREATE OR REPLACE FUNCTION public.is_jugador_visible_sitio_oficial(p_jugador_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.riviera_jugadores rj
    WHERE rj.id = p_jugador_id
      AND rj.estado = 'activo'
      AND rj.visible_publico IS TRUE
      AND COALESCE(rj.suma_ranking, true) = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_jugador_visible_sitio_oficial(uuid) TO anon, authenticated;

-- ── Vista sitio oficial (sin security_invoker: anon no hereda RLS del organizador) ──
CREATE OR REPLACE VIEW public.riviera_jugadores_sitio_oficial AS
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
  COALESCE(
    public.riviera_official_display_puntos_for_jugador(rj.id),
    COALESCE(js.puntos_totales, 0)
  )::integer AS puntos_totales,
  COALESCE(js.total_partidos, 0)::integer AS total_partidos,
  COALESCE(js.victorias, 0)::integer AS victorias
FROM public.riviera_jugadores rj
LEFT JOIN public.jugador_stats js ON js.jugador_id = rj.id
WHERE rj.estado = 'activo'
  AND rj.visible_publico IS TRUE
  AND COALESCE(rj.suma_ranking, true) = true;

COMMENT ON VIEW public.riviera_jugadores_sitio_oficial IS
  'Jugadores con «Sitio oficial» en admin. Filtrar por organizador_id o usar riviera_ranking_sitio_oficial_global.';

GRANT SELECT ON public.riviera_jugadores_sitio_oficial TO anon, authenticated;

-- ── Ranking oficial por club ──
CREATE OR REPLACE FUNCTION public.riviera_ranking_sitio_oficial_por_organizador(
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
    v.id,
    v.organizador_id,
    v.nombre,
    v.slug,
    v.foto_url,
    v.categoria,
    v.genero,
    v.pais_codigo,
    v.club,
    v.estado,
    v.visible_publico,
    v.suma_ranking,
    v.rating,
    v.rating_partidos,
    v.rating_fiabilidad,
    v.created_at,
    v.updated_at,
    v.puntos_totales,
    v.total_partidos,
    v.victorias
  FROM public.riviera_jugadores_sitio_oficial v
  WHERE v.organizador_id = p_organizador_id
    AND (p_categoria IS NULL OR v.categoria = p_categoria)
    AND (
      p_genero IS NULL
      OR (upper(p_genero) IN ('F', 'FEMENIL') AND v.genero = 'F')
      OR (
        upper(p_genero) IN ('M', 'VARONIL')
        AND (v.genero = 'M' OR v.genero IS NULL)
      )
    )
  ORDER BY v.puntos_totales DESC, v.nombre ASC;
$$;

COMMENT ON FUNCTION public.riviera_ranking_sitio_oficial_por_organizador(uuid, text, text) IS
  'Ranking sitio oficial de un club. Solo jugadores con visible_publico=true (admin).';

GRANT EXECUTE ON FUNCTION public.riviera_ranking_sitio_oficial_por_organizador(uuid, text, text) TO anon, authenticated;

-- ── Ranking global (todos los clubes) para rivieraopen.com/rankings sin ?org= ──
CREATE OR REPLACE FUNCTION public.riviera_ranking_sitio_oficial_global(
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
    v.id,
    v.organizador_id,
    v.nombre,
    v.slug,
    v.foto_url,
    v.categoria,
    v.genero,
    v.pais_codigo,
    v.club,
    v.estado,
    v.visible_publico,
    v.suma_ranking,
    v.rating,
    v.rating_partidos,
    v.rating_fiabilidad,
    v.created_at,
    v.updated_at,
    v.puntos_totales,
    v.total_partidos,
    v.victorias
  FROM public.riviera_jugadores_sitio_oficial v
  WHERE (p_categoria IS NULL OR v.categoria = p_categoria)
    AND (
      p_genero IS NULL
      OR (upper(p_genero) IN ('F', 'FEMENIL') AND v.genero = 'F')
      OR (
        upper(p_genero) IN ('M', 'VARONIL')
        AND (v.genero = 'M' OR v.genero IS NULL)
      )
    )
  ORDER BY v.puntos_totales DESC, v.nombre ASC;
$$;

COMMENT ON FUNCTION public.riviera_ranking_sitio_oficial_global(text, text) IS
  'Ranking sitio oficial global: todos los jugadores con visible_publico=true de cualquier club.';

GRANT EXECUTE ON FUNCTION public.riviera_ranking_sitio_oficial_global(text, text) TO anon, authenticated;

-- ── Clubs con al menos un jugador publicado en sitio oficial ──
CREATE OR REPLACE FUNCTION public.riviera_organizadores_ranking_oficial()
RETURNS TABLE (
  organizador_id uuid,
  nombre text,
  email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT
    u.id AS organizador_id,
    u.name AS nombre,
    u.email AS email
  FROM public.users u
  INNER JOIN public.riviera_jugadores rj
    ON rj.organizador_id = u.id
  WHERE rj.estado = 'activo'
    AND rj.visible_publico IS TRUE
    AND COALESCE(rj.suma_ranking, true) = true
  ORDER BY u.name ASC, u.email ASC;
$$;

COMMENT ON FUNCTION public.riviera_organizadores_ranking_oficial() IS
  'Organizadores con al menos un jugador publicado en sitio oficial.';

GRANT EXECUTE ON FUNCTION public.riviera_organizadores_ranking_oficial() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
