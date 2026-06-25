-- Vista y helpers para www.rivieraopen.com (sitio oficial).
-- La app Riviera (appriviera) y el sitio oficial comparten esta base de datos.
-- Ejecutar después de admin-master-controls.sql

-- ── ¿Este jugador debe aparecer en rivieraopen.com? ──
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
      AND public.is_organizador_ranking_publico(rj.organizador_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_jugador_visible_sitio_oficial(uuid) TO anon, authenticated;

-- ── Jugadores visibles en ranking/perfil del sitio oficial ──
CREATE OR REPLACE VIEW public.riviera_jugadores_sitio_oficial
WITH (security_invoker = true) AS
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
  COALESCE(js.puntos_totales, 0)::integer AS puntos_totales,
  COALESCE(js.total_partidos, 0)::integer AS total_partidos,
  COALESCE(js.victorias, 0)::integer AS victorias
FROM public.riviera_jugadores rj
LEFT JOIN public.jugador_stats js ON js.jugador_id = rj.id
WHERE rj.estado = 'activo'
  AND rj.visible_publico IS TRUE
  AND COALESCE(rj.suma_ranking, true) = true
  AND public.is_organizador_ranking_publico(rj.organizador_id);

COMMENT ON VIEW public.riviera_jugadores_sitio_oficial IS
  'Jugadores elegibles para el sitio oficial. SIEMPRE filtrar por organizador_id; no usar como ranking global multi-club.';

GRANT SELECT ON public.riviera_jugadores_sitio_oficial TO anon, authenticated;

-- ── Clubs con ranking publicado (índice para www.rivieraopen.com) ──
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
  SELECT
    u.id AS organizador_id,
    u.name AS nombre,
    u.email AS email
  FROM public.users u
  INNER JOIN public.organizador_game_modes ogm
    ON ogm.organizador_id = u.id
  WHERE ogm.visible_ranking_oficial = true
  ORDER BY u.name ASC, u.email ASC;
$$;

COMMENT ON FUNCTION public.riviera_organizadores_ranking_oficial() IS
  'Lista organizadores con visible_ranking_oficial=true. Para índice de rankings en rivieraopen.com.';

GRANT EXECUTE ON FUNCTION public.riviera_organizadores_ranking_oficial() TO anon, authenticated;

-- ── Ranking oficial por club (no mezcla organizadores) ──
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
    AND public.is_organizador_ranking_publico(p_organizador_id)
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
  'Ranking oficial de un solo club. Respeta visible_ranking_oficial, suma_ranking, visible_publico y estado activo.';

GRANT EXECUTE ON FUNCTION public.riviera_ranking_sitio_oficial_por_organizador(uuid, text, text) TO anon, authenticated;

-- ── Ranking interno por club (appriviera /ranking/o/{id}) ──
-- Todos los jugadores con suma_ranking; NO filtra visible_publico.
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
    COALESCE(js.puntos_totales, 0)::integer AS puntos_totales,
    COALESCE(js.total_partidos, 0)::integer AS total_partidos,
    COALESCE(js.victorias, 0)::integer AS victorias
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

COMMENT ON FUNCTION public.riviera_ranking_interno_por_organizador(uuid, text, text) IS
  'Ranking interno del club en appriviera. Jugadores activos del organizador; no filtra visible_publico.';

GRANT EXECUTE ON FUNCTION public.riviera_ranking_interno_por_organizador(uuid, text, text) TO anon, authenticated;

-- Fichas de jugador en ranking interno: ejecutar también supabase/jugador-interno-por-slug.sql

NOTIFY pgrst, 'reload schema';
