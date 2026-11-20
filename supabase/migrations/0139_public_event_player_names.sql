-- La vista pública de un americano ya muestra foto y rating sin sesión.
-- El nombre de la ficha no venía en esa lectura, así que cancha y
-- clasificación se quedaban con el nombre congelado al armar la ronda.

CREATE OR REPLACE FUNCTION public.riviera_public_event_player_names(
  p_organizador_id uuid,
  p_legacy_player_ids uuid[]
)
RETURNS TABLE (
  legacy_player_id uuid,
  nombre text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ids AS (
    SELECT DISTINCT unnest(p_legacy_player_ids) AS lid
  )
  SELECT DISTINCT ON (i.lid)
    i.lid AS legacy_player_id,
    NULLIF(btrim(rj.nombre), '') AS nombre
  FROM ids i
  JOIN public.riviera_jugadores rj
    ON rj.estado = 'activo'
   AND rj.organizador_id = p_organizador_id
   AND (rj.legacy_player_id = i.lid OR rj.id = i.lid)
  ORDER BY i.lid, rj.updated_at DESC NULLS LAST;
$$;

COMMENT ON FUNCTION public.riviera_public_event_player_names(uuid, uuid[]) IS
  'Vista pública: nombre vigente de la ficha para jugadores de un evento publicado.';

GRANT EXECUTE ON FUNCTION public.riviera_public_event_player_names(uuid, uuid[])
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
