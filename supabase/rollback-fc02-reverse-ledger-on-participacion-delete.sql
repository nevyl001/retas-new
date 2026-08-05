-- Rollback de supabase/migrations/0008_reverse_ledger_on_participacion_delete.sql
-- (FC-02, Fase C1) -- restaura delete_jugador_participacion_linked() a su
-- versión anterior, SIN las llamadas a _reverse_ledger_for_participacion_safe().
-- Uso de emergencia únicamente: reintroduce el bug original (el ranking
-- oficial del sitio no baja al borrar una participación individual).

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
  v_deleted_count integer := 0;
  v_jid uuid;
  v_rebuilt uuid[] := ARRAY[]::uuid[];
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

    DELETE FROM public.jugador_participaciones jp
    WHERE jp.tipo_evento::text = v_part.tipo_evento
      AND jp.evento_id = v_part.evento_id
      AND jp.jugador_id IN (
        SELECT linked.riviera_jugador_id
        FROM public._riviera_official_jugador_ids_for_key(v_official_key) linked
      );

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    FOR v_jid IN
      SELECT linked.riviera_jugador_id
      FROM public._riviera_official_jugador_ids_for_key(v_official_key) linked
    LOOP
      BEGIN
        PERFORM public.refresh_jugador_stats(v_jid);
        v_rebuilt := array_append(v_rebuilt, v_jid);
      EXCEPTION
        WHEN undefined_function THEN
          NULL;
      END;
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

    DELETE FROM public.jugador_participaciones
    WHERE id = p_participacion_id;

    v_deleted_count := 1;

    BEGIN
      PERFORM public.refresh_jugador_stats(v_part.jugador_id);
      v_rebuilt := array_append(v_rebuilt, v_part.jugador_id);
    EXCEPTION
      WHEN undefined_function THEN
        NULL;
    END;
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
  'Elimina un evento del historial en TODOS los perfiles ROMC enlazados, registra exclusión y recalcula stats.';
