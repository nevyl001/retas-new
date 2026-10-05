-- Programación de pendientes de un grupo.
--
-- No decide qué partidos existen: eso sigue en reconciliar_torneo_express_grupo.
-- Esta función solo escribe cancha, programado_en y orden de partidos pendientes.
-- No toca ronda, parejas, marcador, snapshot, rating ni carrera.
--
-- El algoritmo vive en TypeScript. Aquí se vuelve a validar la propuesta:
-- versión, pertenencia, pendiente vigente, cancha, horario, conflictos y
-- que el modo no deje fuera un partido que debía venir. Si algo falla,
-- no hay UPDATE. Si el resultado es idéntico, la versión no sube.
--
-- Orden de locks, el mismo de las fases anteriores:
--   1. torneo_express
--   2. torneo_express_grupos
--   3. torneo_express_grupo_parejas ORDER BY pareja_id
--   4. torneo_express_partidos ORDER BY id
--
-- También se endurece la transición a eliminatoria: no avanza si queda
-- un cruce obligatorio sin historial. Un empate sin resolver no bloquea.
-- Una pareja retirada no genera obligación futura.
--
-- Riesgo: un torneo que antes podía cerrar la fase con pendientes ahora
-- recibe GROUP_PHASE_INCOMPLETE y se queda en grupos.
--
-- Rollback lógico:
--   recrear confirmar_torneo_express_fase_eliminatoria_transicion desde 0003;
--   DROP FUNCTION aplicar_programacion_torneo_express_grupo;
--   DROP FUNCTION te_torneo_fase_grupos_incompleta;
--   DROP FUNCTION te_court_key;

CREATE OR REPLACE FUNCTION public.te_court_key(p_cancha text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT lower(
    regexp_replace(btrim(coalesce(p_cancha, '')), '^cancha[[:space:]]+', '', 'i')
  );
$fn$;

CREATE OR REPLACE FUNCTION public.te_torneo_fase_grupos_incompleta(p_torneo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.torneo_express_grupos g
    JOIN public.torneo_express_grupo_parejas a
      ON a.grupo_id = g.id AND a.activa
    JOIN public.torneo_express_grupo_parejas b
      ON b.grupo_id = g.id AND b.activa AND a.pareja_id < b.pareja_id
    WHERE g.torneo_id = p_torneo_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.torneo_express_partidos p
        JOIN public.torneo_express_grupo_parejas sa
          ON sa.grupo_id = g.id
         AND sa.activa
         AND p.pareja_local_id = ANY (sa.pareja_previa_ids || ARRAY[sa.pareja_id])
        JOIN public.torneo_express_grupo_parejas sb
          ON sb.grupo_id = g.id
         AND sb.activa
         AND p.pareja_visitante_id = ANY (sb.pareja_previa_ids || ARRAY[sb.pareja_id])
        WHERE p.grupo_id = g.id
          AND sa.pareja_id <> sb.pareja_id
          AND (
            (sa.pareja_id = a.pareja_id AND sb.pareja_id = b.pareja_id)
            OR (sa.pareja_id = b.pareja_id AND sb.pareja_id = a.pareja_id)
          )
          AND public.te_partido_tiene_historial(
            p.estado, p.ganador_id, p.puntos_local, p.puntos_visitante, p.sets_resultado
          )
      )
  );
$fn$;

