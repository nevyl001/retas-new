-- PostgREST carga safeupdate. Un DELETE sin WHERE falla al cerrar la
-- jornada o la temporada, aunque la tabla sea temporal. No cambia el cálculo.

CREATE OR REPLACE FUNCTION public.flex_rank_scores(
  p_jornada_id uuid,
  p_orden uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_best uuid;
  v_a record;
  v_b record;
  v_better boolean;
  v_group uuid[];
  v_member uuid;
  v_place int := 0;
  v_rows jsonb := '[]'::jsonb;
  v_ties jsonb := '[]'::jsonb;
  v_gf int;
  v_gc int;
  v_pts int;
  v_partidos int;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS flex_score_override (
    partido_id uuid PRIMARY KEY,
    score_a integer,
    score_b integer
  ) ON COMMIT DROP;

  CREATE TEMP TABLE IF NOT EXISTS flex_rank_acc (
    jugador_id uuid PRIMARY KEY,
    gf integer NOT NULL,
    gc integer NOT NULL,
    partidos integer NOT NULL,
    placed boolean NOT NULL DEFAULT false
  ) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS flex_rank_h2h (
    a uuid NOT NULL,
    b uuid NOT NULL,
    gf integer NOT NULL,
    gc integer NOT NULL,
    PRIMARY KEY (a, b)
  ) ON COMMIT DROP;
  DELETE FROM flex_rank_acc WHERE true;
  DELETE FROM flex_rank_h2h WHERE true;

  INSERT INTO flex_rank_acc (jugador_id, gf, gc, partidos)
  SELECT jugador_id, 0, 0, 0
  FROM public.liga_jornada_participantes
  WHERE jornada_id = p_jornada_id;

  IF (SELECT COUNT(*) FROM flex_rank_acc) NOT IN (12, 16) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La jornada oficial se cierra con 12 o 16 jugadores.');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.liga_partidos p
    LEFT JOIN flex_score_override o ON o.partido_id = p.id
    WHERE p.jornada_id = p_jornada_id
      AND (
        COALESCE(o.score_a, p.score_pareja1) IS NULL
        OR COALESCE(o.score_b, p.score_pareja2) IS NULL
        OR COALESCE(o.score_a, p.score_pareja1) < 0
        OR COALESCE(o.score_b, p.score_pareja2) < 0
        OR COALESCE(o.score_a, p.score_pareja1) > 99
        OR COALESCE(o.score_b, p.score_pareja2) > 99
      )
  ) OR NOT EXISTS (
    SELECT 1 FROM public.liga_partidos WHERE jornada_id = p_jornada_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Completa marcadores válidos, de 0 a 99, antes de asignar puntos.');
  END IF;

  FOR v_a IN
    SELECT
      p.id,
      par1.jugador1_id AS a1,
      par1.jugador2_id AS a2,
      par2.jugador1_id AS b1,
      par2.jugador2_id AS b2,
      COALESCE(o.score_a, p.score_pareja1) AS score_a,
      COALESCE(o.score_b, p.score_pareja2) AS score_b
    FROM public.liga_partidos p
    JOIN public.liga_jornada_parejas par1 ON par1.id = p.pareja1_id
    JOIN public.liga_jornada_parejas par2 ON par2.id = p.pareja2_id
    LEFT JOIN flex_score_override o ON o.partido_id = p.id
    WHERE p.jornada_id = p_jornada_id
  LOOP
    IF (SELECT COUNT(DISTINCT x) FROM unnest(ARRAY[v_a.a1, v_a.a2, v_a.b1, v_a.b2]) x) <> 4 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Hay un partido sin cuatro jugadores distintos.');
    END IF;
    FOREACH v_id IN ARRAY (ARRAY[v_a.a1, v_a.a2, v_a.b1, v_a.b2])
    LOOP
      IF NOT EXISTS (SELECT 1 FROM flex_rank_acc WHERE jugador_id = v_id) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Un partido incluye a alguien que no está en la jornada.');
      END IF;
    END LOOP;
    UPDATE flex_rank_acc
       SET gf = gf + v_a.score_a, gc = gc + v_a.score_b, partidos = partidos + 1
     WHERE jugador_id IN (v_a.a1, v_a.a2);
    UPDATE flex_rank_acc
       SET gf = gf + v_a.score_b, gc = gc + v_a.score_a, partidos = partidos + 1
     WHERE jugador_id IN (v_a.b1, v_a.b2);
    FOREACH v_id IN ARRAY (ARRAY[v_a.a1, v_a.a2])
    LOOP
      INSERT INTO flex_rank_h2h (a, b, gf, gc)
      SELECT v_id, rival, v_a.score_a, v_a.score_b
      FROM unnest(ARRAY[v_a.b1, v_a.b2]) rival
      ON CONFLICT (a, b) DO UPDATE
        SET gf = flex_rank_h2h.gf + EXCLUDED.gf,
            gc = flex_rank_h2h.gc + EXCLUDED.gc;
    END LOOP;
    FOREACH v_id IN ARRAY (ARRAY[v_a.b1, v_a.b2])
    LOOP
      INSERT INTO flex_rank_h2h (a, b, gf, gc)
      SELECT v_id, rival, v_a.score_b, v_a.score_a
      FROM unnest(ARRAY[v_a.a1, v_a.a2]) rival
      ON CONFLICT (a, b) DO UPDATE
        SET gf = flex_rank_h2h.gf + EXCLUDED.gf,
            gc = flex_rank_h2h.gc + EXCLUDED.gc;
    END LOOP;
  END LOOP;

  IF EXISTS (SELECT 1 FROM flex_rank_acc WHERE partidos < 1) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Hay un participante sin partidos. No se asignan puntos ficticios.');
  END IF;

  WHILE EXISTS (SELECT 1 FROM flex_rank_acc WHERE NOT placed) LOOP
    v_best := NULL;
    FOR v_id IN SELECT jugador_id FROM flex_rank_acc WHERE NOT placed LOOP
      IF v_best IS NULL THEN
        v_best := v_id;
      ELSE
        SELECT * INTO v_a FROM flex_rank_acc WHERE jugador_id = v_id;
        SELECT * INTO v_b FROM flex_rank_acc WHERE jugador_id = v_best;
        v_better := false;
        IF v_a.gf <> v_b.gf THEN
          v_better := v_a.gf > v_b.gf;
        ELSIF (v_a.gf - v_a.gc) <> (v_b.gf - v_b.gc) THEN
          v_better := (v_a.gf - v_a.gc) > (v_b.gf - v_b.gc);
        ELSE
          SELECT COALESCE(SUM(gf), 0), COALESCE(SUM(gc), 0)
            INTO v_gf, v_gc
          FROM flex_rank_h2h
          WHERE a = v_id AND b = v_best;
          IF v_gf + v_gc > 0 THEN
            v_better := (v_gf - v_gc) > 0;
          END IF;
        END IF;
        IF v_better THEN
          v_best := v_id;
        END IF;
      END IF;
    END LOOP;

    v_group := ARRAY[]::uuid[];
    FOR v_id IN SELECT jugador_id FROM flex_rank_acc WHERE NOT placed LOOP
      SELECT * INTO v_a FROM flex_rank_acc WHERE jugador_id = v_id;
      SELECT * INTO v_b FROM flex_rank_acc WHERE jugador_id = v_best;
      v_better := false;
      IF v_a.gf <> v_b.gf OR (v_a.gf - v_a.gc) <> (v_b.gf - v_b.gc) THEN
        v_better := true;
      ELSE
        SELECT COALESCE(SUM(gf), 0), COALESCE(SUM(gc), 0)
          INTO v_gf, v_gc
        FROM flex_rank_h2h
        WHERE (a = v_id AND b = v_best) OR (a = v_best AND b = v_id);
        IF v_gf + v_gc > 0 THEN
          SELECT COALESCE(SUM(gf - gc), 0) INTO v_gf
          FROM flex_rank_h2h WHERE a = v_id AND b = v_best;
          SELECT COALESCE(SUM(gf - gc), 0) INTO v_gc
          FROM flex_rank_h2h WHERE a = v_best AND b = v_id;
          v_better := v_gf <> v_gc;
        END IF;
      END IF;
      IF NOT v_better THEN
        v_group := array_append(v_group, v_id);
      END IF;
    END LOOP;

    IF COALESCE(array_length(v_group, 1), 0) > 1 THEN
      IF p_orden IS NULL OR EXISTS (
        SELECT 1 FROM unnest(v_group) g(id)
        WHERE array_position(p_orden, g.id) IS NULL
      ) THEN
        v_ties := v_ties || jsonb_build_array(
          (SELECT COALESCE(jsonb_agg(g.id ORDER BY g.id::text), '[]'::jsonb) FROM unnest(v_group) g(id))
        );
        RETURN jsonb_build_object(
          'ok', false,
          'needs_resolution', true,
          'error', 'Hay un empate que cambia los puntos. Define el orden de esos jugadores antes de cerrar la jornada.',
          'ties', v_ties
        );
      END IF;
      SELECT COALESCE(array_agg(g.id ORDER BY array_position(p_orden, g.id)), ARRAY[]::uuid[])
        INTO v_group
      FROM unnest(v_group) g(id);
    END IF;

    FOREACH v_member IN ARRAY v_group LOOP
      v_place := v_place + 1;
      v_pts := public.flex_puntos_por_posicion(v_place);
      SELECT gf, gc, partidos INTO v_gf, v_gc, v_partidos
      FROM flex_rank_acc WHERE jugador_id = v_member;
      v_rows := v_rows || jsonb_build_array(jsonb_build_object(
        'jugador_id', v_member,
        'posicion', v_place,
        'puntos', v_pts,
        'partidos', v_partidos,
        'games_favor', v_gf,
        'games_contra', v_gc,
        'promedio_gf', ROUND(v_gf::numeric / v_partidos, 4),
        'promedio_dif', ROUND((v_gf - v_gc)::numeric / v_partidos, 4)
      ));
      UPDATE flex_rank_acc SET placed = true WHERE jugador_id = v_member;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'rows', v_rows);
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

  IF COALESCE(v_planeadas, 0) <> 12 OR COALESCE(v_total, 0) <> 12 OR COALESCE(v_max, 0) <> 12 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La temporada oficial es de 12 jornadas. No se cierra una temporada incompleta.');
  END IF;
  IF EXISTS (
    SELECT 1 FROM generate_series(1, 12) n
    WHERE NOT EXISTS (
      SELECT 1 FROM public.liga_jornadas j
      WHERE j.liga_id = p_liga_id AND j.numero = n
    )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Falta una jornada del 1 al 12.');
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
    RETURN jsonb_build_object('ok', false, 'error', 'Termina las 12 jornadas y asigna sus puntos antes de cerrar la temporada.');
  END IF;

  SELECT j.id, j.numero INTO v_final, v_num
  FROM public.liga_jornadas j
  WHERE j.liga_id = p_liga_id AND j.numero = 12;

  UPDATE public.liga_jornada_flex
     SET es_final = (jornada_id = v_final), updated_at = now()
   WHERE liga_id = p_liga_id;
  UPDATE public.liga_flex_config
     SET jornada_final_id = v_final, updated_at = now()
   WHERE liga_id = p_liga_id;

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
