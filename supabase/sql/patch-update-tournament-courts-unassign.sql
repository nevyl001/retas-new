-- Atomic: update tournaments.courts + unassign pending matches on removed courts.
-- Court NULL = "Por asignar". REQUIERE matches.court nullable
--   (aplicar antes: supabase/sql/patch-matches-court-nullable.sql).
-- Never touches matches with results or in-progress statuses.
-- Optimistic lock on tournaments.updated_at (set explicitly; no auto-trigger required).
--
-- Atomicity: conflict checks happen BEFORE any write. On not_null_violation /
-- any error after writes, RAISE so the transaction rolls back (RPC return of
-- ok:false would still COMMIT — do not RETURN after partial writes).

CREATE OR REPLACE FUNCTION public.update_tournament_courts_and_unassign(
  p_tournament_id uuid,
  p_new_courts integer,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_old_courts integer;
  v_updated_at timestamptz;
  v_new_updated_at timestamptz;
  v_unassigned integer := 0;
  v_rowcount integer;
BEGIN
  IF p_tournament_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_tournament_id');
  END IF;
  IF p_new_courts IS NULL OR p_new_courts < 1 OR p_new_courts > 20 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_courts');
  END IF;

  SELECT user_id, courts, updated_at
    INTO v_owner, v_old_courts, v_updated_at
  FROM public.tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF auth.uid() IS NULL OR auth.uid() <> v_owner THEN
    IF NOT public.is_master_admin() THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
    END IF;
  END IF;

  -- Conflict before any mutation
  IF p_expected_updated_at IS NOT NULL
     AND v_updated_at IS NOT NULL
     AND p_expected_updated_at <> v_updated_at THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'conflict',
      'message', 'La configuración cambió en otra sesión. Recarga los datos antes de guardar.'
    );
  END IF;

  -- 1) Update courts + bump updated_at (explicit; no trigger assumed)
  UPDATE public.tournaments
  SET
    courts = p_new_courts,
    updated_at = now()
  WHERE id = p_tournament_id
    AND (
      p_expected_updated_at IS NULL
      OR updated_at IS NULL
      OR updated_at = p_expected_updated_at
    )
  RETURNING updated_at INTO v_new_updated_at;

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  IF v_rowcount = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'conflict',
      'message', 'La configuración cambió en otra sesión. Recarga los datos antes de guardar.'
    );
  END IF;

  -- 2) Unassign only future/pending on courts that disappear (no auto-reschedule)
  IF p_new_courts < coalesce(v_old_courts, 1) THEN
    BEGIN
      UPDATE public.matches m
      SET court = NULL
      WHERE m.tournament_id = p_tournament_id
        AND m.court IS NOT NULL
        AND m.court > p_new_courts
        AND coalesce(m.pair1_score, m.pair2_score) IS NULL
        AND lower(coalesce(m.status, '')) NOT IN (
          'completed', 'finished', 'finalizado',
          'in_progress', 'playing', 'en_juego', 'live', 'started'
        );
      GET DIAGNOSTICS v_unassigned = ROW_COUNT;
    EXCEPTION
      WHEN not_null_violation THEN
        -- Abort entire transaction (courts update rolls back)
        RAISE EXCEPTION 'matches.court no acepta NULL; no se pudo desasignar de forma segura'
          USING ERRCODE = 'check_violation';
      WHEN undefined_column THEN
        RAISE EXCEPTION 'matches.court no existe'
          USING ERRCODE = 'undefined_column';
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'courts', p_new_courts,
    'unassigned_count', v_unassigned,
    'updated_at', v_new_updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_tournament_courts_and_unassign(uuid, integer, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_tournament_courts_and_unassign(uuid, integer, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.update_tournament_courts_and_unassign(uuid, integer, timestamptz) IS
  'Actualiza tournaments.courts y pone court=NULL en pendientes fuera de rango; no toca resultados ni en juego; atómico.';
