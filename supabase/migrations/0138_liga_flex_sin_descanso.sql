-- Flex League oficial: 12 o 16 jugadores, todos juegan cada ronda.
-- No modifica datos de 0137. Solo refuerza la confirmación de la programación.

CREATE OR REPLACE FUNCTION public.flex_guardar_programacion(
  p_jornada_id uuid,
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
  v_row jsonb;
  v_ronda int;
  v_cancha int;
  v_ids uuid[];
  v_p1 uuid;
  v_p2 uuid;
  v_n int;
  v_ronda_check int;
  v_cubiertos int;
  v_partidos_ronda int;
BEGIN
  SELECT j.liga_id INTO v_liga FROM public.liga_jornadas j WHERE j.id = p_jornada_id;
  IF v_liga IS NULL OR NOT public.flex_league_can_write(v_liga) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin permiso para esta jornada.');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.liga_partidos
    WHERE jornada_id = p_jornada_id
      AND (score_pareja1 IS NOT NULL OR score_pareja2 IS NOT NULL)
  ) OR EXISTS (
    SELECT 1 FROM public.liga_jornadas
    WHERE id = p_jornada_id AND estado <> 'upcoming'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La jornada ya tiene resultados o empezó. No se reescribe el calendario.');
  END IF;
  IF jsonb_typeof(p_partidos) IS DISTINCT FROM 'array' OR jsonb_array_length(p_partidos) < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No hay partidos para confirmar.');
  END IF;

  SELECT COUNT(*) INTO v_n
  FROM public.liga_jornada_participantes
  WHERE jornada_id = p_jornada_id;
  IF v_n NOT IN (12, 16) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'La jornada oficial se juega con 12 o 16 jugadores. Ajusta la lista; no se retira a nadie.'
    );
  END IF;

  DELETE FROM public.liga_partidos WHERE jornada_id = p_jornada_id;
  DELETE FROM public.liga_jornada_parejas WHERE jornada_id = p_jornada_id;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_partidos)
  LOOP
    v_ronda := (v_row->>'ronda')::int;
    v_cancha := (v_row->>'cancha')::int;
    v_ids := ARRAY[
      (v_row->>'a1')::uuid,
      (v_row->>'a2')::uuid,
      (v_row->>'b1')::uuid,
      (v_row->>'b2')::uuid
    ];
    IF v_ids[1] IS NULL OR v_ids[2] IS NULL OR v_ids[3] IS NULL OR v_ids[4] IS NULL
       OR (SELECT COUNT(DISTINCT x) FROM unnest(v_ids) x) <> 4 THEN
      RAISE EXCEPTION 'Partido inválido en la ronda %', v_ronda;
    END IF;
    IF v_cancha < 1 OR v_cancha > (v_n / 4) THEN
      RAISE EXCEPTION 'La cancha % no se usa: con % jugadores bastan % canchas.', v_cancha, v_n, v_n / 4;
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
      p_jornada_id, v_p1, v_p2, v_cancha, v_ronda, 'upcoming'
    );
  END LOOP;

  FOR v_ronda_check IN
    SELECT DISTINCT ronda FROM public.liga_partidos WHERE jornada_id = p_jornada_id
  LOOP
    SELECT COUNT(*) INTO v_partidos_ronda
    FROM public.liga_partidos
    WHERE jornada_id = p_jornada_id AND ronda = v_ronda_check;

    SELECT COUNT(*) INTO v_cubiertos
    FROM (
      SELECT par.jugador1_id AS jugador_id
      FROM public.liga_partidos p
      JOIN public.liga_jornada_parejas par ON par.id IN (p.pareja1_id, p.pareja2_id)
      WHERE p.jornada_id = p_jornada_id AND p.ronda = v_ronda_check
      UNION
      SELECT par.jugador2_id
      FROM public.liga_partidos p
      JOIN public.liga_jornada_parejas par ON par.id IN (p.pareja1_id, p.pareja2_id)
      WHERE p.jornada_id = p_jornada_id AND p.ronda = v_ronda_check
    ) jugadores;
    IF v_partidos_ronda IS DISTINCT FROM (v_n / 4) OR v_cubiertos IS DISTINCT FROM v_n THEN
      RAISE EXCEPTION 'La ronda % no tiene a todos los jugadores exactamente una vez.', v_ronda_check;
    END IF;
  END LOOP;

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
    v_liga,
    p_jornada_id,
    auth.uid(),
    'confirmar_programacion',
    jsonb_build_object('seed', p_seed, 'algoritmo', p_calidad->>'algorithmVersion', 'jugadores', v_n)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.flex_guardar_programacion(uuid, bigint, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flex_guardar_programacion(uuid, bigint, jsonb, jsonb, text) TO authenticated;
