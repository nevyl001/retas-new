-- Riviera Flex League. Liga individual por jornadas de Americano Dinámico.
-- Los puntos de posición viven en esta liga. No escriben el ledger global.

DO $$
DECLARE
  v_before text;
BEGIN
  SELECT pg_get_constraintdef(c.oid)
    INTO v_before
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'ligas'
    AND c.conname = 'ligas_modalidad_check';

  IF v_before IS NOT NULL AND v_before ILIKE '%flex_league%' THEN
    RETURN;
  END IF;

  IF v_before IS NOT NULL AND v_before NOT ILIKE '%individual_rotativo%' THEN
    RAISE EXCEPTION '0137 ABORT: el CHECK de modalidad no conserva individual_rotativo (%).', v_before;
  END IF;

  ALTER TABLE public.ligas DROP CONSTRAINT IF EXISTS ligas_modalidad_check;
  ALTER TABLE public.ligas
    ADD CONSTRAINT ligas_modalidad_check
    CHECK (
      modalidad = ANY (
        ARRAY[
          'individual_rotativo'::text,
          'parejas_fijas'::text,
          'parejas_fijas_playoffs'::text,
          'flex_league'::text
        ]
      )
    );
END $$;

COMMENT ON CONSTRAINT ligas_modalidad_check ON public.ligas IS
  'Modalidades Liga: individual_rotativo | parejas_fijas | parejas_fijas_playoffs | flex_league';

