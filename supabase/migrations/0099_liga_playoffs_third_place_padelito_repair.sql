-- 0099: Partido THIRD (3.er/4.º) en playoffs de liga + reparación Padelito T1.
--
-- Causa: ensurePlayoffsGranFinal solo materializaba FINAL; THIRD nunca se insertaba.
-- El cliente TS ahora crea FINAL+THIRD de forma idempotente (UNIQUE liga_id+bracket_slot).
--
-- Esta migración:
-- 1) Documenta el slot THIRD en comentario de columna.
-- 2) Repara únicamente «Liga Padelito Warehouse Temporada 1» si falta THIRD,
--    sin tocar la Gran Final ya marcada (a5806e1d-…).

COMMENT ON COLUMN public.liga_partidos.bracket_slot IS
  'SF1 | SF2 | CL1..CLk | FINAL | THIRD (NULL en regulares); THIRD = 3.er/4.º (no confundir con CL)';

DO $$
DECLARE
  v_liga_id uuid := '08d658c9-ebf5-411f-bfff-c764f3226858';
  v_liga_nombre text;
  v_jornada_final_id uuid := 'd314330b-69ce-419b-a60c-e5079ca64d2a';
  v_final_id uuid := 'a5806e1d-81ff-402a-9406-706be98b5f98';
  v_eq_arturo uuid := 'f5883491-f0bb-4e9a-a374-b4c439b3197c';
  v_eq_kevin uuid := '0b866493-fa0c-4b21-a462-861050c3947a';
  v_eq_eddie uuid := 'eb451406-f7d1-46f6-9ce9-7e66b1563035';
  v_eq_cuadra uuid := '224e1237-74a9-4da9-8477-8a263d125c96';
  v_sf1_winner uuid;
  v_sf1_loser uuid;
  v_sf2_winner uuid;
  v_sf2_loser uuid;
  v_final_eq1 uuid;
  v_final_eq2 uuid;
  v_third_exists boolean;
  v_pareja_arturo uuid;
  v_pareja_kevin uuid;
  v_kevin_jug1 uuid;
  v_kevin_jug2 uuid;
  v_third_id uuid;
