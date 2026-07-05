-- =============================================================================
-- Perfiles públicos por riviera_jugadores.id (duelos 2v2, liga, etc.)
-- =============================================================================
-- Una sola función SECURITY DEFINER: cualquier vista /public/ pasa ids de
-- riviera_jugadores y recibe foto + rating canónico (multiclub / cedidos).
-- Depende de riviera_public_event_legacy_player_profiles (misma lógica canon).
-- Ejecutar en Supabase SQL Editor (staging → prod).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.riviera_public_riviera_jugador_profiles(
  p_organizador_id uuid,
  p_jugador_ids uuid[]
)
RETURNS TABLE (
  jugador_id uuid,
  foto_url text,
  rating numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ids AS (
    SELECT DISTINCT unnest(p_jugador_ids) AS jid
  ),
  local AS (
    SELECT
      i.jid,
      rj.id AS rj_id,
      rj.legacy_player_id,
      rj.foto_url AS local_foto,
      COALESCE(rj.rating, 3)::numeric AS local_rating
    FROM ids i
    LEFT JOIN public.riviera_jugadores rj
      ON rj.id = i.jid
      AND rj.estado = 'activo'
  ),
  lookup AS (
    SELECT
      jid,
      COALESCE(legacy_player_id, rj_id, jid) AS lookup_id,
      local_foto,
      local_rating
    FROM local
  ),
  distinct_lookups AS (
    SELECT DISTINCT lookup_id FROM lookup
  ),
  canon AS (
    SELECT p.legacy_player_id, p.foto_url, p.rating
    FROM distinct_lookups dl
    CROSS JOIN LATERAL (
      SELECT *
      FROM public.riviera_public_event_legacy_player_profiles(
        p_organizador_id,
        ARRAY[dl.lookup_id]
      )
    ) p
  )
  SELECT
    l.jid AS jugador_id,
    COALESCE(l.local_foto, c.foto_url) AS foto_url,
    COALESCE(c.rating, l.local_rating, 3)::numeric AS rating
  FROM lookup l
  LEFT JOIN canon c ON c.legacy_player_id = l.lookup_id;
$$;

COMMENT ON FUNCTION public.riviera_public_riviera_jugador_profiles(uuid, uuid[]) IS
  'Vista pública anon: foto y rating canónico por riviera_jugadores.id (duelos, eventos).';

GRANT EXECUTE ON FUNCTION public.riviera_public_riviera_jugador_profiles(uuid, uuid[]) TO anon, authenticated;

-- Alias usado por el cliente (mismo patrón que riviera_event_legacy_player_avatars).
CREATE OR REPLACE FUNCTION public.riviera_event_player_avatars(
  p_organizador_id uuid,
  p_jugador_ids uuid[]
)
RETURNS TABLE (
  id uuid,
  foto_url text,
  rating numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.jugador_id AS id,
    p.foto_url,
    p.rating
  FROM public.riviera_public_riviera_jugador_profiles(
    p_organizador_id,
    p_jugador_ids
  ) p;
$$;

COMMENT ON FUNCTION public.riviera_event_player_avatars(uuid, uuid[]) IS
  'Alias: perfiles públicos por riviera_jugadores.id (foto + rating canónico).';

GRANT EXECUTE ON FUNCTION public.riviera_event_player_avatars(uuid, uuid[]) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
