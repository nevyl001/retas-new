-- =============================================================================
-- 0031 — Generalizar parejas_fijas_playoffs a N≥4 parejas
-- =============================================================================
-- No modifica 0030 (ya aplicada en Production).
-- bracket_slot sigue siendo text; playoff_seeds jsonb — sin columnas nuevas.
-- REPLACE del RPC freeze: expected = N(N-1); seeds 1..N; CL1..CLk dinámicos;
-- jornada playoffs = última jornada regular + 1 (no hardcode 9).
-- =============================================================================

COMMENT ON COLUMN public.liga_partidos.bracket_slot IS
  'SF1 | SF2 | CL1..CLk | FINAL (NULL en regulares); k = floor((N-4)/2)';

COMMENT ON COLUMN public.ligas.playoff_seeds IS
  'Fotografía congelada seeds 1..N (+ opcional classification_bye = equipo_id)';

CREATE OR REPLACE FUNCTION public.liga_playoffs_freeze_and_generate_jornada9(
  p_liga_id uuid,
  p_seeds jsonb,
  p_sf1_p1 uuid,
  p_sf1_p2 uuid,
  p_sf2_p1 uuid,
  p_sf2_p2 uuid,
  p_cl1_p1 uuid,
  p_cl1_p2 uuid,
  p_cl2_p1 uuid,
  p_cl2_p2 uuid,
  p_canchas integer DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organizador uuid;
  v_modalidad text;
  v_seeds jsonb;
  v_jornada_id uuid;
  v_canchas integer;
  v_equipo_id uuid;
  v_jugador1_id uuid;
  v_jugador2_id uuid;
  v_pareja_id uuid;
  v_map jsonb := '{}'::jsonb;
  v_eq1 uuid;
  v_eq2 uuid;
  v_p1 uuid;
  v_p2 uuid;
  v_existing integer;
  v_regular_done integer;
  v_regular_total integer;
  v_calendar_n integer;
  v_n integer;
  v_expected integer;
  v_last_regular integer;
  v_playoff_jornada integer;
  v_i integer;
  v_low integer;
  v_high integer;
  v_cl integer;
  v_slot text;
  v_fase text;
  v_seed_home text;
  v_seed_away text;
  v_bye_seed integer;
  v_key text;
  v_seen jsonb := '{}'::jsonb;
BEGIN
  -- Params de pareja del cliente se ignoran (firma estable / compat).
  PERFORM p_sf1_p1, p_sf1_p2, p_sf2_p1, p_sf2_p2,
          p_cl1_p1, p_cl1_p2, p_cl2_p1, p_cl2_p2;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  SELECT organizador_id, modalidad, playoff_seeds
    INTO v_organizador, v_modalidad, v_seeds
  FROM public.ligas
  WHERE id = p_liga_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Liga no encontrada';
  END IF;

  IF v_organizador IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Sin permiso sobre esta liga';
  END IF;

  IF v_modalidad IS DISTINCT FROM 'parejas_fijas_playoffs' THEN
    RAISE EXCEPTION 'Modalidad incorrecta para playoffs';
  END IF;

  v_canchas := GREATEST(1, COALESCE(p_canchas, 3));

  SELECT COUNT(*)::integer INTO v_regular_done
  FROM public.liga_partidos
  WHERE liga_id = p_liga_id
    AND fase = 'regular'
    AND estado = 'completed';

  SELECT COUNT(*)::integer INTO v_regular_total
  FROM public.liga_partidos
  WHERE liga_id = p_liga_id
    AND fase = 'regular';

  -- N del calendario: equipos distintos en partidos regulares (no SF/CL/FINAL).
  SELECT COUNT(*)::integer INTO v_calendar_n
  FROM (
    SELECT DISTINCT jp.equipo_id
    FROM public.liga_partidos p
    JOIN public.liga_jornada_parejas jp ON jp.id = p.pareja1_id
    WHERE p.liga_id = p_liga_id AND p.fase = 'regular'
    UNION
    SELECT DISTINCT jp.equipo_id
    FROM public.liga_partidos p
    JOIN public.liga_jornada_parejas jp ON jp.id = p.pareja2_id
    WHERE p.liga_id = p_liga_id AND p.fase = 'regular'
  ) calendar_teams;

  IF v_seeds IS NULL THEN
    IF p_seeds IS NULL OR jsonb_typeof(p_seeds) <> 'object' THEN
      RAISE EXCEPTION 'Seeds inválidos';
    END IF;

    -- Contar seeds numéricos consecutivos 1..N (ignora classification_bye)
    v_n := 0;
    LOOP
      v_i := v_n + 1;
      IF p_seeds ? v_i::text
         AND NULLIF(trim(p_seeds ->> v_i::text), '') IS NOT NULL THEN
        v_n := v_i;
      ELSE
        EXIT;
      END IF;
    END LOOP;

    IF v_n < 4 THEN
      RAISE EXCEPTION 'Seeds incompletos (se requieren claves 1..N con N>=4)';
    END IF;

    -- Sin huecos ni duplicados
    FOR v_i IN 1..v_n LOOP
      v_key := trim(p_seeds ->> v_i::text);
      IF v_key IS NULL OR v_key = '' THEN
        RAISE EXCEPTION 'Seed faltante: %', v_i;
      END IF;
      IF v_seen ? v_key THEN
        RAISE EXCEPTION 'Seed duplicado: %', v_key;
      END IF;
      v_seen := v_seen || jsonb_build_object(v_key, true);
    END LOOP;

    IF v_n IS DISTINCT FROM v_calendar_n THEN
      RAISE EXCEPTION
        'Seeds N (%) no coincide con parejas del calendario regular (%)',
        v_n, v_calendar_n;
    END IF;

    v_expected := v_n * (v_n - 1);
    IF v_regular_total IS DISTINCT FROM v_expected THEN
      RAISE EXCEPTION
        'Total regulares (%/%) no cuadra con N(N-1)',
        v_regular_total, v_expected;
    END IF;
    IF v_regular_done IS DISTINCT FROM v_expected THEN
      RAISE EXCEPTION 'Fase regular incompleta (%/%)', v_regular_done, v_expected;
    END IF;

    v_seeds := p_seeds;

    -- Classification BYE si (N-4) impar → seed central
    IF ((v_n - 4) % 2) = 1 THEN
      v_bye_seed := 5 + ((v_n - 4) / 2);
      v_seeds := v_seeds || jsonb_build_object(
        'classification_bye',
        v_seeds ->> v_bye_seed::text
      );
    END IF;

    UPDATE public.ligas
    SET playoff_seeds = v_seeds,
        playoff_seeded_at = now()
    WHERE id = p_liga_id
      AND playoff_seeds IS NULL;

    SELECT playoff_seeds INTO v_seeds
    FROM public.ligas
    WHERE id = p_liga_id;

    IF v_seeds IS NULL THEN
      RAISE EXCEPTION 'No se pudieron congelar seeds';
    END IF;
  ELSE
    -- Seeds ya congelados: contar N desde la fotografía (solo claves 1..N)
    v_n := 0;
    LOOP
      v_i := v_n + 1;
      IF v_seeds ? v_i::text
         AND NULLIF(trim(v_seeds ->> v_i::text), '') IS NOT NULL THEN
        v_n := v_i;
      ELSE
        EXIT;
      END IF;
    END LOOP;
    IF v_n < 4 THEN
      RAISE EXCEPTION 'playoff_seeds congelados inválidos';
    END IF;
  END IF;

  SELECT COALESCE(MAX(j.numero), 0)::integer INTO v_last_regular
  FROM public.liga_jornadas j
  WHERE j.liga_id = p_liga_id
    AND EXISTS (
      SELECT 1
      FROM public.liga_partidos p
      WHERE p.jornada_id = j.id
        AND p.fase = 'regular'
    );

  IF v_last_regular < 1 THEN
    RAISE EXCEPTION 'No hay jornadas regulares';
  END IF;

  v_playoff_jornada := v_last_regular + 1;

  SELECT id INTO v_jornada_id
  FROM public.liga_jornadas
  WHERE liga_id = p_liga_id AND numero = v_playoff_jornada
  LIMIT 1;

  IF v_jornada_id IS NULL THEN
    INSERT INTO public.liga_jornadas (liga_id, numero, estado)
    VALUES (p_liga_id, v_playoff_jornada, 'upcoming')
    RETURNING id INTO v_jornada_id;
  END IF;

  -- Parejas de jornada para todos los seeds 1..N (BYE no juega partido; se registra)
  FOR v_i IN 1..v_n LOOP
    SELECT e.id, e.jugador1_id, e.jugador2_id
      INTO v_equipo_id, v_jugador1_id, v_jugador2_id
    FROM public.liga_equipos e
    WHERE e.liga_id = p_liga_id
      AND e.id::text = (v_seeds ->> v_i::text)
    LIMIT 1;

    IF v_equipo_id IS NULL THEN
      RAISE EXCEPTION 'Equipo seed % no encontrado', v_i;
    END IF;

    SELECT id INTO v_pareja_id
    FROM public.liga_jornada_parejas
    WHERE jornada_id = v_jornada_id AND equipo_id = v_equipo_id
    LIMIT 1;

    IF v_pareja_id IS NULL THEN
      INSERT INTO public.liga_jornada_parejas (
        jornada_id, equipo_id, jugador1_id, jugador2_id
      ) VALUES (
        v_jornada_id, v_equipo_id, v_jugador1_id, v_jugador2_id
      )
      RETURNING id INTO v_pareja_id;
    END IF;

    v_map := v_map || jsonb_build_object(v_equipo_id::text, v_pareja_id::text);
  END LOOP;

  -- Helper inline: insertar partido si slot libre
  -- SF1 = 1v4, SF2 = 2v3
  FOR v_i IN 1..2 LOOP
    IF v_i = 1 THEN
      v_slot := 'SF1'; v_fase := 'semifinal';
      v_seed_home := '1'; v_seed_away := '4';
    ELSE
      v_slot := 'SF2'; v_fase := 'semifinal';
      v_seed_home := '2'; v_seed_away := '3';
    END IF;

    SELECT COUNT(*)::integer INTO v_existing
    FROM public.liga_partidos
    WHERE liga_id = p_liga_id AND bracket_slot = v_slot;

    IF v_existing = 0 THEN
      v_eq1 := (v_seeds ->> v_seed_home)::uuid;
      v_eq2 := (v_seeds ->> v_seed_away)::uuid;
      v_p1 := (v_map ->> v_eq1::text)::uuid;
      v_p2 := (v_map ->> v_eq2::text)::uuid;
      IF v_p1 IS NULL OR v_p2 IS NULL THEN
        RAISE EXCEPTION 'Falta pareja de jornada para slot %', v_slot;
      END IF;
      INSERT INTO public.liga_partidos (
        jornada_id, pareja1_id, pareja2_id, ronda, cancha, estado,
        score_pareja1, score_pareja2, fase, bracket_slot, liga_id
      ) VALUES (
        v_jornada_id, v_p1, v_p2, 1, ((v_i - 1) % v_canchas) + 1, 'upcoming',
        NULL, NULL, v_fase, v_slot, p_liga_id
      );
    END IF;
  END LOOP;

  -- CL extremos: low=5, high=N
  v_low := 5;
  v_high := v_n;
  v_cl := 1;
  WHILE v_low < v_high LOOP
    v_slot := 'CL' || v_cl::text;
    v_fase := 'classification';
    v_seed_home := v_low::text;
    v_seed_away := v_high::text;

    SELECT COUNT(*)::integer INTO v_existing
    FROM public.liga_partidos
    WHERE liga_id = p_liga_id AND bracket_slot = v_slot;

    IF v_existing = 0 THEN
      v_eq1 := (v_seeds ->> v_seed_home)::uuid;
      v_eq2 := (v_seeds ->> v_seed_away)::uuid;
      v_p1 := (v_map ->> v_eq1::text)::uuid;
      v_p2 := (v_map ->> v_eq2::text)::uuid;
      IF v_p1 IS NULL OR v_p2 IS NULL THEN
        RAISE EXCEPTION 'Falta pareja de jornada para slot %', v_slot;
      END IF;
      INSERT INTO public.liga_partidos (
        jornada_id, pareja1_id, pareja2_id, ronda, cancha, estado,
        score_pareja1, score_pareja2, fase, bracket_slot, liga_id
      ) VALUES (
        v_jornada_id, v_p1, v_p2, 1,
        ((1 + v_cl) % v_canchas) + 1, 'upcoming',
        NULL, NULL, v_fase, v_slot, p_liga_id
      );
    END IF;

    v_cl := v_cl + 1;
    v_low := v_low + 1;
    v_high := v_high - 1;
  END LOOP;
  -- Si v_low = v_high: classification BYE (sin partido)

  RETURN jsonb_build_object(
    'ok', true,
    'jornada_id', v_jornada_id,
    'jornada_numero', v_playoff_jornada,
    'team_count', v_n,
    'seeds', v_seeds
  );
END;
$$;

REVOKE ALL ON FUNCTION public.liga_playoffs_freeze_and_generate_jornada9(
  uuid, jsonb, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liga_playoffs_freeze_and_generate_jornada9(
  uuid, jsonb, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, integer
) TO authenticated;