BEGIN
  SELECT nombre INTO v_liga_nombre
  FROM public.ligas
  WHERE id = v_liga_id;

  IF v_liga_nombre IS NULL THEN
    RAISE NOTICE '0099: liga % no existe; skip repair', v_liga_id;
    RETURN;
  END IF;

  IF v_liga_nombre NOT ILIKE '%PADELITO%WAREHOUSE%TEMPORADA%1%' THEN
    RAISE EXCEPTION '0099: liga % nombre inesperado: %', v_liga_id, v_liga_nombre;
  END IF;

  -- Verificar SF1: Arturo vs Eddie, ganador Eddie (STB)
  SELECT
    CASE
      WHEN set_scores->'stb'->>'p2' = '10' AND set_scores->'stb'->>'p1' = '4'
        THEN pareja2_equipo
      ELSE NULL
    END,
    CASE
      WHEN set_scores->'stb'->>'p2' = '10' AND set_scores->'stb'->>'p1' = '4'
        THEN pareja1_equipo
      ELSE NULL
    END
  INTO v_sf1_winner, v_sf1_loser
  FROM (
    SELECT
      p.set_scores,
      jp1.equipo_id AS pareja1_equipo,
      jp2.equipo_id AS pareja2_equipo
    FROM public.liga_partidos p
    JOIN public.liga_jornada_parejas jp1 ON jp1.id = p.pareja1_id
    JOIN public.liga_jornada_parejas jp2 ON jp2.id = p.pareja2_id
    WHERE p.liga_id = v_liga_id AND p.bracket_slot = 'SF1' AND p.estado = 'completed'
  ) s;

  IF v_sf1_winner IS DISTINCT FROM v_eq_eddie OR v_sf1_loser IS DISTINCT FROM v_eq_arturo THEN
    RAISE EXCEPTION
      '0099: SF1 no coincide con captura esperada (Eddie gana a Arturo). winner=% loser=%',
      v_sf1_winner, v_sf1_loser;
  END IF;

  -- Verificar SF2: Cuadra vs Kevin, ganador Cuadra (games 12-7)
  SELECT
    CASE WHEN p.score_pareja1 > p.score_pareja2 THEN jp1.equipo_id ELSE jp2.equipo_id END,
    CASE WHEN p.score_pareja1 > p.score_pareja2 THEN jp2.equipo_id ELSE jp1.equipo_id END
  INTO v_sf2_winner, v_sf2_loser
  FROM public.liga_partidos p
  JOIN public.liga_jornada_parejas jp1 ON jp1.id = p.pareja1_id
  JOIN public.liga_jornada_parejas jp2 ON jp2.id = p.pareja2_id
  WHERE p.liga_id = v_liga_id AND p.bracket_slot = 'SF2' AND p.estado = 'completed';

  IF v_sf2_winner IS DISTINCT FROM v_eq_cuadra OR v_sf2_loser IS DISTINCT FROM v_eq_kevin THEN
    RAISE EXCEPTION
      '0099: SF2 no coincide (Cuadra gana a Kevin). winner=% loser=%',
      v_sf2_winner, v_sf2_loser;
  END IF;

  -- Proteger FINAL existente
  SELECT jp1.equipo_id, jp2.equipo_id
  INTO v_final_eq1, v_final_eq2
  FROM public.liga_partidos p
  JOIN public.liga_jornada_parejas jp1 ON jp1.id = p.pareja1_id
  JOIN public.liga_jornada_parejas jp2 ON jp2.id = p.pareja2_id
  WHERE p.id = v_final_id
    AND p.liga_id = v_liga_id
    AND p.bracket_slot = 'FINAL'
    AND p.estado = 'completed'
    AND p.jornada_id = v_jornada_final_id;

  IF v_final_eq1 IS NULL THEN
    RAISE EXCEPTION '0099: FINAL % no encontrada o no completed; abort', v_final_id;
  END IF;

  IF v_final_eq1 IS DISTINCT FROM v_eq_eddie OR v_final_eq2 IS DISTINCT FROM v_eq_cuadra THEN
    RAISE EXCEPTION
      '0099: FINAL participantes inesperados eq1=% eq2=%; abort sin tocar',
      v_final_eq1, v_final_eq2;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.liga_partidos
    WHERE liga_id = v_liga_id AND bracket_slot = 'THIRD'
  ) INTO v_third_exists;

  IF v_third_exists THEN
    RAISE NOTICE '0099: THIRD ya existe; noop';
    -- Asegurar jornada no completed si THIRD pending
    UPDATE public.liga_jornadas j
    SET estado = 'in_progress', puntos_aplicados = false
    WHERE j.id = v_jornada_final_id
      AND j.estado = 'completed'
      AND EXISTS (
        SELECT 1 FROM public.liga_partidos p
        WHERE p.jornada_id = j.id AND p.estado IS DISTINCT FROM 'completed'
      );
    RETURN;
  END IF;

  -- Pareja Arturo en jornada final (ya debería existir)
  SELECT id INTO v_pareja_arturo
  FROM public.liga_jornada_parejas
  WHERE jornada_id = v_jornada_final_id AND equipo_id = v_eq_arturo
  LIMIT 1;

  IF v_pareja_arturo IS NULL THEN
    INSERT INTO public.liga_jornada_parejas (jornada_id, equipo_id, jugador1_id, jugador2_id)
    SELECT v_jornada_final_id, e.id, e.jugador1_id, e.jugador2_id
    FROM public.liga_equipos e
    WHERE e.id = v_eq_arturo
    RETURNING id INTO v_pareja_arturo;
  END IF;

  -- Pareja Kevin (faltante en captura)
  SELECT id INTO v_pareja_kevin
  FROM public.liga_jornada_parejas
  WHERE jornada_id = v_jornada_final_id AND equipo_id = v_eq_kevin
  LIMIT 1;

  IF v_pareja_kevin IS NULL THEN
    SELECT jugador1_id, jugador2_id INTO v_kevin_jug1, v_kevin_jug2
    FROM public.liga_equipos WHERE id = v_eq_kevin;

    INSERT INTO public.liga_jornada_parejas (jornada_id, equipo_id, jugador1_id, jugador2_id)
    VALUES (v_jornada_final_id, v_eq_kevin, v_kevin_jug1, v_kevin_jug2)
    RETURNING id INTO v_pareja_kevin;
  END IF;

  INSERT INTO public.liga_partidos (
    jornada_id, liga_id, pareja1_id, pareja2_id,
    ronda, cancha, estado, score_pareja1, score_pareja2,
    fase, bracket_slot
  )
  VALUES (
    v_jornada_final_id, v_liga_id, v_pareja_arturo, v_pareja_kevin,
    1, 2, 'upcoming', NULL, NULL,
    'classification', 'THIRD'
  )
  RETURNING id INTO v_third_id;

  UPDATE public.liga_jornadas
  SET estado = 'in_progress', puntos_aplicados = false
  WHERE id = v_jornada_final_id
    AND estado = 'completed';

  RAISE NOTICE '0099: THIRD creado id=% jornada=% FINAL intacta=%',
    v_third_id, v_jornada_final_id, v_final_id;
END $$;
