-- =============================================================================
-- Fotos públicas para jugadores de liga (liga_jugadores.id)
-- =============================================================================
-- Bypass RLS / visible_publico en vistas /public/ de liga (ranking, jornadas).
-- Mismo patrón que riviera_public_reta_event_players.
-- Ejecutar en Supabase SQL Editor (staging → prod).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.riviera_public_liga_jugador_profiles(
  p_organizador_id uuid,
  p_liga_jugador_ids uuid[]
)
RETURNS TABLE (
  liga_jugador_id uuid,
  foto_url text
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
      rj.foto_url
    FROM ids i
    JOIN public.riviera_jugadores rj
      ON rj.organizador_id = p_organizador_id
      AND rj.estado = 'activo'
      AND rj.legacy_liga_jugador_id = i.lid
      AND rj.foto_url IS NOT NULL
      AND trim(rj.foto_url) <> ''
    ORDER BY i.lid, COALESCE(rj.rating_partidos, 0) DESC NULLS LAST
  ),
  by_name AS (
    SELECT DISTINCT ON (i.lid)
      i.lid,
      rj.foto_url
    FROM ids i
    JOIN public.liga_jugadores lj ON lj.id = i.lid
    JOIN public.riviera_jugadores rj
      ON rj.organizador_id = p_organizador_id
      AND rj.estado = 'activo'
      AND lower(trim(rj.nombre)) = lower(trim(lj.nombre))
      AND rj.foto_url IS NOT NULL
      AND trim(rj.foto_url) <> ''
    LEFT JOIN linked l ON l.lid = i.lid
    WHERE l.lid IS NULL
    ORDER BY i.lid, COALESCE(rj.rating_partidos, 0) DESC NULLS LAST
  )
  SELECT lid AS liga_jugador_id, foto_url FROM linked
  UNION ALL
  SELECT lid AS liga_jugador_id, foto_url FROM by_name;
$$;

COMMENT ON FUNCTION public.riviera_public_liga_jugador_profiles(uuid, uuid[]) IS
  'Vista pública anon: foto_url por liga_jugadores.id (enlace legacy o nombre).';

GRANT EXECUTE ON FUNCTION public.riviera_public_liga_jugador_profiles(uuid, uuid[]) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
