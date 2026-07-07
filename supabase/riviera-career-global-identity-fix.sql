-- Fix estructural: carrera global por official_player_key / Riviera ID.
-- Ejecutar en Supabase SQL Editor (staging → prod).
--
-- Cambios:
--   1. get_public_career_jugador_ids: sin gate visible_publico; expansión bidireccional de grants.
--   2. resolve_public_player_identity: misma expansión.
--   3. riviera_list_participaciones_for_jugador_ids: fetch directo por IDs ya resueltos.
--   4. _resolve_official_player_key: traverse grants en ambas direcciones.

CREATE OR REPLACE FUNCTION public._resolve_official_player_key(p_riviera_jugador_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key uuid;
  v_source_id uuid;
  v_grant_source uuid;
BEGIN
  SELECT l.official_player_key
  INTO v_key
  FROM public.riviera_official_player_profile_link l
  WHERE l.riviera_jugador_id = p_riviera_jugador_id;

  IF v_key IS NOT NULL THEN
    RETURN v_key;
  END IF;

  -- Grant: clon local → jugador origen con profile_link
  SELECT opa.jugador_id
  INTO v_source_id
  FROM public.organizer_player_access opa
  WHERE opa.is_active = true
    AND opa.local_jugador_id = p_riviera_jugador_id
  LIMIT 1;

  IF v_source_id IS NOT NULL THEN
    SELECT l.official_player_key
    INTO v_key
    FROM public.riviera_official_player_profile_link l
    WHERE l.riviera_jugador_id = v_source_id;
    IF v_key IS NOT NULL THEN
      RETURN v_key;
    END IF;
  END IF;

  -- Grant inverso: perfil origen → buscar profile_link en cualquier clon activo
  SELECT l.official_player_key
  INTO v_key
  FROM public.organizer_player_access opa
  JOIN public.riviera_official_player_profile_link l
    ON l.riviera_jugador_id = opa.local_jugador_id
  WHERE opa.is_active = true
    AND opa.jugador_id = p_riviera_jugador_id
  LIMIT 1;

  IF v_key IS NOT NULL THEN
    RETURN v_key;
  END IF;

  -- Grant inverso vía canonical en identity
  SELECT i.official_player_key
  INTO v_key
  FROM public.organizer_player_access opa
  JOIN public.riviera_official_player_identity i
    ON i.canonical_riviera_jugador_id = opa.jugador_id
  WHERE opa.is_active = true
    AND opa.local_jugador_id = p_riviera_jugador_id
  LIMIT 1;

  RETURN v_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_career_jugador_ids(p_jugador_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE ctx AS (
    SELECT public._resolve_official_player_key(p_jugador_id) AS official_key
  ),
  career_seed AS (
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
    UNION
    SELECT opa.local_jugador_id
    FROM public.organizer_player_access opa
    WHERE opa.is_active = true
      AND opa.jugador_id = p_jugador_id
      AND opa.local_jugador_id IS NOT NULL
  ),
  career AS (
    SELECT DISTINCT cs.jugador_id
    FROM career_seed cs
    WHERE cs.jugador_id IS NOT NULL
  )
  SELECT DISTINCT c.jugador_id
  FROM career c
  JOIN public.riviera_jugadores rj ON rj.id = c.jugador_id
  WHERE rj.estado = 'activo';
$$;

COMMENT ON FUNCTION public.get_public_career_jugador_ids(uuid) IS
  'IDs de perfiles de la misma carrera global (sin gate visible_publico; grants bidireccionales).';

CREATE OR REPLACE FUNCTION public.resolve_public_player_identity(
  p_jugador_id uuid DEFAULT NULL,
  p_riviera_id text DEFAULT NULL
)
RETURNS TABLE (
  anchor_jugador_id uuid,
  canonical_jugador_id uuid,
  riviera_id text,
  official_player_key text,
  home_organizador_id uuid,
  linked_jugador_id uuid,
  linked_organizador_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH anchor AS (
    SELECT COALESCE(
      p_jugador_id,
      (
        SELECT i.canonical_riviera_jugador_id
        FROM public.riviera_official_player_identity i
        WHERE i.riviera_id = NULLIF(TRIM(p_riviera_id), '')
        LIMIT 1
      )
    ) AS jugador_id
  ),
  official AS (
    SELECT public._resolve_official_player_key(a.jugador_id) AS official_key
    FROM anchor a
    WHERE a.jugador_id IS NOT NULL
  ),
  career AS (
    SELECT g.jugador_id
    FROM anchor a
    CROSS JOIN LATERAL public.get_public_career_jugador_ids(a.jugador_id) AS g(jugador_id)
    WHERE a.jugador_id IS NOT NULL
  ),
  linked AS (
    SELECT DISTINCT c.jugador_id
    FROM career c
    WHERE c.jugador_id IS NOT NULL
  ),
  identity_row AS (
    SELECT
      i.riviera_id::text AS riviera_id,
      i.official_player_key::text AS official_player_key,
      i.canonical_riviera_jugador_id AS canonical_jugador_id
    FROM official o
    JOIN public.riviera_official_player_identity i
      ON i.official_player_key = o.official_key
    WHERE o.official_key IS NOT NULL
    LIMIT 1
  ),
  home AS (
    SELECT rj.organizador_id
    FROM anchor a
    JOIN public.riviera_jugadores rj ON rj.id = a.jugador_id
    WHERE rj.estado = 'activo'
    LIMIT 1
  )
  SELECT
    a.jugador_id AS anchor_jugador_id,
    COALESCE(ir.canonical_jugador_id, a.jugador_id) AS canonical_jugador_id,
    ir.riviera_id,
    ir.official_player_key,
    h.organizador_id AS home_organizador_id,
    l.jugador_id AS linked_jugador_id,
    rj.organizador_id AS linked_organizador_id
  FROM anchor a
  CROSS JOIN linked l
  LEFT JOIN identity_row ir ON true
  LEFT JOIN home h ON true
  LEFT JOIN public.riviera_jugadores rj
    ON rj.id = l.jugador_id
   AND rj.estado = 'activo'
  WHERE a.jugador_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.riviera_list_participaciones_for_jugador_ids(
  p_jugador_ids uuid[],
  p_limit integer DEFAULT 500
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
  WHERE jp.jugador_id = ANY(p_jugador_ids)
    AND rj.estado = 'activo'
    AND NOT public.is_jugador_participacion_excluded(
      jp.jugador_id,
      jp.tipo_evento::text,
      jp.evento_id
    )
  ORDER BY jp.fecha DESC NULLS LAST, jp.created_at DESC NULLS LAST
  LIMIT GREATEST(COALESCE(p_limit, 500), 1);
$$;

COMMENT ON FUNCTION public.riviera_list_participaciones_for_jugador_ids(uuid[], integer) IS
  'Participaciones globales por lista explícita de jugador_id (motor de carrera unificado).';

GRANT EXECUTE ON FUNCTION public.riviera_list_participaciones_for_jugador_ids(uuid[], integer)
  TO anon, authenticated;

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
  SELECT jp.*
  FROM public.riviera_list_participaciones_for_jugador_ids(
    ARRAY(
      SELECT g.jugador_id
      FROM public.get_public_career_jugador_ids(p_jugador_id) AS g(jugador_id)
    ),
    p_limit
  ) jp;
$$;

NOTIFY pgrst, 'reload schema';
