-- RIVIERA 2.1.3B — Lectura pública de Riviera ID en perfiles visibles
-- Ejecutar en Supabase SQL Editor (staging → prod).
-- Solo expone riviera_id de jugadores con visible_publico=true.

CREATE OR REPLACE FUNCTION public.get_public_riviera_id_for_jugador(p_jugador_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.riviera_id
  FROM public.riviera_jugadores rj
  JOIN public.riviera_official_player_identity i
    ON i.canonical_riviera_jugador_id = rj.id
  WHERE rj.id = p_jugador_id
    AND rj.estado = 'activo'
    AND rj.visible_publico IS TRUE
    AND COALESCE(rj.suma_ranking, true) = true
    AND i.riviera_id IS NOT NULL
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_public_riviera_id_for_jugador(uuid) IS
  'Sprint 2.1.3B — Devuelve Riviera ID legible para perfiles públicos (sin auth).';

GRANT EXECUTE ON FUNCTION public.get_public_riviera_id_for_jugador(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
