-- ══════════════════════════════════════════════════════════════════════════════
-- 0060 — Reta Abierta: Promoción automática de reserva / lista de espera
--
-- REQUERIMIENTO:
-- Si un jugador confirmado en una reta o convocatoria cancela su asistencia
-- o es dado de baja por el organizador, el sistema debe promover automáticamente
-- al jugador que estaba en reserva/lista de espera (status = 'waitlist') al estado
-- confirmado (status = 'confirmed') en orden FIFO (created_at ASC), ocupando
-- de inmediato el lugar vacante disponible.
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Helper interno: auto-promover waitlist en orden FIFO ───────────────────
CREATE OR REPLACE FUNCTION public._open_reg_auto_promote_waitlist(p_registration_id uuid)
RETURNS int
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg public.tournament_open_registration%ROWTYPE;
  v_confirmed int;
  v_promoted int := 0;
  v_entry_id uuid;
  v_started boolean := false;
BEGIN
  IF p_registration_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_cfg
  FROM public.tournament_open_registration
  WHERE id = p_registration_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- No promover si la convocatoria está desactivada, cerrada o cancelada
  IF v_cfg.enabled IS NOT TRUE OR v_cfg.status IN ('closed', 'cancelled') THEN
    RETURN 0;
  END IF;

  -- No alterar slots si el evento ya inició o finalizó
  IF v_cfg.mode_type = 'duelo_2v2' THEN
    SELECT estado IN ('en_juego', 'finalizado') INTO v_started
    FROM public.duelos_2v2 WHERE id = v_cfg.entity_id;
  ELSE
    SELECT coalesce(is_started, false) OR coalesce(is_finished, false)
      INTO v_started
    FROM public.tournaments WHERE id = v_cfg.entity_id;
  END IF;

  IF coalesce(v_started, false) THEN
    RETURN 0;
  END IF;

  SELECT count(*)::int INTO v_confirmed
  FROM public.tournament_open_registration_entries
  WHERE registration_id = v_cfg.id
    AND status = 'confirmed';

  WHILE v_confirmed < v_cfg.capacity LOOP
    SELECT e.id INTO v_entry_id
    FROM public.tournament_open_registration_entries e
    WHERE e.registration_id = v_cfg.id
      AND e.status = 'waitlist'
    ORDER BY e.created_at ASC, e.id ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    EXIT WHEN v_entry_id IS NULL;

    UPDATE public.tournament_open_registration_entries
    SET status = 'confirmed',
        confirmed_at = coalesce(confirmed_at, now()),
        updated_at = now()
    WHERE id = v_entry_id;

    v_confirmed := v_confirmed + 1;
    v_promoted := v_promoted + 1;
    v_entry_id := NULL;
  END LOOP;

  IF v_promoted > 0 THEN
    IF v_cfg.mode_type = 'americano' THEN
      PERFORM public._open_reg_sync_americano_roster(v_cfg.entity_id);
    ELSIF v_cfg.mode_type = 'duelo_2v2' THEN
      PERFORM public._open_reg_sync_duelo_slots(v_cfg.entity_id);
    END IF;
  END IF;

  RETURN v_promoted;
END;
$$;

