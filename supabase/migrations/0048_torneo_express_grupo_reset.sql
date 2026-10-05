-- Reset atómico de un grupo de Torneo Express.
--
-- Orden de locks, el mismo que apply_torneo_express_grupo_resultado:
--   1. torneo_express          (te_lock_categoria_editable / FOR UPDATE)
--   2. torneo_express_grupos   (FOR UPDATE, una fila)
--   3. torneo_express_partidos (FOR UPDATE ORDER BY id)
--   4. pairs                   (solo al guardar marcador, ORDER BY id)
-- Finalizar fase bloquea únicamente torneo_express. No hay inversión
-- categoría → partido.
--
-- version en el grupo sube al resetear y al guardar un marcador nuevo.
-- Un reset con la versión que la pantalla cargó se rechaza si alguien
-- guardó un resultado o reseteó después. No sustituye al lock: el lock
-- serializa; la versión rechaza una confirmación vieja.
--
-- Carrera y ledger se publican al cerrar la categoría. te_lock_categoria_editable
-- ya niega el reset en ese estado. Esta migración no los toca.
--
-- _revert_rating_for_partido_ref vive en
-- supabase/fix-rank002-safe-delete-cascade-20260729.sql. No se reescribe.
-- Es idempotente: sin filas en rating_historial no cambia el rating.
-- Corre dentro de esta función, así que un error revierte rating y marcador juntos.
--
-- Rollback lógico:
--   DROP FUNCTION public.reset_torneo_express_grupo(uuid, integer);
--   DROP INDEX IF EXISTS public.torneo_express_partidos_grupo_matchup_uidx;
--   ALTER TABLE public.torneo_express_grupos DROP CONSTRAINT IF EXISTS torneo_express_grupos_version_positive;
--   ALTER TABLE public.torneo_express_grupos DROP COLUMN IF EXISTS version;
--   y volver a crear apply_torneo_express_grupo_resultado desde 0044.

ALTER TABLE public.torneo_express_grupos
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'torneo_express_grupos_version_positive'
  ) THEN
    ALTER TABLE public.torneo_express_grupos
      ADD CONSTRAINT torneo_express_grupos_version_positive
      CHECK (version >= 1);
  END IF;
END $$;

COMMENT ON COLUMN public.torneo_express_grupos.version IS
  'Versión administrativa del grupo. Sube al resetear y al guardar un marcador. No es un timestamp.';

