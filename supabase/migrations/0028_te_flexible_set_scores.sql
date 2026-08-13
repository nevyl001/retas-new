-- ══════════════════════════════════════════════════════════════════════════════
-- Torneo Express: marcadores flexibles (a 6, a 8, por tiempo, empates)
-- 2026-08-13
--
-- Reemplaza la validación estricta de pádel (6-0…6-4 / 7-5 / 7-6) de
-- 0020_strict_padel_set_validation.sql. En grupos se admite cualquier marcador
-- 0–99 y empate (ganador_id NULL). En eliminatoria el cliente sigue exigiendo
-- ganador; el trigger solo valida rango numérico.
-- ══════════════════════════════════════════════════════════════════════════════

-- Rango flexible: enteros 0–99 (incluye empates).
CREATE OR REPLACE FUNCTION public._is_legal_padel_set(
  p_local integer,
  p_visitante integer
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    p_local IS NOT NULL
    AND p_visitante IS NOT NULL
    AND p_local >= 0
    AND p_visitante >= 0
    AND p_local <= 99
    AND p_visitante <= 99;
$$;

-- Misma regla flexible (se conserva el nombre por compatibilidad).
CREATE OR REPLACE FUNCTION public._is_legal_padel_super_tie_break(
  p_local integer,
  p_visitante integer
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT public._is_legal_padel_set(p_local, p_visitante);
$$;

CREATE OR REPLACE FUNCTION public._are_legal_padel_sets(p_sets jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_set jsonb;
BEGIN
  IF p_sets IS NULL OR jsonb_typeof(p_sets) = 'null' THEN
    RETURN true;
  END IF;
  IF jsonb_typeof(p_sets) <> 'array' THEN
    RETURN false;
  END IF;
  IF jsonb_array_length(p_sets) = 0 THEN
    RETURN true;
  END IF;
  IF jsonb_array_length(p_sets) > 3 THEN
    RETURN false;
  END IF;

  FOR v_set IN SELECT * FROM jsonb_array_elements(p_sets)
  LOOP
    IF jsonb_typeof(v_set) <> 'object' THEN
      RETURN false;
    END IF;
    IF jsonb_typeof(v_set->'local') <> 'number'
       OR jsonb_typeof(v_set->'visitante') <> 'number' THEN
      RETURN false;
    END IF;
    IF NOT public._is_legal_padel_set(
      (v_set->>'local')::integer,
      (v_set->>'visitante')::integer
    ) THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;

-- RPC de grupos: acepta empate (p_ganador_side NULL o 'empate').
CREATE OR REPLACE FUNCTION public.apply_torneo_express_grupo_resultado(
  p_partido_id uuid,
  p_puntos_local integer,
  p_puntos_visitante integer,
  p_ganador_side text,
  p_sets_resultado jsonb,
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
  v_grupo record;
  v_torneo record;
  v_ganador_id uuid;
  v_tiene_sets boolean;
  v_side text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  v_side := NULLIF(trim(lower(coalesce(p_ganador_side, ''))), '');
  IF v_side IS NOT NULL AND v_side NOT IN ('local', 'visitante', 'empate') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_score');
  END IF;
  IF v_side = 'empate' THEN
    v_side := NULL;
  END IF;

  IF p_puntos_local IS NULL OR p_puntos_visitante IS NULL
     OR p_puntos_local < 0 OR p_puntos_visitante < 0
     OR p_puntos_local > 99 OR p_puntos_visitante > 99 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_score');
  END IF;

  v_tiene_sets := p_sets_resultado IS NOT NULL
    AND jsonb_typeof(p_sets_resultado) = 'array'
    AND jsonb_array_length(p_sets_resultado) > 0;

  IF v_tiene_sets THEN
    IF NOT public._are_legal_padel_sets(p_sets_resultado) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_score');
    END IF;
  ELSIF NOT public._is_legal_padel_set(p_puntos_local, p_puntos_visitante) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_score');
  END IF;

  SELECT id, grupo_id, pareja_local_id, pareja_visitante_id, estado,
         puntos_local, puntos_visitante, ganador_id, sets_resultado
    INTO v_partido
    FROM public.torneo_express_partidos
    WHERE id = p_partido_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT id, torneo_id INTO v_grupo
  FROM public.torneo_express_grupos
  WHERE id = v_partido.grupo_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT id, organizador_id, fase_torneo, estado INTO v_torneo
  FROM public.torneo_express
  WHERE id = v_grupo.torneo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_torneo.organizador_id IS NULL OR v_torneo.organizador_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Sin permiso sobre este torneo';
  END IF;

  IF v_torneo.fase_torneo = 'cerrado' OR v_torneo.estado = 'finalizado' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'torneo_cerrado');
  END IF;

  IF v_side IS NULL THEN
    v_ganador_id := NULL;
  ELSIF v_side = 'local' THEN
    v_ganador_id := v_partido.pareja_local_id;
  ELSE
    v_ganador_id := v_partido.pareja_visitante_id;
  END IF;

  IF v_side IS NOT NULL AND v_ganador_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_score');
  END IF;

  IF v_partido.estado = 'jugado'
     AND v_partido.puntos_local = p_puntos_local
     AND v_partido.puntos_visitante = p_puntos_visitante
     AND v_partido.ganador_id IS NOT DISTINCT FROM v_ganador_id
     AND v_partido.sets_resultado IS NOT DISTINCT FROM p_sets_resultado
  THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'unchanged',
      'partido_id', p_partido_id,
      'grupo_id', v_partido.grupo_id,
      'torneo_id', v_grupo.torneo_id
    );
  END IF;

  IF v_partido.estado = 'jugado' AND NOT p_force THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'conflict',
      'puntos_local', v_partido.puntos_local,
      'puntos_visitante', v_partido.puntos_visitante,
      'sets_resultado', v_partido.sets_resultado
    );
  END IF;

  UPDATE public.torneo_express_partidos
  SET puntos_local = p_puntos_local,
      puntos_visitante = p_puntos_visitante,
      ganador_id = v_ganador_id,
      estado = 'jugado',
      sets_resultado = p_sets_resultado
  WHERE id = p_partido_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'updated',
    'partido_id', p_partido_id,
    'grupo_id', v_partido.grupo_id,
    'torneo_id', v_grupo.torneo_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_torneo_express_grupo_resultado(uuid, integer, integer, text, jsonb, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_torneo_express_grupo_resultado(uuid, integer, integer, text, jsonb, boolean)
  TO authenticated;

DO $$
BEGIN
  IF NOT public._is_legal_padel_set(8, 6) THEN
    RAISE EXCEPTION 'Fix incompleto: 8-6 debe ser legal';
  END IF;
  IF NOT public._is_legal_padel_set(5, 3) THEN
    RAISE EXCEPTION 'Fix incompleto: 5-3 debe ser legal';
  END IF;
  IF NOT public._is_legal_padel_set(4, 4) THEN
    RAISE EXCEPTION 'Fix incompleto: empate 4-4 debe ser legal';
  END IF;
  IF public._is_legal_padel_set(100, 0) OR public._is_legal_padel_set(-1, 3) THEN
    RAISE EXCEPTION 'Fix incompleto: fuera de rango aceptado';
  END IF;
  IF NOT public._are_legal_padel_sets('[{"local":8,"visitante":6}]'::jsonb) THEN
    RAISE EXCEPTION 'Fix incompleto: _are_legal_padel_sets rechazó 8-6';
  END IF;
END;
$$;
