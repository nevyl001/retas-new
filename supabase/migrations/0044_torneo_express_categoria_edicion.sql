-- Torneo Express — edición de categoría ya creada.
-- Tres RPC atómicas. La autoridad es SQL; el preview de React no basta.
-- Orden de locks único: torneo_express, luego partido(s), luego pairs.
-- apply_torneo_express_grupo_resultado se reescribe con ese mismo orden
-- (antes bloqueaba el partido y después el torneo). No hay en_juego:
-- lo que se congela es la composición que existe cuando el resultado
-- ya quedó persistido, más un rechazo si cambió mientras este guardado
-- esperaba el lock. Si una validación falla, Postgres revierte la función.
-- Reorganizar está prohibida en cuanto existe historial persistido, porque
-- recrear grupos o partidos atribuiría resultados a otra estructura.
-- Nunca se borra public.pairs ni public.players: la pareja puede vivir fuera
-- de esta categoría. Solo se retiran vínculos y partidos de este torneo.

-- Historial persistido. Misma regla que partidoTieneHistorial:
-- jugado, ganador, puntos o sets con marcador. El badge EN JUEGO no existe.
CREATE OR REPLACE FUNCTION public.te_sets_tienen_marcador(p_sets jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT
    p_sets IS NOT NULL
    AND jsonb_typeof(p_sets) = 'array'
    AND jsonb_array_length(p_sets) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_sets) AS el
      WHERE jsonb_typeof(el) IS DISTINCT FROM 'object'
         OR jsonb_typeof(el -> 'local') IS DISTINCT FROM 'number'
         OR jsonb_typeof(el -> 'visitante') IS DISTINCT FROM 'number'
         OR (el ->> 'local')::numeric < 0
         OR (el ->> 'visitante')::numeric < 0
    );
$fn$;