-- Guardar marcador: mismo cuerpo que 0044, más el lock del grupo y version + 1
-- solo cuando el marcador realmente cambia. unchanged y conflict no suben versión.
CREATE OR REPLACE FUNCTION public.apply_torneo_express_grupo_resultado(
  p_partido_id uuid,
  p_puntos_local integer,
  p_puntos_visitante integer,
  p_ganador_side text,
  p_sets_resultado jsonb,
  p_force boolean DEFAULT false,
  p_expected_pairs jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_partido record;
  v_torneo record;
  v_grupo_torneo uuid;
  v_ganador_id uuid;
  v_tiene_sets boolean;
  v_side text;
  v_lock_torneo uuid;
  v_lock_grupo uuid;
  v_version_rows integer;
  v_after_local_p1 uuid;
  v_after_local_p2 uuid;
  v_after_local_virtual boolean;
  v_after_visit_p1 uuid;
  v_after_visit_p2 uuid;
  v_after_visit_virtual boolean;
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

  SELECT g.torneo_id, p.grupo_id
    INTO v_lock_torneo, v_lock_grupo
  FROM public.torneo_express_partidos p
  JOIN public.torneo_express_grupos g ON g.id = p.grupo_id
  WHERE p.id = p_partido_id;

  IF v_lock_torneo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  -- lock-order: torneo
  SELECT id, organizador_id, fase_torneo, estado
    INTO v_torneo
  FROM public.torneo_express
  WHERE id = v_lock_torneo
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

  -- lock-order: grupo
  PERFORM 1
  FROM public.torneo_express_grupos
  WHERE id = v_lock_grupo
  FOR UPDATE;

  -- lock-order: partido
  SELECT id, grupo_id, pareja_local_id, pareja_visitante_id, estado,
         puntos_local, puntos_visitante, ganador_id, sets_resultado
    INTO v_partido
  FROM public.torneo_express_partidos
  WHERE id = p_partido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT g.torneo_id INTO v_grupo_torneo
  FROM public.torneo_express_grupos g
  WHERE g.id = v_partido.grupo_id;

  IF v_grupo_torneo IS DISTINCT FROM v_torneo.id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  -- lock-order: pairs, siempre por id para no invertir el orden entre parejas.
  PERFORM 1
  FROM public.pairs
  WHERE id IN (v_partido.pareja_local_id, v_partido.pareja_visitante_id)
  ORDER BY id
  FOR UPDATE;

  SELECT player1_id, player2_id, is_virtual
    INTO v_after_local_p1, v_after_local_p2, v_after_local_virtual
  FROM public.te_pair_player_ids(v_partido.pareja_local_id);
  SELECT player1_id, player2_id, is_virtual
    INTO v_after_visit_p1, v_after_visit_p2, v_after_visit_virtual
  FROM public.te_pair_player_ids(v_partido.pareja_visitante_id);

  IF p_expected_pairs IS NULL
     OR jsonb_typeof(p_expected_pairs) <> 'object'
     OR jsonb_typeof(p_expected_pairs -> 'local') <> 'object'
     OR jsonb_typeof(p_expected_pairs -> 'visitante') <> 'object'
     OR NOT public.te_side_composition_matches(
       p_expected_pairs -> 'local',
       v_partido.pareja_local_id,
       v_after_local_p1,
       v_after_local_p2,
       v_after_local_virtual
     )
     OR NOT public.te_side_composition_matches(
       p_expected_pairs -> 'visitante',
       v_partido.pareja_visitante_id,
       v_after_visit_p1,
       v_after_visit_p2,
       v_after_visit_virtual
     ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PAIR_COMPOSITION_CHANGED');
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
      'torneo_id', v_torneo.id
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

  UPDATE public.torneo_express_grupos
  SET version = version + 1
  WHERE id = v_partido.grupo_id;
  GET DIAGNOSTICS v_version_rows = ROW_COUNT;
  IF v_version_rows <> 1 THEN
    RAISE EXCEPTION 'GROUP_VERSION_UPDATE_FAILED';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'updated',
    'partido_id', p_partido_id,
    'grupo_id', v_partido.grupo_id,
    'torneo_id', v_torneo.id
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.reset_torneo_express_grupo(
  p_grupo_id uuid,
  p_expected_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_torneo_id uuid;
  v_version integer;
  v_guard jsonb;
  v_partido record;
  v_ref text;
  v_rating_rows integer;
  v_matches_reset integer := 0;
  v_ratings_reverted integer := 0;
BEGIN
  IF p_grupo_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'GROUP_NOT_FOUND');
  END IF;

  SELECT torneo_id
    INTO v_torneo_id
  FROM public.torneo_express_grupos
  WHERE id = p_grupo_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'GROUP_NOT_FOUND');
  END IF;

  -- lock-order: torneo. Ownership, fase y eliminatoria viven en este helper.
  v_guard := public.te_lock_categoria_editable(v_torneo_id);
  IF NOT (v_guard ->> 'ok')::boolean THEN
    IF (v_guard ->> 'error') IN ('TOURNAMENT_NOT_EDITABLE', 'ELIMINATORIA_EXISTS') THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'GROUP_NOT_EDITABLE',
        'reason', v_guard ->> 'error'
      );
    END IF;
    RETURN v_guard;
  END IF;

  -- lock-order: grupo
  SELECT version
    INTO v_version
  FROM public.torneo_express_grupos
  WHERE id = p_grupo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'GROUP_NOT_FOUND');
  END IF;

  IF p_expected_version IS NULL OR v_version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'STALE_GROUP_VERSION',
      'version', v_version
    );
  END IF;

  -- lock-order: partidos, siempre por id.
  PERFORM 1
  FROM public.torneo_express_partidos
  WHERE grupo_id = p_grupo_id
  ORDER BY id
  FOR UPDATE;

  FOR v_partido IN
    SELECT id, estado, puntos_local, puntos_visitante, ganador_id, sets_resultado
    FROM public.torneo_express_partidos
    WHERE grupo_id = p_grupo_id
    ORDER BY id
  LOOP
    v_ref := 'te-grupo:' || v_partido.id::text;
    SELECT count(*)
      INTO v_rating_rows
    FROM public.rating_historial
    WHERE partido_ref = v_ref;

    PERFORM public._revert_rating_for_partido_ref(v_ref);
    IF v_rating_rows > 0 THEN
      v_ratings_reverted := v_ratings_reverted + 1;
    END IF;

    IF v_partido.estado IS DISTINCT FROM 'pendiente'
       OR v_partido.puntos_local IS NOT NULL
       OR v_partido.puntos_visitante IS NOT NULL
       OR v_partido.ganador_id IS NOT NULL
       OR v_partido.sets_resultado IS NOT NULL THEN
      UPDATE public.torneo_express_partidos
      SET puntos_local = NULL,
          puntos_visitante = NULL,
          sets_resultado = NULL,
          ganador_id = NULL,
          estado = 'pendiente'
      WHERE id = v_partido.id;
      v_matches_reset := v_matches_reset + 1;
    END IF;
  END LOOP;

  UPDATE public.torneo_express_grupos
  SET version = version + 1
  WHERE id = p_grupo_id;

  RETURN jsonb_build_object(
    'ok', true,
    'group_id', p_grupo_id,
    'matches_reset', v_matches_reset,
    'ratings_reverted', v_ratings_reverted,
    'version', v_version + 1
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.reset_torneo_express_grupo(uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_torneo_express_grupo(uuid, integer)
  TO authenticated;

-- No se borran filas. Si ya hay A-B y B-A en el mismo grupo, la migración aborta.
DO $$
DECLARE
  v_dup integer;
BEGIN
  SELECT count(*)
    INTO v_dup
  FROM (
    SELECT grupo_id, public.te_matchup_key(pareja_local_id, pareja_visitante_id) AS matchup
    FROM public.torneo_express_partidos
    WHERE pareja_local_id IS NOT NULL
      AND pareja_visitante_id IS NOT NULL
    GROUP BY grupo_id, public.te_matchup_key(pareja_local_id, pareja_visitante_id)
    HAVING count(*) > 1
  ) duplicated;

  IF v_dup > 0 THEN
    RAISE EXCEPTION
      'Hay % enfrentamientos duplicados en torneo_express_partidos. No se borró ninguno.',
      v_dup;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS torneo_express_partidos_grupo_matchup_uidx
  ON public.torneo_express_partidos (
    grupo_id,
    public.te_matchup_key(pareja_local_id, pareja_visitante_id)
  )
  WHERE pareja_local_id IS NOT NULL
    AND pareja_visitante_id IS NOT NULL;

COMMENT ON INDEX public.torneo_express_partidos_grupo_matchup_uidx IS
  'Un enfrentamiento por grupo. A-B y B-A comparten te_matchup_key. No aplica a eliminatoria.';
