-- Repara +100 pts de inscripción de liga (carrera/ledger) para todos los participantes.
-- Cubre parejas fijas / playoffs (liga_equipos) e individual rotativo (liga_inscripciones).
--
-- Uso:
--   SELECT public.admin_repair_liga_inscripcion_career('UUID-LIGA', false);
--   SELECT public.admin_repair_liga_inscripcion_career('UUID-LIGA', true);  -- preview

CREATE OR REPLACE FUNCTION public.admin_repair_liga_inscripcion_career(
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
  v_jugador_id uuid;
  v_part_id uuid;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_ledger integer := 0;
  v_refreshed integer := 0;
  v_meta jsonb;
  v_evento_nombre text;
BEGIN
  IF p_liga_id IS NULL THEN
    RAISE EXCEPTION 'p_liga_id requerido';
  END IF;

  SELECT id, nombre, organizador_id, modalidad
  INTO v_liga
  FROM public.ligas
  WHERE id = p_liga_id;

  IF v_liga.id IS NULL THEN
    RAISE EXCEPTION 'Liga no encontrada: %', p_liga_id;
  END IF;

  IF v_liga.organizador_id IS NULL THEN
    RAISE EXCEPTION 'Liga sin organizador_id';
  END IF;

  v_evento_nombre := 'Liga ' || v_liga.nombre || ' — Inscripción';

  FOR v_jugador_id IN
    SELECT DISTINCT rj.id
    FROM (
      -- Parejas fijas / playoffs
      SELECT le.jugador1_id AS legacy_id
      FROM public.liga_equipos le
      WHERE le.liga_id = p_liga_id
      UNION
      SELECT le.jugador2_id
      FROM public.liga_equipos le
      WHERE le.liga_id = p_liga_id
      UNION
      -- Rotativo
      SELECT li.jugador_id
      FROM public.liga_inscripciones li
      WHERE li.liga_id = p_liga_id
    ) AS participants
    INNER JOIN public.riviera_jugadores rj
      ON rj.legacy_liga_jugador_id = participants.legacy_id
     AND rj.organizador_id = v_liga.organizador_id
    WHERE participants.legacy_id IS NOT NULL
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.jugador_participaciones jp
      WHERE jp.jugador_id = v_jugador_id
        AND jp.tipo_evento = 'liga'
        AND jp.evento_id = p_liga_id
        AND jp.metadata->>'subtipo' = 'liga_inscripcion'
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_meta := jsonb_build_object(
      'subtipo', 'liga_inscripcion',
      'organizador_id', v_liga.organizador_id::text,
      'liga_id', p_liga_id::text,
      'liga_nombre', v_liga.nombre,
      'modalidad', 'liga',
      'modalidad_label', 'Liga',
      'lugar', 'Inscripción a la liga',
      'puntos_desglose', jsonb_build_object('liga_inscripcion', 100),
      'esquema_puntos', 'riviera_open_v1'
    );

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
      metadata
    )
    VALUES (
      v_jugador_id,
      'liga',
      p_liga_id,
      v_evento_nombre,
      CURRENT_DATE,
      'participación',
      0,
      0,
      100,
      v_meta
    )
    RETURNING id INTO v_part_id;

    v_inserted := v_inserted + 1;

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
    'liga_id', p_liga_id,
    'liga_nombre', v_liga.nombre,
    'organizador_id', v_liga.organizador_id,
    'inserted', v_inserted,
    'skipped_existing', v_skipped,
    'ledger_written', v_ledger,
    'stats_refreshed', v_refreshed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_repair_liga_inscripcion_career(uuid, boolean)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.admin_repair_liga_inscripcion_career(uuid, boolean) IS
  'Backfill +100 inscripción liga (participaciones + ledger). p_dry_run=true solo preview.';