CREATE OR REPLACE FUNCTION public.te_partido_tiene_historial(
  p_estado text,
  p_ganador_id uuid,
  p_puntos_local integer,
  p_puntos_visitante integer,
  p_sets jsonb
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT
    p_estado = 'jugado'
    OR p_ganador_id IS NOT NULL
    OR p_puntos_local IS NOT NULL
    OR p_puntos_visitante IS NOT NULL
    OR public.te_sets_tienen_marcador(p_sets);
$fn$;

CREATE OR REPLACE FUNCTION public.te_mexico_slot_key(p_inst timestamptz)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT to_char(
    p_inst AT TIME ZONE 'America/Mexico_City',
    'YYYY-MM-DD"T"HH24:MI'
  );
$fn$;

CREATE OR REPLACE FUNCTION public.te_matchup_key(p_a uuid, p_b uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT CASE
    WHEN p_a IS NULL OR p_b IS NULL THEN NULL
    WHEN p_a::text < p_b::text THEN p_a::text || '|' || p_b::text
    ELSE p_b::text || '|' || p_a::text
  END;
$fn$;

-- Mismo círculo que generateBalancedRoundRobin (índices 1-based).
CREATE OR REPLACE FUNCTION public.te_balanced_round_robin(p_pair_ids uuid[])
RETURNS TABLE(local_id uuid, visitante_id uuid, ronda integer, orden integer)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  n integer;
  lista uuid[];
  working uuid[];
  total integer;
  rondas integer;
  mitad integer;
  r integer;
  i integer;
  ord integer := 1;
  p1 uuid;
  p2 uuid;
  rotated uuid[];
  last_id uuid;
  rotated_len integer;
BEGIN
  n := coalesce(array_length(p_pair_ids, 1), 0);
  IF n < 2 THEN
    RETURN;
  END IF;

  lista := p_pair_ids;
  IF n % 2 <> 0 THEN
    lista := lista || ARRAY[NULL::uuid];
  END IF;

  total := array_length(lista, 1);
  rondas := total - 1;
  mitad := total / 2;
  working := lista;

  FOR r IN 0..(rondas - 1) LOOP
    FOR i IN 0..(mitad - 1) LOOP
      p1 := working[i + 1];
      p2 := working[total - i];
      IF p1 IS NOT NULL AND p2 IS NOT NULL THEN
        local_id := p1;
        visitante_id := p2;
        ronda := r + 1;
        orden := ord;
        ord := ord + 1;
        RETURN NEXT;
      END IF;
    END LOOP;

    IF r < rondas - 1 THEN
      rotated := working[2:total];
      rotated_len := coalesce(array_length(rotated, 1), 0);
      last_id := rotated[rotated_len];
      IF rotated_len > 1 THEN
        rotated := rotated[1:rotated_len - 1];
      ELSE
        rotated := ARRAY[]::uuid[];
      END IF;
      rotated := ARRAY[last_id] || rotated;
      working := ARRAY[working[1]] || rotated;
    END IF;
  END LOOP;
END;
$fn$;

-- Bloquea la categoría y rechaza fase, cierre y eliminatoria.
CREATE OR REPLACE FUNCTION public.te_lock_categoria_editable(p_torneo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_owner uuid;
  v_fase text;
  v_estado text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  IF p_torneo_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TOURNAMENT_NOT_FOUND');
  END IF;

  SELECT organizador_id, fase_torneo, estado
    INTO v_owner, v_fase, v_estado
  FROM public.torneo_express
  WHERE id = p_torneo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TOURNAMENT_NOT_FOUND');
  END IF;

  IF v_owner IS NULL OR v_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Sin permiso sobre este torneo';
  END IF;

  IF v_estado = 'finalizado' OR v_fase = 'cerrado' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TOURNAMENT_NOT_EDITABLE');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.torneo_express_eliminatoria_partidos
    WHERE torneo_id = p_torneo_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ELIMINATORIA_EXISTS');
  END IF;

  IF v_fase IS NOT NULL AND v_fase <> 'grupos' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TOURNAMENT_NOT_EDITABLE');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$fn$;

-- Lectura de la composición de una pareja. apply_torneo_express_grupo_resultado
-- la llama antes y después de los locks para detectar un cambio mientras esperaba.
CREATE OR REPLACE FUNCTION public.te_pair_player_ids(p_pair_id uuid)
RETURNS TABLE (player1_id uuid, player2_id uuid)
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
  SELECT pr.player1_id, pr.player2_id
  FROM public.pairs pr
  WHERE pr.id = p_pair_id;
$fn$;

CREATE OR REPLACE FUNCTION public.append_torneo_express_pareja_grupo(
  p_torneo_id uuid,
  p_grupo_id uuid,
  p_player1_id uuid,
  p_player2_id uuid,
  p_partidos jsonb
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_guard jsonb;
  v_grupo_id uuid;
  v_name1 text;
  v_name2 text;
  v_tournament_id uuid;
  v_tournament_count integer;
  v_null_tournament integer;
  v_pareja_id uuid;
  v_group_count integer;
  v_payload_count integer;
  v_max_ronda integer;
  v_max_orden integer;
  v_scheduled_count integer;
  v_category_count integer;
  v_category_incomplete integer;
  v_last_slot text;
  elem jsonb;
  v_rival uuid;
  v_ronda integer;
  v_orden integer;
  v_cancha text;
  v_programado timestamptz;
  v_created integer := 0;
BEGIN
  v_guard := public.te_lock_categoria_editable(p_torneo_id);
  IF NOT (v_guard ->> 'ok')::boolean THEN
    RETURN v_guard;
  END IF;

  BEGIN
    PERFORM 1
    FROM public.torneo_express_partidos p
    JOIN public.torneo_express_grupos g ON g.id = p.grupo_id
    WHERE g.torneo_id = p_torneo_id
    FOR UPDATE OF p NOWAIT;
  EXCEPTION
    WHEN lock_not_available THEN
      RETURN jsonb_build_object('ok', false, 'error', 'STALE_SCHEDULE');
  END;

  IF p_grupo_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_GROUP');
  END IF;

  SELECT g.id INTO v_grupo_id
  FROM public.torneo_express_grupos g
  WHERE g.id = p_grupo_id
    AND g.torneo_id = p_torneo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_GROUP');
  END IF;

  IF p_player1_id IS NULL OR p_player2_id IS NULL OR p_player1_id = p_player2_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_MATCH_PAYLOAD');
  END IF;

  SELECT btrim(name) INTO v_name1 FROM public.players WHERE id = p_player1_id;
  SELECT btrim(name) INTO v_name2 FROM public.players WHERE id = p_player2_id;
  IF v_name1 IS NULL OR v_name1 = '' OR v_name2 IS NULL OR v_name2 = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PLAYER_NOT_FOUND');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.torneo_express_grupo_parejas gp
    JOIN public.torneo_express_grupos g ON g.id = gp.grupo_id
    JOIN public.pairs pr ON pr.id = gp.pareja_id
    WHERE g.torneo_id = p_torneo_id
      AND (
        pr.player1_id IN (p_player1_id, p_player2_id)
        OR pr.player2_id IN (p_player1_id, p_player2_id)
      )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PLAYER_ALREADY_REGISTERED');
  END IF;

  SELECT count(DISTINCT pr.tournament_id) FILTER (WHERE pr.tournament_id IS NOT NULL),
         count(*) FILTER (WHERE pr.tournament_id IS NULL)
    INTO v_tournament_count, v_null_tournament
  FROM public.torneo_express_grupo_parejas gp
  JOIN public.torneo_express_grupos g ON g.id = gp.grupo_id
  JOIN public.pairs pr ON pr.id = gp.pareja_id
  WHERE g.torneo_id = p_torneo_id;

  IF v_null_tournament > 0 OR v_tournament_count <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PAIR_TOURNAMENT_UNRESOLVED');
  END IF;

  SELECT DISTINCT pr.tournament_id INTO v_tournament_id
  FROM public.torneo_express_grupo_parejas gp
  JOIN public.torneo_express_grupos g ON g.id = gp.grupo_id
  JOIN public.pairs pr ON pr.id = gp.pareja_id
  WHERE g.torneo_id = p_torneo_id
    AND pr.tournament_id IS NOT NULL;

  IF p_partidos IS NULL OR jsonb_typeof(p_partidos) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_MATCH_PAYLOAD');
  END IF;

  DROP TABLE IF EXISTS te_append_partidos;

  SELECT count(*) INTO v_group_count
  FROM public.torneo_express_grupo_parejas
  WHERE grupo_id = v_grupo_id;

  v_payload_count := jsonb_array_length(p_partidos);
  IF v_payload_count <> v_group_count THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_MATCH_PAYLOAD');
  END IF;

  SELECT coalesce(max(CASE WHEN p.ronda > 0 THEN p.ronda ELSE 0 END), 0),
         coalesce(max(CASE WHEN p.orden > 0 THEN p.orden ELSE 0 END), 0)
    INTO v_max_ronda, v_max_orden
  FROM public.torneo_express_partidos p
  WHERE p.grupo_id = v_grupo_id;

  CREATE TEMP TABLE te_append_partidos (
    rival_id uuid PRIMARY KEY,
    ronda integer NOT NULL,
    orden integer NOT NULL,
    cancha text,
    programado_en timestamptz,
    scheduled boolean NOT NULL
  ) ON COMMIT DROP;

  FOR elem IN SELECT value FROM jsonb_array_elements(p_partidos) LOOP
    BEGIN
      v_rival := (elem ->> 'rival_id')::uuid;
      v_ronda := (elem ->> 'ronda')::integer;
      v_orden := (elem ->> 'orden')::integer;
    EXCEPTION
      WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RETURN jsonb_build_object('ok', false, 'error', 'INVALID_MATCH_PAYLOAD');
    END;

    IF v_rival IS NULL OR v_ronda IS NULL OR v_orden IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INVALID_MATCH_PAYLOAD');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.torneo_express_grupo_parejas
      WHERE grupo_id = v_grupo_id AND pareja_id = v_rival
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INVALID_MATCH_PAYLOAD');
    END IF;

    IF v_ronda <> v_max_ronda + 1
       OR v_orden <= v_max_orden
       OR v_orden > v_max_orden + v_group_count THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INVALID_MATCH_PAYLOAD');
    END IF;

    v_cancha := nullif(btrim(elem ->> 'cancha'), '');
    BEGIN
      IF nullif(btrim(elem ->> 'programado_en'), '') IS NULL THEN
        v_programado := NULL;
      ELSE
        v_programado := (elem ->> 'programado_en')::timestamptz;
      END IF;
    EXCEPTION
      WHEN invalid_text_representation OR datetime_field_overflow THEN
        RETURN jsonb_build_object('ok', false, 'error', 'STALE_SCHEDULE');
    END;

    BEGIN
      INSERT INTO te_append_partidos (rival_id, ronda, orden, cancha, programado_en, scheduled)
      VALUES (
        v_rival,
        v_ronda,
        v_orden,
        v_cancha,
        v_programado,
        v_cancha IS NOT NULL AND v_programado IS NOT NULL
      );
    EXCEPTION
      WHEN unique_violation THEN
        RETURN jsonb_build_object('ok', false, 'error', 'DUPLICATE_MATCH');
    END;
  END LOOP;

  IF (SELECT count(*) FROM te_append_partidos) <> v_group_count
     OR (SELECT count(DISTINCT orden) FROM te_append_partidos) <> v_group_count THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_MATCH_PAYLOAD');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.torneo_express_grupo_parejas gp
    WHERE gp.grupo_id = v_grupo_id
      AND NOT EXISTS (
        SELECT 1 FROM te_append_partidos a WHERE a.rival_id = gp.pareja_id
      )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_MATCH_PAYLOAD');
  END IF;

  SELECT count(*) FILTER (WHERE scheduled),
         count(*) FILTER (WHERE NOT scheduled)
    INTO v_scheduled_count, v_payload_count
  FROM te_append_partidos;

  IF v_scheduled_count <> 0 AND v_payload_count <> 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'STALE_SCHEDULE');
  END IF;

  SELECT count(*) INTO v_category_count
  FROM public.torneo_express_partidos p
  JOIN public.torneo_express_grupos g ON g.id = p.grupo_id
  WHERE g.torneo_id = p_torneo_id;

  SELECT count(*) INTO v_category_incomplete
  FROM public.torneo_express_partidos p
  JOIN public.torneo_express_grupos g ON g.id = p.grupo_id
  WHERE g.torneo_id = p_torneo_id
    AND (
      p.programado_en IS NULL
      OR p.cancha IS NULL
      OR btrim(p.cancha) = ''
    );

  IF v_scheduled_count = 0 THEN
    IF v_category_count > 0 AND v_category_incomplete = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'STALE_SCHEDULE');
    END IF;
  ELSE
    IF v_category_count = 0 OR v_category_incomplete > 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'STALE_SCHEDULE');
    END IF;

    SELECT max(public.te_mexico_slot_key(p.programado_en))
      INTO v_last_slot
    FROM public.torneo_express_partidos p
    JOIN public.torneo_express_grupos g ON g.id = p.grupo_id
    WHERE g.torneo_id = p_torneo_id
      AND p.programado_en IS NOT NULL;

    IF EXISTS (
      SELECT 1 FROM te_append_partidos a
      WHERE public.te_mexico_slot_key(a.programado_en) <= v_last_slot
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'STALE_SCHEDULE');
    END IF;

    IF EXISTS (
      SELECT 1
      FROM te_append_partidos a
      JOIN te_append_partidos b
        ON a.rival_id <> b.rival_id
       AND public.te_mexico_slot_key(a.programado_en)
         = public.te_mexico_slot_key(b.programado_en)
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'STALE_SCHEDULE');
    END IF;

    IF EXISTS (
      SELECT 1
      FROM te_append_partidos a
      JOIN public.torneo_express_partidos p ON true
      JOIN public.torneo_express_grupos g ON g.id = p.grupo_id
      WHERE g.torneo_id = p_torneo_id
        AND public.te_mexico_slot_key(p.programado_en)
          = public.te_mexico_slot_key(a.programado_en)
        AND (
          btrim(p.cancha) = a.cancha
          OR p.pareja_local_id = a.rival_id
          OR p.pareja_visitante_id = a.rival_id
        )
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'STALE_SCHEDULE');
    END IF;
  END IF;

  INSERT INTO public.pairs (
    tournament_id,
    player1_id,
    player2_id,
    player1_name,
    player2_name
  ) VALUES (
    v_tournament_id,
    p_player1_id,
    p_player2_id,
    v_name1,
    v_name2
  )
  RETURNING id INTO v_pareja_id;

  INSERT INTO public.torneo_express_grupo_parejas (grupo_id, pareja_id)
  VALUES (v_grupo_id, v_pareja_id);

  INSERT INTO public.torneo_express_partidos (
    grupo_id,
    pareja_local_id,
    pareja_visitante_id,
    estado,
    ronda,
    orden,
    cancha,
    programado_en
  )
  SELECT
    v_grupo_id,
    v_pareja_id,
    a.rival_id,
    'pendiente',
    a.ronda,
    a.orden,
    a.cancha,
    a.programado_en
  FROM te_append_partidos a;

  GET DIAGNOSTICS v_created = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'pareja_id', v_pareja_id,
    'partidos_creados', v_created
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.replace_torneo_express_pair_player(
  p_torneo_id uuid,
  p_pareja_id uuid,
  p_jugador_saliente_id uuid,
  p_jugador_nuevo_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_guard jsonb;
  v_player1 uuid;
  v_player2 uuid;
  v_name text;
  v_slot text;
BEGIN
  v_guard := public.te_lock_categoria_editable(p_torneo_id);
  IF NOT (v_guard ->> 'ok')::boolean THEN
    RETURN v_guard;
  END IF;

  IF p_pareja_id IS NULL OR p_jugador_saliente_id IS NULL OR p_jugador_nuevo_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_MATCH_PAYLOAD');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.torneo_express_grupo_parejas gp
    JOIN public.torneo_express_grupos g ON g.id = gp.grupo_id
    WHERE g.torneo_id = p_torneo_id
      AND gp.pareja_id = p_pareja_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PAIR_NOT_IN_TOURNAMENT');
  END IF;

  BEGIN
    PERFORM 1
    FROM public.torneo_express_partidos p
    JOIN public.torneo_express_grupos g ON g.id = p.grupo_id
    WHERE g.torneo_id = p_torneo_id
      AND (p.pareja_local_id = p_pareja_id OR p.pareja_visitante_id = p_pareja_id)
    FOR UPDATE OF p NOWAIT;
  EXCEPTION
    WHEN lock_not_available THEN
      RETURN jsonb_build_object('ok', false, 'error', 'PAIR_HAS_HISTORY');
  END;

  IF EXISTS (
    SELECT 1
    FROM public.torneo_express_partidos p
    JOIN public.torneo_express_grupos g ON g.id = p.grupo_id
    WHERE g.torneo_id = p_torneo_id
      AND (p.pareja_local_id = p_pareja_id OR p.pareja_visitante_id = p_pareja_id)
      AND public.te_partido_tiene_historial(
        p.estado,
        p.ganador_id,
        p.puntos_local,
        p.puntos_visitante,
        p.sets_resultado
      )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PAIR_HAS_HISTORY');
  END IF;

  SELECT player1_id, player2_id
    INTO v_player1, v_player2
  FROM public.pairs
  WHERE id = p_pareja_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PAIR_NOT_FOUND');
  END IF;

  IF v_player1 = p_jugador_saliente_id THEN
    v_slot := 'player1';
  ELSIF v_player2 = p_jugador_saliente_id THEN
    v_slot := 'player2';
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'OUTGOING_NOT_IN_PAIR');
  END IF;

  IF (v_slot = 'player1' AND p_jugador_nuevo_id = v_player2)
     OR (v_slot = 'player2' AND p_jugador_nuevo_id = v_player1)
     OR p_jugador_nuevo_id = p_jugador_saliente_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NEW_IS_PARTNER');
  END IF;

  SELECT btrim(name) INTO v_name
  FROM public.players
  WHERE id = p_jugador_nuevo_id;

  IF v_name IS NULL OR v_name = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PLAYER_NOT_FOUND');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.torneo_express_grupo_parejas gp
    JOIN public.torneo_express_grupos g ON g.id = gp.grupo_id
    JOIN public.pairs pr ON pr.id = gp.pareja_id
    WHERE g.torneo_id = p_torneo_id
      AND gp.pareja_id <> p_pareja_id
      AND (pr.player1_id = p_jugador_nuevo_id OR pr.player2_id = p_jugador_nuevo_id)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PLAYER_ALREADY_REGISTERED');
  END IF;

  -- Revalidar historial con los locks ya tomados, antes de escribir.
  IF EXISTS (
    SELECT 1
    FROM public.torneo_express_partidos p
    JOIN public.torneo_express_grupos g ON g.id = p.grupo_id
    WHERE g.torneo_id = p_torneo_id
      AND (p.pareja_local_id = p_pareja_id OR p.pareja_visitante_id = p_pareja_id)
      AND public.te_partido_tiene_historial(
        p.estado,
        p.ganador_id,
        p.puntos_local,
        p.puntos_visitante,
        p.sets_resultado
      )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PAIR_HAS_HISTORY');
  END IF;

  IF v_slot = 'player1' THEN
    UPDATE public.pairs
    SET player1_id = p_jugador_nuevo_id,
        player1_name = v_name
    WHERE id = p_pareja_id;
  ELSE
    UPDATE public.pairs
    SET player2_id = p_jugador_nuevo_id,
        player2_name = v_name
    WHERE id = p_pareja_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'pareja_id', p_pareja_id,
    'jugador_saliente_id', p_jugador_saliente_id,
    'jugador_nuevo_id', p_jugador_nuevo_id
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.reorganize_torneo_express_grupos(
  p_torneo_id uuid,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_guard jsonb;
  v_grupos jsonb;
  v_partidos jsonb;
  elem jsonb;
  v_nombre text;
  v_orden integer;
  v_ids uuid[];
  v_id uuid;
  v_local uuid;
  v_visit uuid;
  v_ronda integer;
  v_match_orden integer;
  v_cancha text;
  v_programado timestamptz;
  v_grupo_id uuid;
  v_inserted integer := 0;
  pareja_json jsonb;
BEGIN
  v_guard := public.te_lock_categoria_editable(p_torneo_id);
  IF NOT (v_guard ->> 'ok')::boolean THEN
    RETURN v_guard;
  END IF;

  BEGIN
    PERFORM 1
    FROM public.torneo_express_partidos p
    JOIN public.torneo_express_grupos g ON g.id = p.grupo_id
    WHERE g.torneo_id = p_torneo_id
    FOR UPDATE OF p NOWAIT;
  EXCEPTION
    WHEN lock_not_available THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INVALID_REORGANIZATION');
  END;

  IF EXISTS (
    SELECT 1
    FROM public.torneo_express_partidos p
    JOIN public.torneo_express_grupos g ON g.id = p.grupo_id
    WHERE g.torneo_id = p_torneo_id
      AND public.te_partido_tiene_historial(
        p.estado,
        p.ganador_id,
        p.puntos_local,
        p.puntos_visitante,
        p.sets_resultado
      )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_REORGANIZATION');
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_REORGANIZATION');
  END IF;

  DROP TABLE IF EXISTS te_reorg_asignacion;
  DROP TABLE IF EXISTS te_reorg_partidos;
  DROP TABLE IF EXISTS te_reorg_grupos;

  v_grupos := p_payload -> 'grupos';
  v_partidos := p_payload -> 'partidos';
  IF jsonb_typeof(v_grupos) IS DISTINCT FROM 'array'
     OR jsonb_typeof(v_partidos) IS DISTINCT FROM 'array'
     OR jsonb_array_length(v_grupos) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_REORGANIZATION');
  END IF;

  CREATE TEMP TABLE te_reorg_grupos (
    orden integer PRIMARY KEY,
    nombre text NOT NULL,
    pareja_ids uuid[] NOT NULL,
    grupo_id uuid NOT NULL
  ) ON COMMIT DROP;

  CREATE TEMP TABLE te_reorg_partidos (
    grupo_orden integer NOT NULL,
    local_id uuid NOT NULL,
    visitante_id uuid NOT NULL,
    ronda integer NOT NULL,
    orden integer NOT NULL,
    cancha text NOT NULL,
    programado_en timestamptz NOT NULL,
    matchup text NOT NULL
  ) ON COMMIT DROP;

  FOR elem IN SELECT value FROM jsonb_array_elements(v_grupos) LOOP
    v_nombre := btrim(elem ->> 'nombre');
    BEGIN
      v_orden := (elem ->> 'orden')::integer;
    EXCEPTION
      WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RETURN jsonb_build_object('ok', false, 'error', 'INVALID_GROUP');
    END;

    IF v_nombre IS NULL OR v_nombre = '' OR v_orden IS NULL OR v_orden < 1 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INVALID_GROUP');
    END IF;

    IF jsonb_typeof(elem -> 'pareja_ids') IS DISTINCT FROM 'array'
       OR jsonb_array_length(elem -> 'pareja_ids') < 2 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INVALID_GROUP');
    END IF;

    v_ids := ARRAY[]::uuid[];
    FOR pareja_json IN
      SELECT value FROM jsonb_array_elements(elem -> 'pareja_ids')
    LOOP
      BEGIN
        v_id := (pareja_json #>> '{}')::uuid;
      EXCEPTION
        WHEN invalid_text_representation THEN
          RETURN jsonb_build_object('ok', false, 'error', 'INVALID_GROUP');
      END;
      IF v_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'INVALID_GROUP');
      END IF;
      v_ids := v_ids || v_id;
    END LOOP;

    BEGIN
      INSERT INTO te_reorg_grupos (orden, nombre, pareja_ids, grupo_id)
      VALUES (v_orden, v_nombre, v_ids, gen_random_uuid());
    EXCEPTION
      WHEN unique_violation THEN
        RETURN jsonb_build_object('ok', false, 'error', 'INVALID_GROUP');
      WHEN invalid_text_representation THEN
        RETURN jsonb_build_object('ok', false, 'error', 'INVALID_GROUP');
    END;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM te_reorg_grupos a
    JOIN te_reorg_grupos b
      ON a.orden <> b.orden
     AND lower(a.nombre) = lower(b.nombre)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_GROUP');
  END IF;

  CREATE TEMP TABLE te_reorg_asignacion (
    pareja_id uuid PRIMARY KEY,
    orden integer NOT NULL
  ) ON COMMIT DROP;

  BEGIN
    INSERT INTO te_reorg_asignacion (pareja_id, orden)
    SELECT pareja_id, g.orden
    FROM te_reorg_grupos g
    CROSS JOIN LATERAL unnest(g.pareja_ids) AS pareja_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('ok', false, 'error', 'PAIR_DUPLICATED');
  END;

  IF EXISTS (
    SELECT 1 FROM te_reorg_grupos g
    WHERE coalesce(array_length(g.pareja_ids, 1), 0) <> (
      SELECT count(*) FROM unnest(g.pareja_ids) AS u
    )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PAIR_DUPLICATED');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM te_reorg_asignacion a
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.torneo_express_grupo_parejas gp
      JOIN public.torneo_express_grupos g ON g.id = gp.grupo_id
      WHERE g.torneo_id = p_torneo_id
        AND gp.pareja_id = a.pareja_id
    )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PAIR_NOT_IN_TOURNAMENT');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.torneo_express_grupo_parejas gp
    JOIN public.torneo_express_grupos g ON g.id = gp.grupo_id
    WHERE g.torneo_id = p_torneo_id
      AND NOT EXISTS (
        SELECT 1 FROM te_reorg_asignacion a WHERE a.pareja_id = gp.pareja_id
      )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PAIR_WITHOUT_GROUP');
  END IF;

  FOR elem IN SELECT value FROM jsonb_array_elements(v_partidos) LOOP
    BEGIN
      v_orden := (elem ->> 'grupo_orden')::integer;
      v_local := (elem ->> 'pareja_local_id')::uuid;
      v_visit := (elem ->> 'pareja_visitante_id')::uuid;
      v_ronda := (elem ->> 'ronda')::integer;
      v_match_orden := (elem ->> 'orden')::integer;
      v_programado := (elem ->> 'programado_en')::timestamptz;
    EXCEPTION
      WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN
        RETURN jsonb_build_object('ok', false, 'error', 'INVALID_MATCH_PAYLOAD');
    END;

    v_cancha := btrim(elem ->> 'cancha');
    IF v_orden IS NULL OR v_local IS NULL OR v_visit IS NULL
       OR v_ronda IS NULL OR v_match_orden IS NULL
       OR v_programado IS NULL OR v_cancha IS NULL OR v_cancha = ''
       OR v_local = v_visit THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INVALID_MATCH_PAYLOAD');
    END IF;

    BEGIN
      INSERT INTO te_reorg_partidos (
        grupo_orden, local_id, visitante_id, ronda, orden, cancha, programado_en, matchup
      ) VALUES (
        v_orden,
        v_local,
        v_visit,
        v_ronda,
        v_match_orden,
        v_cancha,
        v_programado,
        public.te_matchup_key(v_local, v_visit)
      );
    EXCEPTION
      WHEN unique_violation THEN
        RETURN jsonb_build_object('ok', false, 'error', 'DUPLICATE_MATCH');
    END;
  END LOOP;

  IF EXISTS (
    SELECT matchup
    FROM te_reorg_partidos
    GROUP BY matchup, grupo_orden
    HAVING count(*) > 1
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'DUPLICATE_MATCH');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM te_reorg_grupos g
    WHERE EXISTS (
      SELECT 1
      FROM public.te_balanced_round_robin(g.pareja_ids) expected
      WHERE NOT EXISTS (
        SELECT 1
        FROM te_reorg_partidos p
        WHERE p.grupo_orden = g.orden
          AND p.matchup = public.te_matchup_key(expected.local_id, expected.visitante_id)
          AND p.ronda = expected.ronda
          AND p.orden = expected.orden
      )
    )
    OR (
      SELECT count(*) FROM te_reorg_partidos p WHERE p.grupo_orden = g.orden
    ) <> (
      SELECT count(*) FROM public.te_balanced_round_robin(g.pareja_ids)
    )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ROUND_ROBIN_MISMATCH');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM te_reorg_partidos a
    JOIN te_reorg_partidos b
      ON a.ctid <> b.ctid
     AND public.te_mexico_slot_key(a.programado_en)
       = public.te_mexico_slot_key(b.programado_en)
     AND (
       a.cancha = b.cancha
       OR a.local_id IN (b.local_id, b.visitante_id)
       OR a.visitante_id IN (b.local_id, b.visitante_id)
     )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'STALE_SCHEDULE');
  END IF;

  -- Partidos primero, luego vínculos y grupos. pairs no se toca.
  DELETE FROM public.torneo_express_partidos p
  USING public.torneo_express_grupos g
  WHERE p.grupo_id = g.id
    AND g.torneo_id = p_torneo_id;

  DELETE FROM public.torneo_express_grupo_parejas gp
  USING public.torneo_express_grupos g
  WHERE gp.grupo_id = g.id
    AND g.torneo_id = p_torneo_id;

  DELETE FROM public.torneo_express_grupos
  WHERE torneo_id = p_torneo_id;

  INSERT INTO public.torneo_express_grupos (id, torneo_id, nombre, orden)
  SELECT grupo_id, p_torneo_id, nombre, orden
  FROM te_reorg_grupos;

  INSERT INTO public.torneo_express_grupo_parejas (grupo_id, pareja_id)
  SELECT g.grupo_id, pareja_id
  FROM te_reorg_grupos g
  CROSS JOIN LATERAL unnest(g.pareja_ids) AS pareja_id;

  INSERT INTO public.torneo_express_partidos (
    grupo_id,
    pareja_local_id,
    pareja_visitante_id,
    estado,
    ronda,
    orden,
    cancha,
    programado_en
  )
  SELECT
    g.grupo_id,
    p.local_id,
    p.visitante_id,
    'pendiente',
    p.ronda,
    p.orden,
    p.cancha,
    p.programado_en
  FROM te_reorg_partidos p
  JOIN te_reorg_grupos g ON g.orden = p.grupo_orden;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'torneo_id', p_torneo_id,
    'grupos', (SELECT count(*) FROM te_reorg_grupos),
    'partidos', v_inserted
  );
END;
$fn$;

-- Firma de 7 argumentos. La de 6 se elimina al final de esta migración:
-- sin p_expected_pairs no hay guardado. Puntos, empate, conflicto y force
-- de marcador quedan igual. force no omite la composición.
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
  v_after_local_p1 uuid;
  v_after_local_p2 uuid;
  v_after_visit_p1 uuid;
  v_after_visit_p2 uuid;
  v_exp_local_pair uuid;
  v_exp_local_p1 uuid;
  v_exp_local_p2 uuid;
  v_exp_visit_pair uuid;
  v_exp_visit_p1 uuid;
  v_exp_visit_p2 uuid;
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

  SELECT g.torneo_id INTO v_lock_torneo
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

  SELECT player1_id, player2_id
    INTO v_after_local_p1, v_after_local_p2
  FROM public.te_pair_player_ids(v_partido.pareja_local_id);
  SELECT player1_id, player2_id
    INTO v_after_visit_p1, v_after_visit_p2
  FROM public.te_pair_player_ids(v_partido.pareja_visitante_id);

  -- p_force no interviene: un formulario viejo no se sobrescribe.
  IF p_expected_pairs IS NULL
     OR jsonb_typeof(p_expected_pairs) <> 'object'
     OR jsonb_typeof(p_expected_pairs -> 'local') <> 'object'
     OR jsonb_typeof(p_expected_pairs -> 'visitante') <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PAIR_COMPOSITION_CHANGED');
  END IF;

  BEGIN
    v_exp_local_pair := (p_expected_pairs #>> '{local,pair_id}')::uuid;
    v_exp_local_p1 := (p_expected_pairs #>> '{local,player1_id}')::uuid;
    v_exp_local_p2 := (p_expected_pairs #>> '{local,player2_id}')::uuid;
    v_exp_visit_pair := (p_expected_pairs #>> '{visitante,pair_id}')::uuid;
    v_exp_visit_p1 := (p_expected_pairs #>> '{visitante,player1_id}')::uuid;
    v_exp_visit_p2 := (p_expected_pairs #>> '{visitante,player2_id}')::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN jsonb_build_object('ok', false, 'error', 'PAIR_COMPOSITION_CHANGED');
  END;

  IF v_exp_local_pair IS NULL
     OR v_exp_local_p1 IS NULL
     OR v_exp_local_p2 IS NULL
     OR v_exp_visit_pair IS NULL
     OR v_exp_visit_p1 IS NULL
     OR v_exp_visit_p2 IS NULL
     OR v_partido.pareja_local_id IS DISTINCT FROM v_exp_local_pair
     OR v_partido.pareja_visitante_id IS DISTINCT FROM v_exp_visit_pair
     OR v_after_local_p1 IS DISTINCT FROM v_exp_local_p1
     OR v_after_local_p2 IS DISTINCT FROM v_exp_local_p2
     OR v_after_visit_p1 IS DISTINCT FROM v_exp_visit_p1
     OR v_after_visit_p2 IS DISTINCT FROM v_exp_visit_p2 THEN
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

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'updated',
    'partido_id', p_partido_id,
    'grupo_id', v_partido.grupo_id,
    'torneo_id', v_torneo.id
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.te_sets_tienen_marcador(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.te_partido_tiene_historial(text, uuid, integer, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.te_mexico_slot_key(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.te_matchup_key(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.te_balanced_round_robin(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.te_lock_categoria_editable(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.te_pair_player_ids(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.te_sets_tienen_marcador(jsonb) TO CURRENT_USER;
GRANT EXECUTE ON FUNCTION public.te_partido_tiene_historial(text, uuid, integer, integer, jsonb) TO CURRENT_USER;
GRANT EXECUTE ON FUNCTION public.te_mexico_slot_key(timestamptz) TO CURRENT_USER;
GRANT EXECUTE ON FUNCTION public.te_matchup_key(uuid, uuid) TO CURRENT_USER;
GRANT EXECUTE ON FUNCTION public.te_balanced_round_robin(uuid[]) TO CURRENT_USER;
GRANT EXECUTE ON FUNCTION public.te_lock_categoria_editable(uuid) TO CURRENT_USER;
GRANT EXECUTE ON FUNCTION public.te_pair_player_ids(uuid) TO CURRENT_USER;

REVOKE ALL ON FUNCTION public.append_torneo_express_pareja_grupo(uuid, uuid, uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.replace_torneo_express_pair_player(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reorganize_torneo_express_grupos(uuid, jsonb) FROM PUBLIC, anon;
DROP FUNCTION IF EXISTS public.apply_torneo_express_grupo_resultado(uuid, integer, integer, text, jsonb, boolean);

REVOKE ALL ON FUNCTION public.apply_torneo_express_grupo_resultado(uuid, integer, integer, text, jsonb, boolean, jsonb)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.append_torneo_express_pareja_grupo(uuid, uuid, uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_torneo_express_pair_player(uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorganize_torneo_express_grupos(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_torneo_express_grupo_resultado(uuid, integer, integer, text, jsonb, boolean, jsonb)
  TO authenticated;

DO $fn$
BEGIN
  IF to_regprocedure('public.append_torneo_express_pareja_grupo(uuid,uuid,uuid,uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Falta append_torneo_express_pareja_grupo';
  END IF;
  IF to_regprocedure('public.replace_torneo_express_pair_player(uuid,uuid,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta replace_torneo_express_pair_player';
  END IF;
  IF to_regprocedure('public.reorganize_torneo_express_grupos(uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Falta reorganize_torneo_express_grupos';
  END IF;
  IF to_regprocedure('public.apply_torneo_express_grupo_resultado(uuid,integer,integer,text,jsonb,boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'La firma de 6 argumentos de apply_torneo_express_grupo_resultado sigue activa';
  END IF;
  IF to_regprocedure('public.apply_torneo_express_grupo_resultado(uuid,integer,integer,text,jsonb,boolean,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Falta apply_torneo_express_grupo_resultado de 7 argumentos';
  END IF;
END;
$fn$;
