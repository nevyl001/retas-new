-- Reasignación atómica de round/court conservando IDs de matches.
-- Preferida frente a delete+insert cuando los 28 enfrentamientos ya existen.
-- Bloquea si hay marcadores en matches o cualquier fila en games.

CREATE OR REPLACE FUNCTION public.reassign_tournament_match_rounds_if_unscored(
  p_tournament_id uuid,
  p_patches jsonb
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
  v_updated int := 0;
  v_row jsonb;
  v_match_id uuid;
  v_round int;
  v_court int;
  v_found int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'auth_required',
      'message', 'Debes iniciar sesión para reasignar rondas.'
    );
  END IF;

  SELECT t.user_id INTO v_owner
  FROM public.tournaments t
  WHERE t.id = p_tournament_id
  FOR UPDATE;

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
      'message', 'Solo el organizador (o admin maestro) puede reasignar rondas.'
    );
  END IF;

  IF p_patches IS NULL OR jsonb_typeof(p_patches) <> 'array' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_payload',
      'message', 'p_patches debe ser un arreglo JSON.'
    );
  END IF;

  -- Lock concurrente de todos los partidos del torneo.
  PERFORM 1
  FROM public.matches m
  WHERE m.tournament_id = p_tournament_id
  FOR UPDATE;

  SELECT count(*)::int INTO v_existing
  FROM public.matches m
  WHERE m.tournament_id = p_tournament_id;

  IF v_existing = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'no_matches',
      'message', 'La reta no tiene partidos para reasignar.'
    );
  END IF;

  IF jsonb_array_length(p_patches) <> v_existing THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'patch_count_mismatch',
      'message', format(
        'Se esperaban %s patches (uno por partido); llegaron %s.',
        v_existing,
        jsonb_array_length(p_patches)
      ),
      'existing_matches', v_existing
    );
  END IF;

  SELECT count(*)::int INTO v_scored_matches
  FROM public.matches m
  WHERE m.tournament_id = p_tournament_id
    AND (
      m.status = 'finished'
      OR m.pair1_score IS NOT NULL
      OR m.pair2_score IS NOT NULL
    );

  SELECT count(*)::int INTO v_games_count
  FROM public.games g
  WHERE g.match_id IN (
    SELECT m.id FROM public.matches m WHERE m.tournament_id = p_tournament_id
  );

  IF v_scored_matches > 0 OR v_games_count > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'has_results',
      'message', format(
        'Hay resultados (matches=%s, games=%s). No se reasignaron rondas.',
        v_scored_matches,
        v_games_count
      ),
      'scored_matches', v_scored_matches,
      'games_count', v_games_count
    );
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_patches)
  LOOP
    v_match_id := (v_row->>'id')::uuid;
    v_round := (v_row->>'round')::int;
    v_court := (v_row->>'court')::int;

    IF v_match_id IS NULL OR v_round IS NULL OR v_court IS NULL THEN
      RAISE EXCEPTION 'patch_invalid: id/round/court requeridos';
    END IF;

    IF v_round < 1 OR v_court < 1 THEN
      RAISE EXCEPTION 'patch_invalid: round/court deben ser >= 1';
    END IF;

    UPDATE public.matches m
    SET round = v_round,
        court = v_court
    WHERE m.id = v_match_id
      AND m.tournament_id = p_tournament_id;

    GET DIAGNOSTICS v_found = ROW_COUNT;
    IF v_found <> 1 THEN
      RAISE EXCEPTION 'patch_orphan: match % no pertenece al torneo', v_match_id;
    END IF;

    v_updated := v_updated + 1;
  END LOOP;

  IF v_updated <> v_existing THEN
    RAISE EXCEPTION 'update_incomplete: updated=% existing=%', v_updated, v_existing;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'updated', v_updated,
    'tournament_id', p_tournament_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_tournament_match_rounds_if_unscored(uuid, jsonb)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reassign_tournament_match_rounds_if_unscored(uuid, jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.reassign_tournament_match_rounds_if_unscored(uuid, jsonb) IS
  'Reasigna round/court de matches existentes sin borrar IDs; aborta si hay marcadores o games.';

-- Endurece replace (creación/regeneración completa) si 0092 aún no estaba o se vuelve a aplicar.
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
  v_p1 uuid;
  v_p2 uuid;
  v_pair_ok int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'auth_required',
      'message', 'Debes iniciar sesión para reprogramar la reta.'
    );
  END IF;

  SELECT t.user_id INTO v_owner
  FROM public.tournaments t
  WHERE t.id = p_tournament_id
  FOR UPDATE;

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

  IF p_matches IS NULL OR jsonb_typeof(p_matches) <> 'array' OR jsonb_array_length(p_matches) = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_payload',
      'message', 'p_matches debe ser un arreglo JSON no vacío.'
    );
  END IF;

  PERFORM 1 FROM public.matches m WHERE m.tournament_id = p_tournament_id FOR UPDATE;

  SELECT count(*)::int INTO v_existing
  FROM public.matches m WHERE m.tournament_id = p_tournament_id;

  SELECT count(*)::int INTO v_scored_matches
  FROM public.matches m
  WHERE m.tournament_id = p_tournament_id
    AND (
      m.status = 'finished'
      OR m.pair1_score IS NOT NULL
      OR m.pair2_score IS NOT NULL
    );

  SELECT count(*)::int INTO v_games_count
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

  -- Validar pertenencia de parejas al torneo antes de borrar.
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_matches)
  LOOP
    v_p1 := (v_row->>'pair1_id')::uuid;
    v_p2 := (v_row->>'pair2_id')::uuid;
    IF v_p1 IS NULL OR v_p2 IS NULL OR v_p1 = v_p2 THEN
      RAISE EXCEPTION 'invalid_pair_ids';
    END IF;
    SELECT count(*)::int INTO v_pair_ok
    FROM public.pairs p
    WHERE p.tournament_id = p_tournament_id
      AND p.id IN (v_p1, v_p2);
    IF v_pair_ok <> 2 THEN
      RAISE EXCEPTION 'pair_not_in_tournament: % / %', v_p1, v_p2;
    END IF;
  END LOOP;

  DELETE FROM public.matches WHERE tournament_id = p_tournament_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_matches)
  LOOP
    INSERT INTO public.matches (
      tournament_id, pair1_id, pair2_id, pair1_name, pair2_name, court, round, status
    ) VALUES (
      p_tournament_id,
      (v_row->>'pair1_id')::uuid,
      (v_row->>'pair2_id')::uuid,
      coalesce(v_row->>'pair1_name', ''),
      coalesce(v_row->>'pair2_name', ''),
      CASE WHEN nullif(v_row->>'court', '') IS NOT NULL THEN (v_row->>'court')::int ELSE NULL END,
      CASE WHEN nullif(v_row->>'round', '') IS NOT NULL THEN (v_row->>'round')::int ELSE 1 END,
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
