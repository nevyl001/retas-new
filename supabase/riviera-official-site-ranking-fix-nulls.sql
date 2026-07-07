-- Sprint 2.1 — ranking sitio oficial: puntos ROMC sin fallback a jugador_stats local.
-- Ejecutar DESPUÉS de riviera-official-display-puntos-for-jugador.sql.
-- No editar ranking-sitio-oficial-global.sql in-place (migración incremental).

-- ── Vista: puntos_totales = solo ledger ROMC (nullable) ──
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
  public.riviera_official_display_puntos_for_jugador(rj.id)::integer AS puntos_totales,
  COALESCE(js.total_partidos, 0)::integer AS total_partidos,
  COALESCE(js.victorias, 0)::integer AS victorias
FROM public.riviera_jugadores rj
LEFT JOIN public.jugador_stats js ON js.jugador_id = rj.id
WHERE rj.estado = 'activo'
  AND rj.visible_publico IS TRUE
  AND COALESCE(rj.suma_ranking, true) = true;

COMMENT ON VIEW public.riviera_jugadores_sitio_oficial IS
  'Jugadores sitio oficial. puntos_totales = ROMC (nullable); sin fallback a jugador_stats.';

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
  ORDER BY v.puntos_totales DESC NULLS LAST, v.nombre ASC;
$$;

-- ── Ranking global ──
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
  ORDER BY v.puntos_totales DESC NULLS LAST, v.nombre ASC;
$$;

-- ── Posición # ranking global: sin ROMC → sin posición (NULL) ──
DROP FUNCTION IF EXISTS public.riviera_ranking_posicion_sitio_oficial_global(uuid, text, text);

CREATE OR REPLACE FUNCTION public.riviera_ranking_posicion_sitio_oficial_global(
  p_jugador_id uuid,
  p_categoria text,
  p_genero text DEFAULT 'M'
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pos integer := 0;
  v_prev_pts integer := NULL;
  v_row record;
  v_idx integer := 0;
  v_player_pts integer;
BEGIN
  SELECT v.puntos_totales
  INTO v_player_pts
  FROM public.riviera_jugadores_sitio_oficial v
  WHERE v.id = p_jugador_id;

  IF NOT FOUND OR v_player_pts IS NULL THEN
    RETURN NULL;
  END IF;

  FOR v_row IN
    SELECT v.id, v.puntos_totales
    FROM public.riviera_ranking_sitio_oficial_global(p_categoria, p_genero) v
    WHERE v.puntos_totales IS NOT NULL
    ORDER BY v.puntos_totales DESC NULLS LAST, v.nombre ASC
  LOOP
    v_idx := v_idx + 1;
    IF v_prev_pts IS NULL OR v_row.puntos_totales <> v_prev_pts THEN
      v_pos := v_idx;
      v_prev_pts := v_row.puntos_totales;
    END IF;
    IF v_row.id = p_jugador_id THEN
      RETURN v_pos;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.riviera_ranking_posicion_sitio_oficial_global(uuid, text, text)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
