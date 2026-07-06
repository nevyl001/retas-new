-- Carrera global en ficha pública (anon): participaciones de todos los perfiles
-- enlazados (profile_link + grants) aunque el clon local no sea visible_publico.
-- Ejecutar en Supabase SQL Editor (staging → prod).

CREATE OR REPLACE FUNCTION public.get_public_career_jugador_ids(p_jugador_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ctx AS (
    SELECT public._resolve_official_player_key(p_jugador_id) AS official_key
  ),
  career AS (
    SELECT p_jugador_id AS jugador_id
    UNION
    SELECT l.riviera_jugador_id
    FROM ctx
    JOIN public.riviera_official_player_profile_link l
      ON l.official_player_key = ctx.official_key
    WHERE ctx.official_key IS NOT NULL
    UNION
    SELECT i.canonical_riviera_jugador_id
    FROM ctx
    JOIN public.riviera_official_player_identity i
      ON i.official_player_key = ctx.official_key
    WHERE ctx.official_key IS NOT NULL
      AND i.canonical_riviera_jugador_id IS NOT NULL
    UNION
    SELECT opa.local_jugador_id
    FROM ctx
    JOIN public.riviera_official_player_identity i
      ON i.official_player_key = ctx.official_key
    JOIN public.organizer_player_access opa
      ON opa.jugador_id = i.canonical_riviera_jugador_id
     AND opa.is_active = true
    WHERE ctx.official_key IS NOT NULL
      AND opa.local_jugador_id IS NOT NULL
    UNION
    SELECT opa.jugador_id
    FROM public.organizer_player_access opa
    WHERE opa.is_active = true
      AND opa.local_jugador_id = p_jugador_id
      AND opa.jugador_id IS NOT NULL
  )
  SELECT DISTINCT c.jugador_id
  FROM career c
  WHERE c.jugador_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM career c2
      JOIN public.riviera_jugadores rj ON rj.id = c2.jugador_id
      WHERE rj.estado = 'activo'
        AND rj.visible_publico IS TRUE
        AND COALESCE(rj.suma_ranking, true) = true
    );
$$;

COMMENT ON FUNCTION public.get_public_career_jugador_ids(uuid) IS
  'IDs de perfiles de la misma Carrera visibles en ficha pública (bypass RLS multiclub).';

GRANT EXECUTE ON FUNCTION public.get_public_career_jugador_ids(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.riviera_list_career_participaciones_public(
  p_jugador_id uuid,
  p_limit integer DEFAULT 100
)
RETURNS SETOF public.jugador_participaciones
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    jp.id,
    jp.jugador_id,
    jp.tipo_evento,
    jp.evento_id,
    jp.evento_nombre,
    jp.fecha,
    jp.pareja_con,
    jp.resultado,
    jp.sets_favor,
    jp.sets_contra,
    jp.puntos_obtenidos,
    CASE
      WHEN COALESCE(jp.metadata->>'organizador_id', '') <> '' THEN jp.metadata
      WHEN d.id IS NOT NULL THEN COALESCE(jp.metadata, '{}'::jsonb)
        || jsonb_build_object('organizador_id', d.organizador_id::text)
      WHEN t.id IS NOT NULL THEN COALESCE(jp.metadata, '{}'::jsonb)
        || jsonb_build_object('organizador_id', t.organizador_id::text)
      WHEN rj.organizador_id IS NOT NULL THEN COALESCE(jp.metadata, '{}'::jsonb)
        || jsonb_build_object('organizador_id', rj.organizador_id::text)
      ELSE COALESCE(jp.metadata, '{}'::jsonb)
    END AS metadata,
    jp.created_at
  FROM public.jugador_participaciones jp
  INNER JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
  LEFT JOIN public.duelos_2v2 d
    ON jp.tipo_evento = 'duelo_2v2'
   AND jp.evento_id::uuid = d.id
  LEFT JOIN public.torneo_express t
    ON jp.tipo_evento = 'torneo_express'
   AND jp.evento_id::uuid = t.id
  WHERE jp.jugador_id IN (
    SELECT g.jugador_id FROM public.get_public_career_jugador_ids(p_jugador_id) AS g(jugador_id)
  )
    AND rj.estado = 'activo'
    AND NOT public.is_jugador_participacion_excluded(
      jp.jugador_id,
      jp.tipo_evento::text,
      jp.evento_id
    )
  ORDER BY jp.fecha DESC NULLS LAST, jp.created_at DESC NULLS LAST
  LIMIT GREATEST(COALESCE(p_limit, 100), 1);
$$;

COMMENT ON FUNCTION public.riviera_list_career_participaciones_public(uuid, integer) IS
  'Historial global por Carrera Deportiva para ficha pública (multiclub / cedidos).';

GRANT EXECUTE ON FUNCTION public.riviera_list_career_participaciones_public(uuid, integer)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
