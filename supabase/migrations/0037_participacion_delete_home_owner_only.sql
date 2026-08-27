-- Borrar participaciones del historial: solo el club de registro (canonical/home).
-- El dueño puede revertir ledger y refrescar stats de perfiles ROMC enlazados;
-- los clubes cedidos/importados no.

CREATE OR REPLACE FUNCTION public._resolve_home_organizador_for_jugador(p_jugador_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key uuid;
  v_home uuid;
BEGIN
  IF p_jugador_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_key := public._resolve_official_player_key(p_jugador_id);

  IF v_key IS NOT NULL THEN
    SELECT rj.organizador_id
    INTO v_home
    FROM public.riviera_official_player_identity i
    INNER JOIN public.riviera_jugadores rj
      ON rj.id = i.canonical_riviera_jugador_id
    WHERE i.official_player_key = v_key;
  END IF;

  IF v_home IS NOT NULL THEN
    RETURN v_home;
  END IF;

  SELECT rj.organizador_id
  INTO v_home
  FROM public.riviera_jugadores rj
  WHERE rj.id = p_jugador_id;

  RETURN v_home;
END;
$$;

REVOKE ALL ON FUNCTION public._resolve_home_organizador_for_jugador(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reverse_riviera_official_ledger_for_participacion(p_participacion_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ledger record;
  v_owner uuid;
  v_part_jugador_id uuid;
  v_home_org uuid;
BEGIN
  IF p_participacion_id IS NULL THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'null_participacion_id');
  END IF;

  SELECT rj.organizador_id, jp.jugador_id
  INTO v_owner, v_part_jugador_id
  FROM public.jugador_participaciones jp
  JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
  WHERE jp.id = p_participacion_id;

  IF v_owner IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'no_participation',
      'participacion_id', p_participacion_id
    );
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sin permiso para revertir esta participación';
  END IF;

  v_home_org := public._resolve_home_organizador_for_jugador(v_part_jugador_id);

  IF NOT public.is_master_admin()
     AND v_owner IS DISTINCT FROM auth.uid()
     AND (v_home_org IS NULL OR v_home_org IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'Sin permiso para revertir esta participación';
  END IF;

  SELECT
    l.id,
    l.official_player_key,
    l.points,
    l.counts_for_official_ranking
  INTO v_ledger
  FROM public.riviera_official_points_ledger l
  WHERE l.participacion_id = p_participacion_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'no_ledger',
      'participacion_id', p_participacion_id
    );
  END IF;

  DELETE FROM public.riviera_official_points_ledger
  WHERE id = v_ledger.id;

  PERFORM public._recalc_official_player_totals(v_ledger.official_player_key);

  RETURN jsonb_build_object(
    'status', 'reversed',
    'participacion_id', p_participacion_id,
    'official_player_key', v_ledger.official_player_key,
    'points_reversed', v_ledger.points
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.reverse_riviera_official_ledger_for_participacion(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_riviera_official_ledger_for_participacion(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_jugador_stats(p_jugador_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stats record;
  v_role text := COALESCE(auth.role(), '');
  v_player_org uuid;
  v_home_org uuid;
BEGIN
  IF p_jugador_id IS NULL THEN
    RETURN;
  END IF;

  IF v_role = 'anon' THEN
    RAISE EXCEPTION 'No autorizado para refrescar estadísticas de este jugador';
  END IF;

  IF v_role = 'authenticated' THEN
    SELECT rj.organizador_id INTO v_player_org
    FROM public.riviera_jugadores rj
    WHERE rj.id = p_jugador_id;

    v_home_org := public._resolve_home_organizador_for_jugador(p_jugador_id);

    IF auth.uid() IS NULL
       OR (
         NOT public.is_master_admin()
         AND (v_player_org IS NULL OR v_player_org IS DISTINCT FROM auth.uid())
         AND (v_home_org IS NULL OR v_home_org IS DISTINCT FROM auth.uid())
       ) THEN
      RAISE EXCEPTION 'No autorizado para refrescar estadísticas de este jugador';
    END IF;
  END IF;

  SELECT
    COALESCE(SUM(jp.puntos_obtenidos), 0)::integer AS puntos_totales,
    COALESCE(SUM(jp.sets_favor), 0)::integer AS sets_favor_total,
    COALESCE(SUM(jp.sets_contra), 0)::integer AS sets_contra_total,
    COUNT(*) FILTER (
      WHERE COALESCE(jp.metadata->>'subtipo', '') <> 'liga_inscripcion'
        AND COALESCE(jp.metadata->>'subtipo', '') <> 'ajuste_manual'
    )::integer AS participaciones_solo,
    COUNT(*) FILTER (WHERE jp.tipo_evento::text = 'reta')::integer AS total_retas,
    COUNT(*) FILTER (WHERE jp.tipo_evento::text = 'torneo_express')::integer AS total_torneos_express,
    COUNT(*) FILTER (WHERE jp.tipo_evento::text = 'liga')::integer AS total_ligas,
    COUNT(*) FILTER (WHERE jp.tipo_evento::text = 'americano')::integer AS total_americanos,
    COALESCE(SUM(
      CASE
        WHEN COALESCE(jp.metadata->>'subtipo', '') IN ('liga_inscripcion', 'ajuste_manual') THEN 0
        ELSE COALESCE(
          NULLIF(jp.metadata->>'partidos_ganados', '')::integer,
          CASE WHEN jp.resultado::text = 'victoria' THEN 1 ELSE 0 END
        )
      END
    ), 0)::integer AS victorias,
    COALESCE(SUM(
      CASE
        WHEN COALESCE(jp.metadata->>'subtipo', '') IN ('liga_inscripcion', 'ajuste_manual') THEN 0
        ELSE COALESCE(
          NULLIF(jp.metadata->>'partidos_perdidos', '')::integer,
          CASE WHEN jp.resultado::text = 'derrota' THEN 1 ELSE 0 END
        )
      END
    ), 0)::integer AS derrotas,
    COALESCE(SUM(
      CASE
        WHEN COALESCE(jp.metadata->>'subtipo', '') IN ('liga_inscripcion', 'ajuste_manual') THEN 0
        ELSE COALESCE(
          NULLIF(jp.metadata->>'partidos_empatados', '')::integer,
          CASE WHEN jp.resultado::text = 'empate' THEN 1 ELSE 0 END
        )
      END
    ), 0)::integer AS empates,
    MAX(jp.fecha) FILTER (
      WHERE COALESCE(jp.metadata->>'subtipo', '') NOT IN ('liga_inscripcion', 'ajuste_manual')
    ) AS ultima_actividad
  INTO v_stats
  FROM public.jugador_participaciones jp
  WHERE jp.jugador_id = p_jugador_id;

  INSERT INTO public.jugador_stats (
    jugador_id,
    total_partidos,
    victorias,
    derrotas,
    empates,
    participaciones_solo,
    pct_victorias,
    total_retas,
    total_torneos_express,
    total_ligas,
    total_americanos,
    sets_favor_total,
    sets_contra_total,
    racha_actual,
    ultima_actividad,
    puntos_totales,
    updated_at
  )
  VALUES (
    p_jugador_id,
    GREATEST(0, COALESCE(v_stats.victorias, 0) + COALESCE(v_stats.derrotas, 0)),
    COALESCE(v_stats.victorias, 0),
    COALESCE(v_stats.derrotas, 0),
    COALESCE(v_stats.empates, 0),
    COALESCE(v_stats.participaciones_solo, 0),
    CASE
      WHEN COALESCE(v_stats.victorias, 0) + COALESCE(v_stats.derrotas, 0) > 0 THEN
        ROUND(
          (v_stats.victorias::numeric /
            (v_stats.victorias + v_stats.derrotas)::numeric) * 10000
        ) / 100
      ELSE 0
    END,
    COALESCE(v_stats.total_retas, 0),
    COALESCE(v_stats.total_torneos_express, 0),
    COALESCE(v_stats.total_ligas, 0),
    COALESCE(v_stats.total_americanos, 0),
    COALESCE(v_stats.sets_favor_total, 0),
    COALESCE(v_stats.sets_contra_total, 0),
    '',
    v_stats.ultima_actividad,
    COALESCE(v_stats.puntos_totales, 0),
    now()
  )
  ON CONFLICT (jugador_id) DO UPDATE SET
    total_partidos = EXCLUDED.total_partidos,
    victorias = EXCLUDED.victorias,
    derrotas = EXCLUDED.derrotas,
    empates = EXCLUDED.empates,
    participaciones_solo = EXCLUDED.participaciones_solo,
    pct_victorias = EXCLUDED.pct_victorias,
    total_retas = EXCLUDED.total_retas,
    total_torneos_express = EXCLUDED.total_torneos_express,
    total_ligas = EXCLUDED.total_ligas,
    total_americanos = EXCLUDED.total_americanos,
    sets_favor_total = EXCLUDED.sets_favor_total,
    sets_contra_total = EXCLUDED.sets_contra_total,
    ultima_actividad = EXCLUDED.ultima_actividad,
    puntos_totales = EXCLUDED.puntos_totales,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_jugador_stats(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_jugador_stats(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.refresh_jugador_stats(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_jugador_participacion_linked(
  p_organizador_id uuid,
  p_view_jugador_id uuid,
  p_participacion_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_part record;
  v_official_key uuid;
  v_home_org uuid;
  v_deleted_count integer := 0;
  v_jid uuid;
  v_pid uuid;
  v_rebuilt uuid[] := ARRAY[]::uuid[];
  v_ids_to_reverse uuid[];
BEGIN
  IF p_organizador_id IS NULL OR p_view_jugador_id IS NULL OR p_participacion_id IS NULL THEN
    RAISE EXCEPTION 'Parámetros incompletos';
  END IF;

  IF auth.uid() IS DISTINCT FROM p_organizador_id THEN
    RAISE EXCEPTION 'Sin permiso para gestionar este registro';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.riviera_jugadores rj
    WHERE rj.id = p_view_jugador_id
      AND rj.organizador_id = p_organizador_id
  ) THEN
    RAISE EXCEPTION 'Jugador no encontrado o sin permiso';
  END IF;

  v_home_org := public._resolve_home_organizador_for_jugador(p_view_jugador_id);

  IF NOT public.is_master_admin()
     AND (v_home_org IS NULL OR v_home_org IS DISTINCT FROM p_organizador_id) THEN
    RAISE EXCEPTION 'Solo el club de registro puede eliminar eventos del historial';
  END IF;

  SELECT
    jp.id,
    jp.jugador_id,
    jp.evento_nombre,
    jp.tipo_evento::text AS tipo_evento,
    jp.evento_id
  INTO v_part
  FROM public.jugador_participaciones jp
  WHERE jp.id = p_participacion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro de historial no encontrado';
  END IF;

  v_official_key := public.resolve_official_player_key_for_jugador(p_view_jugador_id);

  IF v_official_key IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public._riviera_official_jugador_ids_for_key(v_official_key) linked
      WHERE linked.riviera_jugador_id = v_part.jugador_id
    ) THEN
      RAISE EXCEPTION 'La participación no pertenece a este jugador enlazado';
    END IF;

    INSERT INTO public.jugador_participacion_exclusiones (
      official_player_key,
      tipo_evento,
      evento_id,
      evento_nombre,
      deleted_by_organizador_id
    ) VALUES (
      v_official_key,
      v_part.tipo_evento,
      v_part.evento_id,
      v_part.evento_nombre,
      p_organizador_id
    )
    ON CONFLICT DO NOTHING;

    SELECT array_agg(jp.id) INTO v_ids_to_reverse
    FROM public.jugador_participaciones jp
    WHERE jp.tipo_evento::text = v_part.tipo_evento
      AND jp.evento_id = v_part.evento_id
      AND jp.jugador_id IN (
        SELECT linked.riviera_jugador_id
        FROM public._riviera_official_jugador_ids_for_key(v_official_key) linked
      );

    IF v_ids_to_reverse IS NOT NULL THEN
      FOREACH v_pid IN ARRAY v_ids_to_reverse LOOP
        PERFORM public._reverse_ledger_for_participacion_safe(v_pid);
      END LOOP;
    END IF;

    DELETE FROM public.jugador_participaciones jp
    WHERE jp.id = ANY(coalesce(v_ids_to_reverse, ARRAY[]::uuid[]));

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    FOR v_jid IN
      SELECT linked.riviera_jugador_id
      FROM public._riviera_official_jugador_ids_for_key(v_official_key) linked
    LOOP
      PERFORM public.refresh_jugador_stats(v_jid);
      v_rebuilt := array_append(v_rebuilt, v_jid);
    END LOOP;
  ELSE
    IF v_part.jugador_id IS DISTINCT FROM p_view_jugador_id THEN
      RAISE EXCEPTION 'La participación no pertenece a este jugador';
    END IF;

    INSERT INTO public.jugador_participacion_exclusiones (
      scope_jugador_id,
      tipo_evento,
      evento_id,
      evento_nombre,
      deleted_by_organizador_id
    ) VALUES (
      p_view_jugador_id,
      v_part.tipo_evento,
      v_part.evento_id,
      v_part.evento_nombre,
      p_organizador_id
    )
    ON CONFLICT DO NOTHING;

    PERFORM public._reverse_ledger_for_participacion_safe(p_participacion_id);

    DELETE FROM public.jugador_participaciones
    WHERE id = p_participacion_id;

    v_deleted_count := 1;

    PERFORM public.refresh_jugador_stats(v_part.jugador_id);
    v_rebuilt := array_append(v_rebuilt, v_part.jugador_id);
  END IF;

  RETURN jsonb_build_object(
    'status', 'deleted',
    'participacion_id', p_participacion_id,
    'source_jugador_id', v_part.jugador_id,
    'view_jugador_id', p_view_jugador_id,
    'evento_nombre', v_part.evento_nombre,
    'tipo_evento', v_part.tipo_evento,
    'evento_id', v_part.evento_id,
    'deleted_count', v_deleted_count,
    'rebuilt_jugador_ids', to_jsonb(v_rebuilt)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_jugador_participacion_linked(uuid, uuid, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.delete_jugador_participacion_linked(uuid, uuid, uuid) IS
  'Elimina evento del historial (ROMC). Solo club de registro. Revierte ledger y recalcula stats.';

COMMENT ON FUNCTION public.reverse_riviera_official_ledger_for_participacion(uuid) IS
  'Revierte ledger oficial. Dueño del perfil local o club de registro (canonical).';
