-- Permite revertir ledger al admin del jugador (cualquier club ROMC enlazado),
-- no solo al organizador del perfil local donde vive la fila de participación.
-- Fix: «Sin permiso para revertir esta participación» al borrar historial cross-club.

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
  v_official_key uuid;
  v_can_manage boolean := false;
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

  IF public.is_master_admin() OR v_owner = auth.uid() THEN
    v_can_manage := true;
  ELSE
    v_official_key := public.resolve_official_player_key_for_jugador(v_part_jugador_id);
    IF v_official_key IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM public._riviera_official_jugador_ids_for_key(v_official_key) linked
        INNER JOIN public.riviera_jugadores rj ON rj.id = linked.riviera_jugador_id
        WHERE rj.organizador_id = auth.uid()
      ) INTO v_can_manage;
    END IF;
  END IF;

  IF NOT v_can_manage THEN
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

COMMENT ON FUNCTION public.reverse_riviera_official_ledger_for_participacion(uuid) IS
  'Revierte ledger oficial de una participación. Permite al admin de cualquier perfil ROMC enlazado al mismo jugador.';