CREATE TABLE IF NOT EXISTS public.liga_flex_config (
  liga_id uuid PRIMARY KEY REFERENCES public.ligas(id) ON DELETE CASCADE,
  jornadas_planeadas integer NOT NULL DEFAULT 12 CHECK (jornadas_planeadas BETWEEN 1 AND 48),
  jugadores_min integer NOT NULL DEFAULT 12 CHECK (jugadores_min >= 4),
  jugadores_max integer NOT NULL DEFAULT 16 CHECK (jugadores_max BETWEEN jugadores_min AND 16),
  rondas_sugeridas integer NOT NULL DEFAULT 5 CHECK (rondas_sugeridas BETWEEN 1 AND 24),
  duracion_ronda_min integer NOT NULL DEFAULT 20 CHECK (duracion_ronda_min BETWEEN 5 AND 90),
  descanso_min integer NOT NULL DEFAULT 3 CHECK (descanso_min BETWEEN 0 AND 30),
  categoria text,
  horario_sugerido text,
  inscripcion_temporada_mxn numeric,
  participacion_jornada_mxn numeric,
  premio_campeon text,
  premio_subcampeon text,
  premio_tercer text,
  jornada_final_id uuid,
  cerrado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'liga_flex_config_jornada_final_fkey'
  ) THEN
    ALTER TABLE public.liga_flex_config
      ADD CONSTRAINT liga_flex_config_jornada_final_fkey
      FOREIGN KEY (jornada_final_id) REFERENCES public.liga_jornadas(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.liga_jornada_flex (
  jornada_id uuid PRIMARY KEY REFERENCES public.liga_jornadas(id) ON DELETE CASCADE,
  liga_id uuid NOT NULL REFERENCES public.ligas(id) ON DELETE CASCADE,
  canchas integer NOT NULL DEFAULT 3 CHECK (canchas BETWEEN 1 AND 12),
  rondas integer NOT NULL DEFAULT 5 CHECK (rondas BETWEEN 1 AND 24),
  duracion_ronda_min integer NOT NULL DEFAULT 20 CHECK (duracion_ronda_min BETWEEN 5 AND 90),
  descanso_min integer NOT NULL DEFAULT 3 CHECK (descanso_min BETWEEN 0 AND 30),
  hora_inicio time,
  hora_fin time,
  seed bigint,
  programacion_estado text NOT NULL DEFAULT 'vacia'
    CHECK (programacion_estado IN ('vacia', 'borrador', 'confirmada')),
  advertencia text,
  es_final boolean NOT NULL DEFAULT false,
  calidad jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS liga_jornada_flex_una_final
  ON public.liga_jornada_flex (liga_id)
  WHERE es_final;

CREATE TABLE IF NOT EXISTS public.liga_jornada_participantes (
  jornada_id uuid NOT NULL REFERENCES public.liga_jornadas(id) ON DELETE CASCADE,
  jugador_id uuid NOT NULL REFERENCES public.liga_jugadores(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (jornada_id, jugador_id)
);

CREATE TABLE IF NOT EXISTS public.liga_flex_posiciones (
  jornada_id uuid NOT NULL REFERENCES public.liga_jornadas(id) ON DELETE CASCADE,
  jugador_id uuid NOT NULL REFERENCES public.liga_jugadores(id),
  posicion integer NOT NULL CHECK (posicion BETWEEN 1 AND 16),
  puntos integer NOT NULL CHECK (puntos >= 0),
  partidos integer NOT NULL CHECK (partidos >= 0),
  games_favor integer NOT NULL,
  games_contra integer NOT NULL,
  promedio_gf numeric NOT NULL,
  promedio_dif numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (jornada_id, jugador_id),
  UNIQUE (jornada_id, posicion)
);

CREATE TABLE IF NOT EXISTS public.liga_flex_honores (
  liga_id uuid PRIMARY KEY REFERENCES public.ligas(id) ON DELETE CASCADE,
  campeon_id uuid NOT NULL REFERENCES public.liga_jugadores(id),
  subcampeon_id uuid NOT NULL REFERENCES public.liga_jugadores(id),
  tercer_id uuid REFERENCES public.liga_jugadores(id),
  jornada_final_id uuid NOT NULL REFERENCES public.liga_jornadas(id) ON DELETE CASCADE,
  cerrado_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.liga_flex_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id uuid NOT NULL REFERENCES public.ligas(id) ON DELETE CASCADE,
  jornada_id uuid REFERENCES public.liga_jornadas(id) ON DELETE SET NULL,
  actor_id uuid NOT NULL,
  accion text NOT NULL,
  detalle jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS liga_flex_auditoria_liga_idx
  ON public.liga_flex_auditoria (liga_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.flex_puntos_por_posicion(p_posicion integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_posicion
    WHEN 1 THEN 100 WHEN 2 THEN 90 WHEN 3 THEN 80 WHEN 4 THEN 70
    WHEN 5 THEN 65 WHEN 6 THEN 60 WHEN 7 THEN 55 WHEN 8 THEN 50
    WHEN 9 THEN 45 WHEN 10 THEN 40 WHEN 11 THEN 35 WHEN 12 THEN 30
    WHEN 13 THEN 25 WHEN 14 THEN 20 WHEN 15 THEN 15 WHEN 16 THEN 10
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.flex_league_can_write(p_liga_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND COALESCE(public.is_restricted_sub_account(auth.uid()), false) = false
    AND EXISTS (
      SELECT 1
      FROM public.ligas l
      WHERE l.id = p_liga_id
        AND l.modalidad = 'flex_league'
        AND (l.organizador_id = auth.uid() OR COALESCE(public.is_master_admin(), false))
    );
$$;

CREATE OR REPLACE FUNCTION public.flex_recalcular_puntos_inscripcion(p_liga_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.liga_inscripciones i
     SET puntos = COALESCE((
       SELECT SUM(p.puntos)::int
       FROM public.liga_flex_posiciones p
       JOIN public.liga_jornadas j ON j.id = p.jornada_id
       WHERE j.liga_id = p_liga_id
         AND j.estado = 'completed'
         AND p.jugador_id = i.jugador_id
     ), 0)
   WHERE i.liga_id = p_liga_id;
END;
$$;

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

  UPDATE public.liga_jornada_flex
     SET seed = p_seed,
         programacion_estado = 'confirmada',
         calidad = p_calidad,
         advertencia = NULLIF(btrim(COALESCE(p_advertencia, '')), ''),
         updated_at = now()
   WHERE jornada_id = p_jornada_id;

  INSERT INTO public.liga_flex_auditoria (liga_id, jornada_id, actor_id, accion, detalle)
  VALUES (v_liga, p_jornada_id, auth.uid(), 'confirmar_programacion', jsonb_build_object('seed', p_seed));

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.flex_set_participantes(
  p_jornada_id uuid,
  p_jugadores uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_liga uuid;
  v_estado text;
  v_max int;
  v_id uuid;
BEGIN
  SELECT j.liga_id, j.estado INTO v_liga, v_estado
  FROM public.liga_jornadas j WHERE j.id = p_jornada_id;
  IF v_liga IS NULL OR NOT public.flex_league_can_write(v_liga) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin permiso para esta jornada.');
  END IF;
  IF v_estado <> 'upcoming' OR EXISTS (
    SELECT 1 FROM public.liga_partidos
    WHERE jornada_id = p_jornada_id
      AND (score_pareja1 IS NOT NULL OR score_pareja2 IS NOT NULL)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No se cambia el roster de una jornada con resultados.');
  END IF;

  SELECT COALESCE(jugadores_max, 16) INTO v_max
  FROM public.liga_flex_config WHERE liga_id = v_liga;
  IF COALESCE(array_length(p_jugadores, 1), 0) > COALESCE(v_max, 16) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Hay más jugadores que el máximo de la jornada.');
  END IF;
  IF (
    SELECT COUNT(DISTINCT x) FROM unnest(COALESCE(p_jugadores, ARRAY[]::uuid[])) x
  ) IS DISTINCT FROM COALESCE(array_length(p_jugadores, 1), 0) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Un jugador está repetido en la jornada.');
  END IF;

  DELETE FROM public.liga_partidos WHERE jornada_id = p_jornada_id;
  DELETE FROM public.liga_jornada_parejas WHERE jornada_id = p_jornada_id;
  DELETE FROM public.liga_jornada_participantes WHERE jornada_id = p_jornada_id;

  FOREACH v_id IN ARRAY COALESCE(p_jugadores, ARRAY[]::uuid[])
  LOOP
    INSERT INTO public.liga_jornada_participantes (jornada_id, jugador_id)
    VALUES (p_jornada_id, v_id);
    INSERT INTO public.liga_inscripciones (liga_id, jugador_id, puntos)
    SELECT v_liga, v_id, 0
    WHERE NOT EXISTS (
      SELECT 1 FROM public.liga_inscripciones
      WHERE liga_id = v_liga AND jugador_id = v_id
    );
  END LOOP;

  UPDATE public.liga_jornada_flex
     SET programacion_estado = 'vacia',
         seed = NULL,
         calidad = NULL,
         advertencia = NULL,
         updated_at = now()
   WHERE jornada_id = p_jornada_id;

  RETURN jsonb_build_object('ok', true, 'participantes', COALESCE(array_length(p_jugadores, 1), 0));
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
  v_n int;
  v_row jsonb;
  v_pos int;
  v_pts int;
BEGIN
  SELECT j.liga_id INTO v_liga FROM public.liga_jornadas j WHERE j.id = p_jornada_id;
  IF v_liga IS NULL OR NOT public.flex_league_can_write(v_liga) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin permiso para cerrar esta jornada.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.ligas WHERE id = v_liga AND estado = 'completed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La liga está cerrada. Reábrela para corregir.');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.liga_partidos
    WHERE jornada_id = p_jornada_id
      AND (estado IS DISTINCT FROM 'completed' OR score_pareja1 IS NULL OR score_pareja2 IS NULL)
  ) OR NOT EXISTS (
    SELECT 1 FROM public.liga_partidos WHERE jornada_id = p_jornada_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Completa todos los marcadores antes de asignar puntos.');
  END IF;

  v_n := jsonb_array_length(p_filas);
  IF v_n IS NULL OR v_n < 1 OR v_n > 16 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La clasificación de la jornada no es válida.');
  END IF;
  IF (
    SELECT COUNT(*) FROM public.liga_jornada_participantes WHERE jornada_id = p_jornada_id
  ) IS DISTINCT FROM v_n THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La clasificación no cubre a los participantes de la jornada.');
  END IF;

  DELETE FROM public.liga_flex_posiciones WHERE jornada_id = p_jornada_id;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_filas)
  LOOP
    v_pos := (v_row->>'posicion')::int;
    v_pts := public.flex_puntos_por_posicion(v_pos);
    IF v_pts IS NULL OR v_pts IS DISTINCT FROM (v_row->>'puntos')::int THEN
      RAISE EXCEPTION 'Los puntos no coinciden con la tabla oficial de la posición %.', v_pos;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.liga_jornada_participantes
      WHERE jornada_id = p_jornada_id AND jugador_id = (v_row->>'jugador_id')::uuid
    ) THEN
      RAISE EXCEPTION 'La clasificación incluye a alguien fuera de la jornada.';
    END IF;
    INSERT INTO public.liga_flex_posiciones (
      jornada_id, jugador_id, posicion, puntos, partidos,
      games_favor, games_contra, promedio_gf, promedio_dif
    ) VALUES (
      p_jornada_id,
      (v_row->>'jugador_id')::uuid,
      v_pos,
      v_pts,
      (v_row->>'partidos')::int,
      (v_row->>'games_favor')::int,
      (v_row->>'games_contra')::int,
      (v_row->>'promedio_gf')::numeric,
      (v_row->>'promedio_dif')::numeric
    );
  END LOOP;

  UPDATE public.liga_jornadas
     SET estado = 'completed', puntos_aplicados = true
   WHERE id = p_jornada_id;

  UPDATE public.ligas
     SET estado = 'in_progress'
   WHERE id = v_liga AND estado = 'upcoming';

  PERFORM public.flex_recalcular_puntos_inscripcion(v_liga);

  INSERT INTO public.liga_flex_auditoria (liga_id, jornada_id, actor_id, accion, detalle)
  VALUES (
    v_liga, p_jornada_id, auth.uid(), 'aplicar_jornada',
    jsonb_build_object('nota', NULLIF(btrim(COALESCE(p_nota, '')), ''))
  );

  RETURN jsonb_build_object('ok', true);
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
  v_row record;
  v_prev jsonb;
  v_place int := 0;
  v_tie boolean;
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

  SELECT c.jornada_final_id INTO v_final
  FROM public.liga_flex_config c WHERE c.liga_id = p_liga_id;
  IF v_final IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Marca la jornada final antes de cerrar.');
  END IF;
  SELECT numero INTO v_num FROM public.liga_jornadas WHERE id = v_final AND liga_id = p_liga_id;
  SELECT MAX(numero) INTO v_max FROM public.liga_jornadas WHERE liga_id = p_liga_id;
  IF v_num IS NULL OR v_num IS DISTINCT FROM v_max THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La jornada final tiene que ser la última del calendario.');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.liga_jornadas
    WHERE id = v_final AND estado IS DISTINCT FROM 'completed'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Termina la jornada final antes de cerrar la liga.');
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS flex_board_close (
    jugador_id uuid PRIMARY KEY,
    puntos int NOT NULL,
    jj int NOT NULL,
    keys int[] NOT NULL,
    picked boolean NOT NULL DEFAULT false
  ) ON COMMIT DROP;
  DELETE FROM flex_board_close;

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
          'error', 'El podio sigue empatado. Registra el orden deportivo antes de cerrar.',
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

CREATE OR REPLACE FUNCTION public.flex_reabrir_liga(p_liga_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.flex_league_can_write(p_liga_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin permiso para reabrir esta liga.');
  END IF;
  IF NULLIF(btrim(COALESCE(p_motivo, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Escribe el motivo de la reapertura.');
  END IF;
  DELETE FROM public.liga_flex_honores WHERE liga_id = p_liga_id;
  UPDATE public.liga_flex_config
     SET cerrado_at = NULL, updated_at = now()
   WHERE liga_id = p_liga_id;
  UPDATE public.ligas SET estado = 'in_progress' WHERE id = p_liga_id;
  INSERT INTO public.liga_flex_auditoria (liga_id, actor_id, accion, detalle)
  VALUES (p_liga_id, auth.uid(), 'reabrir_liga', jsonb_build_object('motivo', btrim(p_motivo)));
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.flex_puntos_por_posicion(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.flex_league_can_write(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.flex_recalcular_puntos_inscripcion(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.flex_guardar_programacion(uuid, bigint, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.flex_set_participantes(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.flex_aplicar_jornada(uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.flex_cerrar_liga(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.flex_reabrir_liga(uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.flex_puntos_por_posicion(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flex_league_can_write(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flex_guardar_programacion(uuid, bigint, jsonb, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flex_set_participantes(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flex_aplicar_jornada(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flex_cerrar_liga(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flex_reabrir_liga(uuid, text) TO authenticated;

ALTER TABLE public.liga_flex_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liga_jornada_flex ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liga_jornada_participantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liga_flex_posiciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liga_flex_honores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liga_flex_auditoria ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.liga_flex_config FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.liga_jornada_flex FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.liga_jornada_participantes FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.liga_flex_posiciones FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.liga_flex_honores FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.liga_flex_auditoria FROM PUBLIC, anon;

GRANT SELECT ON TABLE public.liga_flex_config TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.liga_flex_config TO authenticated;
GRANT SELECT ON TABLE public.liga_jornada_flex TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.liga_jornada_flex TO authenticated;
GRANT SELECT ON TABLE public.liga_jornada_participantes TO anon, authenticated;
GRANT SELECT ON TABLE public.liga_flex_posiciones TO anon, authenticated;
GRANT SELECT ON TABLE public.liga_flex_honores TO anon, authenticated;
GRANT SELECT ON TABLE public.liga_flex_auditoria TO authenticated;

DROP POLICY IF EXISTS liga_flex_config_read ON public.liga_flex_config;
CREATE POLICY liga_flex_config_read ON public.liga_flex_config
  FOR SELECT TO anon, authenticated
  USING (public.is_liga_public(liga_id) OR public.flex_league_can_write(liga_id));

DROP POLICY IF EXISTS liga_flex_config_write ON public.liga_flex_config;
CREATE POLICY liga_flex_config_write ON public.liga_flex_config
  FOR ALL TO authenticated
  USING (public.flex_league_can_write(liga_id))
  WITH CHECK (public.flex_league_can_write(liga_id));

DROP POLICY IF EXISTS liga_jornada_flex_read ON public.liga_jornada_flex;
CREATE POLICY liga_jornada_flex_read ON public.liga_jornada_flex
  FOR SELECT TO anon, authenticated
  USING (public.is_liga_public(liga_id) OR public.flex_league_can_write(liga_id));

DROP POLICY IF EXISTS liga_jornada_flex_write ON public.liga_jornada_flex;
CREATE POLICY liga_jornada_flex_write ON public.liga_jornada_flex
  FOR ALL TO authenticated
  USING (public.flex_league_can_write(liga_id))
  WITH CHECK (public.flex_league_can_write(liga_id));

DROP POLICY IF EXISTS liga_jornada_participantes_read ON public.liga_jornada_participantes;
CREATE POLICY liga_jornada_participantes_read ON public.liga_jornada_participantes
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.liga_jornadas j
      WHERE j.id = jornada_id
        AND (public.is_liga_public(j.liga_id) OR public.flex_league_can_write(j.liga_id))
    )
  );

DROP POLICY IF EXISTS liga_flex_posiciones_read ON public.liga_flex_posiciones;
CREATE POLICY liga_flex_posiciones_read ON public.liga_flex_posiciones
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.liga_jornadas j
      WHERE j.id = jornada_id
        AND (public.is_liga_public(j.liga_id) OR public.flex_league_can_write(j.liga_id))
    )
  );

DROP POLICY IF EXISTS liga_flex_honores_read ON public.liga_flex_honores;
CREATE POLICY liga_flex_honores_read ON public.liga_flex_honores
  FOR SELECT TO anon, authenticated
  USING (public.is_liga_public(liga_id) OR public.flex_league_can_write(liga_id));

DROP POLICY IF EXISTS liga_flex_auditoria_read ON public.liga_flex_auditoria;
CREATE POLICY liga_flex_auditoria_read ON public.liga_flex_auditoria
  FOR SELECT TO authenticated
  USING (public.flex_league_can_write(liga_id));

COMMENT ON TABLE public.liga_flex_posiciones IS
  'Puntos oficiales de Riviera Flex League por jornada. Se reemplazan al corregir; no se acumulan encima.';
