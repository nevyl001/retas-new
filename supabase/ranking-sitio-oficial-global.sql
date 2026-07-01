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

-- ── Posición # en ranking global (ficha rivieraopen.com /players/{id}) ──
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
BEGIN
  FOR v_row IN
    SELECT v.id, v.puntos_totales
    FROM public.riviera_ranking_sitio_oficial_global(p_categoria, p_genero) v
    ORDER BY v.puntos_totales DESC, v.nombre ASC
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
  RETURN 0;
END;
$$;

COMMENT ON FUNCTION public.riviera_ranking_posicion_sitio_oficial_global(uuid, text, text) IS
  'Posición en ranking global sitio oficial (todos los clubes). Usar en ficha pública, no por-organizador.';

GRANT EXECUTE ON FUNCTION public.riviera_ranking_posicion_sitio_oficial_global(uuid, text, text) TO anon, authenticated;

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

-- ── is_organizador_ranking_publico: derivado de jugadores publicados (no manual por club) ──
CREATE OR REPLACE FUNCTION public.is_organizador_ranking_publico(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.riviera_jugadores rj
    WHERE rj.organizador_id = p_org_id
      AND rj.estado = 'activo'
      AND rj.visible_publico IS TRUE
      AND COALESCE(rj.suma_ranking, true) = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_organizador_ranking_publico(uuid) TO anon, authenticated;

-- ── Anon: solo filas con «Sitio oficial» explícito (sin gate extra por club) ──
DROP POLICY IF EXISTS rj_select_anon ON public.riviera_jugadores;
CREATE POLICY rj_select_anon ON public.riviera_jugadores
  FOR SELECT TO anon
  USING (
    estado = 'activo'
    AND visible_publico IS TRUE
    AND COALESCE(suma_ranking, true) = true
  );

-- ── Trigger: visible_ranking_oficial del club sigue al admin (visible_publico por jugador) ──
CREATE OR REPLACE FUNCTION public.sync_organizador_ranking_oficial_from_players()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_has_public boolean;
BEGIN
  v_org_id := COALESCE(NEW.organizador_id, OLD.organizador_id);
  IF v_org_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.riviera_jugadores rj
    WHERE rj.organizador_id = v_org_id
      AND rj.estado = 'activo'
      AND rj.visible_publico IS TRUE
      AND COALESCE(rj.suma_ranking, true) = true
  ) INTO v_has_public;

  INSERT INTO public.organizador_game_modes (organizador_id, visible_ranking_oficial, updated_at)
  VALUES (v_org_id, v_has_public, now())
  ON CONFLICT (organizador_id) DO UPDATE
  SET visible_ranking_oficial = EXCLUDED.visible_ranking_oficial,
      updated_at = EXCLUDED.updated_at;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_organizador_ranking_oficial ON public.riviera_jugadores;
CREATE TRIGGER trg_sync_organizador_ranking_oficial
  AFTER INSERT OR UPDATE OF visible_publico, estado, suma_ranking
  OR DELETE
  ON public.riviera_jugadores
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_organizador_ranking_oficial_from_players();

-- Alinear clubs existentes con jugadores ya publicados en admin
UPDATE public.organizador_game_modes ogm
SET visible_ranking_oficial = EXISTS (
  SELECT 1
  FROM public.riviera_jugadores rj
  WHERE rj.organizador_id = ogm.organizador_id
    AND rj.estado = 'activo'
    AND rj.visible_publico IS TRUE
    AND COALESCE(rj.suma_ranking, true) = true
),
updated_at = now();

NOTIFY pgrst, 'reload schema';
