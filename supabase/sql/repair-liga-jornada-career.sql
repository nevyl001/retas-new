-- Repara carrera Riviera (+50 ganador jornada, +0 resto participantes) para jornada ya cerrada.
-- Idempotente: omite jugadores con participación liga_jornada existente para esa jornada.
--
-- Uso:
--   SELECT public.admin_repair_liga_jornada_career('UUID-JORNADA', false);
--   SELECT public.admin_repair_liga_jornada_career('UUID-JORNADA', true);  -- preview

CREATE OR REPLACE FUNCTION public._playoffs_match_ranking_pts(
  p_set_scores jsonb,
  p_for_p1 boolean
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_stb jsonb;
  v_s1 jsonb;
  v_s2 jsonb;
  s1p1 int;
  s1p2 int;
  s2p1 int;
  s2p2 int;
  sw1 int := 0;
  sw2 int := 0;
  p1_won_stb boolean;
BEGIN
  IF p_set_scores IS NULL THEN
    RETURN 0;
  END IF;

  IF coalesce((p_set_scores->>'wo')::boolean, false) THEN
    RETURN 0;
  END IF;

  v_s1 := p_set_scores->'sets'->0;
  v_s2 := p_set_scores->'sets'->1;
  IF v_s1 IS NULL OR v_s2 IS NULL THEN
    RETURN 0;
  END IF;

  s1p1 := coalesce((v_s1->>'p1')::int, 0);
  s1p2 := coalesce((v_s1->>'p2')::int, 0);
  s2p1 := coalesce((v_s2->>'p1')::int, 0);
  s2p2 := coalesce((v_s2->>'p2')::int, 0);

  IF s1p1 > s1p2 THEN
    sw1 := sw1 + 1;
  ELSIF s1p2 > s1p1 THEN
    sw2 := sw2 + 1;
  END IF;

  IF s2p1 > s2p2 THEN
    sw1 := sw1 + 1;
  ELSIF s2p2 > s2p1 THEN
    sw2 := sw2 + 1;
  END IF;

  v_stb := p_set_scores->'stb';
  IF v_stb IS NOT NULL AND ((sw1 = 1 AND sw2 = 1) OR (sw1 = 0 AND sw2 = 0)) THEN
    p1_won_stb := coalesce((v_stb->>'p1')::int, 0) > coalesce((v_stb->>'p2')::int, 0);
    IF p_for_p1 THEN
      RETURN CASE WHEN p1_won_stb THEN 2 ELSE 1 END;
    END IF;
    RETURN CASE WHEN p1_won_stb THEN 1 ELSE 2 END;
  END IF;

  IF sw1 > sw2 THEN
    RETURN CASE WHEN p_for_p1 THEN 3 ELSE 0 END;
  ELSIF sw2 > sw1 THEN
    RETURN CASE WHEN p_for_p1 THEN 0 ELSE 3 END;
  END IF;

  RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_repair_liga_jornada_career(
  p_jornada_id uuid,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jornada record;
  v_liga record;
  v_winner_pareja_id uuid;
  v_winner_j1 uuid;
  v_winner_j2 uuid;
  v_legacy_id uuid;
  v_jugador_id uuid;
  v_part_id uuid;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_ledger integer := 0;
  v_refreshed integer := 0;
  v_winners integer := 0;
  v_meta jsonb;
  v_pts integer;
  v_gano boolean;
  v_evento_nombre text;
  v_nombre text;
BEGIN
  IF p_jornada_id IS NULL THEN
    RAISE EXCEPTION 'p_jornada_id requerido';
  END IF;

  SELECT j.id, j.liga_id, j.numero, j.estado
  INTO v_jornada
  FROM public.liga_jornadas j
  WHERE j.id = p_jornada_id;

  IF v_jornada.id IS NULL THEN
    RAISE EXCEPTION 'Jornada no encontrada: %', p_jornada_id;
  END IF;

  IF v_jornada.estado IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Jornada % no está completed (estado=%)', p_jornada_id, v_jornada.estado;
  END IF;

  SELECT l.id, l.nombre, l.organizador_id, l.modalidad
  INTO v_liga
  FROM public.ligas l
  WHERE l.id = v_jornada.liga_id;

  IF v_liga.organizador_id IS NULL THEN
    RAISE EXCEPTION 'Liga sin organizador_id';
  END IF;

  v_evento_nombre := 'Liga ' || v_liga.nombre || ' - Jornada ' || v_jornada.numero;

  WITH partidos AS (
    SELECT
      lp.pareja1_id,
      lp.pareja2_id,
      lp.set_scores,
      coalesce(lp.score_pareja1, 0) AS score1,
      coalesce(lp.score_pareja2, 0) AS score2
    FROM public.liga_partidos lp
    WHERE lp.jornada_id = p_jornada_id
      AND lp.estado = 'completed'
  ),
  stats AS (
    SELECT
      p.pareja1_id AS pareja_id,
      public._playoffs_match_ranking_pts(p.set_scores, true) AS puntos,
      p.score1 AS gf,
      p.score2 AS gc,
      CASE
        WHEN public._playoffs_match_ranking_pts(p.set_scores, true)
           > public._playoffs_match_ranking_pts(p.set_scores, false) THEN 1
        ELSE 0
      END AS victorias
    FROM partidos p
    UNION ALL
    SELECT
      p.pareja2_id,
      public._playoffs_match_ranking_pts(p.set_scores, false),
      p.score2,
      p.score1,
      CASE
        WHEN public._playoffs_match_ranking_pts(p.set_scores, false)
           > public._playoffs_match_ranking_pts(p.set_scores, true) THEN 1
        ELSE 0
      END
    FROM partidos p
  ),
  agg AS (
    SELECT
      s.pareja_id,
      sum(s.puntos) AS puntos,
      sum(s.victorias) AS victorias,
      sum(s.gf) AS gf,
      sum(s.gc) AS gc,
      sum(s.gf) - sum(s.gc) AS dif
    FROM stats s
    GROUP BY s.pareja_id
  ),
  ranked AS (
    SELECT
      a.pareja_id,
      row_number() OVER (
        ORDER BY a.puntos DESC, a.dif DESC, a.gf DESC, a.victorias DESC, a.pareja_id
      ) AS rn
    FROM agg a
  )
  SELECT r.pareja_id, jp.jugador1_id, jp.jugador2_id
  INTO v_winner_pareja_id, v_winner_j1, v_winner_j2
  FROM ranked r
  JOIN public.liga_jornada_parejas jp ON jp.id = r.pareja_id
  WHERE r.rn = 1;

  IF v_winner_pareja_id IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar ganador de jornada %', p_jornada_id;
  END IF;

  FOR v_legacy_id, v_nombre IN
    SELECT DISTINCT lj.id, lj.nombre
    FROM (
      SELECT jp.jugador1_id AS legacy_id
      FROM public.liga_jornada_parejas jp
      WHERE jp.jornada_id = p_jornada_id
        AND EXISTS (
          SELECT 1
          FROM public.liga_partidos lp
          WHERE lp.jornada_id = p_jornada_id
            AND lp.estado = 'completed'
            AND (lp.pareja1_id = jp.id OR lp.pareja2_id = jp.id)
        )
      UNION
      SELECT jp.jugador2_id
      FROM public.liga_jornada_parejas jp
      WHERE jp.jornada_id = p_jornada_id
        AND EXISTS (
          SELECT 1
          FROM public.liga_partidos lp
          WHERE lp.jornada_id = p_jornada_id
            AND lp.estado = 'completed'
            AND (lp.pareja1_id = jp.id OR lp.pareja2_id = jp.id)
        )
    ) AS played
    JOIN public.liga_jugadores lj ON lj.id = played.legacy_id
  LOOP
    SELECT rj.id
    INTO v_jugador_id
    FROM public.riviera_jugadores rj
    WHERE rj.legacy_liga_jugador_id = v_legacy_id
      AND rj.organizador_id = v_liga.organizador_id
    LIMIT 1;

    IF v_jugador_id IS NULL THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.jugador_participaciones jp
      WHERE jp.jugador_id = v_jugador_id
        AND jp.tipo_evento = 'liga'
        AND jp.evento_id = p_jornada_id
        AND jp.metadata->>'subtipo' = 'liga_jornada'
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_gano := v_legacy_id IN (v_winner_j1, v_winner_j2);
    v_pts := CASE WHEN v_gano THEN 50 ELSE 0 END;

    v_meta := jsonb_build_object(
      'subtipo', 'liga_jornada',
      'organizador_id', v_liga.organizador_id::text,
      'liga_id', v_liga.id::text,
      'liga_nombre', v_liga.nombre,
      'jornada_numero', v_jornada.numero,
      'jornada_ganada', v_gano,
      'modalidad', 'liga',
      'modalidad_label', 'Liga',
      'lugar', CASE WHEN v_gano THEN 'Ganador jornada ' || v_jornada.numero::text ELSE 'Participación en jornada' END,
      'puntos_desglose', CASE
        WHEN v_gano THEN jsonb_build_object('liga_jornada_ganada', 50)
        ELSE '{}'::jsonb
      END,
      'esquema_puntos', 'riviera_open_v1',
      'repair', 'admin_repair_liga_jornada_career'
    );

    IF p_dry_run THEN
      v_inserted := v_inserted + 1;
      IF v_gano THEN
        v_winners := v_winners + 1;
      END IF;
      CONTINUE;
    END IF;

    INSERT INTO public.jugador_participaciones (
      jugador_id,
      tipo_evento,
      evento_id,
      evento_nombre,
      fecha,
      resultado,
      sets_favor,
      sets_contra,
      puntos_obtenidos,
      metadata
    )
    VALUES (
      v_jugador_id,
      'liga',
      p_jornada_id,
      v_evento_nombre,
      CURRENT_DATE,
      'participación',
      0,
      0,
      v_pts,
      v_meta
    )
    RETURNING id INTO v_part_id;

    v_inserted := v_inserted + 1;
    IF v_gano THEN
      v_winners := v_winners + 1;
    END IF;

    BEGIN
      PERFORM public.try_write_riviera_official_ledger(v_part_id);
      v_ledger := v_ledger + 1;
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;

    BEGIN
      PERFORM public.refresh_jugador_stats(v_jugador_id);
      v_refreshed := v_refreshed + 1;
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'jornada_id', p_jornada_id,
    'jornada_numero', v_jornada.numero,
    'liga_id', v_liga.id,
    'liga_nombre', v_liga.nombre,
    'organizador_id', v_liga.organizador_id,
    'winner_pareja_id', v_winner_pareja_id,
    'winner_legacy_jugador_ids', jsonb_build_array(v_winner_j1, v_winner_j2),
    'inserted', v_inserted,
    'winners_credited', v_winners,
    'skipped_existing', v_skipped,
    'ledger_written', v_ledger,
    'stats_refreshed', v_refreshed
  );
END;
$$;

REVOKE ALL ON FUNCTION public._playoffs_match_ranking_pts(jsonb, boolean)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.admin_repair_liga_jornada_career(uuid, boolean)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.admin_repair_liga_jornada_career(uuid, boolean) IS
  'Backfill participaciones liga_jornada (+50 ganador, +0 resto). p_dry_run=true solo preview.';