CREATE OR REPLACE FUNCTION public.aplicar_programacion_torneo_express_grupo(
  p_grupo_id uuid,
  p_expected_version integer,
  p_mode text,
  p_now timestamptz,
  p_assignments jsonb,
  p_courts text[],
  p_slots jsonb,
  p_occupied jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_torneo_id uuid;
  v_guard jsonb;
  v_version_guard jsonb;
  v_version integer;
  v_item jsonb;
  v_match_id uuid;
  v_cancha text;
  v_programado timestamptz;
  v_orden integer;
  v_time_key text;
  v_court_key text;
  v_now_key text;
  v_estado text;
  v_old_cancha text;
  v_old_programado timestamptz;
  v_old_orden integer;
  v_local uuid;
  v_visit uuid;
  v_slot_local uuid;
  v_slot_visit uuid;
  v_historial boolean;
  v_changed integer := 0;
BEGIN
  IF p_grupo_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'GROUP_NOT_FOUND');
  END IF;
  IF p_mode IS DISTINCT FROM 'faltantes' AND p_mode IS DISTINCT FROM 'reorganizar' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_MODE');
  END IF;
  IF p_now IS NULL
     OR jsonb_typeof(coalesce(p_assignments, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(coalesce(p_slots, '[]'::jsonb)) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_SLOT');
  END IF;

  SELECT torneo_id INTO v_torneo_id
  FROM public.torneo_express_grupos WHERE id = p_grupo_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'GROUP_NOT_FOUND');
  END IF;

  v_guard := public.te_lock_categoria_editable(v_torneo_id);
  IF NOT (v_guard ->> 'ok')::boolean THEN
    IF (v_guard ->> 'error') IN ('TOURNAMENT_NOT_EDITABLE', 'ELIMINATORIA_EXISTS') THEN
      RETURN jsonb_build_object(
        'ok', false, 'error', 'GROUP_NOT_EDITABLE', 'reason', v_guard ->> 'error'
      );
    END IF;
    RETURN v_guard;
  END IF;

  PERFORM 1 FROM public.torneo_express_grupos WHERE id = p_grupo_id FOR UPDATE;
  v_version_guard := public.te_grupo_version_ok(p_grupo_id, p_expected_version);
  IF NOT (v_version_guard ->> 'ok')::boolean THEN
    RETURN v_version_guard;
  END IF;
  v_version := (v_version_guard ->> 'version')::integer;

  PERFORM 1
  FROM public.torneo_express_grupo_parejas
  WHERE grupo_id = p_grupo_id
  ORDER BY pareja_id
  FOR UPDATE;

  PERFORM 1
  FROM public.torneo_express_partidos
  WHERE grupo_id = p_grupo_id
  ORDER BY id
  FOR UPDATE;

  v_now_key := public.te_mexico_slot_key(p_now);

  DROP TABLE IF EXISTS te_sched_assign;
  DROP TABLE IF EXISTS te_sched_open;
  DROP TABLE IF EXISTS te_sched_courts;
  DROP TABLE IF EXISTS te_sched_presence;
  CREATE TEMP TABLE te_sched_assign (
    match_id uuid PRIMARY KEY,
    cancha text NOT NULL,
    programado_en timestamptz NOT NULL,
    orden integer NOT NULL,
    time_key text NOT NULL,
    court_key text NOT NULL
  ) ON COMMIT DROP;
  CREATE TEMP TABLE te_sched_open (
    time_key text NOT NULL,
    court_key text NOT NULL,
    PRIMARY KEY (time_key, court_key)
  ) ON COMMIT DROP;
  CREATE TEMP TABLE te_sched_courts (
    time_key text NOT NULL,
    court_key text NOT NULL,
    source text NOT NULL
  ) ON COMMIT DROP;
  CREATE TEMP TABLE te_sched_presence (
    time_key text NOT NULL,
    slot_id uuid NOT NULL,
    match_id uuid NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO te_sched_open (time_key, court_key)
  SELECT DISTINCT
    public.te_mexico_slot_key((value ->> 'programado_en')::timestamptz),
    public.te_court_key(value ->> 'cancha')
  FROM jsonb_array_elements(coalesce(p_slots, '[]'::jsonb)) AS value
  WHERE public.te_court_key(value ->> 'cancha') <> ''
    AND value ->> 'programado_en' IS NOT NULL
  ON CONFLICT DO NOTHING;

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) AS value
    ORDER BY value ->> 'match_id'
  LOOP
    BEGIN
      v_match_id := (v_item ->> 'match_id')::uuid;
      v_cancha := v_item ->> 'cancha';
      v_programado := (v_item ->> 'programado_en')::timestamptz;
      v_orden := (v_item ->> 'orden')::integer;
    EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INVALID_SLOT', 'version', v_version);
    END;

    v_time_key := public.te_mexico_slot_key(v_programado);
    v_court_key := public.te_court_key(v_cancha);
    IF v_match_id IS NULL OR v_programado IS NULL OR v_orden IS NULL OR v_orden < 1
       OR v_court_key = '' OR v_time_key IS NULL OR v_time_key < v_now_key THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INVALID_SLOT', 'version', v_version);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM unnest(coalesce(p_courts, ARRAY[]::text[])) AS court
      WHERE public.te_court_key(court) = v_court_key
    ) OR NOT EXISTS (
      SELECT 1 FROM te_sched_open open
      WHERE open.time_key = v_time_key AND open.court_key = v_court_key
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INVALID_SLOT', 'version', v_version);
    END IF;
    IF EXISTS (SELECT 1 FROM te_sched_assign WHERE match_id = v_match_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INVALID_SLOT', 'version', v_version);
    END IF;

    SELECT
      p.estado, p.cancha, p.programado_en, p.orden,
      p.pareja_local_id, p.pareja_visitante_id,
      public.te_partido_tiene_historial(
        p.estado, p.ganador_id, p.puntos_local, p.puntos_visitante, p.sets_resultado
      ),
      public.te_slot_pareja_actual(p_grupo_id, p.pareja_local_id),
      public.te_slot_pareja_actual(p_grupo_id, p.pareja_visitante_id)
    INTO
      v_estado, v_old_cancha, v_old_programado, v_old_orden,
      v_local, v_visit, v_historial, v_slot_local, v_slot_visit
    FROM public.torneo_express_partidos p
    WHERE p.id = v_match_id AND p.grupo_id = p_grupo_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'MATCH_NOT_IN_GROUP', 'version', v_version);
    END IF;
    IF v_historial OR v_estado IS DISTINCT FROM 'pendiente' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'PLAYED_MATCH_LOCKED', 'version', v_version);
    END IF;
    IF v_slot_local IS NULL OR v_slot_visit IS NULL OR v_slot_local = v_slot_visit THEN
      RETURN jsonb_build_object('ok', false, 'error', 'OBSOLETE_MATCH', 'version', v_version);
    END IF;
    IF p_mode = 'faltantes'
       AND v_old_programado IS NOT NULL
       AND public.te_court_key(v_old_cancha) <> ''
       AND (
         public.te_court_key(v_old_cancha) IS DISTINCT FROM v_court_key
         OR public.te_mexico_slot_key(v_old_programado) IS DISTINCT FROM v_time_key
         OR v_old_orden IS DISTINCT FROM v_orden
       ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'PENDING_ALREADY_SCHEDULED', 'version', v_version);
    END IF;

    INSERT INTO te_sched_assign (match_id, cancha, programado_en, orden, time_key, court_key)
    VALUES (v_match_id, btrim(v_cancha), v_programado, v_orden, v_time_key, v_court_key);
  END LOOP;

  IF p_mode = 'reorganizar' AND EXISTS (
    SELECT 1
    FROM public.torneo_express_partidos p
    WHERE p.grupo_id = p_grupo_id
      AND p.estado = 'pendiente'
      AND NOT public.te_partido_tiene_historial(
        p.estado, p.ganador_id, p.puntos_local, p.puntos_visitante, p.sets_resultado
      )
      AND public.te_slot_pareja_actual(p_grupo_id, p.pareja_local_id) IS NOT NULL
      AND public.te_slot_pareja_actual(p_grupo_id, p.pareja_visitante_id) IS NOT NULL
      AND public.te_slot_pareja_actual(p_grupo_id, p.pareja_local_id)
          IS DISTINCT FROM public.te_slot_pareja_actual(p_grupo_id, p.pareja_visitante_id)
      AND NOT EXISTS (SELECT 1 FROM te_sched_assign a WHERE a.match_id = p.id)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INCOMPLETE_PROPOSAL', 'version', v_version);
  END IF;

  IF p_mode = 'faltantes' AND EXISTS (
    SELECT 1
    FROM public.torneo_express_partidos p
    WHERE p.grupo_id = p_grupo_id
      AND p.estado = 'pendiente'
      AND NOT public.te_partido_tiene_historial(
        p.estado, p.ganador_id, p.puntos_local, p.puntos_visitante, p.sets_resultado
      )
      AND public.te_slot_pareja_actual(p_grupo_id, p.pareja_local_id) IS NOT NULL
      AND public.te_slot_pareja_actual(p_grupo_id, p.pareja_visitante_id) IS NOT NULL
      AND (
        p.programado_en IS NULL OR public.te_court_key(p.cancha) = ''
      )
      AND NOT EXISTS (SELECT 1 FROM te_sched_assign a WHERE a.match_id = p.id)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INCOMPLETE_PROPOSAL', 'version', v_version);
  END IF;

  INSERT INTO te_sched_courts (time_key, court_key, source)
  SELECT time_key, court_key, 'proposal' FROM te_sched_assign;

  INSERT INTO te_sched_courts (time_key, court_key, source)
  SELECT public.te_mexico_slot_key(p.programado_en), public.te_court_key(p.cancha), 'blocked'
  FROM public.torneo_express_partidos p
  JOIN public.torneo_express_grupos g ON g.id = p.grupo_id
  WHERE g.torneo_id = v_torneo_id
    AND p.programado_en IS NOT NULL
    AND public.te_court_key(p.cancha) <> ''
    AND NOT EXISTS (SELECT 1 FROM te_sched_assign a WHERE a.match_id = p.id);

  INSERT INTO te_sched_courts (time_key, court_key, source)
  SELECT public.te_mexico_slot_key(e.programado_en), public.te_court_key(e.cancha), 'blocked'
  FROM public.torneo_express_eliminatoria_partidos e
  WHERE e.torneo_id = v_torneo_id
    AND e.programado_en IS NOT NULL
    AND public.te_court_key(e.cancha) <> '';

  INSERT INTO te_sched_courts (time_key, court_key, source)
  SELECT public.te_mexico_slot_key((value ->> 'programado_en')::timestamptz),
         public.te_court_key(value ->> 'cancha'),
         'blocked'
  FROM jsonb_array_elements(coalesce(p_occupied, '[]'::jsonb)) AS value
  WHERE value ->> 'programado_en' IS NOT NULL
    AND public.te_court_key(value ->> 'cancha') <> '';

  IF EXISTS (
    SELECT 1
    FROM te_sched_courts proposal
    WHERE proposal.source = 'proposal'
      AND (
        EXISTS (
          SELECT 1 FROM te_sched_courts other
          WHERE other.source = 'blocked'
            AND other.time_key = proposal.time_key
            AND other.court_key = proposal.court_key
        )
        OR (
          SELECT count(*) FROM te_sched_courts twin
          WHERE twin.source = 'proposal'
            AND twin.time_key = proposal.time_key
            AND twin.court_key = proposal.court_key
        ) > 1
      )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'COURT_SLOT_CONFLICT', 'version', v_version);
  END IF;

  INSERT INTO te_sched_presence (time_key, slot_id, match_id)
  SELECT a.time_key, public.te_slot_pareja_actual(p_grupo_id, p.pareja_local_id), a.match_id
  FROM te_sched_assign a
  JOIN public.torneo_express_partidos p ON p.id = a.match_id
  UNION ALL
  SELECT a.time_key, public.te_slot_pareja_actual(p_grupo_id, p.pareja_visitante_id), a.match_id
  FROM te_sched_assign a
  JOIN public.torneo_express_partidos p ON p.id = a.match_id;

  INSERT INTO te_sched_presence (time_key, slot_id, match_id)
  SELECT
    public.te_mexico_slot_key(p.programado_en),
    coalesce(public.te_slot_pareja_actual(p.grupo_id, p.pareja_local_id), p.pareja_local_id),
    p.id
  FROM public.torneo_express_partidos p
  WHERE p.grupo_id = p_grupo_id
    AND p.programado_en IS NOT NULL
    AND public.te_court_key(p.cancha) <> ''
    AND NOT EXISTS (SELECT 1 FROM te_sched_assign a WHERE a.match_id = p.id)
  UNION ALL
  SELECT
    public.te_mexico_slot_key(p.programado_en),
    coalesce(public.te_slot_pareja_actual(p.grupo_id, p.pareja_visitante_id), p.pareja_visitante_id),
    p.id
  FROM public.torneo_express_partidos p
  WHERE p.grupo_id = p_grupo_id
    AND p.programado_en IS NOT NULL
    AND public.te_court_key(p.cancha) <> ''
    AND NOT EXISTS (SELECT 1 FROM te_sched_assign a WHERE a.match_id = p.id);

  IF EXISTS (
    SELECT 1
    FROM te_sched_presence proposal
    JOIN te_sched_presence other
      ON other.time_key = proposal.time_key
     AND other.slot_id = proposal.slot_id
     AND other.match_id <> proposal.match_id
    WHERE EXISTS (SELECT 1 FROM te_sched_assign a WHERE a.match_id = proposal.match_id)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PAIR_SLOT_CONFLICT', 'version', v_version);
  END IF;

  UPDATE public.torneo_express_partidos p
  SET cancha = a.cancha,
      programado_en = a.programado_en,
      orden = a.orden
  FROM te_sched_assign a
  WHERE p.id = a.match_id
    AND p.grupo_id = p_grupo_id
    AND p.estado = 'pendiente'
    AND (
      p.cancha IS DISTINCT FROM a.cancha
      OR p.programado_en IS DISTINCT FROM a.programado_en
      OR p.orden IS DISTINCT FROM a.orden
    );
  GET DIAGNOSTICS v_changed = ROW_COUNT;

  IF EXISTS (
    SELECT 1
    FROM te_sched_assign a
    JOIN public.torneo_express_partidos p ON p.id = a.match_id
    WHERE p.grupo_id IS DISTINCT FROM p_grupo_id
       OR p.estado IS DISTINCT FROM 'pendiente'
       OR public.te_mexico_slot_key(p.programado_en) IS DISTINCT FROM a.time_key
       OR public.te_court_key(p.cancha) IS DISTINCT FROM a.court_key
  ) THEN
    RAISE EXCEPTION 'SCHEDULE_INVARIANT';
  END IF;

  IF v_changed = 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'changed', 0,
      'version', v_version
    );
  END IF;

  v_version := public.te_grupo_bump_version(p_grupo_id);
  RETURN jsonb_build_object(
    'ok', true,
    'changed', v_changed,
    'version', v_version
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.confirmar_torneo_express_fase_eliminatoria_transicion(
  p_torneo_id uuid,
  p_fase_eliminacion text,
  p_bracket_slots jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organizador uuid;
  v_rows int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  SELECT organizador_id INTO v_organizador
  FROM public.torneo_express
  WHERE id = p_torneo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_organizador IS NULL OR v_organizador IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Sin permiso sobre este torneo';
  END IF;

  IF public.te_torneo_fase_grupos_incompleta(p_torneo_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'GROUP_PHASE_INCOMPLETE');
  END IF;

  UPDATE public.torneo_express
  SET fase_torneo = 'eliminatoria',
      fase_eliminacion = p_fase_eliminacion,
      bracket_slots = p_bracket_slots,
      fase_grupos_finalizada_at = now(),
      estado = 'en_curso'
  WHERE id = p_torneo_id
    AND fase_torneo = 'grupos';

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ya_en_eliminatoria');
  END IF;

  RETURN jsonb_build_object('ok', true, 'torneo_id', p_torneo_id);
END;
$$;

REVOKE ALL ON FUNCTION public.te_court_key(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.te_torneo_fase_grupos_incompleta(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aplicar_programacion_torneo_express_grupo(uuid, integer, text, timestamptz, jsonb, text[], jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirmar_torneo_express_fase_eliminatoria_transicion(uuid, text, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.aplicar_programacion_torneo_express_grupo(uuid, integer, text, timestamptz, jsonb, text[], jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_torneo_express_fase_eliminatoria_transicion(uuid, text, jsonb) TO authenticated;
