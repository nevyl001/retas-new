-- ══════════════════════════════════════════════════════════════════════════════
-- parejas_fijas_playoffs: el resultado de Liga se calcula por games totales
-- de ambos sets (set1.p1+set2.p1 vs set1.p2+set2.p2), NO por sets ganados.
--
-- Esta RPC recalcula score_pareja1/2 desde p_set_scores.sets (salvo WO)
-- para no confiar en totales enviados por el cliente.
-- NO toca update_liga_partido_score_parejas_fijas (legacy).
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_liga_partido_score_parejas_fijas_playoffs(
  p_partido_id uuid,
  p_score1 integer,
  p_score2 integer,
  p_set_scores jsonb,
  p_force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partido record;
  v_organizador uuid;
  v_wo boolean;
  v_score1 integer;
  v_score2 integer;
  v_set1 jsonb;
  v_set2 jsonb;
  v_s1p1 integer;
  v_s1p2 integer;
  v_s2p1 integer;
  v_s2p2 integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  IF p_set_scores IS NULL
     OR (p_set_scores ->> 'format') IS DISTINCT FROM 'parejas_fijas_playoffs' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_score');
  END IF;

  v_wo := COALESCE((p_set_scores ->> 'wo')::boolean, false);

  IF v_wo THEN
    -- WO administrativo 6-0; prioridad sobre sets/games/STB.
    IF p_score1 IS NULL OR p_score2 IS NULL OR p_score1 < 0 OR p_score2 < 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_score');
    END IF;
    IF NOT (
      (p_score1 = 6 AND p_score2 = 0) OR (p_score1 = 0 AND p_score2 = 6)
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_wo');
    END IF;
    IF (p_set_scores -> 'stb') IS NOT NULL
       AND jsonb_typeof(p_set_scores -> 'stb') <> 'null' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'wo_no_stb');
    END IF;
    v_score1 := p_score1;
    v_score2 := p_score2;
  ELSE
    -- Recalcular games totales desde sets (no confiar en p_score*).
    IF jsonb_typeof(p_set_scores -> 'sets') IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_set_scores -> 'sets') IS DISTINCT FROM 2 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'sets_required');
    END IF;

    v_set1 := (p_set_scores -> 'sets') -> 0;
    v_set2 := (p_set_scores -> 'sets') -> 1;

    BEGIN
      v_s1p1 := (v_set1 ->> 'p1')::integer;
      v_s1p2 := (v_set1 ->> 'p2')::integer;
      v_s2p1 := (v_set2 ->> 'p1')::integer;
      v_s2p2 := (v_set2 ->> 'p2')::integer;
    EXCEPTION WHEN others THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_sets');
    END;

    IF v_s1p1 IS NULL OR v_s1p2 IS NULL OR v_s2p1 IS NULL OR v_s2p2 IS NULL
       OR v_s1p1 < 0 OR v_s1p2 < 0 OR v_s2p1 < 0 OR v_s2p2 < 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_sets');
    END IF;

    -- No exigir llegar a 6: sets incompletos por tiempo son válidos.
    v_score1 := v_s1p1 + v_s2p1;
    v_score2 := v_s1p2 + v_s2p2;

    -- Empate en games totales → STB obligatorio (NO por sets 1-1).
    IF v_score1 = v_score2
       AND (
         (p_set_scores -> 'stb') IS NULL
         OR jsonb_typeof(p_set_scores -> 'stb') = 'null'
       )
    THEN
      RETURN jsonb_build_object('ok', false, 'error', 'stb_required');
    END IF;

    IF v_score1 <> v_score2
       AND (p_set_scores -> 'stb') IS NOT NULL
       AND jsonb_typeof(p_set_scores -> 'stb') <> 'null'
    THEN
      RETURN jsonb_build_object('ok', false, 'error', 'stb_not_allowed');
    END IF;
  END IF;

  SELECT id, jornada_id, ronda, estado, score_pareja1, score_pareja2, set_scores
    INTO v_partido
    FROM public.liga_partidos
    WHERE id = p_partido_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT l.organizador_id INTO v_organizador
  FROM public.liga_jornadas j
  JOIN public.ligas l ON l.id = j.liga_id
  WHERE j.id = v_partido.jornada_id;

  IF v_organizador IS NULL OR v_organizador IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Sin permiso sobre este partido';
  END IF;

  IF v_partido.estado = 'completed'
     AND v_partido.score_pareja1 = v_score1
     AND v_partido.score_pareja2 = v_score2
     AND v_partido.set_scores IS NOT DISTINCT FROM p_set_scores
  THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'unchanged',
      'partido_id', p_partido_id,
      'jornada_id', v_partido.jornada_id
    );
  END IF;

  IF v_partido.estado = 'completed' AND NOT p_force THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'conflict',
      'score_pareja1', v_partido.score_pareja1,
      'score_pareja2', v_partido.score_pareja2,
      'set_scores', v_partido.set_scores
    );
  END IF;

  UPDATE public.liga_partidos
  SET score_pareja1 = v_score1,
      score_pareja2 = v_score2,
      set_scores = p_set_scores,
      estado = 'completed'
  WHERE id = p_partido_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'updated',
    'partido_id', p_partido_id,
    'jornada_id', v_partido.jornada_id,
    'score_pareja1', v_score1,
    'score_pareja2', v_score2
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_liga_partido_score_parejas_fijas_playoffs(uuid, integer, integer, jsonb, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_liga_partido_score_parejas_fijas_playoffs(uuid, integer, integer, jsonb, boolean)
  TO authenticated;

COMMENT ON FUNCTION public.update_liga_partido_score_parejas_fijas_playoffs(uuid, integer, integer, jsonb, boolean) IS
  'parejas_fijas_playoffs: guarda marcador recalculando games totales desde sets (no sets ganados). WO 6-0. Empate totales exige STB.';
