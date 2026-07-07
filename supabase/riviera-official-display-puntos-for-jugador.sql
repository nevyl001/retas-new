-- RPC puente: puntos globales ROMC para un riviera_jugador_id.
-- Fuente: riviera_official_player_totals vía official_player_key (_resolve_official_player_key).
-- NULL = sin identidad oficial enlazada (no sustituir con suma local en la app).
-- Ejecutar en Supabase después de riviera-official-multi-club-romc1.sql.

CREATE OR REPLACE FUNCTION public.riviera_official_display_puntos_for_jugador(
  p_riviera_jugador_id uuid
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key uuid;
  v_pts integer;
BEGIN
  IF p_riviera_jugador_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_key := public._resolve_official_player_key(p_riviera_jugador_id);
  IF v_key IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(t.points_total, 0)::integer
  INTO v_pts
  FROM public.riviera_official_player_totals t
  WHERE t.official_player_key = v_key;

  RETURN COALESCE(v_pts, 0);
END;
$$;

COMMENT ON FUNCTION public.riviera_official_display_puntos_for_jugador(uuid) IS
  'Puntos acumulados Ranking Global Riviera Open (ROMC) para un perfil. NULL si no hay official_player_key.';

GRANT EXECUTE ON FUNCTION public.riviera_official_display_puntos_for_jugador(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
