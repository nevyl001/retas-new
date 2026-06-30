-- Reversión de puntos oficiales (ROMC) al eliminar participaciones.
-- Ejecutar en Supabase SQL Editor después de riviera-official-player-activity-romc2b.sql
--
-- Al borrar un evento del historial (jugador_participaciones), se elimina la entrada
-- del ledger oficial y se recalculan los totales globales del jugador.

CREATE OR REPLACE FUNCTION public._recalc_official_player_totals(p_official_player_key uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer;
  v_last timestamptz;
BEGIN
  IF p_official_player_key IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(l.points), 0)::integer,
    MAX(l.created_at)
  INTO v_total, v_last
  FROM public.riviera_official_points_ledger l
  WHERE l.official_player_key = p_official_player_key
    AND COALESCE(l.counts_for_official_ranking, true) = true;

  UPDATE public.riviera_official_player_totals
  SET
    points_total = GREATEST(0, v_total),
    last_activity_at = v_last,
    updated_at = now()
  WHERE official_player_key = p_official_player_key;

  IF NOT FOUND AND v_total > 0 THEN
    INSERT INTO public.riviera_official_player_totals (
      official_player_key,
      points_total,
      last_activity_at
    ) VALUES (
      p_official_player_key,
      v_total,
      v_last
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._recalc_official_player_totals(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._recalc_official_player_totals(uuid) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.reverse_riviera_official_ledger_for_participacion(
  p_participacion_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ledger record;
BEGIN
  IF p_participacion_id IS NULL THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'null_participacion_id');
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
$$;

GRANT EXECUTE ON FUNCTION public.reverse_riviera_official_ledger_for_participacion(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.reverse_riviera_official_ledger_for_participacion(uuid) IS
  'Elimina el movimiento oficial de una participación y recalcula riviera_official_player_totals.';

CREATE OR REPLACE FUNCTION public.trg_reverse_official_ledger_on_participacion_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.reverse_riviera_official_ledger_for_participacion(OLD.id);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS reverse_official_ledger_before_participacion_delete
  ON public.jugador_participaciones;

CREATE TRIGGER reverse_official_ledger_before_participacion_delete
  BEFORE DELETE ON public.jugador_participaciones
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_reverse_official_ledger_on_participacion_delete();
