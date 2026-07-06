-- Lectura pública del ranking: Riviera IDs, grants y carrera (anon = authenticated en UI pública).
-- Ejecutar en Supabase SQL Editor (staging → prod).

-- ── Riviera IDs en lote (sin exigir visible_publico) ──
CREATE OR REPLACE FUNCTION public.get_public_riviera_ids_for_jugadores(p_jugador_ids uuid[])
RETURNS TABLE (jugador_id uuid, riviera_id text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ids AS (
    SELECT DISTINCT unnest(COALESCE(p_jugador_ids, ARRAY[]::uuid[])) AS jugador_id
  ),
  via_link AS (
    SELECT
      i.jugador_id,
      ident.riviera_id::text AS riviera_id
    FROM ids i
    JOIN public.riviera_jugadores rj
      ON rj.id = i.jugador_id
     AND rj.estado = 'activo'
    JOIN public.riviera_official_player_profile_link pl
      ON pl.riviera_jugador_id = i.jugador_id
    JOIN public.riviera_official_player_identity ident
      ON ident.official_player_key = pl.official_player_key
    WHERE ident.riviera_id IS NOT NULL
  ),
  via_canonical AS (
    SELECT
      i.jugador_id,
      ident.riviera_id::text AS riviera_id
    FROM ids i
    JOIN public.riviera_jugadores rj
      ON rj.id = i.jugador_id
     AND rj.estado = 'activo'
    JOIN public.riviera_official_player_identity ident
      ON ident.canonical_riviera_jugador_id = i.jugador_id
    WHERE ident.riviera_id IS NOT NULL
  )
  SELECT DISTINCT ON (jugador_id) jugador_id, riviera_id
  FROM (
    SELECT * FROM via_link
    UNION ALL
    SELECT * FROM via_canonical
  ) merged
  ORDER BY jugador_id, riviera_id;
$$;

COMMENT ON FUNCTION public.get_public_riviera_ids_for_jugadores(uuid[]) IS
  'Riviera ID para jugadores del ranking público (carrera deportiva, sin visible_publico).';

GRANT EXECUTE ON FUNCTION public.get_public_riviera_ids_for_jugadores(uuid[])
  TO anon, authenticated;

-- ── Grants activos visibles en ranking público del club ──
CREATE OR REPLACE FUNCTION public.list_public_grants_for_ranking(p_grantee_organizador_id uuid)
RETURNS TABLE (
  id uuid,
  jugador_id uuid,
  owner_organizador_id uuid,
  local_jugador_id uuid,
  local_display_name text,
  local_category text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    opa.id,
    opa.jugador_id,
    opa.owner_organizador_id,
    opa.local_jugador_id,
    opa.local_display_name,
    opa.local_category
  FROM public.organizer_player_access opa
  WHERE opa.grantee_organizer_id = p_grantee_organizador_id
    AND opa.is_active = true
    AND public.is_organizador_ranking_publico(p_grantee_organizador_id);
$$;

COMMENT ON FUNCTION public.list_public_grants_for_ranking(uuid) IS
  'Cedidos/grants para merge del ranking público (anon ok si el club publica ranking).';

GRANT EXECUTE ON FUNCTION public.list_public_grants_for_ranking(uuid)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