REVOKE ALL ON FUNCTION public._open_reg_auto_promote_waitlist(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._open_reg_auto_promote_waitlist(uuid) FROM anon, authenticated;

-- ── 2. Cancelación por jugador (slug + token o Riviera ID) ───────────────────
DROP FUNCTION IF EXISTS public.cancel_tournament_open_registration(text, text);

CREATE OR REPLACE FUNCTION public.cancel_tournament_open_registration(
  p_slug text,
  p_cancellation_token text DEFAULT NULL,
  p_riviera_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_cfg public.tournament_open_registration;
  v_hash text;
  v_entry public.tournament_open_registration_entries%ROWTYPE;
  v_norm text;
  v_token text := nullif(trim(coalesce(p_cancellation_token, '')), '');
  v_promoted int := 0;
BEGIN
  SELECT * INTO v_cfg
  FROM public.tournament_open_registration
  WHERE public_slug = trim(coalesce(p_slug, ''))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_token IS NOT NULL AND length(v_token) >= 16 THEN
    v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

    SELECT * INTO v_entry
    FROM public.tournament_open_registration_entries e
    WHERE e.registration_id = v_cfg.id
      AND e.cancellation_token_hash = v_hash
      AND e.status IN ('confirmed', 'waitlist', 'pending_approval')
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
    END IF;
  ELSE
    v_norm := public._normalize_riviera_id_loose(p_riviera_id);
    IF v_norm IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_riviera_id');
    END IF;

    SELECT * INTO v_entry
    FROM public.tournament_open_registration_entries e
    WHERE e.registration_id = v_cfg.id
      AND upper(trim(e.riviera_id)) = v_norm
      AND e.status IN ('confirmed', 'waitlist', 'pending_approval')
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_registered');
    END IF;
  END IF;

  UPDATE public.tournament_open_registration_entries
  SET
    status = 'cancelled',
    cancelled_at = now(),
    updated_at = now(),
    cancellation_token_hash = NULL
  WHERE id = v_entry.id;

  IF v_entry.status = 'confirmed' THEN
    -- Promover automáticamente al primer jugador en reserva/waitlist
    v_promoted := public._open_reg_auto_promote_waitlist(v_cfg.id);

    -- Sincronizar rosters/slots siempre que salió un confirmado
    IF v_cfg.mode_type = 'americano' THEN
      PERFORM public._open_reg_sync_americano_roster(v_cfg.entity_id);
    ELSIF v_cfg.mode_type = 'duelo_2v2' THEN
      PERFORM public._open_reg_sync_duelo_slots(v_cfg.entity_id);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'entry_id', v_entry.id,
    'previous_status', v_entry.status,
    'promoted_count', v_promoted,
    'message', 'Inscripción cancelada.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_tournament_open_registration(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_tournament_open_registration(text, text, text) TO anon, authenticated;

-- ── 3. Eliminación / baja por organizador ────────────────────────────────────
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
  v_promoted int := 0;
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

  IF v_entry.status = 'confirmed' THEN
    -- Promover automáticamente al primer jugador en reserva/waitlist
    v_promoted := public._open_reg_auto_promote_waitlist(v_cfg.id);
  END IF;

  IF v_cfg.mode_type = 'americano' THEN
    PERFORM public._open_reg_sync_americano_roster(v_cfg.entity_id);
  ELSIF v_cfg.mode_type = 'duelo_2v2' THEN
    PERFORM public._open_reg_sync_duelo_slots(v_cfg.entity_id);
  END IF;

  -- Respuesta sin token hash ni PII
  RETURN jsonb_build_object(
    'ok', true,
    'entry_id', v_entry.id,
    'status', 'removed',
    'previous_status', v_entry.status,
    'promoted_count', v_promoted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.remove_open_game_registration_entry(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_open_game_registration_entry(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.remove_open_game_registration_entry(uuid) TO authenticated;

-- ── 4. Actualización de cupo: reusar el helper unificado ──────────────────────
CREATE OR REPLACE FUNCTION public.set_open_game_registration_capacity(
  p_mode_type text,
  p_entity_id uuid,
  p_capacity int
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_mode text;
  v_cfg public.tournament_open_registration%ROWTYPE;
  v_new_cap int;
  v_confirmed int;
  v_promoted int := 0;
  v_started boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida';
  END IF;

  v_mode := public._assert_convocatoria_mode_allowed(p_mode_type);

  IF v_mode = 'duelo_2v2' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'capacity_locked',
      'message', 'El cupo de Duelo 2vs2 es fijo (4 jugadores).'
    );
  END IF;

  IF p_entity_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'entity_id_required');
  END IF;

  SELECT * INTO v_cfg
  FROM public.tournament_open_registration
  WHERE mode_type = v_mode AND entity_id = p_entity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF public._open_reg_organizer_id(v_cfg.mode_type, v_cfg.entity_id) <> v_uid THEN
    RAISE EXCEPTION 'Sin permiso';
  END IF;

  SELECT coalesce(is_started, false) OR coalesce(is_finished, false)
    INTO v_started
  FROM public.tournaments WHERE id = v_cfg.entity_id;

  IF coalesce(v_started, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tournament_started');
  END IF;

  IF v_cfg.status IN ('closed', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'registration_closed');
  END IF;

  v_new_cap := coalesce(p_capacity, 0);
  IF v_new_cap < 2 OR v_new_cap > 512 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_capacity',
      'message', 'El cupo debe estar entre 2 y 512 jugadores.'
    );
  END IF;

  IF v_new_cap = v_cfg.capacity THEN
    SELECT count(*)::int INTO v_confirmed
    FROM public.tournament_open_registration_entries
    WHERE registration_id = v_cfg.id AND status = 'confirmed';

    RETURN jsonb_build_object(
      'ok', true,
      'capacity', v_cfg.capacity,
      'confirmed_count', v_confirmed,
      'spots_left', greatest(v_cfg.capacity - v_confirmed, 0),
      'promoted_count', 0,
      'registration_id', v_cfg.id,
      'mode_type', v_cfg.mode_type,
      'entity_id', v_cfg.entity_id
    );
  END IF;

  SELECT count(*)::int INTO v_confirmed
  FROM public.tournament_open_registration_entries
  WHERE registration_id = v_cfg.id AND status = 'confirmed';

  IF v_new_cap < v_confirmed THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'capacity_below_confirmed',
      'confirmed_count', v_confirmed,
      'requested_capacity', v_new_cap,
      'message', format(
        'Ya hay %s confirmados. Saca inscritos en «Administrar inscritos» antes de bajar el cupo a %s.',
        v_confirmed, v_new_cap
      )
    );
  END IF;

  UPDATE public.tournament_open_registration
  SET capacity = v_new_cap, updated_at = now()
  WHERE id = v_cfg.id
  RETURNING * INTO v_cfg;

  -- Promover waitlist FIFO con el helper unificado
  v_promoted := public._open_reg_auto_promote_waitlist(v_cfg.id);

  SELECT count(*)::int INTO v_confirmed
  FROM public.tournament_open_registration_entries
  WHERE registration_id = v_cfg.id AND status = 'confirmed';

  RETURN jsonb_build_object(
    'ok', true,
    'capacity', v_cfg.capacity,
    'confirmed_count', v_confirmed,
    'spots_left', greatest(v_cfg.capacity - v_confirmed, 0),
    'promoted_count', v_promoted,
    'registration_id', v_cfg.id,
    'mode_type', v_cfg.mode_type,
    'entity_id', v_cfg.entity_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_open_game_registration_capacity(text, uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_open_game_registration_capacity(text, uuid, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_open_game_registration_capacity(text, uuid, int) TO authenticated;

-- ── 5. Sanar convocatorias activas existentes con huecos y waitlist ──────────
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT e.registration_id
    FROM public.tournament_open_registration_entries e
    JOIN public.tournament_open_registration cfg ON cfg.id = e.registration_id
    WHERE e.status = 'waitlist'
      AND cfg.enabled = true
      AND cfg.status NOT IN ('closed', 'cancelled')
  LOOP
    PERFORM public._open_reg_auto_promote_waitlist(r.registration_id);
  END LOOP;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';

