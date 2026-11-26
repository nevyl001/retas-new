-- Cierra la jornada al confirmar la última ronda programada y, si la
-- temporada ya está completa, intenta el campeón con flex_cerrar_liga.
-- No cambia el criterio de puntos. Un empate no cierra: devuelve
-- needs_resolution y la jornada sigue abierta hasta que se ordene.

CREATE OR REPLACE FUNCTION public.flex_adjuntar_temporada(p_liga uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v jsonb;
BEGIN
  v := public.flex_cerrar_liga(p_liga, NULL);
  IF COALESCE((v->>'needs_resolution')::boolean, false) THEN
    RETURN jsonb_build_object(
      'season_needs_resolution', true,
      'season_error', v->>'error',
      'tied', v->'tied'
    );
  END IF;
  IF COALESCE((v->>'ok')::boolean, false) THEN
    RETURN jsonb_build_object(
      'season_closed', true,
      'season_idempotent', COALESCE((v->>'idempotent')::boolean, false),
      'campeon_id', v->'campeon_id'
    );
  END IF;
  RETURN jsonb_build_object('season_pending', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.flex_aplicar_jornada(
  p_jornada_id uuid,
  p_filas jsonb,
  p_nota text DEFAULT NULL
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
  v_orden uuid[];
  v_rank jsonb;
  v_extra jsonb;
BEGIN
  SELECT j.liga_id, j.estado, l.estado
    INTO v_liga, v_estado, v_liga_estado
  FROM public.liga_jornadas j
  JOIN public.ligas l ON l.id = j.liga_id
  WHERE j.id = p_jornada_id
  FOR UPDATE OF j;

  IF v_liga IS NULL OR NOT public.flex_league_can_write(v_liga) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin permiso para cerrar esta jornada.');
  END IF;
  IF v_liga_estado = 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La temporada está cerrada. Reábrela antes de corregir.');
  END IF;
  IF v_estado = 'completed' AND EXISTS (
    SELECT 1 FROM public.liga_flex_posiciones WHERE jornada_id = p_jornada_id
  ) THEN
    v_extra := public.flex_adjuntar_temporada(v_liga);
    RETURN jsonb_build_object('ok', true, 'idempotent', true) || v_extra;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('flex-jornada'), hashtext(p_jornada_id::text));
  DROP TABLE IF EXISTS pg_temp.flex_score_override;

  SELECT COALESCE(array_agg((value->>'jugador_id')::uuid), ARRAY[]::uuid[])
    INTO v_orden
  FROM jsonb_array_elements(COALESCE(p_filas, '[]'::jsonb));

  v_rank := public.flex_rank_scores(p_jornada_id, NULLIF(v_orden, ARRAY[]::uuid[]));
  IF COALESCE((v_rank->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_rank;
  END IF;

  PERFORM public.flex_escribir_posiciones(p_jornada_id, v_rank->'rows');

  INSERT INTO public.liga_flex_auditoria (liga_id, jornada_id, actor_id, accion, detalle)
  VALUES (
    v_liga, p_jornada_id, auth.uid(), 'aplicar_jornada',
    jsonb_build_object('nota', NULLIF(btrim(COALESCE(p_nota, '')), ''), 'origen', 'cierre_automatico')
  );

  v_extra := public.flex_adjuntar_temporada(v_liga);
  RETURN jsonb_build_object('ok', true, 'idempotent', false, 'closed', true) || v_extra;
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
  v_target int;
  v_confirmed int;
  v_scored boolean;
  v_apply jsonb;
BEGIN
  SELECT j.liga_id, j.estado INTO v_liga, v_estado
  FROM public.liga_jornadas j
  WHERE j.id = p_jornada_id
  FOR UPDATE;
  IF v_liga IS NULL OR NOT public.flex_league_can_write(v_liga) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin permiso para esta jornada.');
  END IF;
  IF v_estado = 'completed' THEN
    v_apply := public.flex_aplicar_jornada(p_jornada_id, '[]'::jsonb, NULL);
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'closed', true,
      'season_needs_resolution', COALESCE((v_apply->>'season_needs_resolution')::boolean, false),
      'season_error', v_apply->>'season_error',
      'tied', COALESCE(v_apply->'tied', '[]'::jsonb),
      'season_closed', COALESCE((v_apply->>'season_closed')::boolean, false)
    );
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

  IF NOT EXISTS (
    SELECT 1 FROM public.liga_flex_auditoria a
    WHERE a.jornada_id = p_jornada_id
      AND a.accion = 'confirmar_ronda'
      AND (a.detalle->>'ronda')::int = p_ronda
  ) THEN
    INSERT INTO public.liga_flex_auditoria (liga_id, jornada_id, actor_id, accion, detalle)
    VALUES (
      v_liga, p_jornada_id, auth.uid(), 'confirmar_ronda',
      jsonb_build_object('ronda', p_ronda, 'partidos', v_partidos)
    );
  END IF;

  SELECT COALESCE(rondas, 0) INTO v_target
  FROM public.liga_jornada_flex
  WHERE jornada_id = p_jornada_id;

  SELECT COUNT(DISTINCT (detalle->>'ronda')::int) INTO v_confirmed
  FROM public.liga_flex_auditoria
  WHERE jornada_id = p_jornada_id
    AND accion = 'confirmar_ronda'
    AND (detalle->>'ronda')::int BETWEEN 1 AND v_target;

  SELECT COUNT(DISTINCT ronda) = v_target
     AND bool_and(score_pareja1 IS NOT NULL AND score_pareja2 IS NOT NULL)
    INTO v_scored
  FROM public.liga_partidos
  WHERE jornada_id = p_jornada_id
    AND ronda BETWEEN 1 AND v_target;

  IF v_target >= 1 AND v_confirmed = v_target AND COALESCE(v_scored, false) THEN
    v_apply := public.flex_aplicar_jornada(p_jornada_id, '[]'::jsonb, NULL);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'ronda', p_ronda,
    'closed', COALESCE((v_apply->>'ok')::boolean, false)
      AND NOT COALESCE((v_apply->>'needs_resolution')::boolean, false),
    'needs_resolution', COALESCE((v_apply->>'needs_resolution')::boolean, false),
    'error', v_apply->>'error',
    'ties', v_apply->'ties',
    'season_needs_resolution', COALESCE((v_apply->>'season_needs_resolution')::boolean, false),
    'season_error', v_apply->>'season_error',
    'tied', COALESCE(v_apply->'tied', '[]'::jsonb),
    'season_closed', COALESCE((v_apply->>'season_closed')::boolean, false)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.flex_adjuntar_temporada(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.flex_aplicar_jornada(uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.flex_confirmar_ronda(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flex_aplicar_jornada(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flex_confirmar_ronda(uuid, integer) TO authenticated;

-- Una corrección de jornada finalizada vuelve a intentar el campeón
-- con las jornadas programadas. El podio no cambia de criterio.

CREATE OR REPLACE FUNCTION public.flex_corregir_marcador(
  p_partido_id uuid,
  p_score_a integer,
  p_score_b integer,
  p_motivo text,
  p_orden uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_motivo text;
  v_jornada uuid;
  v_liga uuid;
  v_estado text;
  v_liga_estado text;
  v_ronda integer;
  v_cancha integer;
  v_prev_a integer;
  v_prev_b integer;
  v_confirmada boolean;
  v_rank jsonb;
  v_extra jsonb;
BEGIN
  v_motivo := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  IF v_motivo IS NULL OR char_length(v_motivo) < 4 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Escribe el motivo de la corrección (mínimo 4 caracteres).');
  END IF;
  IF char_length(v_motivo) > 300 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El motivo es demasiado largo (máximo 300 caracteres).');
  END IF;

  SELECT p.jornada_id, j.liga_id, j.estado, l.estado, p.ronda, p.cancha
    INTO v_jornada, v_liga, v_estado, v_liga_estado, v_ronda, v_cancha
  FROM public.liga_partidos p
  JOIN public.liga_jornadas j ON j.id = p.jornada_id
  JOIN public.ligas l ON l.id = j.liga_id
  WHERE p.id = p_partido_id
  FOR UPDATE OF j;

  IF v_liga IS NULL OR NOT public.flex_league_can_write(v_liga) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin permiso para corregir este marcador.');
  END IF;
  IF v_liga_estado = 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La temporada ya tiene campeón. Reábrela con motivo antes de corregir.');
  END IF;
  IF p_score_a IS NULL OR p_score_b IS NULL OR p_score_a < 0 OR p_score_b < 0 OR p_score_a > 99 OR p_score_b > 99 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El marcador tiene que ser un entero entre 0 y 99.');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('flex-jornada'), hashtext(v_jornada::text));

  -- Se lee de nuevo bajo el candado: el resultado anterior que se audita es el
  -- que de verdad estaba guardado, no el que el cliente tenía en pantalla.
  SELECT score_pareja1, score_pareja2
    INTO v_prev_a, v_prev_b
  FROM public.liga_partidos
  WHERE id = p_partido_id;

  IF v_prev_a IS NULL OR v_prev_b IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El partido todavía no tiene marcador. Captúralo con Guardar.');
  END IF;

  v_confirmada := v_estado = 'completed' OR EXISTS (
    SELECT 1 FROM public.liga_flex_auditoria a
    WHERE a.jornada_id = v_jornada
      AND a.accion = 'confirmar_ronda'
      AND (a.detalle->>'ronda')::int = v_ronda
  );
  IF NOT v_confirmada THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La ronda sigue abierta. Edita el marcador con Guardar.');
  END IF;

  IF v_prev_a = p_score_a AND v_prev_b = p_score_b THEN
    RETURN jsonb_build_object('ok', true, 'unchanged', true);
  END IF;

  IF v_estado = 'completed' THEN
    DROP TABLE IF EXISTS pg_temp.flex_score_override;
    CREATE TEMP TABLE flex_score_override (
      partido_id uuid PRIMARY KEY,
      score_a integer,
      score_b integer
    ) ON COMMIT DROP;
    INSERT INTO flex_score_override (partido_id, score_a, score_b)
    VALUES (p_partido_id, p_score_a, p_score_b);

    v_rank := public.flex_rank_scores(v_jornada, p_orden);
    IF COALESCE((v_rank->>'ok')::boolean, false) IS NOT TRUE THEN
      DROP TABLE IF EXISTS pg_temp.flex_score_override;
      RETURN v_rank;
    END IF;

    UPDATE public.liga_partidos
       SET score_pareja1 = p_score_a,
           score_pareja2 = p_score_b,
           estado = 'completed'
     WHERE id = p_partido_id;

    PERFORM public.flex_escribir_posiciones(v_jornada, v_rank->'rows');
    DROP TABLE IF EXISTS pg_temp.flex_score_override;
  ELSE
    UPDATE public.liga_partidos
       SET score_pareja1 = p_score_a,
           score_pareja2 = p_score_b,
           estado = 'completed'
     WHERE id = p_partido_id;
  END IF;

  INSERT INTO public.liga_flex_auditoria (liga_id, jornada_id, actor_id, accion, detalle)
  VALUES (
    v_liga, v_jornada, auth.uid(), 'corregir_marcador',
    jsonb_build_object(
      'partido_id', p_partido_id,
      'ronda', v_ronda,
      'cancha', v_cancha,
      'anterior', jsonb_build_object('a', v_prev_a, 'b', v_prev_b),
      'nuevo', jsonb_build_object('a', p_score_a, 'b', p_score_b),
      'motivo', v_motivo,
      'jornada_finalizada', v_estado = 'completed'
    )
  );

  v_extra := CASE
    WHEN v_estado = 'completed' THEN public.flex_adjuntar_temporada(v_liga)
    ELSE '{}'::jsonb
  END;
  RETURN jsonb_build_object('ok', true, 'jornada_finalizada', v_estado = 'completed') || v_extra;
END;
$$;


CREATE OR REPLACE FUNCTION public.flex_corregir_jornada(
  p_jornada_id uuid,
  p_marcadores jsonb,
  p_motivo text,
  p_orden uuid[] DEFAULT NULL
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
  v_rank jsonb;
  v_row jsonb;
  v_extra jsonb;
BEGIN
  IF NULLIF(btrim(COALESCE(p_motivo, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Escribe el motivo de la corrección.');
  END IF;

  SELECT j.liga_id, j.estado, l.estado
    INTO v_liga, v_estado, v_liga_estado
  FROM public.liga_jornadas j
  JOIN public.ligas l ON l.id = j.liga_id
  WHERE j.id = p_jornada_id
  FOR UPDATE OF j;

  IF v_liga IS NULL OR NOT public.flex_league_can_write(v_liga) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin permiso para corregir esta jornada.');
  END IF;
  IF v_liga_estado = 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La temporada ya tiene campeón. Reábrela con motivo antes de corregir.');
  END IF;
  IF v_estado IS DISTINCT FROM 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La corrección es para una jornada ya finalizada. Mientras sigue abierta, edita el marcador directo.');
  END IF;
  IF jsonb_typeof(p_marcadores) IS DISTINCT FROM 'array' OR jsonb_array_length(p_marcadores) < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Faltan los marcadores corregidos.');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('flex-jornada'), hashtext(p_jornada_id::text));

  DROP TABLE IF EXISTS pg_temp.flex_score_override;
  CREATE TEMP TABLE flex_score_override (
    partido_id uuid PRIMARY KEY,
    score_a integer,
    score_b integer
  ) ON COMMIT DROP;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_marcadores) LOOP
    IF (v_row->>'score_a')::int < 0 OR (v_row->>'score_a')::int > 99
       OR (v_row->>'score_b')::int < 0 OR (v_row->>'score_b')::int > 99 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'El marcador tiene que ser un entero entre 0 y 99.');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.liga_partidos
      WHERE id = (v_row->>'partido_id')::uuid AND jornada_id = p_jornada_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Un marcador no pertenece a esta jornada.');
    END IF;
    INSERT INTO flex_score_override (partido_id, score_a, score_b)
    VALUES ((v_row->>'partido_id')::uuid, (v_row->>'score_a')::int, (v_row->>'score_b')::int);
  END LOOP;

  v_rank := public.flex_rank_scores(p_jornada_id, p_orden);
  IF COALESCE((v_rank->>'ok')::boolean, false) IS NOT TRUE THEN
    DROP TABLE IF EXISTS pg_temp.flex_score_override;
    RETURN v_rank;
  END IF;

  UPDATE public.liga_partidos p
     SET score_pareja1 = o.score_a,
         score_pareja2 = o.score_b,
         estado = 'completed'
    FROM flex_score_override o
   WHERE p.id = o.partido_id;

  PERFORM public.flex_escribir_posiciones(p_jornada_id, v_rank->'rows');

  INSERT INTO public.liga_flex_auditoria (liga_id, jornada_id, actor_id, accion, detalle)
  VALUES (
    v_liga, p_jornada_id, auth.uid(), 'corregir_jornada',
    jsonb_build_object('motivo', btrim(p_motivo))
  );

  DROP TABLE IF EXISTS pg_temp.flex_score_override;
  v_extra := public.flex_adjuntar_temporada(v_liga);
  RETURN jsonb_build_object('ok', true) || v_extra;
END;
$$;


CREATE OR REPLACE FUNCTION public.flex_cerrar_liga(
  p_liga_id uuid,
  p_orden uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_final uuid;
  v_max int;
  v_num int;
  v_planeadas int;
  v_total int;
  v_row record;
  v_prev jsonb;
  v_place int := 0;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_campeon uuid;
  v_sub uuid;
  v_tercer uuid;
  v_existing public.liga_flex_honores%ROWTYPE;
BEGIN
  IF NOT public.flex_league_can_write(p_liga_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin permiso para cerrar esta liga.');
  END IF;

  SELECT h.* INTO v_existing FROM public.liga_flex_honores h WHERE h.liga_id = p_liga_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'campeon_id', v_existing.campeon_id,
      'subcampeon_id', v_existing.subcampeon_id,
      'tercer_id', v_existing.tercer_id
    );
  END IF;

  SELECT c.jornadas_planeadas INTO v_planeadas
  FROM public.liga_flex_config c WHERE c.liga_id = p_liga_id;
  SELECT COUNT(*), MAX(numero) INTO v_total, v_max
  FROM public.liga_jornadas WHERE liga_id = p_liga_id;

  IF COALESCE(v_planeadas, 0) < 1
     OR COALESCE(v_total, 0) IS DISTINCT FROM v_planeadas
     OR COALESCE(v_max, 0) IS DISTINCT FROM v_planeadas THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La temporada todavía no tiene todas las jornadas programadas.');
  END IF;
  IF EXISTS (
    SELECT 1 FROM generate_series(1, v_planeadas) n
    WHERE NOT EXISTS (
      SELECT 1 FROM public.liga_jornadas j
      WHERE j.liga_id = p_liga_id AND j.numero = n
    )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Falta una jornada del calendario.');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.liga_jornadas j
    WHERE j.liga_id = p_liga_id
      AND (
        j.estado IS DISTINCT FROM 'completed'
        OR NOT EXISTS (
          SELECT 1 FROM public.liga_flex_posiciones p WHERE p.jornada_id = j.id
        )
        OR (
          SELECT COUNT(*) FROM public.liga_flex_posiciones p WHERE p.jornada_id = j.id
        ) IS DISTINCT FROM (
          SELECT COUNT(*) FROM public.liga_jornada_participantes part WHERE part.jornada_id = j.id
        )
      )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Termina las jornadas programadas y asigna sus puntos antes de cerrar la temporada.');
  END IF;

  SELECT j.id, j.numero INTO v_final, v_num
  FROM public.liga_jornadas j
  WHERE j.liga_id = p_liga_id AND j.numero = v_planeadas;
  IF v_final IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No está la última jornada programada.');
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS flex_board_close (
    jugador_id uuid PRIMARY KEY,
    puntos int NOT NULL,
    jj int NOT NULL,
    keys int[] NOT NULL,
    picked boolean NOT NULL DEFAULT false
  ) ON COMMIT DROP;
  DELETE FROM flex_board_close WHERE true;

  INSERT INTO flex_board_close (jugador_id, puntos, jj, keys)
  SELECT
    p.jugador_id,
    SUM(p.puntos)::int,
    COUNT(*)::int,
    ARRAY[
      COUNT(*) FILTER (WHERE p.posicion = 1),
      COUNT(*) FILTER (WHERE p.posicion = 2),
      COUNT(*) FILTER (WHERE p.posicion = 3),
      COUNT(*) FILTER (WHERE p.posicion = 4),
      COUNT(*) FILTER (WHERE p.posicion = 5),
      COUNT(*) FILTER (WHERE p.posicion = 6),
      COUNT(*) FILTER (WHERE p.posicion = 7),
      COUNT(*) FILTER (WHERE p.posicion = 8),
      COUNT(*) FILTER (WHERE p.posicion = 9),
      COUNT(*) FILTER (WHERE p.posicion = 10),
      COUNT(*) FILTER (WHERE p.posicion = 11),
      COUNT(*) FILTER (WHERE p.posicion = 12),
      COUNT(*) FILTER (WHERE p.posicion = 13),
      COUNT(*) FILTER (WHERE p.posicion = 14),
      COUNT(*) FILTER (WHERE p.posicion = 15),
      COUNT(*) FILTER (WHERE p.posicion = 16)
    ]::int[]
  FROM public.liga_flex_posiciones p
  JOIN public.liga_jornadas j ON j.id = p.jornada_id
  WHERE j.liga_id = p_liga_id AND j.estado = 'completed'
  GROUP BY p.jugador_id;

  IF (SELECT COUNT(*) FROM flex_board_close) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Hacen falta al menos tres jugadores con puntos para el podio.');
  END IF;

  FOR v_place IN 1..3 LOOP
    SELECT b.jugador_id, b.puntos, b.jj, b.keys
      INTO v_row
    FROM flex_board_close b
    WHERE NOT b.picked
    ORDER BY b.puntos DESC, b.keys DESC, b.jj DESC
    LIMIT 1;

    SELECT COALESCE(jsonb_agg(b.jugador_id), '[]'::jsonb)
      INTO v_prev
    FROM flex_board_close b
    WHERE NOT b.picked
      AND b.puntos = v_row.puntos
      AND b.keys = v_row.keys
      AND b.jj = v_row.jj;

    IF jsonb_array_length(v_prev) > 1 THEN
      IF p_orden IS NULL OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(v_prev) t(id)
        WHERE array_position(p_orden, t.id::uuid) IS NULL
      ) THEN
        RETURN jsonb_build_object(
          'ok', false,
          'needs_resolution', true,
          'error', 'El podio sigue empatado. Ordena a esos jugadores antes de cerrar.',
          'tied', v_prev
        );
      END IF;
      SELECT t.id::uuid INTO v_campeon
      FROM jsonb_array_elements_text(v_prev) t(id)
      ORDER BY array_position(p_orden, t.id::uuid)
      LIMIT 1;
    ELSE
      v_campeon := v_row.jugador_id;
    END IF;

    v_ids := array_append(v_ids, v_campeon);
    UPDATE flex_board_close SET picked = true WHERE jugador_id = v_campeon;
  END LOOP;

  v_campeon := v_ids[1];
  v_sub := v_ids[2];
  v_tercer := v_ids[3];

  UPDATE public.liga_jornada_flex
     SET es_final = (jornada_id = v_final), updated_at = now()
   WHERE liga_id = p_liga_id;
  UPDATE public.liga_flex_config
     SET jornada_final_id = v_final, updated_at = now()
   WHERE liga_id = p_liga_id;

  INSERT INTO public.liga_flex_honores (
    liga_id, campeon_id, subcampeon_id, tercer_id, jornada_final_id
  ) VALUES (
    p_liga_id, v_campeon, v_sub, v_tercer, v_final
  );

  UPDATE public.ligas SET estado = 'completed' WHERE id = p_liga_id;
  UPDATE public.liga_flex_config SET cerrado_at = now(), updated_at = now() WHERE liga_id = p_liga_id;

  INSERT INTO public.liga_flex_auditoria (liga_id, jornada_id, actor_id, accion, detalle)
  VALUES (
    p_liga_id, v_final, auth.uid(), 'cerrar_liga',
    jsonb_build_object('campeon_id', v_campeon, 'subcampeon_id', v_sub, 'tercer_id', v_tercer)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'campeon_id', v_campeon,
    'subcampeon_id', v_sub,
    'tercer_id', v_tercer
  );
END;
$$;


NOTIFY pgrst, 'reload schema';
