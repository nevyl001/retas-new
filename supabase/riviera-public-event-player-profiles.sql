-- Perfiles públicos (foto + rating) para vistas /public/ de retas y torneos.
-- Resuelve jugadores cedidos vía organizer_player_access sin sesión authenticated.
-- Ejecutar en Supabase SQL Editor (staging → prod).

CREATE OR REPLACE FUNCTION public.riviera_public_event_legacy_player_profiles(
  p_organizador_id uuid,
  p_legacy_player_ids uuid[]
)
RETURNS TABLE (
  legacy_player_id uuid,
  foto_url text,
  rating numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ids AS (
    SELECT DISTINCT unnest(p_legacy_player_ids) AS lid
  ),
  local AS (
    SELECT DISTINCT ON (i.lid)
      i.lid,
      rj.id AS rj_id,
      rj.foto_url AS local_foto,
      COALESCE(rj.rating, 3)::numeric AS local_rating,
      COALESCE(rj.rating_partidos, 0) AS local_partidos
    FROM ids i
    LEFT JOIN public.riviera_jugadores rj
      ON rj.estado = 'activo'
      AND rj.organizador_id = p_organizador_id
      AND (rj.legacy_player_id = i.lid OR rj.id = i.lid)
    ORDER BY i.lid, COALESCE(rj.rating_partidos, 0) DESC NULLS LAST
  ),
  access AS (
    SELECT DISTINCT ON (lid)
      lid,
      source_id
    FROM (
      SELECT
        i.lid,
        opa.jugador_id AS source_id,
        opa.updated_at
      FROM ids i
      LEFT JOIN local l ON l.lid = i.lid
      JOIN public.organizer_player_access opa
        ON opa.grantee_organizer_id = p_organizador_id
        AND opa.is_active = true
        AND (
          (l.rj_id IS NOT NULL AND opa.local_jugador_id = l.rj_id)
          OR (l.rj_id IS NOT NULL AND opa.jugador_id = l.rj_id)
        )
      UNION ALL
      SELECT
        i.lid,
        opa.jugador_id AS source_id,
        opa.updated_at
      FROM ids i
      JOIN public.organizer_player_access opa
        ON opa.grantee_organizer_id = p_organizador_id
        AND opa.is_active = true
      JOIN public.riviera_jugadores src_match
        ON src_match.id = opa.jugador_id
        AND src_match.estado = 'activo'
        AND src_match.legacy_player_id = i.lid
    ) grants
    ORDER BY lid, updated_at DESC NULLS LAST
  ),
  source AS (
    SELECT
      a.lid,
      src.foto_url AS source_foto,
      COALESCE(src.rating, 3)::numeric AS source_rating,
      COALESCE(src.rating_partidos, 0) AS source_partidos
    FROM access a
    JOIN public.riviera_jugadores src
      ON src.id = a.source_id
      AND src.estado = 'activo'
  ),
  canon AS (
    SELECT DISTINCT ON (i.lid)
      i.lid,
      rj.foto_url AS canon_foto,
      COALESCE(rj.rating, 3)::numeric AS canon_rating,
      COALESCE(rj.rating_partidos, 0) AS canon_partidos
    FROM ids i
    JOIN public.riviera_jugadores rj
      ON rj.estado = 'activo'
      AND rj.legacy_player_id = i.lid
    ORDER BY
      i.lid,
      COALESCE(rj.rating_partidos, 0) DESC NULLS LAST,
      CASE WHEN COALESCE(rj.rating, 3) = 3 THEN 1 ELSE 0 END,
      CASE WHEN rj.organizador_id = p_organizador_id THEN 1 ELSE 0 END DESC,
      COALESCE(rj.rating, 3) DESC
  )
  SELECT
    i.lid AS legacy_player_id,
    COALESCE(l.local_foto, s.source_foto, c.canon_foto) AS foto_url,
    CASE
      WHEN s.source_partidos > 0 AND s.source_rating <> 3 THEN s.source_rating
      WHEN c.canon_partidos > 0 AND c.canon_rating <> 3 THEN c.canon_rating
      WHEN l.local_partidos > 0 AND l.local_rating <> 3 THEN l.local_rating
      WHEN s.source_rating IS NOT NULL AND s.source_rating <> 3 THEN s.source_rating
      WHEN c.canon_rating IS NOT NULL AND c.canon_rating <> 3 THEN c.canon_rating
      ELSE COALESCE(l.local_rating, s.source_rating, c.canon_rating, 3)
    END AS rating
  FROM ids i
  LEFT JOIN local l ON l.lid = i.lid
  LEFT JOIN source s ON s.lid = i.lid
  LEFT JOIN canon c ON c.lid = i.lid;
$$;

COMMENT ON FUNCTION public.riviera_public_event_legacy_player_profiles(uuid, uuid[]) IS
  'Vista pública anon: foto y rating por legacy players.id, incluye cedidos (organizer_player_access).';

GRANT EXECUTE ON FUNCTION public.riviera_public_event_legacy_player_profiles(uuid, uuid[]) TO anon, authenticated;

-- Alias legacy usado por el cliente antes de este migration.
CREATE OR REPLACE FUNCTION public.riviera_event_legacy_player_avatars(
  p_organizador_id uuid,
  p_legacy_player_ids uuid[]
)
RETURNS TABLE (
  legacy_player_id uuid,
  foto_url text,
  rating numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.riviera_public_event_legacy_player_profiles(
    p_organizador_id,
    p_legacy_player_ids
  );
$$;

GRANT EXECUTE ON FUNCTION public.riviera_event_legacy_player_avatars(uuid, uuid[]) TO anon, authenticated;

-- Jugadores de reta pública por participaciones (bypass RLS / visible_publico).
-- DROP necesario: PostgreSQL no permite cambiar columnas de RETURNS TABLE con CREATE OR REPLACE.
DROP FUNCTION IF EXISTS public.riviera_public_reta_event_players(uuid, uuid);

CREATE FUNCTION public.riviera_public_reta_event_players(
  p_organizador_id uuid,
  p_tournament_id uuid
)
RETURNS TABLE (
  jugador_id uuid,
  legacy_player_id uuid,
  nombre text,
  foto_url text,
  rating numeric,
  pair_id uuid,
  pair_slot integer,
  canonical_legacy_player_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (jp.jugador_id)
    jp.jugador_id,
    rj.legacy_player_id,
    rj.nombre,
    rj.foto_url,
    COALESCE(rj.rating, 3)::numeric AS rating,
    NULLIF(jp.metadata->>'pair_id', '')::uuid AS pair_id,
    NULLIF(jp.metadata->>'pair_slot', '')::integer AS pair_slot,
    NULLIF(jp.metadata->>'canonical_legacy_player_id', '')::uuid
      AS canonical_legacy_player_id
  FROM public.jugador_participaciones jp
  INNER JOIN public.riviera_jugadores rj
    ON rj.id = jp.jugador_id
  WHERE jp.evento_id = p_tournament_id
    AND jp.tipo_evento = 'reta'
    AND rj.organizador_id = p_organizador_id
    AND rj.estado = 'activo'
  ORDER BY jp.jugador_id, jp.fecha DESC NULLS LAST, jp.created_at DESC NULLS LAST;
$$;

COMMENT ON FUNCTION public.riviera_public_reta_event_players(uuid, uuid) IS
  'Vista pública anon: jugadores que participaron en una reta (por riviera_jugador_id).';

GRANT EXECUTE ON FUNCTION public.riviera_public_reta_event_players(uuid, uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
