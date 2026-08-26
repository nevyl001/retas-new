-- =============================================================================
-- Identidad pública (Drive/Revés + nacionalidad) por legacy players.id
-- =============================================================================
-- Misma resolución que riviera_public_event_legacy_player_profiles (local /
-- cedidos / canónico), pero incluye attrs de ficha necesarios en vistas
-- /public/ cuando RLS de riviera_jugadores bloquea el SELECT directo
-- (p. ej. is_organizador_ranking_publico = false).
--
-- Sin PII (email/teléfono/whatsapp/fecha_nacimiento).
-- Ejecutar en Supabase SQL Editor (staging → prod).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.riviera_public_event_legacy_player_identity(
  p_organizador_id uuid,
  p_legacy_player_ids uuid[]
)
RETURNS TABLE (
  legacy_player_id uuid,
  riviera_jugador_id uuid,
  nombre text,
  slug text,
  foto_url text,
  rating numeric,
  nivel text,
  categoria text,
  mano_dominante text,
  en_cancha text,
  pais_codigo text,
  edad integer
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
      rj.nombre AS local_nombre,
      rj.slug AS local_slug,
      rj.foto_url AS local_foto,
      COALESCE(rj.rating, 3)::numeric AS local_rating,
      COALESCE(rj.rating_partidos, 0) AS local_partidos,
      rj.nivel::text AS local_nivel,
      rj.categoria AS local_categoria,
      rj.mano_dominante AS local_mano,
      rj.en_cancha AS local_en_cancha,
      rj.pais_codigo::text AS local_pais,
      rj.edad AS local_edad
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
      src.id AS source_rj_id,
      src.nombre AS source_nombre,
      src.slug AS source_slug,
      src.foto_url AS source_foto,
      COALESCE(src.rating, 3)::numeric AS source_rating,
      COALESCE(src.rating_partidos, 0) AS source_partidos,
      src.nivel::text AS source_nivel,
      src.categoria AS source_categoria,
      src.mano_dominante AS source_mano,
      src.en_cancha AS source_en_cancha,
      src.pais_codigo::text AS source_pais,
      src.edad AS source_edad
    FROM access a
    JOIN public.riviera_jugadores src
      ON src.id = a.source_id
      AND src.estado = 'activo'
  ),
  canon AS (
    SELECT DISTINCT ON (i.lid)
      i.lid,
      rj.id AS canon_rj_id,
      rj.nombre AS canon_nombre,
      rj.slug AS canon_slug,
      rj.foto_url AS canon_foto,
      COALESCE(rj.rating, 3)::numeric AS canon_rating,
      COALESCE(rj.rating_partidos, 0) AS canon_partidos,
      rj.nivel::text AS canon_nivel,
      rj.categoria AS canon_categoria,
      rj.mano_dominante AS canon_mano,
      rj.en_cancha AS canon_en_cancha,
      rj.pais_codigo::text AS canon_pais,
      rj.edad AS canon_edad
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
    COALESCE(l.rj_id, s.source_rj_id, c.canon_rj_id) AS riviera_jugador_id,
    COALESCE(l.local_nombre, s.source_nombre, c.canon_nombre) AS nombre,
    COALESCE(l.local_slug, s.source_slug, c.canon_slug) AS slug,
    COALESCE(l.local_foto, s.source_foto, c.canon_foto) AS foto_url,
    CASE
      WHEN s.source_partidos > 0 AND s.source_rating <> 3 THEN s.source_rating
      WHEN c.canon_partidos > 0 AND c.canon_rating <> 3 THEN c.canon_rating
      WHEN l.local_partidos > 0 AND l.local_rating <> 3 THEN l.local_rating
      WHEN s.source_rating IS NOT NULL AND s.source_rating <> 3 THEN s.source_rating
      WHEN c.canon_rating IS NOT NULL AND c.canon_rating <> 3 THEN c.canon_rating
      ELSE COALESCE(l.local_rating, s.source_rating, c.canon_rating, 3)
    END AS rating,
    COALESCE(l.local_nivel, s.source_nivel, c.canon_nivel) AS nivel,
    COALESCE(l.local_categoria, s.source_categoria, c.canon_categoria) AS categoria,
    COALESCE(l.local_mano, s.source_mano, c.canon_mano) AS mano_dominante,
    COALESCE(l.local_en_cancha, s.source_en_cancha, c.canon_en_cancha) AS en_cancha,
    COALESCE(l.local_pais, s.source_pais, c.canon_pais) AS pais_codigo,
    COALESCE(l.local_edad, s.source_edad, c.canon_edad)::integer AS edad
  FROM ids i
  LEFT JOIN local l ON l.lid = i.lid
  LEFT JOIN source s ON s.lid = i.lid
  LEFT JOIN canon c ON c.lid = i.lid;
$$;

COMMENT ON FUNCTION public.riviera_public_event_legacy_player_identity(uuid, uuid[]) IS
  'Vista pública anon: identidad (Drive/Revés, país, mano, edad) por legacy players.id, incluye cedidos.';

GRANT EXECUTE ON FUNCTION public.riviera_public_event_legacy_player_identity(uuid, uuid[])
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
