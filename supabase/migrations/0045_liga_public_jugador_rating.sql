-- =============================================================================
-- Perfil público de jugadores de liga (liga_jugadores.id): foto + rating
-- =============================================================================
-- Bypass RLS / visible_publico en vistas /public/ de liga (ranking, jornadas).
-- El rating es el de riviera_jugadores, no el valor inicial del chip.
-- Cambiar el RETURNS TABLE exige DROP (Postgres no deja CREATE OR REPLACE).
-- =============================================================================

DROP FUNCTION IF EXISTS public.riviera_public_liga_jugador_profiles(uuid, uuid[]);

CREATE FUNCTION public.riviera_public_liga_jugador_profiles(
  p_organizador_id uuid,
  p_liga_jugador_ids uuid[]
)
RETURNS TABLE (
  liga_jugador_id uuid,
  foto_url text,
  rating numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ids AS (
    SELECT DISTINCT unnest(p_liga_jugador_ids) AS lid
  ),
  linked AS (
    SELECT DISTINCT ON (i.lid)
      i.lid,
      NULLIF(trim(rj.foto_url), '') AS foto_url,
      rj.rating
    FROM ids i
    JOIN public.riviera_jugadores rj
      ON rj.organizador_id = p_organizador_id
      AND rj.estado = 'activo'
      AND rj.legacy_liga_jugador_id = i.lid
    ORDER BY i.lid, COALESCE(rj.rating_partidos, 0) DESC NULLS LAST
  ),
  by_name AS (
    SELECT DISTINCT ON (i.lid)
      i.lid,
      NULLIF(trim(rj.foto_url), '') AS foto_url,
      rj.rating
    FROM ids i
    JOIN public.liga_jugadores lj ON lj.id = i.lid
    JOIN public.riviera_jugadores rj
      ON rj.organizador_id = p_organizador_id
      AND rj.estado = 'activo'
      AND lower(trim(rj.nombre)) = lower(trim(lj.nombre))
    LEFT JOIN linked l ON l.lid = i.lid
    WHERE l.lid IS NULL
    ORDER BY i.lid, COALESCE(rj.rating_partidos, 0) DESC NULLS LAST
  )
  SELECT lid AS liga_jugador_id, foto_url, rating FROM linked
  UNION ALL
  SELECT lid AS liga_jugador_id, foto_url, rating FROM by_name;
$$;

COMMENT ON FUNCTION public.riviera_public_liga_jugador_profiles(uuid, uuid[]) IS
  'Vista pública anon: foto_url y rating por liga_jugadores.id (enlace legacy o nombre).';

GRANT EXECUTE ON FUNCTION public.riviera_public_liga_jugador_profiles(uuid, uuid[]) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
