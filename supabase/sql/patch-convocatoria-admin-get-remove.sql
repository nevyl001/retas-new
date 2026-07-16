-- ══════════════════════════════════════════════════════════════════════════════
-- Patch: RPC admin de lectura + baja de entrada (sin SELECT directo cliente)
--
-- Contexto: el panel autenticado hacía .from('tournament_open_registration')
-- y actualizaba entries directo. Con RLS + helper sin EXECUTE para authenticated,
-- PostgREST responde 403. La superficie correcta es SECURITY DEFINER (como
-- list/upsert/close).
--
-- NO ampliar GRANT a anon. Solo authenticated + dueño del evento.
-- Ejecutar manualmente en staging/prod cuando se autorice.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_open_game_registration(
  p_mode_type text,
  p_entity_id uuid
)
RETURNS public.tournament_open_registration
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_mode text;
  v_org uuid;
  v_row public.tournament_open_registration;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Autenticación requerida'; END IF;
  v_mode := public._assert_convocatoria_mode_allowed(p_mode_type);
  IF p_entity_id IS NULL THEN RAISE EXCEPTION 'entity_id requerido'; END IF;

  -- Ownership server-side (no confiar en el cliente)
  v_org := public._open_reg_organizer_id(v_mode, p_entity_id);
  IF v_org IS NULL OR v_org <> v_uid THEN
    RAISE EXCEPTION 'Evento no encontrado o sin permiso';
  END IF;

  SELECT * INTO v_row
  FROM public.tournament_open_registration
  WHERE mode_type = v_mode AND entity_id = p_entity_id;

  -- NULL si no hay convocatoria (no crea fila)
  -- La fila de config no incluye cancellation_token_hash / teléfono / email.
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.get_open_game_registration(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_open_game_registration(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_open_game_registration(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_open_game_registration_entry(
  p_entry_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_entry public.tournament_open_registration_entries%ROWTYPE;
  v_cfg public.tournament_open_registration;
  v_started boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Autenticación requerida'; END IF;
  IF p_entry_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'entry_id_required');
  END IF;

  SELECT * INTO v_entry
  FROM public.tournament_open_registration_entries
  WHERE id = p_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT * INTO v_cfg
  FROM public.tournament_open_registration
  WHERE id = v_entry.registration_id
  FOR UPDATE;

  IF NOT FOUND
     OR public._open_reg_organizer_id(v_cfg.mode_type, v_cfg.entity_id) <> v_uid THEN
    RAISE EXCEPTION 'Sin permiso';
  END IF;

  -- No alterar roster/slots después de iniciar el juego
  IF v_cfg.mode_type = 'duelo_2v2' THEN
    SELECT estado IN ('en_juego', 'finalizado') INTO v_started
    FROM public.duelos_2v2 WHERE id = v_cfg.entity_id;
  ELSE
    SELECT coalesce(is_started, false) OR coalesce(is_finished, false)
      INTO v_started
    FROM public.tournaments WHERE id = v_cfg.entity_id;
  END IF;

  IF coalesce(v_started, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'registration_closed');
  END IF;

  IF v_cfg.status IN ('closed', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'registration_closed');
  END IF;

  -- Soft-remove (auditoría): no DELETE físico
  UPDATE public.tournament_open_registration_entries
  SET status = 'removed',
      cancelled_at = now(),
      updated_at = now(),
      cancellation_token_hash = null
  WHERE id = v_entry.id;

  IF v_cfg.mode_type = 'americano' THEN
    PERFORM public._open_reg_sync_americano_roster(v_cfg.entity_id);
  ELSIF v_cfg.mode_type = 'duelo_2v2' THEN
    PERFORM public._open_reg_sync_duelo_slots(v_cfg.entity_id);
  END IF;

  -- Respuesta sin token hash ni PII
  RETURN jsonb_build_object('ok', true, 'entry_id', v_entry.id, 'status', 'removed');
END;
$$;

REVOKE ALL ON FUNCTION public.remove_open_game_registration_entry(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_open_game_registration_entry(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.remove_open_game_registration_entry(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
