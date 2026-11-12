-- =============================================================================
-- 0129_resultado_detalle_playoff_y_duelo.sql
--
-- Alinea el resultado derivado de ocho participaciones de playoff y del
-- duelo de RIV-00000037 con el ganador oficial ya guardado.
--
-- Playoffs (sets 1-1, gana el súper tie-break del lado con menos juegos):
--   d6852631-9648-42df-91e3-83dc94b7cc18  sets 3-6, 6-1, STB 3-5, juegos 9-7
--   fa99a5d2-1125-4ebb-851f-8f5682261a5b  sets 4-6, 6-3, STB 4-10, juegos 10-9
-- El otro partido de la misma jornada, si existe, no se toca.
--
-- Duelo c46767cf-74fd-4e03-9e39-5c5773319f20:
--   resultado oficial derrota, 20 puntos, juegos 15-14.
--   Solo el campo resultado del detalle pasa de win a loss.
--
-- No modifica puntos, ledger, totales, columnas de marcador ni el resultado
-- de la participación. Guarda el valor anterior en metadata.
-- Si la fila ya está alineada, no hace nada. Si el marcador original cambió,
-- aborta sin escribir.
--
-- APLICACIÓN: ejecutar este archivo solo, a mano. No usar db push.
-- =============================================================================

DO $$
DECLARE
  v_ledger_before text;
  v_totals_before text;
  v_ledger_after text;
  v_totals_after text;
  v_side int;
  v_row record;
  v_item jsonb;
  v_new_item jsonb;
  v_detalle jsonb;
  v_changed boolean;
  v_favor int;
  v_contra int;
  v_side_jugador int;
  v_esperado text;
  v_ganados int;
  v_perdidos int;
  v_empatados int;
  v_metadata jsonb;
  v_reparadas int := 0;
  v_objetivos int;
  v_mal int;
