-- Elimina un jugador del registro del organizador con limpieza ROMC / rating / duelos.
-- Ejecutar en Supabase SQL Editor si falta el RPC delete_riviera_jugador.

CREATE OR REPLACE FUNCTION public.delete_riviera_jugador(
  p_organizador_id uuid,
  p_jugador_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_official_key uuid;
  v_part_id uuid;
  v_new_canonical uuid;
  v_liga_jugador_id uuid;
  v_deleted_participaciones integer := 0;
BEGIN
  IF p_organizador_id IS NULL OR p_jugador_id IS NULL THEN
    RAISE EXCEPTION 'Parámetros incompletos';
  END IF;

  IF auth.uid() IS DISTINCT FROM p_organizador_id THEN
    RAISE EXCEPTION 'Sin permiso para eliminar este jugador';
  END IF;

  SELECT rj.id, rj.legacy_liga_jugador_id
  INTO v_row
  FROM public.riviera_jugadores rj
  WHERE rj.id = p_jugador_id
    AND rj.organizador_id = p_organizador_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jugador no encontrado o sin permiso para eliminarlo';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organizer_player_access opa
    WHERE opa.grantee_organizer_id = p_organizador_id
      AND opa.local_jugador_id = p_jugador_id
      AND opa.is_active = true
  ) THEN
    RAISE EXCEPTION
      'No se puede eliminar un jugador concedido desde este club. Revoca el acceso desde Admin Principal.';
  END IF;

  v_official_key := public.resolve_official_player_key_for_jugador(p_jugador_id);

  -- Revertir ledger oficial antes de borrar participaciones (FK RESTRICT).
  FOR v_part_id IN
    SELECT jp.id
    FROM public.jugador_participaciones jp
    WHERE jp.jugador_id = p_jugador_id
  LOOP
    BEGIN
      PERFORM public.reverse_riviera_official_ledger_for_participacion(v_part_id);
    EXCEPTION
      WHEN undefined_function THEN
        NULL;
    END;
  END LOOP;

  DELETE FROM public.jugador_participaciones
  WHERE jugador_id = p_jugador_id;
  GET DIAGNOSTICS v_deleted_participaciones = ROW_COUNT;

  -- Ledger huérfano por source_local_jugador_id (sin participación).
  IF to_regclass('public.riviera_official_points_ledger') IS NOT NULL THEN
    DELETE FROM public.riviera_official_points_ledger
    WHERE source_local_jugador_id = p_jugador_id;
  END IF;

  IF to_regclass('public.jugador_participacion_exclusiones') IS NOT NULL THEN
    DELETE FROM public.jugador_participacion_exclusiones
    WHERE scope_jugador_id = p_jugador_id
       OR (v_official_key IS NOT NULL AND official_player_key = v_official_key);
  END IF;

  IF to_regclass('public.rating_historial') IS NOT NULL THEN
    DELETE FROM public.rating_historial
    WHERE jugador_id = p_jugador_id;
  END IF;

  DELETE FROM public.jugador_stats
  WHERE jugador_id = p_jugador_id;

  -- Desvincular perfil oficial ROMC (FK RESTRICT en riviera_jugadores).
  IF to_regclass('public.riviera_official_player_profile_link') IS NOT NULL THEN
    SELECT l.official_player_key
    INTO v_official_key
    FROM public.riviera_official_player_profile_link l
    WHERE l.riviera_jugador_id = p_jugador_id;

    IF v_official_key IS NOT NULL THEN
      IF EXISTS (
        SELECT 1
        FROM public.riviera_official_player_identity i
        WHERE i.official_player_key = v_official_key
          AND i.canonical_riviera_jugador_id = p_jugador_id
      ) THEN
        SELECT l.riviera_jugador_id
        INTO v_new_canonical
        FROM public.riviera_official_player_profile_link l
        WHERE l.official_player_key = v_official_key
          AND l.riviera_jugador_id <> p_jugador_id
        ORDER BY l.created_at
        LIMIT 1;

        IF v_new_canonical IS NOT NULL THEN
          UPDATE public.riviera_official_player_identity
          SET canonical_riviera_jugador_id = v_new_canonical
          WHERE official_player_key = v_official_key;
        END IF;
      END IF;

      DELETE FROM public.riviera_official_player_profile_link
      WHERE riviera_jugador_id = p_jugador_id;

      IF v_new_canonical IS NULL AND NOT EXISTS (
        SELECT 1
        FROM public.riviera_official_player_profile_link l
        WHERE l.official_player_key = v_official_key
      ) THEN
        IF to_regclass('public.riviera_official_player_totals') IS NOT NULL THEN
          DELETE FROM public.riviera_official_player_totals
          WHERE official_player_key = v_official_key;
        END IF;
        IF to_regclass('public.riviera_official_points_ledger') IS NOT NULL THEN
          DELETE FROM public.riviera_official_points_ledger
          WHERE official_player_key = v_official_key;
        END IF;
        DELETE FROM public.riviera_official_player_identity
        WHERE official_player_key = v_official_key;
      END IF;
    END IF;
  END IF;

  -- Duelos: conservar el encuentro pero quitar referencia al jugador borrado.
  IF to_regclass('public.duelos_2v2') IS NOT NULL THEN
    UPDATE public.duelos_2v2
    SET
      pareja_a_j1_id = CASE WHEN pareja_a_j1_id = p_jugador_id THEN NULL ELSE pareja_a_j1_id END,
      pareja_a_j2_id = CASE WHEN pareja_a_j2_id = p_jugador_id THEN NULL ELSE pareja_a_j2_id END,
      pareja_b_j1_id = CASE WHEN pareja_b_j1_id = p_jugador_id THEN NULL ELSE pareja_b_j1_id END,
      pareja_b_j2_id = CASE WHEN pareja_b_j2_id = p_jugador_id THEN NULL ELSE pareja_b_j2_id END,
      updated_at = now()
    WHERE organizador_id = p_organizador_id
      AND (
        pareja_a_j1_id = p_jugador_id
        OR pareja_a_j2_id = p_jugador_id
        OR pareja_b_j1_id = p_jugador_id
        OR pareja_b_j2_id = p_jugador_id
      );
  END IF;

  v_liga_jugador_id := NULLIF(trim(v_row.legacy_liga_jugador_id::text), '')::uuid;

  IF v_liga_jugador_id IS NOT NULL THEN
    IF to_regclass('public.liga_inscripciones') IS NOT NULL THEN
      DELETE FROM public.liga_inscripciones
      WHERE jugador_id = v_liga_jugador_id;
    END IF;

    IF to_regclass('public.liga_jugadores') IS NOT NULL THEN
      UPDATE public.liga_jugadores
      SET estado = 'inactivo'
      WHERE id = v_liga_jugador_id
        AND organizador_id = p_organizador_id;
    END IF;
  END IF;

  IF to_regclass('public.organizer_player_access') IS NOT NULL THEN
    DELETE FROM public.organizer_player_access
    WHERE jugador_id = p_jugador_id
       OR local_jugador_id = p_jugador_id;
  END IF;

  DELETE FROM public.riviera_jugadores
  WHERE id = p_jugador_id
    AND organizador_id = p_organizador_id;

  RETURN jsonb_build_object(
    'status', 'deleted',
    'jugador_id', p_jugador_id,
    'participaciones_deleted', v_deleted_participaciones
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_riviera_jugador(uuid, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.delete_riviera_jugador(uuid, uuid) IS
  'Elimina jugador propio del organizador: participaciones, stats, rating, ROMC, duelos y accesos concedidos.';

NOTIFY pgrst, 'reload schema';
