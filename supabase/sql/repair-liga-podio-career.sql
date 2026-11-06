-- Repara el podio de carrera de una liga de parejas con playoffs.
-- Fuente: Gran Final y partido THIRD ya cerrados. No toca marcadores ni posiciones.
-- Cada jugador recibe su fila (subtipo liga_podio_final) vía legacy_liga_jugador_id.
-- +500 / +250 / +100 según riviera_open_v1. Reejecutar no duplica.
--
--   SELECT public.admin_repair_liga_podio_career('UUID-LIGA', true);
--   SELECT public.admin_repair_liga_podio_career('UUID-LIGA', false);

CREATE OR REPLACE FUNCTION public.admin_repair_liga_podio_career(
  p_liga_id uuid,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_liga record;
  v_club text;
  v_row record;
  v_part_id uuid;
  v_ledger jsonb;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_unresolved integer := 0;
  v_preview jsonb := '[]'::jsonb;
BEGIN
  IF p_liga_id IS NULL THEN
    RAISE EXCEPTION 'p_liga_id requerido';
  END IF;

  SELECT id, nombre, organizador_id, modalidad, estado
  INTO v_liga
  FROM public.ligas
  WHERE id = p_liga_id;

  IF v_liga.id IS NULL THEN
    RAISE EXCEPTION 'Liga no encontrada: %', p_liga_id;
  END IF;
  IF v_liga.modalidad IS DISTINCT FROM 'parejas_fijas_playoffs' THEN
    RAISE EXCEPTION 'Solo parejas_fijas_playoffs. Modalidad: %', v_liga.modalidad;
  END IF;
  IF v_liga.estado IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'La liga no está finalizada.';
  END IF;

  SELECT coalesce(u.name, u.email, 'Club')
  INTO v_club
  FROM public.users u
  WHERE u.id = v_liga.organizador_id;

  FOR v_row IN
    WITH sets AS (
      SELECT
        p.id AS partido_id,
        p.bracket_slot,
        p.pareja1_id,
        p.pareja2_id,
        COALESCE((
          SELECT COUNT(*)::integer
          FROM jsonb_array_elements(p.set_scores->'sets') s
          WHERE (s->>'p1')::integer > (s->>'p2')::integer
        ), 0) AS sets_p1,
        COALESCE((
          SELECT COUNT(*)::integer
          FROM jsonb_array_elements(p.set_scores->'sets') s
          WHERE (s->>'p2')::integer > (s->>'p1')::integer
        ), 0) AS sets_p2
      FROM public.liga_partidos p
      JOIN public.liga_jornadas j ON j.id = p.jornada_id
      WHERE j.liga_id = p_liga_id
        AND p.estado = 'completed'
        AND p.bracket_slot IN ('FINAL', 'THIRD')
    ),
    winners AS (
      SELECT 1 AS posicion,
        CASE WHEN sets_p1 > sets_p2 THEN pareja1_id
             WHEN sets_p2 > sets_p1 THEN pareja2_id
        END AS pareja_id
      FROM sets
      WHERE bracket_slot = 'FINAL' AND sets_p1 <> sets_p2
      UNION ALL
      SELECT 2,
        CASE WHEN sets_p1 > sets_p2 THEN pareja2_id
             WHEN sets_p2 > sets_p1 THEN pareja1_id
        END
      FROM sets
      WHERE bracket_slot = 'FINAL' AND sets_p1 <> sets_p2
      UNION ALL
      SELECT 3,
        CASE WHEN sets_p1 > sets_p2 THEN pareja1_id
             WHEN sets_p2 > sets_p1 THEN pareja2_id
        END
      FROM sets
      WHERE bracket_slot = 'THIRD' AND sets_p1 <> sets_p2
    ),
    players AS (
      SELECT w.posicion, jp.jugador1_id AS legacy_id, 1 AS lado
      FROM winners w
      JOIN public.liga_jornada_parejas jp ON jp.id = w.pareja_id
      WHERE w.posicion IS NOT NULL
      UNION ALL
      SELECT w.posicion, jp.jugador2_id, 2
      FROM winners w
      JOIN public.liga_jornada_parejas jp ON jp.id = w.pareja_id
      WHERE w.posicion IS NOT NULL
    )
    SELECT
      pl.posicion,
      pl.legacy_id,
      lj.nombre AS liga_nombre,
      rj.id AS riviera_jugador_id,
      ident.riviera_id,
      COALESCE(rj.suma_ranking, true) AS suma_ranking,
      CASE pl.posicion WHEN 1 THEN 500 WHEN 2 THEN 250 WHEN 3 THEN 100 END AS puntos,
      CASE pl.posicion
        WHEN 1 THEN 'victoria'
        WHEN 2 THEN 'derrota'
        ELSE 'empate'
      END AS resultado,
      CASE pl.posicion
        WHEN 1 THEN 'Campeón'
        WHEN 2 THEN 'Subcampeón'
        ELSE '3er lugar'
      END AS lugar,
      CASE pl.posicion
        WHEN 1 THEN 'campeon'
        WHEN 2 THEN 'subcampeon'
        ELSE 'tercer'
      END AS placement,
      (
        SELECT lj2.nombre
        FROM players mate
        JOIN public.liga_jugadores lj2 ON lj2.id = mate.legacy_id
        WHERE mate.posicion = pl.posicion
          AND mate.legacy_id IS DISTINCT FROM pl.legacy_id
        LIMIT 1
      ) AS pareja_con
    FROM players pl
    LEFT JOIN public.liga_jugadores lj ON lj.id = pl.legacy_id
    LEFT JOIN public.riviera_jugadores rj
      ON rj.legacy_liga_jugador_id = pl.legacy_id
     AND rj.organizador_id = v_liga.organizador_id
    LEFT JOIN public.riviera_official_player_profile_link link
      ON link.riviera_jugador_id = rj.id
    LEFT JOIN public.riviera_official_player_identity ident
      ON ident.official_player_key = link.official_player_key
    ORDER BY pl.posicion, pl.lado
  LOOP
    IF v_row.riviera_jugador_id IS NULL OR v_row.riviera_id IS NULL THEN
      v_unresolved := v_unresolved + 1;
      v_preview := v_preview || jsonb_build_array(jsonb_build_object(
        'posicion', v_row.posicion,
        'nombre', v_row.liga_nombre,
        'legacy_id', v_row.legacy_id,
        'status', 'sin_riviera_id'
      ));
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.jugador_participaciones jp
      WHERE jp.jugador_id = v_row.riviera_jugador_id
        AND jp.tipo_evento = 'liga'
        AND jp.evento_id = p_liga_id
        AND jp.metadata->>'subtipo' = 'liga_podio_final'
    ) THEN
      v_skipped := v_skipped + 1;
      v_preview := v_preview || jsonb_build_array(jsonb_build_object(
        'posicion', v_row.posicion,
        'nombre', v_row.liga_nombre,
        'riviera_id', v_row.riviera_id,
        'status', 'ya_existia'
      ));
      CONTINUE;
    END IF;

    v_preview := v_preview || jsonb_build_array(jsonb_build_object(
      'posicion', v_row.posicion,
      'nombre', v_row.liga_nombre,
      'riviera_id', v_row.riviera_id,
      'riviera_jugador_id', v_row.riviera_jugador_id,
      'puntos', CASE WHEN v_row.suma_ranking THEN v_row.puntos ELSE 0 END,
      'lugar', v_row.lugar,
      'status', CASE WHEN p_dry_run THEN 'pendiente' ELSE 'insertado' END
    ));

    IF p_dry_run THEN
      v_inserted := v_inserted + 1;
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
      pareja_con,
      metadata
    ) VALUES (
      v_row.riviera_jugador_id,
      'liga',
      p_liga_id,
      'Liga ' || v_liga.nombre || ' — Podio final',
      CURRENT_DATE,
      v_row.resultado::public.jugador_resultado,
      0,
      0,
      CASE WHEN v_row.suma_ranking THEN v_row.puntos ELSE 0 END,
      v_row.pareja_con,
      jsonb_build_object(
        'subtipo', 'liga_podio_final',
        'organizador_id', v_liga.organizador_id::text,
        'club_name', COALESCE(v_club, 'Club'),
        'liga_id', p_liga_id::text,
        'liga_nombre', v_liga.nombre,
        'posicion_final', v_row.posicion,
        'placement', v_row.placement,
        'campeon_torneo', v_row.posicion = 1,
        'subcampeon_torneo', v_row.posicion = 2,
        'partidos_ganados', 0,
        'partidos_perdidos', 0,
        'partidos_empatados', 0,
        'modalidad', 'liga',
        'modalidad_label', 'Liga',
        'lugar', v_row.lugar,
        'podio_source', 'playoff',
        'puntos_aplicados', true,
        'puntos_evento', CASE WHEN v_row.suma_ranking THEN v_row.puntos ELSE 0 END,
        'puntos_desglose', CASE v_row.posicion
          WHEN 1 THEN jsonb_build_object('liga_podio_1', 500)
          WHEN 2 THEN jsonb_build_object('liga_podio_2', 250)
          ELSE jsonb_build_object('liga_podio_3', 100)
        END,
        'ranking_puntos_esquema', 'riviera_open_v1'
      )
    )
    RETURNING id INTO v_part_id;

    v_inserted := v_inserted + 1;

    v_ledger := public.try_write_riviera_official_ledger(v_part_id);
    PERFORM public.refresh_jugador_stats(v_row.riviera_jugador_id);

    v_preview := v_preview || jsonb_build_array(jsonb_build_object(
      'riviera_id', v_row.riviera_id,
      'ledger', v_ledger
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'liga_id', p_liga_id,
    'liga_nombre', v_liga.nombre,
    'club', v_club,
    'would_insert_or_inserted', v_inserted,
    'skipped_existing', v_skipped,
    'unresolved', v_unresolved,
    'players', v_preview
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_repair_liga_podio_career(uuid, boolean)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.admin_repair_liga_podio_career(uuid, boolean) IS
  'Backfill idempotente del podio de liga por parejas (playoffs). No altera resultados deportivos.';
