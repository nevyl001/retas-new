-- ══════════════════════════════════════════════════════════════════════════════
-- Convocatoria: ajustar cupo (capacity) en vivo — Reta / RR / Americano
--
-- SoT: tournament_open_registration.capacity (NO vive en tournaments).
-- Duelo 2v2: cupo fijo 4 — esta RPC rechaza el modo; upsert también lo fuerza.
--
-- Reglas:
--   - Bajar: NO por debajo de confirmed_count (nunca expulsa).
--   - Subir: promueve waitlist FIFO hasta llenar huecos (atómico, bajo FOR UPDATE).
--   - Rango: 1..64 (mismo CHECK de tabla).
--   - Lock: FOR UPDATE de la fila cfg (= mismo row lock que join_open_registration).
--
-- NO ejecutar automáticamente. Revisar → SQL Editor (staging → prod).
-- ══════════════════════════════════════════════════════════════════════════════

-- Endurece upsert: duelo siempre capacity=4; no bajar bajo confirmados.
CREATE OR REPLACE FUNCTION public.upsert_open_game_registration(
  p_mode_type text,
  p_entity_id uuid,
  p_enabled boolean DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_capacity integer DEFAULT NULL,
  p_waitlist_enabled boolean DEFAULT NULL,
  p_approval_required boolean DEFAULT NULL,
  p_registration_deadline timestamptz DEFAULT NULL,
  p_scheduled_at timestamptz DEFAULT NULL,
  p_duration_minutes integer DEFAULT NULL,
  p_category_label text DEFAULT NULL,
  p_location_label text DEFAULT NULL,
  p_display_rating boolean DEFAULT NULL,
  p_display_photo boolean DEFAULT NULL,
  p_display_full_name boolean DEFAULT NULL,
  p_title_public text DEFAULT NULL,
  p_rama_label text DEFAULT NULL
)
RETURNS public.tournament_open_registration
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_row public.tournament_open_registration;
  v_mode text;
  v_tournament uuid;
  v_next_cap int;
  v_confirmed int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Autenticación requerida'; END IF;
  v_mode := public._assert_convocatoria_mode_allowed(p_mode_type);
  IF p_entity_id IS NULL THEN RAISE EXCEPTION 'entity_id requerido'; END IF;

  v_org := public._open_reg_organizer_id(v_mode, p_entity_id);
  IF v_org IS NULL OR v_org <> v_uid THEN
    RAISE EXCEPTION 'Evento no encontrado o sin permiso';
  END IF;

  v_tournament := CASE WHEN v_mode = 'duelo_2v2' THEN NULL ELSE p_entity_id END;

  -- Capacidad destino (duelo fijo 4)
  IF v_mode = 'duelo_2v2' THEN
    v_next_cap := 4;
  ELSIF p_capacity IS NULL THEN
    v_next_cap := NULL; -- keep existing on update / default on insert
  ELSE
    IF p_capacity < 1 OR p_capacity > 64 THEN
      RAISE EXCEPTION 'Cupo fuera de rango (1–64)';
    END IF;
    v_next_cap := p_capacity;
  END IF;

  INSERT INTO public.tournament_open_registration AS tor (
    id, tournament_id, mode_type, entity_id, public_slug, enabled, status,
    capacity, waitlist_enabled, approval_required, registration_deadline,
    scheduled_at, duration_minutes, category_label, location_label,
    display_rating, display_photo, display_full_name, title_public, rama_label
  ) VALUES (
    gen_random_uuid(),
    v_tournament,
    v_mode,
    p_entity_id,
    public._tor_open_reg_slug(),
    coalesce(p_enabled, false),
    coalesce(p_status, 'draft'),
    coalesce(v_next_cap, CASE WHEN v_mode = 'duelo_2v2' THEN 4 ELSE 8 END),
    coalesce(p_waitlist_enabled, true),
    coalesce(p_approval_required, false),
    p_registration_deadline,
    p_scheduled_at,
    p_duration_minutes,
    nullif(trim(coalesce(p_category_label, '')), ''),
    nullif(trim(coalesce(p_location_label, '')), ''),
    coalesce(p_display_rating, true),
    coalesce(p_display_photo, true),
    coalesce(p_display_full_name, true),
    nullif(trim(coalesce(p_title_public, '')), ''),
    nullif(trim(coalesce(p_rama_label, '')), '')
  )
  ON CONFLICT (mode_type, entity_id) DO UPDATE SET
    enabled = coalesce(p_enabled, tor.enabled),
    status = coalesce(p_status, tor.status),
    capacity = CASE
      WHEN v_mode = 'duelo_2v2' THEN 4
      WHEN v_next_cap IS NULL THEN tor.capacity
      ELSE v_next_cap
    END,
    waitlist_enabled = coalesce(p_waitlist_enabled, tor.waitlist_enabled),
    approval_required = coalesce(p_approval_required, tor.approval_required),
    registration_deadline = coalesce(p_registration_deadline, tor.registration_deadline),
    scheduled_at = coalesce(p_scheduled_at, tor.scheduled_at),
    duration_minutes = coalesce(p_duration_minutes, tor.duration_minutes),
    category_label = coalesce(nullif(trim(coalesce(p_category_label, '')), ''), tor.category_label),
    location_label = coalesce(nullif(trim(coalesce(p_location_label, '')), ''), tor.location_label),
    display_rating = coalesce(p_display_rating, tor.display_rating),
    display_photo = coalesce(p_display_photo, tor.display_photo),
    display_full_name = coalesce(p_display_full_name, tor.display_full_name),
    title_public = coalesce(nullif(trim(coalesce(p_title_public, '')), ''), tor.title_public),
    rama_label = coalesce(nullif(trim(coalesce(p_rama_label, '')), ''), tor.rama_label),
    tournament_id = coalesce(tor.tournament_id, v_tournament),
    updated_at = now()
  RETURNING * INTO v_row;

  -- No bajar bajo confirmados (tampoco vía upsert genérico)
  IF v_mode <> 'duelo_2v2' AND v_next_cap IS NOT NULL THEN
    SELECT count(*)::int INTO v_confirmed
    FROM public.tournament_open_registration_entries e
    WHERE e.registration_id = v_row.id AND e.status = 'confirmed';
    IF v_next_cap < v_confirmed THEN
      RAISE EXCEPTION
        'Ya hay % confirmados. Saca inscritos en Administrar inscritos antes de bajar el cupo a %.',
        v_confirmed, v_next_cap;
    END IF;
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_open_game_registration(
  text, uuid, boolean, text, integer, boolean, boolean, timestamptz, timestamptz,
  integer, text, text, boolean, boolean, boolean, text, text
) TO authenticated;
REVOKE ALL ON FUNCTION public.upsert_open_game_registration(
  text, uuid, boolean, text, integer, boolean, boolean, timestamptz, timestamptz,
  integer, text, text, boolean, boolean, boolean, text, text
) FROM anon;

