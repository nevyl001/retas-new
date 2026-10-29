-- Reemplazo atómico del calendario Round Robin solo si no hay resultados.
-- Evita persistencia parcial (delete + insert en la misma transacción de la función).
-- Si hay matches.finished / scores agregados o cualquier fila en games → aborta.

CREATE OR REPLACE FUNCTION public.replace_tournament_matches_if_unscored(
  p_tournament_id uuid,
  p_matches jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_scored_matches int := 0;
  v_games_count int := 0;
  v_existing int := 0;
  v_inserted int := 0;
  v_row jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'auth_required',
      'message', 'Debes iniciar sesión para reprogramar la reta.'
    );
  END IF;

  SELECT t.user_id
    INTO v_owner
  FROM public.tournaments t
  WHERE t.id = p_tournament_id;

  IF v_owner IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'tournament_not_found',
      'message', 'Reta no encontrada.'
    );
  END IF;

  IF v_owner IS DISTINCT FROM v_uid AND NOT public.is_master_admin() THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'forbidden',
      'message', 'Solo el organizador (o admin maestro) puede reprogramar.'
    );
  END IF;

  IF p_matches IS NULL OR jsonb_typeof(p_matches) <> 'array' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_payload',
      'message', 'p_matches debe ser un arreglo JSON de partidos.'
    );
  END IF;

  IF jsonb_array_length(p_matches) = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'empty_schedule',
      'message', 'No se puede persistir un calendario vacío.'
    );
  END IF;

  SELECT count(*)::int
    INTO v_existing
  FROM public.matches m
  WHERE m.tournament_id = p_tournament_id;

  SELECT count(*)::int
    INTO v_scored_matches
  FROM public.matches m
  WHERE m.tournament_id = p_tournament_id
    AND (
      m.status = 'finished'
      OR m.pair1_score IS NOT NULL
      OR m.pair2_score IS NOT NULL
    );

  SELECT count(*)::int
    INTO v_games_count
  FROM public.games g
  WHERE g.match_id IN (
    SELECT m.id FROM public.matches m WHERE m.tournament_id = p_tournament_id
  );

  IF v_scored_matches > 0 OR v_games_count > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'has_results',
      'message', format(
        'Hay resultados (matches=%s, games=%s). No se regeneró el calendario.',
        v_scored_matches,
        v_games_count
      ),
      'scored_matches', v_scored_matches,
      'games_count', v_games_count,
      'existing_matches', v_existing
    );
  END IF;

  -- Misma transacción de la función: si el INSERT falla, el DELETE se revierte.
  DELETE FROM public.matches
  WHERE tournament_id = p_tournament_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_matches)
  LOOP
    INSERT INTO public.matches (
      tournament_id,
      pair1_id,
      pair2_id,
      pair1_name,
      pair2_name,
      court,
      round,
      status
    ) VALUES (
      p_tournament_id,
      (v_row->>'pair1_id')::uuid,
      (v_row->>'pair2_id')::uuid,
      coalesce(v_row->>'pair1_name', ''),
      coalesce(v_row->>'pair2_name', ''),
      CASE
        WHEN v_row ? 'court' AND nullif(v_row->>'court', '') IS NOT NULL
          THEN (v_row->>'court')::int
        ELSE NULL
      END,
      CASE
        WHEN v_row ? 'round' AND nullif(v_row->>'round', '') IS NOT NULL
          THEN (v_row->>'round')::int
        ELSE 1
      END,
      coalesce(nullif(v_row->>'status', ''), 'pending')
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'replaced_existing', v_existing
  );
END;
$$;

REVOKE ALL ON FUNCTION public.replace_tournament_matches_if_unscored(uuid, jsonb)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_tournament_matches_if_unscored(uuid, jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.replace_tournament_matches_if_unscored(uuid, jsonb) IS
  'Reemplaza el calendario de una reta en una sola transacción solo si no hay marcadores en matches ni filas en games.';