BEGIN
  SELECT md5(coalesce(string_agg(
    participacion_id::text || ':' || points::text || ':' || counts_for_official_ranking::text,
    ',' ORDER BY participacion_id::text
  ), ''))
  INTO v_ledger_before
  FROM public.riviera_official_points_ledger;

  SELECT md5(coalesce(string_agg(
    official_player_key::text || ':' || points_total::text,
    ',' ORDER BY official_player_key::text
  ), ''))
  INTO v_totals_before
  FROM public.riviera_official_player_totals;

  CREATE TEMP TABLE resultado_detalle_stats_antes ON COMMIT DROP AS
  SELECT s.jugador_id, s.puntos_totales, s.sets_favor_total, s.sets_contra_total,
         s.victorias, s.derrotas
  FROM public.jugador_stats s
  WHERE s.jugador_id IN (
    SELECT jp.jugador_id
    FROM public.jugador_participaciones jp
    WHERE jp.id IN (
      '10ae20e2-c33e-47e0-986d-57e6186a51a0',
      '6050f6ab-7761-4dbe-8d5e-f07b4c2155c1',
      '8086465b-2518-4567-9a79-c5f3fc7e1258',
      '9c314e51-13e5-4c67-bf8f-d2e0cd9dc44a',
      'cf59bf91-5a69-4ee7-9148-2acaa6974533',
      'd6679a74-4bed-463b-8fd8-ed9ceb9cbd8a',
      'db6abb86-483a-4e71-8a64-3dd2470541e0',
      'f939e849-7849-41ef-88b7-584c9ab5b4c7',
      'c46767cf-74fd-4e03-9e39-5c5773319f20'
    )
  );

  PERFORM 1 FROM public.liga_partidos p
  WHERE p.id = 'd6852631-9648-42df-91e3-83dc94b7cc18'
    AND p.estado = 'completed'
    AND p.score_pareja1 = 9
    AND p.score_pareja2 = 7
    AND p.set_scores->>'format' = 'parejas_fijas_playoffs'
    AND coalesce(p.set_scores->>'wo', 'false') = 'false'
    AND jsonb_array_length(p.set_scores->'sets') = 2
    AND (p.set_scores->'sets'->0->>'p1')::int = 3
    AND (p.set_scores->'sets'->0->>'p2')::int = 6
    AND (p.set_scores->'sets'->1->>'p1')::int = 6
    AND (p.set_scores->'sets'->1->>'p2')::int = 1
    AND (p.set_scores->'stb'->>'p1')::int = 3
    AND (p.set_scores->'stb'->>'p2')::int = 5;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'partido d6852631 ya no tiene el marcador original';
  END IF;

  PERFORM 1 FROM public.liga_partidos p
  WHERE p.id = 'fa99a5d2-1125-4ebb-851f-8f5682261a5b'
    AND p.estado = 'completed'
    AND p.score_pareja1 = 10
    AND p.score_pareja2 = 9
    AND p.set_scores->>'format' = 'parejas_fijas_playoffs'
    AND coalesce(p.set_scores->>'wo', 'false') = 'false'
    AND jsonb_array_length(p.set_scores->'sets') = 2
    AND (p.set_scores->'sets'->0->>'p1')::int = 4
    AND (p.set_scores->'sets'->0->>'p2')::int = 6
    AND (p.set_scores->'sets'->1->>'p1')::int = 6
    AND (p.set_scores->'sets'->1->>'p2')::int = 3
    AND (p.set_scores->'stb'->>'p1')::int = 4
    AND (p.set_scores->'stb'->>'p2')::int = 10;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'partido fa99a5d2 ya no tiene el marcador original';
  END IF;

  SELECT count(*) INTO v_objetivos
  FROM public.jugador_participaciones jp
  WHERE jp.id IN (
    '10ae20e2-c33e-47e0-986d-57e6186a51a0',
    '6050f6ab-7761-4dbe-8d5e-f07b4c2155c1',
    '8086465b-2518-4567-9a79-c5f3fc7e1258',
    '9c314e51-13e5-4c67-bf8f-d2e0cd9dc44a',
    'cf59bf91-5a69-4ee7-9148-2acaa6974533',
    'd6679a74-4bed-463b-8fd8-ed9ceb9cbd8a',
    'db6abb86-483a-4e71-8a64-3dd2470541e0',
    'f939e849-7849-41ef-88b7-584c9ab5b4c7'
  )
    AND jp.tipo_evento::text = 'liga'
    AND jp.resultado::text = 'participación'
    AND jp.puntos_obtenidos = 0
    AND jp.metadata->>'subtipo' = 'liga_jornada'
    AND NOT EXISTS (
      SELECT 1 FROM public.riviera_official_points_ledger l
      WHERE l.participacion_id = jp.id
    );
  IF v_objetivos <> 8 THEN
    RAISE EXCEPTION 'las 8 participaciones de playoff ya no cumplen las precondiciones';
  END IF;

  PERFORM 1
  FROM public.jugador_participaciones jp
  JOIN public.riviera_official_points_ledger l ON l.participacion_id = jp.id
  JOIN public.riviera_official_player_identity i
    ON i.official_player_key = l.official_player_key
  WHERE jp.id = 'c46767cf-74fd-4e03-9e39-5c5773319f20'
    AND i.riviera_id = 'RIV-00000037'
    AND jp.tipo_evento::text = 'duelo_2v2'
    AND jp.resultado::text = 'derrota'
    AND jp.puntos_obtenidos = 20
    AND jp.sets_favor = 15
    AND jp.sets_contra = 14
    AND l.points = 20
    AND l.counts_for_official_ranking
    AND jp.metadata->>'placement' = 'subcampeon'
    AND jsonb_array_length(jp.metadata->'partidos_detalle') = 1
    AND jp.metadata->'partidos_detalle'->0->>'id' = 'caab78eb-b73b-4ee1-952d-13e1ffb2c06c'
    AND (jp.metadata->'partidos_detalle'->0->>'games_favor')::int = 15
    AND (jp.metadata->'partidos_detalle'->0->>'games_contra')::int = 14
    AND jp.metadata->'partidos_detalle'->0->>'resultado' IN ('win', 'loss');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'el duelo de RIV-00000037 ya no cumple las precondiciones';
  END IF;

  IF (SELECT count(*) FROM resultado_detalle_stats_antes) <> 9 THEN
    RAISE EXCEPTION 'falta la estadística local de alguno de los nueve jugadores';
  END IF;

  CREATE TEMP TABLE resultado_detalle_plan (
    participacion_id uuid PRIMARY KEY,
    metadata jsonb NOT NULL,
    ganados_antes int NOT NULL,
    ganados_despues int NOT NULL
  ) ON COMMIT DROP;

  FOR v_row IN
    SELECT jp.id, jp.metadata, jp.sets_favor, jp.sets_contra
    FROM public.jugador_participaciones jp
    WHERE jp.id IN (
      '10ae20e2-c33e-47e0-986d-57e6186a51a0',
      '6050f6ab-7761-4dbe-8d5e-f07b4c2155c1',
      '8086465b-2518-4567-9a79-c5f3fc7e1258',
      '9c314e51-13e5-4c67-bf8f-d2e0cd9dc44a',
      'cf59bf91-5a69-4ee7-9148-2acaa6974533',
      'd6679a74-4bed-463b-8fd8-ed9ceb9cbd8a',
      'db6abb86-483a-4e71-8a64-3dd2470541e0',
      'f939e849-7849-41ef-88b7-584c9ab5b4c7',
      'c46767cf-74fd-4e03-9e39-5c5773319f20'
    )
    FOR UPDATE
  LOOP
    v_detalle := '[]'::jsonb;
    v_changed := false;
    v_ganados := 0;
    v_perdidos := 0;
    v_empatados := 0;

    FOR v_item IN
      SELECT value
      FROM jsonb_array_elements(coalesce(v_row.metadata->'partidos_detalle', '[]'::jsonb))
    LOOP
      v_new_item := v_item;
      IF v_item->>'id' IN (
        'd6852631-9648-42df-91e3-83dc94b7cc18',
        'fa99a5d2-1125-4ebb-851f-8f5682261a5b'
      ) THEN
        SELECT
          CASE
            WHEN sets_p1 = sets_p2 THEN
              CASE
                WHEN stb_p1 > stb_p2 THEN 1
                WHEN stb_p2 > stb_p1 THEN 2
                ELSE NULL
              END
            WHEN sets_p1 > sets_p2 THEN 1
            ELSE 2
          END
        INTO v_side
        FROM (
          SELECT
            (CASE WHEN (p.set_scores->'sets'->0->>'p1')::int > (p.set_scores->'sets'->0->>'p2')::int THEN 1 ELSE 0 END
             + CASE WHEN (p.set_scores->'sets'->1->>'p1')::int > (p.set_scores->'sets'->1->>'p2')::int THEN 1 ELSE 0 END) AS sets_p1,
            (CASE WHEN (p.set_scores->'sets'->0->>'p2')::int > (p.set_scores->'sets'->0->>'p1')::int THEN 1 ELSE 0 END
             + CASE WHEN (p.set_scores->'sets'->1->>'p2')::int > (p.set_scores->'sets'->1->>'p1')::int THEN 1 ELSE 0 END) AS sets_p2,
            (p.set_scores->'stb'->>'p1')::int AS stb_p1,
            (p.set_scores->'stb'->>'p2')::int AS stb_p2,
            p.score_pareja1,
            p.score_pareja2
          FROM public.liga_partidos p
          WHERE p.id = (v_item->>'id')::uuid
        ) calc;

        v_favor := (v_item->>'games_favor')::int;
        v_contra := (v_item->>'games_contra')::int;

        SELECT
          CASE
            WHEN v_favor = p.score_pareja1 AND v_contra = p.score_pareja2 THEN 1
            WHEN v_favor = p.score_pareja2 AND v_contra = p.score_pareja1 THEN 2
            ELSE NULL
          END
        INTO v_side_jugador
        FROM public.liga_partidos p
        WHERE p.id = (v_item->>'id')::uuid;

        IF v_side IS NULL OR v_side_jugador IS NULL THEN
          RAISE EXCEPTION 'no hay ganador oficial demostrable para %', v_item->>'id';
        END IF;

        v_esperado := CASE WHEN v_side_jugador = v_side THEN 'win' ELSE 'loss' END;
        IF v_item->>'resultado' IS DISTINCT FROM v_esperado THEN
          v_new_item := jsonb_set(v_item, '{resultado}', to_jsonb(v_esperado), false);
          v_changed := true;
        END IF;
      ELSIF v_row.id = 'c46767cf-74fd-4e03-9e39-5c5773319f20' THEN
        IF v_item->>'resultado' IS DISTINCT FROM 'loss' THEN
          v_new_item := jsonb_set(v_item, '{resultado}', '"loss"'::jsonb, false);
          v_changed := true;
        END IF;
      END IF;

      IF v_new_item->>'resultado' = 'win' THEN
        v_ganados := v_ganados + 1;
      ELSIF v_new_item->>'resultado' = 'loss' THEN
        v_perdidos := v_perdidos + 1;
      ELSE
        v_empatados := v_empatados + 1;
      END IF;
      v_detalle := v_detalle || jsonb_build_array(v_new_item);
    END LOOP;

    IF v_changed THEN
      v_metadata := v_row.metadata;
      IF NOT (v_metadata ? 'resultado_detalle_reparado') THEN
        v_metadata := v_metadata || jsonb_build_object(
          'resultado_detalle_reparado',
          jsonb_build_object(
            'at', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'motivo', CASE
              WHEN v_row.id = 'c46767cf-74fd-4e03-9e39-5c5773319f20'
                THEN 'duelo_resultado_oficial'
              ELSE 'playoff_sets_y_stb'
            END,
            'partidos_ganados_antes', v_metadata->'partidos_ganados',
            'partidos_perdidos_antes', v_metadata->'partidos_perdidos',
            'detalle_resultado_antes', (
              SELECT coalesce(jsonb_agg(jsonb_build_object(
                'id', item->>'id',
                'resultado', item->>'resultado'
              )), '[]'::jsonb)
              FROM jsonb_array_elements(coalesce(v_row.metadata->'partidos_detalle', '[]'::jsonb)) item
            )
          )
        );
      END IF;
      v_metadata := jsonb_set(v_metadata, '{partidos_detalle}', v_detalle, true);
      v_metadata := jsonb_set(v_metadata, '{partidos_ganados}', to_jsonb(v_ganados), true);
      v_metadata := jsonb_set(v_metadata, '{partidos_perdidos}', to_jsonb(v_perdidos), true);
      v_metadata := jsonb_set(v_metadata, '{partidos_empatados}', to_jsonb(v_empatados), true);
      v_metadata := jsonb_set(
        v_metadata,
        '{partidos_jugados}',
        to_jsonb(v_ganados + v_perdidos + v_empatados),
        true
      );

      INSERT INTO resultado_detalle_plan (participacion_id, metadata, ganados_antes, ganados_despues)
      VALUES (
        v_row.id,
        v_metadata,
        coalesce((v_row.metadata->>'partidos_ganados')::int, 0),
        v_ganados
      );
    END IF;
  END LOOP;

  UPDATE public.jugador_participaciones jp
  SET metadata = plan.metadata
  FROM resultado_detalle_plan plan
  WHERE jp.id = plan.participacion_id
    AND jp.puntos_obtenidos = CASE
      WHEN jp.id = 'c46767cf-74fd-4e03-9e39-5c5773319f20' THEN 20
      ELSE 0
    END
    AND jp.resultado::text = CASE
      WHEN jp.id = 'c46767cf-74fd-4e03-9e39-5c5773319f20' THEN 'derrota'
      ELSE 'participación'
    END;
  GET DIAGNOSTICS v_reparadas = ROW_COUNT;

  IF v_reparadas <> (SELECT count(*) FROM resultado_detalle_plan) THEN
    RAISE EXCEPTION 'no se actualizaron todas las filas planeadas';
  END IF;

  SELECT count(*) INTO v_mal
  FROM public.jugador_participaciones jp
  CROSS JOIN LATERAL jsonb_array_elements(jp.metadata->'partidos_detalle') elem
  JOIN public.liga_partidos p ON p.id = (elem->>'id')::uuid
  WHERE jp.id IN (
    '10ae20e2-c33e-47e0-986d-57e6186a51a0',
    '6050f6ab-7761-4dbe-8d5e-f07b4c2155c1',
    '8086465b-2518-4567-9a79-c5f3fc7e1258',
    '9c314e51-13e5-4c67-bf8f-d2e0cd9dc44a',
    'cf59bf91-5a69-4ee7-9148-2acaa6974533',
    'd6679a74-4bed-463b-8fd8-ed9ceb9cbd8a',
    'db6abb86-483a-4e71-8a64-3dd2470541e0',
    'f939e849-7849-41ef-88b7-584c9ab5b4c7'
  )
    AND elem->>'id' IN (
      'd6852631-9648-42df-91e3-83dc94b7cc18',
      'fa99a5d2-1125-4ebb-851f-8f5682261a5b'
    )
    AND elem->>'resultado' IS DISTINCT FROM (
      CASE
        WHEN (
          CASE
            WHEN (elem->>'games_favor')::int = p.score_pareja1
             AND (elem->>'games_contra')::int = p.score_pareja2 THEN 1
            ELSE 2
          END
        ) = (
          CASE
            WHEN (p.set_scores->'stb'->>'p2')::int > (p.set_scores->'stb'->>'p1')::int THEN 2
            ELSE 1
          END
        )
        THEN 'win'
        ELSE 'loss'
      END
    );
  IF v_mal <> 0 THEN
    RAISE EXCEPTION 'quedó metadata de playoff distinta del tie-break oficial';
  END IF;

  PERFORM 1
  FROM public.jugador_participaciones jp
  WHERE jp.id = 'c46767cf-74fd-4e03-9e39-5c5773319f20'
    AND jp.puntos_obtenidos = 20
    AND jp.resultado::text = 'derrota'
    AND jp.sets_favor = 15
    AND jp.sets_contra = 14
    AND jp.metadata->'partidos_detalle'->0->>'resultado' = 'loss'
    AND (jp.metadata->'partidos_detalle'->0->>'games_favor')::int = 15
    AND (jp.metadata->'partidos_detalle'->0->>'games_contra')::int = 14
    AND (jp.metadata->>'partidos_ganados')::int = 0
    AND (jp.metadata->>'partidos_perdidos')::int = 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'el detalle del duelo no quedó alineado con la derrota';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM resultado_detalle_stats_antes b
    JOIN public.jugador_stats s ON s.jugador_id = b.jugador_id
    WHERE s.puntos_totales IS DISTINCT FROM b.puntos_totales
       OR s.sets_favor_total IS DISTINCT FROM b.sets_favor_total
       OR s.sets_contra_total IS DISTINCT FROM b.sets_contra_total
  ) THEN
    RAISE EXCEPTION 'el refresco de estadísticas movió puntos o marcadores';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM resultado_detalle_plan plan
    JOIN public.jugador_participaciones jp ON jp.id = plan.participacion_id
    JOIN resultado_detalle_stats_antes b ON b.jugador_id = jp.jugador_id
    JOIN public.jugador_stats s ON s.jugador_id = jp.jugador_id
    WHERE s.victorias IS DISTINCT FROM b.victorias + (plan.ganados_despues - plan.ganados_antes)
       OR s.derrotas IS DISTINCT FROM b.derrotas - (plan.ganados_despues - plan.ganados_antes)
  ) THEN
    RAISE EXCEPTION 'las victorias locales no siguieron solo al detalle corregido';
  END IF;

  SELECT md5(coalesce(string_agg(
    participacion_id::text || ':' || points::text || ':' || counts_for_official_ranking::text,
    ',' ORDER BY participacion_id::text
  ), ''))
  INTO v_ledger_after
  FROM public.riviera_official_points_ledger;

  SELECT md5(coalesce(string_agg(
    official_player_key::text || ':' || points_total::text,
    ',' ORDER BY official_player_key::text
  ), ''))
  INTO v_totals_after
  FROM public.riviera_official_player_totals;

  IF v_ledger_before IS DISTINCT FROM v_ledger_after
     OR v_totals_before IS DISTINCT FROM v_totals_after THEN
    RAISE EXCEPTION 'el ledger o los totales oficiales cambiaron';
  END IF;

  RAISE NOTICE 'filas_reparadas %', v_reparadas;
END $$;
