-- =============================================================================
-- Lectura pública de movimientos de rating en duelos 2v2 finalizados
-- =============================================================================
-- Evita depender de RLS directo sobre rating_historial + visible_publico.
-- Idempotente: CREATE OR REPLACE.
-- Prerrequisito: is_duelo_public() en rls-multiclub-pr1-public-read-helpers.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_public_duelo2v2_rating_moves(p_duelo_id uuid)
RETURNS TABLE (
  jugador_id uuid,
  rating_antes numeric,
  rating_despues numeric,
  delta numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    rh.jugador_id,
    rh.rating_antes,
    rh.rating_despues,
    rh.delta
  FROM public.rating_historial rh
  WHERE p_duelo_id IS NOT NULL
    AND rh.partido_ref = ('duelo2v2:' || p_duelo_id::text)
    AND public.is_duelo_public(p_duelo_id)
  ORDER BY rh.jugador_id;
$$;

COMMENT ON FUNCTION public.get_public_duelo2v2_rating_moves(uuid) IS
  'Vista pública: movimientos de nivel por jugador en un duelo 2v2 finalizado.';

GRANT EXECUTE ON FUNCTION public.get_public_duelo2v2_rating_moves(uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.get_public_duelo2v2_rating_moves(uuid) FROM PUBLIC;

NOTIFY pgrst, 'reload schema';