-- ── RPC dedicada: set capacity en vivo ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_open_game_registration_capacity(
  p_mode_type text,
  p_entity_id uuid,
  p_capacity integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_mode text;
  v_org uuid;
  v_cfg public.tournament_open_registration;
  v_confirmed int;
  v_promoted int := 0;
  v_entry_id uuid;
  v_new_cap int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;

  v_mode := public._assert_convocatoria_mode_allowed(p_mode_type);
  IF p_entity_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'entity_required');
  END IF;

  -- Duelo: cupo fijo 4 — no se puede variar
  IF v_mode = 'duelo_2v2' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'capacity_locked',
      'message', 'El cupo del duelo 2 vs 2 es fijo (4 jugadores).'
    );
  END IF;

  v_org := public._open_reg_organizer_id(v_mode, p_entity_id);
  IF v_org IS NULL OR v_org <> v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_capacity IS NULL OR p_capacity < 1 OR p_capacity > 64 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'capacity_out_of_range',
      'message', 'El cupo debe estar entre 1 y 64.',
      'min', 1,
      'max', 64
    );
  END IF;
  v_new_cap := p_capacity;

  -- Mismo row lock que join_open_registration (FOR UPDATE de la cfg)
  SELECT * INTO v_cfg
  FROM public.tournament_open_registration
  WHERE mode_type = v_mode AND entity_id = p_entity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT count(*)::int INTO v_confirmed
  FROM public.tournament_open_registration_entries e
  WHERE e.registration_id = v_cfg.id AND e.status = 'confirmed';

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

  -- Subir cupo: promover waitlist FIFO hasta llenar (no pending_approval)
  WHILE v_confirmed < v_new_cap LOOP
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

  IF v_promoted > 0 AND v_cfg.mode_type = 'americano' THEN
    PERFORM public._open_reg_sync_americano_roster(v_cfg.entity_id);
  END IF;

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

COMMENT ON FUNCTION public.set_open_game_registration_capacity(text, uuid, integer) IS
  'Ajusta cupo de convocatoria (reta/americano). Rechaza duelo_2v2. No baja bajo confirmados; al subir promueve waitlist FIFO.';

GRANT EXECUTE ON FUNCTION public.set_open_game_registration_capacity(text, uuid, integer)
  TO authenticated;
REVOKE ALL ON FUNCTION public.set_open_game_registration_capacity(text, uuid, integer)
  FROM anon;

NOTIFY pgrst, 'reload schema';
