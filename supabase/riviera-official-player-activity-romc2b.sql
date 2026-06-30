-- ROMC 2.2-B (v2): perfil/ranking oficial lee TODOS los eventos de TODOS los clubes.
-- Ejecutar después de romc2-phase2.sql.

CREATE OR REPLACE FUNCTION public.resolve_official_player_key_for_jugador(
  p_riviera_jugador_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key uuid;
BEGIN
  IF p_riviera_jugador_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_key := public._resolve_official_player_key(p_riviera_jugador_id);

  IF v_key IS NOT NULL THEN
    RETURN v_key;
  END IF;

  RETURN public._ensure_official_identity_for_participation_jugador(p_riviera_jugador_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_official_player_key_for_jugador(uuid) TO anon, authenticated;

-- Todos los riviera_jugadores_id ligados a una identidad oficial (perfiles + canónico).
CREATE OR REPLACE FUNCTION public._riviera_official_jugador_ids_for_key(p_official_player_key uuid)
RETURNS TABLE (riviera_jugador_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pl.riviera_jugador_id
  FROM public.riviera_official_player_profile_link pl
  WHERE pl.official_player_key = p_official_player_key
  UNION
  SELECT i.canonical_riviera_jugador_id
  FROM public.riviera_official_player_identity i
  WHERE i.official_player_key = p_official_player_key
    AND i.canonical_riviera_jugador_id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public._riviera_official_jugador_ids_for_key(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._riviera_official_jugador_ids_for_key(uuid) TO anon, authenticated;

-- Suma ledger global (todos los clubes) para la identidad oficial.
CREATE OR REPLACE FUNCTION public.riviera_official_ledger_points_for_jugador(
  p_riviera_jugador_id uuid
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT SUM(l.points)::integer
      FROM public.riviera_official_points_ledger l
      WHERE l.official_player_key = public.resolve_official_player_key_for_jugador(p_riviera_jugador_id)
        AND l.points > 0
    ),
    0
  );
$$;

GRANT EXECUTE ON FUNCTION public.riviera_official_ledger_points_for_jugador(uuid) TO anon, authenticated;

-- Participaciones locales (cualquier perfil enlazado) aún no reflejadas en ledger (legacy).
CREATE OR REPLACE FUNCTION public.riviera_official_legacy_points_for_jugador(
  p_riviera_jugador_id uuid
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT SUM(jp.puntos_obtenidos)::integer
      FROM public.jugador_participaciones jp
      WHERE jp.jugador_id IN (
        SELECT ids.riviera_jugador_id
        FROM public._riviera_official_jugador_ids_for_key(
          public.resolve_official_player_key_for_jugador(p_riviera_jugador_id)
        ) ids
      )
        AND COALESCE(jp.puntos_obtenidos, 0) > 0
        AND COALESCE(jp.metadata->>'subtipo', '') <> 'ajuste_manual'
        AND NOT EXISTS (
          SELECT 1
          FROM public.riviera_official_points_ledger l
          WHERE l.participacion_id = jp.id
        )
    ),
    0
  );
$$;

GRANT EXECUTE ON FUNCTION public.riviera_official_legacy_points_for_jugador(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.riviera_official_display_puntos_for_jugador(
  p_riviera_jugador_id uuid
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.riviera_official_ledger_points_for_jugador(p_riviera_jugador_id)
    + public.riviera_official_legacy_points_for_jugador(p_riviera_jugador_id);
$$;

GRANT EXECUTE ON FUNCTION public.riviera_official_display_puntos_for_jugador(uuid) TO anon, authenticated;

-- TODOS los eventos en ledger (cualquier club emisor).
CREATE OR REPLACE FUNCTION public.list_riviera_official_player_activity(
  p_riviera_jugador_id uuid,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  ledger_id uuid,
  participacion_id uuid,
  official_player_key uuid,
  source_organizador_id uuid,
  source_club_name text,
  event_type text,
  event_id uuid,
  event_name text,
  points integer,
  activity_at timestamptz,
  metadata jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id AS ledger_id,
    l.participacion_id,
    l.official_player_key,
    l.source_organizer_id,
    l.source_club_name,
    l.event_type,
    l.event_id,
    l.event_name,
    l.points,
    l.created_at AS activity_at,
    l.metadata
  FROM public.riviera_official_points_ledger l
  WHERE l.official_player_key = public.resolve_official_player_key_for_jugador(p_riviera_jugador_id)
    AND l.points > 0
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));
$$;

GRANT EXECUTE ON FUNCTION public.list_riviera_official_player_activity(uuid, integer) TO anon, authenticated;

-- Compat: nombre anterior apunta al listado completo.
CREATE OR REPLACE FUNCTION public.list_riviera_official_cross_club_activity(
  p_riviera_jugador_id uuid,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  ledger_id uuid,
  participacion_id uuid,
  official_player_key uuid,
  source_organizador_id uuid,
  source_club_name text,
  event_type text,
  event_id uuid,
  event_name text,
  points integer,
  activity_at timestamptz,
  metadata jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.list_riviera_official_player_activity(p_riviera_jugador_id, p_limit);
$$;

GRANT EXECUTE ON FUNCTION public.list_riviera_official_cross_club_activity(uuid, integer) TO anon, authenticated;

-- Participaciones legacy de cualquier perfil enlazado (todos los clubes) sin fila en ledger.
CREATE OR REPLACE FUNCTION public.list_riviera_official_legacy_participaciones(
  p_riviera_jugador_id uuid,
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
  WHERE jp.jugador_id IN (
    SELECT ids.riviera_jugador_id
    FROM public._riviera_official_jugador_ids_for_key(
      public.resolve_official_player_key_for_jugador(p_riviera_jugador_id)
    ) ids
  )
    AND COALESCE(jp.metadata->>'subtipo', '') <> 'ajuste_manual'
    AND NOT EXISTS (
      SELECT 1
      FROM public.riviera_official_points_ledger l
      WHERE l.participacion_id = jp.id
    )
  ORDER BY jp.fecha DESC, jp.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));
$$;

GRANT EXECUTE ON FUNCTION public.list_riviera_official_legacy_participaciones(uuid, integer) TO anon, authenticated;

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
  'Ranking oficial: puntos globales ROMC (todos los clubes) + legacy sin ledger.';

-- ── Vista sitio oficial: puntos ROMC globales (rivieraopen.com lee esta vista) ──
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
  public.riviera_official_display_puntos_for_jugador(rj.id)::integer AS puntos_totales,
  COALESCE(js.total_partidos, 0)::integer AS total_partidos,
  COALESCE(js.victorias, 0)::integer AS victorias
FROM public.riviera_jugadores rj
LEFT JOIN public.jugador_stats js ON js.jugador_id = rj.id
WHERE rj.estado = 'activo'
  AND rj.visible_publico IS TRUE
  AND COALESCE(rj.suma_ranking, true) = true
  AND public.is_organizador_ranking_publico(rj.organizador_id);

COMMENT ON VIEW public.riviera_jugadores_sitio_oficial IS
  'Sitio oficial: puntos_totales = ROMC global (todos los clubes). Filtrar siempre por organizador_id.';

GRANT SELECT ON public.riviera_jugadores_sitio_oficial TO anon, authenticated;

-- Posición en ranking oficial (misma lógica que lista: RANK por puntos ROMC).
CREATE OR REPLACE FUNCTION public.riviera_official_ranking_posicion_for_jugador(
  p_jugador_id uuid,
  p_organizador_id uuid DEFAULT NULL,
  p_categoria text DEFAULT NULL,
  p_genero text DEFAULT 'M'
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT
      v.id,
      v.nombre,
      public.riviera_official_display_puntos_for_jugador(v.id) AS pts
    FROM public.riviera_jugadores_sitio_oficial v
    WHERE v.organizador_id = COALESCE(
      p_organizador_id,
      (SELECT rj.organizador_id FROM public.riviera_jugadores rj WHERE rj.id = p_jugador_id)
    )
      AND (p_categoria IS NULL OR v.categoria = p_categoria)
      AND (
        p_genero IS NULL
        OR (upper(p_genero) IN ('F', 'FEMENIL') AND v.genero = 'F')
        OR (
          upper(p_genero) IN ('M', 'VARONIL')
          AND (v.genero = 'M' OR v.genero IS NULL)
        )
      )
  ),
  ranked AS (
    SELECT
      id,
      RANK() OVER (ORDER BY pts DESC, nombre ASC) AS pos
    FROM scoped
  )
  SELECT pos::integer FROM ranked WHERE id = p_jugador_id;
$$;

GRANT EXECUTE ON FUNCTION public.riviera_official_ranking_posicion_for_jugador(uuid, uuid, text, text) TO anon, authenticated;

-- Perfil público oficial (rivieraopen.com): puntos, ranking e historial global.
CREATE OR REPLACE FUNCTION public.get_riviera_oficial_jugador_public_profile(
  p_jugador_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jugador record;
  v_puntos integer;
  v_pos integer;
  v_historial jsonb;
BEGIN
  IF p_jugador_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT public.is_jugador_visible_sitio_oficial(p_jugador_id) THEN
    RETURN NULL;
  END IF;

  SELECT rj.*
  INTO v_jugador
  FROM public.riviera_jugadores rj
  WHERE rj.id = p_jugador_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_puntos := public.riviera_official_display_puntos_for_jugador(p_jugador_id);
  v_pos := public.riviera_official_ranking_posicion_for_jugador(
    p_jugador_id,
    v_jugador.organizador_id,
    v_jugador.categoria,
    COALESCE(v_jugador.genero, 'M')
  );

  SELECT COALESCE(
    (
      SELECT jsonb_agg(entry ORDER BY sort_at DESC)
      FROM (
        SELECT jsonb_build_object(
          'participacion_id', row.participacion_id,
          'event_type', row.event_type,
          'event_id', row.event_id,
          'event_name', row.event_name,
          'points', row.points,
          'source_club_name', row.source_club_name,
          'activity_at', row.activity_at,
          'metadata', row.metadata
        ) AS entry,
        row.activity_at AS sort_at
        FROM public.list_riviera_official_player_activity(p_jugador_id, 100) row
        UNION ALL
        SELECT jsonb_build_object(
          'participacion_id', jp.id,
          'event_type', jp.tipo_evento::text,
          'event_id', jp.evento_id,
          'event_name', jp.evento_nombre,
          'points', jp.puntos_obtenidos,
          'source_club_name', NULL,
          'activity_at', COALESCE(jp.fecha::timestamptz, jp.created_at),
          'metadata', jp.metadata
        ) AS entry,
        COALESCE(jp.fecha::timestamptz, jp.created_at) AS sort_at
        FROM public.list_riviera_official_legacy_participaciones(p_jugador_id, 100) jp
      ) combined
    ),
    '[]'::jsonb
  )
  INTO v_historial;

  RETURN jsonb_build_object(
    'jugador_id', p_jugador_id,
    'organizador_id', v_jugador.organizador_id,
    'puntos_totales', v_puntos,
    'ranking_posicion', v_pos,
    'historial', v_historial
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_riviera_oficial_jugador_public_profile(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_riviera_oficial_jugador_public_profile(uuid) IS
  'Perfil público rivieraopen.com: puntos ROMC globales, posición ranking e historial multiclub.';

NOTIFY pgrst, 'reload schema';
