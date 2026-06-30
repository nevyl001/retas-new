-- Respeta ajustes manuales del organizador en ranking/perfil oficial.
-- puntos efectivos = MAX(stats de cualquier perfil ROMC enlazado, ROMC ledger + legacy)

CREATE OR REPLACE FUNCTION public.riviera_official_display_puntos_for_jugador(
  p_riviera_jugador_id uuid
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ctx AS (
    SELECT public.resolve_official_player_key_for_jugador(p_riviera_jugador_id) AS official_key
  ),
  linked_max AS (
    SELECT COALESCE(MAX(js.puntos_totales), 0)::integer AS pts
    FROM ctx
    LEFT JOIN public._riviera_official_jugador_ids_for_key(ctx.official_key) linked
      ON ctx.official_key IS NOT NULL
    LEFT JOIN public.jugador_stats js
      ON js.jugador_id = linked.riviera_jugador_id
  ),
  local_pts AS (
    SELECT COALESCE(js.puntos_totales, 0)::integer AS pts
    FROM public.jugador_stats js
    WHERE js.jugador_id = p_riviera_jugador_id
  )
  SELECT GREATEST(
    (SELECT pts FROM local_pts),
    (SELECT pts FROM linked_max),
    public.riviera_official_ledger_points_for_jugador(p_riviera_jugador_id)
    + public.riviera_official_legacy_points_for_jugador(p_riviera_jugador_id)
  )::integer;
$$;

COMMENT ON FUNCTION public.riviera_official_display_puntos_for_jugador(uuid) IS
  'Puntos mostrados en sitio oficial: MAX(registro local con ajustes manuales, ROMC global).';

GRANT EXECUTE ON FUNCTION public.riviera_official_display_puntos_for_jugador(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
