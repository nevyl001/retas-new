-- ══════════════════════════════════════════════════════════════════════════════
-- 0013 — Liberar bloques dinámicos huérfanos (sin partidos)
--
-- Tras "Resetear reta" se borran matches pero el bloque 1 puede quedar
-- `completed`. begin_dynamic_team_block responde already_claimed y el cliente
-- no puede regenerar partidos. retry_dynamic_team_block solo liberaba
-- `generating`; ahora también libera `completed` si no hay matches en el
-- rango de rondas del bloque (misma garantía: nunca borra datos reales).
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.retry_dynamic_team_block(
  p_tournament_id uuid,
  p_block_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament record;
  v_block record;
  v_match_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  SELECT id, user_id INTO v_tournament
  FROM public.tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND OR v_tournament.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Sin permiso sobre esta reta';
  END IF;

  SELECT * INTO v_block
  FROM public.reta_dynamic_blocks
  WHERE tournament_id = p_tournament_id AND block_number = p_block_number
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT count(*) INTO v_match_count
  FROM public.matches
  WHERE tournament_id = p_tournament_id
    AND round BETWEEN v_block.round_start AND v_block.round_end;

  IF v_match_count > 0 THEN
    IF v_block.status = 'completed' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'already_completed');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'matches_exist');
  END IF;

  -- Sin partidos en el rango: liberar tanto generating como completed huérfano
  DELETE FROM public.reta_dynamic_blocks WHERE id = v_block.id;

  RETURN jsonb_build_object('ok', true, 'status', 'released');
END;
$$;

REVOKE ALL ON FUNCTION public.retry_dynamic_team_block(uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retry_dynamic_team_block(uuid, integer)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
