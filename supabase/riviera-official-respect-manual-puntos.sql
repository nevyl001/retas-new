-- Respeta ajustes manuales del organizador en ranking/perfil oficial.
-- puntos efectivos = MAX(jugador_stats.puntos_totales, ROMC ledger + legacy)

CREATE OR REPLACE FUNCTION public.riviera_official_display_puntos_for_jugador(
  p_riviera_jugador_id uuid
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(
    COALESCE(
      (
        SELECT js.puntos_totales
        FROM public.jugador_stats js
        WHERE js.jugador_id = p_riviera_jugador_id
      ),
      0
    ),
    public.riviera_official_ledger_points_for_jugador(p_riviera_jugador_id)
    + public.riviera_official_legacy_points_for_jugador(p_riviera_jugador_id)
  )::integer;
$$;

COMMENT ON FUNCTION public.riviera_official_display_puntos_for_jugador(uuid) IS
  'Puntos mostrados en sitio oficial: MAX(registro local con ajustes manuales, ROMC global).';

GRANT EXECUTE ON FUNCTION public.riviera_official_display_puntos_for_jugador(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
