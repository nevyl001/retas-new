-- Flex genera y confirma una ronda a la vez.
-- No reescribe el calendario completo ni toca el ledger global.

CREATE OR REPLACE FUNCTION public.flex_guardar_ronda(
  p_jornada_id uuid,
  p_ronda integer,
  p_seed bigint,
  p_partidos jsonb,
  p_calidad jsonb,
  p_advertencia text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_liga uuid;
  v_estado text;
  v_row jsonb;
  v_ronda int;
  v_cancha int;
  v_ids uuid[];
  v_p1 uuid;
  v_p2 uuid;
  v_n int;
  v_objetivo int;
  v_max int;
  v_cubiertos int;
  v_partidos_ronda int;
BEGIN
  SELECT j.liga_id, j.estado INTO v_liga, v_estado
  FROM public.liga_jornadas j
  WHERE j.id = p_jornada_id
  FOR UPDATE;

  IF v_liga IS NULL OR NOT public.flex_league_can_write(v_liga) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin permiso para esta jornada.');
  END IF;
  IF v_estado = 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La jornada ya está cerrada.');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('flex-jornada'), hashtext(p_jornada_id::text));

  SELECT COUNT(*) INTO v_n
  FROM public.liga_jornada_participantes
  WHERE jornada_id = p_jornada_id;
  IF v_n NOT IN (12, 16) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La jornada oficial se juega con 12 o 16 jugadores.');
  END IF;

  SELECT rondas INTO v_objetivo
  FROM public.liga_jornada_flex
  WHERE jornada_id = p_jornada_id;
  SELECT COALESCE(MAX(ronda), 0) INTO v_max
  FROM public.liga_partidos
  WHERE jornada_id = p_jornada_id;

  IF p_ronda > COALESCE(v_objetivo, 0) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esa ronda supera el objetivo configurado.');
  END IF;
  IF jsonb_typeof(p_partidos) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_partidos) IS DISTINCT FROM (v_n / 4) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La ronda no trae los partidos de todas las canchas.');
  END IF;
  IF p_ronda > 1 AND NOT EXISTS (
    SELECT 1 FROM public.liga_flex_auditoria a
    WHERE a.jornada_id = p_jornada_id
      AND a.accion = 'confirmar_ronda'
      AND (a.detalle->>'ronda')::int = p_ronda - 1
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Confirma la ronda anterior antes de generar la siguiente.');
  END IF;
  IF p_ronda = v_max AND EXISTS (
    SELECT 1 FROM public.liga_partidos
    WHERE jornada_id = p_jornada_id
      AND ronda = p_ronda
      AND (score_pareja1 IS NOT NULL OR score_pareja2 IS NOT NULL)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esa ronda ya tiene marcadores.');
  END IF;
  IF p_ronda = v_max THEN
    DELETE FROM public.liga_partidos
    WHERE jornada_id = p_jornada_id AND ronda = p_ronda;
    DELETE FROM public.liga_jornada_parejas par
    WHERE par.jornada_id = p_jornada_id
      AND NOT EXISTS (
        SELECT 1 FROM public.liga_partidos p
        WHERE p.jornada_id = p_jornada_id
          AND (p.pareja1_id = par.id OR p.pareja2_id = par.id)
      );
  ELSIF p_ronda IS DISTINCT FROM v_max + 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo se puede generar la siguiente ronda.');
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_partidos)
  LOOP
    v_ronda := (v_row->>'ronda')::int;
    v_cancha := (v_row->>'cancha')::int;
    IF v_ronda IS DISTINCT FROM p_ronda THEN
      RAISE EXCEPTION 'El partido no pertenece a la ronda %', p_ronda;
    END IF;
    v_ids := ARRAY[
      (v_row->>'a1')::uuid,
      (v_row->>'a2')::uuid,
      (v_row->>'b1')::uuid,
      (v_row->>'b2')::uuid
    ];
    IF (SELECT COUNT(DISTINCT x) FROM unnest(v_ids) x) <> 4 THEN
      RAISE EXCEPTION 'Partido inválido en la ronda %', p_ronda;
    END IF;
    IF v_cancha < 1 OR v_cancha > (v_n / 4) THEN
      RAISE EXCEPTION 'La cancha % no corresponde a esta jornada.', v_cancha;
    END IF;
    IF EXISTS (
      SELECT 1 FROM unnest(v_ids) x
      WHERE NOT EXISTS (
        SELECT 1 FROM public.liga_jornada_participantes p
        WHERE p.jornada_id = p_jornada_id AND p.jugador_id = x
      )
    ) THEN
      RAISE EXCEPTION 'Un partido incluye a alguien que no está en la jornada.';
    END IF;

    INSERT INTO public.liga_jornada_parejas (jornada_id, jugador1_id, jugador2_id)
    VALUES (p_jornada_id, v_ids[1], v_ids[2])
    RETURNING id INTO v_p1;
    INSERT INTO public.liga_jornada_parejas (jornada_id, jugador1_id, jugador2_id)
    VALUES (p_jornada_id, v_ids[3], v_ids[4])
    RETURNING id INTO v_p2;
    INSERT INTO public.liga_partidos (
      jornada_id, pareja1_id, pareja2_id, cancha, ronda, estado
    ) VALUES (
      p_jornada_id, v_p1, v_p2, v_cancha, p_ronda, 'upcoming'
    );
  END LOOP;

  SELECT COUNT(*) INTO v_partidos_ronda
  FROM public.liga_partidos
  WHERE jornada_id = p_jornada_id AND ronda = p_ronda;
  SELECT COUNT(*) INTO v_cubiertos
  FROM (
    SELECT par.jugador1_id AS jugador_id
    FROM public.liga_partidos p
    JOIN public.liga_jornada_parejas par ON par.id IN (p.pareja1_id, p.pareja2_id)
    WHERE p.jornada_id = p_jornada_id AND p.ronda = p_ronda
    UNION
    SELECT par.jugador2_id
    FROM public.liga_partidos p
    JOIN public.liga_jornada_parejas par ON par.id IN (p.pareja1_id, p.pareja2_id)
    WHERE p.jornada_id = p_jornada_id AND p.ronda = p_ronda
  ) jugadores;
  IF v_partidos_ronda IS DISTINCT FROM (v_n / 4) OR v_cubiertos IS DISTINCT FROM v_n THEN
    RAISE EXCEPTION 'La ronda % no tiene a todos los jugadores exactamente una vez.', p_ronda;
  END IF;

  UPDATE public.liga_jornada_flex
     SET seed = p_seed,
         programacion_estado = 'confirmada',
         calidad = p_calidad,
         advertencia = NULLIF(btrim(COALESCE(p_advertencia, '')), ''),
         canchas = v_n / 4,
         updated_at = now()
   WHERE jornada_id = p_jornada_id;

  INSERT INTO public.liga_flex_auditoria (liga_id, jornada_id, actor_id, accion, detalle)
  VALUES (
    v_liga, p_jornada_id, auth.uid(), 'guardar_ronda',
    jsonb_build_object('ronda', p_ronda, 'seed', p_seed, 'algoritmo', p_calidad->>'algorithmVersion')
  );

  RETURN jsonb_build_object('ok', true, 'ronda', p_ronda);
END;
$$;

CREATE OR REPLACE FUNCTION public.flex_confirmar_ronda(
  p_jornada_id uuid,
  p_ronda integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_liga uuid;
  v_estado text;
  v_partidos int;
  v_listos int;
BEGIN
  SELECT j.liga_id, j.estado INTO v_liga, v_estado
  FROM public.liga_jornadas j
  WHERE j.id = p_jornada_id
  FOR UPDATE;
  IF v_liga IS NULL OR NOT public.flex_league_can_write(v_liga) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin permiso para esta jornada.');
  END IF;
  IF v_estado = 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La jornada ya está cerrada.');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('flex-jornada'), hashtext(p_jornada_id::text));

  SELECT COUNT(*), COUNT(*) FILTER (
    WHERE score_pareja1 IS NOT NULL AND score_pareja2 IS NOT NULL
  )
  INTO v_partidos, v_listos
  FROM public.liga_partidos
  WHERE jornada_id = p_jornada_id AND ronda = p_ronda;

  IF v_partidos < 1 OR v_listos IS DISTINCT FROM v_partidos THEN
    DELETE FROM public.liga_flex_auditoria
    WHERE jornada_id = p_jornada_id
      AND accion = 'confirmar_ronda'
      AND (detalle->>'ronda')::int = p_ronda;
    RETURN jsonb_build_object('ok', false, 'error', 'Faltan marcadores para confirmar la ronda.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.liga_flex_auditoria a
    WHERE a.jornada_id = p_jornada_id
      AND a.accion = 'confirmar_ronda'
      AND (a.detalle->>'ronda')::int = p_ronda
  ) THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;

  INSERT INTO public.liga_flex_auditoria (liga_id, jornada_id, actor_id, accion, detalle)
  VALUES (
    v_liga, p_jornada_id, auth.uid(), 'confirmar_ronda',
    jsonb_build_object('ronda', p_ronda, 'partidos', v_partidos)
  );

  RETURN jsonb_build_object('ok', true, 'ronda', p_ronda);
END;
$$;

CREATE OR REPLACE FUNCTION public.flex_ajustar_rondas(
  p_jornada_id uuid,
  p_rondas integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_liga uuid;
  v_estado text;
  v_piso int;
  v_borradas int;
BEGIN
  SELECT j.liga_id, j.estado INTO v_liga, v_estado
  FROM public.liga_jornadas j
  WHERE j.id = p_jornada_id
  FOR UPDATE;
  IF v_liga IS NULL OR NOT public.flex_league_can_write(v_liga) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin permiso para esta jornada.');
  END IF;
  IF v_estado = 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No se cambia el objetivo de una jornada cerrada.');
  END IF;
  IF p_rondas < 1 OR p_rondas > 24 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Las rondas deben estar entre 1 y 24.');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('flex-jornada'), hashtext(p_jornada_id::text));

  SELECT COALESCE(MAX(ronda), 0) INTO v_piso
  FROM public.liga_partidos
  WHERE jornada_id = p_jornada_id
    AND (score_pareja1 IS NOT NULL OR score_pareja2 IS NOT NULL);

  IF p_rondas < v_piso THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No se puede bajar de las rondas que ya tienen marcador.'
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.liga_partidos
    WHERE jornada_id = p_jornada_id
      AND ronda > p_rondas
      AND (score_pareja1 IS NOT NULL OR score_pareja2 IS NOT NULL)
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Hay una ronda posterior con marcadores. No se elimina en silencio.'
    );
  END IF;

  DELETE FROM public.liga_partidos
  WHERE jornada_id = p_jornada_id
    AND ronda > p_rondas
    AND score_pareja1 IS NULL
    AND score_pareja2 IS NULL;
  GET DIAGNOSTICS v_borradas = ROW_COUNT;

  DELETE FROM public.liga_jornada_parejas par
  WHERE par.jornada_id = p_jornada_id
    AND NOT EXISTS (
      SELECT 1 FROM public.liga_partidos p
      WHERE p.jornada_id = p_jornada_id
        AND (p.pareja1_id = par.id OR p.pareja2_id = par.id)
    );

  DELETE FROM public.liga_flex_auditoria
  WHERE jornada_id = p_jornada_id
    AND accion = 'confirmar_ronda'
    AND (detalle->>'ronda')::int > p_rondas;

  UPDATE public.liga_jornada_flex
     SET rondas = p_rondas,
         programacion_estado = CASE
           WHEN EXISTS (SELECT 1 FROM public.liga_partidos WHERE jornada_id = p_jornada_id)
             THEN programacion_estado
           ELSE 'vacia'
         END,
         updated_at = now()
   WHERE jornada_id = p_jornada_id;

  INSERT INTO public.liga_flex_auditoria (liga_id, jornada_id, actor_id, accion, detalle)
  VALUES (
    v_liga, p_jornada_id, auth.uid(), 'ajustar_rondas',
    jsonb_build_object('rondas', p_rondas, 'partidos_retirados', v_borradas)
  );

  RETURN jsonb_build_object('ok', true, 'rondas', p_rondas, 'partidos_retirados', v_borradas);
END;
$$;

CREATE OR REPLACE FUNCTION public.flex_reiniciar_jornada(
  p_jornada_id uuid,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_liga uuid;
  v_estado text;
  v_liga_estado text;
  v_partidos int;
  v_con_resultado int;
  v_posiciones int;
  v_copia jsonb;
BEGIN
  SELECT j.liga_id, j.estado, l.estado
    INTO v_liga, v_estado, v_liga_estado
  FROM public.liga_jornadas j
  JOIN public.ligas l ON l.id = j.liga_id
  WHERE j.id = p_jornada_id
  FOR UPDATE OF j;

  IF v_liga IS NULL OR NOT public.flex_league_can_write(v_liga) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin permiso para reiniciar esta jornada.');
  END IF;
  IF v_liga_estado = 'completed' OR EXISTS (
    SELECT 1 FROM public.liga_flex_honores h
    WHERE h.liga_id = v_liga AND h.jornada_final_id = p_jornada_id
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'La temporada ya tiene campeón. Reábrela antes de reiniciar esta jornada.'
    );
  END IF;
  IF length(btrim(COALESCE(p_motivo, ''))) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Falta el motivo del reinicio.');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('flex-jornada'), hashtext(p_jornada_id::text));

  SELECT COUNT(*), COUNT(*) FILTER (
    WHERE score_pareja1 IS NOT NULL OR score_pareja2 IS NOT NULL
  )
  INTO v_partidos, v_con_resultado
  FROM public.liga_partidos
  WHERE jornada_id = p_jornada_id;

  SELECT COUNT(*) INTO v_posiciones
  FROM public.liga_flex_posiciones
  WHERE jornada_id = p_jornada_id;

  SELECT jsonb_build_object(
    'estado', v_estado,
    'partidos', v_partidos,
    'con_resultado', v_con_resultado,
    'posiciones', v_posiciones,
    'rondas', (
      SELECT COALESCE(jsonb_agg(DISTINCT ronda), '[]'::jsonb)
      FROM public.liga_partidos WHERE jornada_id = p_jornada_id
    ),
    'marcadores', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'ronda', p.ronda,
        'cancha', p.cancha,
        'score_a', p.score_pareja1,
        'score_b', p.score_pareja2,
        'a1', pa.jugador1_id,
        'a2', pa.jugador2_id,
        'b1', pb.jugador1_id,
        'b2', pb.jugador2_id
      ))
      FROM public.liga_partidos p
      JOIN public.liga_jornada_parejas pa ON pa.id = p.pareja1_id
      JOIN public.liga_jornada_parejas pb ON pb.id = p.pareja2_id
      WHERE p.jornada_id = p_jornada_id
    ), '[]'::jsonb),
    'puntos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'jugador_id', jugador_id,
        'posicion', posicion,
        'puntos', puntos
      ))
      FROM public.liga_flex_posiciones
      WHERE jornada_id = p_jornada_id
    ), '[]'::jsonb)
  ) INTO v_copia;

  DELETE FROM public.liga_flex_posiciones WHERE jornada_id = p_jornada_id;
  DELETE FROM public.liga_partidos WHERE jornada_id = p_jornada_id;
  DELETE FROM public.liga_jornada_parejas WHERE jornada_id = p_jornada_id;
  DELETE FROM public.liga_flex_auditoria
  WHERE jornada_id = p_jornada_id
    AND accion = 'confirmar_ronda';

  UPDATE public.liga_jornadas
     SET estado = 'upcoming'
   WHERE id = p_jornada_id;

  UPDATE public.liga_jornada_flex
     SET programacion_estado = 'vacia',
         seed = NULL,
         calidad = NULL,
         advertencia = NULL,
         updated_at = now()
   WHERE jornada_id = p_jornada_id;

  INSERT INTO public.liga_flex_auditoria (liga_id, jornada_id, actor_id, accion, detalle)
  VALUES (
    v_liga, p_jornada_id, auth.uid(), 'reiniciar_jornada',
    jsonb_build_object('motivo', left(btrim(p_motivo), 240), 'anterior', v_copia)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'partidos', v_partidos,
    'con_resultado', v_con_resultado,
    'posiciones', v_posiciones
  );
END;
$$;

REVOKE ALL ON FUNCTION public.flex_guardar_ronda(uuid, integer, bigint, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.flex_confirmar_ronda(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.flex_ajustar_rondas(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.flex_reiniciar_jornada(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flex_guardar_ronda(uuid, integer, bigint, jsonb, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flex_confirmar_ronda(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flex_ajustar_rondas(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flex_reiniciar_jornada(uuid, text) TO authenticated;
