-- Borrar participación de cualquier club enlazado (ROMC) desde la ficha del jugador
-- en el club donde el organizador tiene el registro.
-- Ejecutar después de riviera-official-player-activity-romc2b.sql y
-- riviera-official-ledger-reversal-on-delete.sql

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

  SELECT jp.id, jp.jugador_id, jp.evento_nombre
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
  ELSIF v_part.jugador_id IS DISTINCT FROM p_view_jugador_id THEN
    RAISE EXCEPTION 'La participación no pertenece a este jugador';
  END IF;

  DELETE FROM public.jugador_participaciones
  WHERE id = p_participacion_id;

  BEGIN
    PERFORM public.refresh_jugador_stats(v_part.jugador_id);
  EXCEPTION
    WHEN undefined_function THEN
      NULL;
  END;

  RETURN jsonb_build_object(
    'status', 'deleted',
    'participacion_id', p_participacion_id,
    'source_jugador_id', v_part.jugador_id,
    'view_jugador_id', p_view_jugador_id,
    'evento_nombre', v_part.evento_nombre
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_jugador_participacion_linked(uuid, uuid, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.delete_jugador_participacion_linked(uuid, uuid, uuid) IS
  'Elimina una participación del historial de cualquier perfil ROMC enlazado al jugador visto en el club del organizador.';
