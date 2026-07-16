-- Preferencia de lado (A/B) al unirse a Convocatoria Duelo 2vs2.
-- Aplicar UNA vez en Supabase SQL Editor (staging → prod).
-- Compatible con join sin p_preferred_side (DEFAULT NULL).

ALTER TABLE public.tournament_open_registration_entries
  ADD COLUMN IF NOT EXISTS preferred_side text;

DO $$
BEGIN
  ALTER TABLE public.tournament_open_registration_entries
    DROP CONSTRAINT IF EXISTS tournament_open_registration_entries_preferred_side_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.tournament_open_registration_entries
  ADD CONSTRAINT tournament_open_registration_entries_preferred_side_check
  CHECK (preferred_side IS NULL OR preferred_side IN ('A', 'B'));

COMMENT ON COLUMN public.tournament_open_registration_entries.preferred_side IS
  'Lado preferido en duelo 2vs2: A (Pareja 1) o B (Pareja 2).';

-- Sync: respeta preferred_side (A→slots 1-2, B→slots 3-4; overflow al otro lado)
CREATE OR REPLACE FUNCTION public._open_reg_sync_duelo_slots(p_duelo_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ids uuid[] := ARRAY[NULL, NULL, NULL, NULL];
  names text[] := ARRAY[NULL, NULL, NULL, NULL];
  r record;
  placed int := 0;
  idx int;
  try_idxs int[];
  i int;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.duelos_2v2 d
    WHERE d.id = p_duelo_id AND d.estado IN ('en_juego', 'finalizado')
      AND d.pareja_a_j1_id IS NOT NULL AND d.pareja_a_j2_id IS NOT NULL
      AND d.pareja_b_j1_id IS NOT NULL AND d.pareja_b_j2_id IS NOT NULL
      AND coalesce(d.sets_pareja_a, 0) + coalesce(d.sets_pareja_b, 0) > 0
  ) THEN
    RETURN;
  END IF;

  -- 1) Preferencias A/B en orden de confirmación
  FOR r IN
    SELECT e.riviera_jugador_id,
           coalesce(nullif(trim(e.display_name_snapshot), ''), rj.nombre) AS nombre,
           opa.local_jugador_id,
           upper(nullif(trim(e.preferred_side), '')) AS pref
    FROM public.tournament_open_registration_entries e
    JOIN public.tournament_open_registration cfg ON cfg.id = e.registration_id
    JOIN public.riviera_jugadores rj ON rj.id = e.riviera_jugador_id
    LEFT JOIN public.organizer_player_access opa
      ON opa.jugador_id = e.riviera_jugador_id
     AND opa.grantee_organizer_id = (SELECT organizador_id FROM public.duelos_2v2 WHERE id = p_duelo_id)
     AND opa.is_active = true
    WHERE cfg.entity_id = p_duelo_id
      AND cfg.mode_type = 'duelo_2v2'
      AND e.status = 'confirmed'
      AND upper(nullif(trim(e.preferred_side), '')) IN ('A', 'B')
    ORDER BY coalesce(e.confirmed_at, e.created_at)
    LIMIT 4
  LOOP
    IF r.pref = 'A' THEN
      try_idxs := ARRAY[1, 2, 3, 4];
    ELSE
      try_idxs := ARRAY[3, 4, 1, 2];
    END IF;
    FOREACH idx IN ARRAY try_idxs LOOP
      IF ids[idx] IS NULL THEN
        ids[idx] := coalesce(r.local_jugador_id, r.riviera_jugador_id);
        names[idx] := r.nombre;
        placed := placed + 1;
        EXIT;
      END IF;
    END LOOP;
    EXIT WHEN placed >= 4;
  END LOOP;

  -- 2) Sin preferencia → primer hueco libre
  FOR r IN
    SELECT e.riviera_jugador_id,
           coalesce(nullif(trim(e.display_name_snapshot), ''), rj.nombre) AS nombre,
           opa.local_jugador_id
    FROM public.tournament_open_registration_entries e
    JOIN public.tournament_open_registration cfg ON cfg.id = e.registration_id
    JOIN public.riviera_jugadores rj ON rj.id = e.riviera_jugador_id
    LEFT JOIN public.organizer_player_access opa
      ON opa.jugador_id = e.riviera_jugador_id
     AND opa.grantee_organizer_id = (SELECT organizador_id FROM public.duelos_2v2 WHERE id = p_duelo_id)
     AND opa.is_active = true
    WHERE cfg.entity_id = p_duelo_id
      AND cfg.mode_type = 'duelo_2v2'
      AND e.status = 'confirmed'
      AND coalesce(upper(nullif(trim(e.preferred_side), '')), '') NOT IN ('A', 'B')
    ORDER BY coalesce(e.confirmed_at, e.created_at)
    LIMIT 4
  LOOP
    FOR i IN 1..4 LOOP
      IF ids[i] IS NULL THEN
        ids[i] := coalesce(r.local_jugador_id, r.riviera_jugador_id);
        names[i] := r.nombre;
        placed := placed + 1;
        EXIT;
      END IF;
    END LOOP;
    EXIT WHEN placed >= 4;
  END LOOP;

  UPDATE public.duelos_2v2 SET
    pareja_a_j1_id = ids[1],
    pareja_a_j1_nombre = coalesce(names[1], ''),
    pareja_a_j2_id = ids[2],
    pareja_a_j2_nombre = coalesce(names[2], ''),
    pareja_b_j1_id = ids[3],
    pareja_b_j1_nombre = coalesce(names[3], ''),
    pareja_b_j2_id = ids[4],
    pareja_b_j2_nombre = coalesce(names[4], ''),
    estado = 'configuracion',
    updated_at = now()
  WHERE id = p_duelo_id;
END;
$$;

REVOKE ALL ON FUNCTION public._open_reg_sync_duelo_slots(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._open_reg_sync_duelo_slots(uuid) FROM anon, authenticated;

-- Join con lado opcional (reemplaza firma de 2 args)
DROP FUNCTION IF EXISTS public.join_tournament_open_registration(text, text);

CREATE OR REPLACE FUNCTION public.join_tournament_open_registration(
  p_slug text,
  p_riviera_id text,
  p_preferred_side text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_cfg public.tournament_open_registration;
  v_norm text;
  v_identity record;
  v_confirmed int;
  v_status text;
  v_token text;
  v_token_hash text;
  v_entry_id uuid;
  v_existing public.tournament_open_registration_entries%ROWTYPE;
  v_host uuid;
  v_owner uuid;
  v_access_id uuid;
  v_local_id uuid;
  v_finished boolean := false;
  v_side text;
BEGIN
  SELECT * INTO v_cfg
  FROM public.tournament_open_registration
  WHERE public_slug = trim(coalesce(p_slug, ''))
  FOR UPDATE;

  IF NOT FOUND OR v_cfg.enabled IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_cfg.status IN ('closed', 'cancelled', 'paused', 'draft') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'registration_' || v_cfg.status);
  END IF;

  IF v_cfg.registration_deadline IS NOT NULL AND now() > v_cfg.registration_deadline THEN
    RETURN jsonb_build_object('ok', false, 'error', 'deadline_passed');
  END IF;

  v_host := public._open_reg_organizer_id(v_cfg.mode_type, v_cfg.entity_id);
  IF v_host IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tournament_unavailable');
  END IF;

  IF v_cfg.mode_type = 'duelo_2v2' THEN
    SELECT estado IN ('en_juego', 'finalizado') INTO v_finished
    FROM public.duelos_2v2 WHERE id = v_cfg.entity_id;
  ELSE
    SELECT coalesce(is_started, false) OR coalesce(is_finished, false)
      INTO v_finished
    FROM public.tournaments WHERE id = v_cfg.entity_id;
  END IF;
  IF coalesce(v_finished, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'registration_closed');
  END IF;

  v_norm := public._normalize_riviera_id_loose(p_riviera_id);
  IF v_norm IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_riviera_id');
  END IF;

  SELECT * INTO v_identity FROM public._resolve_identity_by_riviera_id(v_norm);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'riviera_id_not_found', 'riviera_id', v_norm);
  END IF;

  v_side := upper(nullif(trim(p_preferred_side), ''));
  IF v_side IS NOT NULL AND v_side NOT IN ('A', 'B') THEN
    v_side := NULL;
  END IF;
  IF v_cfg.mode_type <> 'duelo_2v2' THEN
    v_side := NULL;
  END IF;

  PERFORM pg_advisory_xact_lock(
    250715,
    hashtext(v_cfg.id::text || ':' || v_identity.canonical_riviera_jugador_id::text)
  );

  SELECT * INTO v_existing
  FROM public.tournament_open_registration_entries e
  WHERE e.registration_id = v_cfg.id
    AND e.riviera_jugador_id = v_identity.canonical_riviera_jugador_id
    AND e.status IN ('confirmed', 'waitlist', 'pending_approval')
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'already_registered',
      'status', v_existing.status, 'entry_id', v_existing.id
    );
  END IF;

  SELECT count(*)::int INTO v_confirmed
  FROM public.tournament_open_registration_entries e
  WHERE e.registration_id = v_cfg.id AND e.status = 'confirmed';

  IF v_cfg.approval_required THEN
    v_status := 'pending_approval';
  ELSIF v_confirmed < v_cfg.capacity THEN
    v_status := 'confirmed';
  ELSIF v_cfg.waitlist_enabled THEN
    v_status := 'waitlist';
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'full');
  END IF;

  v_owner := v_identity.registration_organizer_id;
  IF v_owner IS NOT NULL AND v_owner <> v_host THEN
    PERFORM pg_advisory_xact_lock(
      212012,
      hashtext(v_host::text || ':' || v_identity.canonical_riviera_jugador_id::text)
    );

    INSERT INTO public.organizer_player_access (
      jugador_id, owner_organizador_id, grantee_organizer_id, access_type,
      granted_by_admin_id, is_active, is_public_ranking, joined_at, joined_via
    ) VALUES (
      v_identity.canonical_riviera_jugador_id, v_owner, v_host, 'granted_by_admin',
      NULL, true, false, now(), 'registration'
    )
    ON CONFLICT (grantee_organizer_id, jugador_id) DO UPDATE SET
      is_active = true,
      left_at = NULL,
      joined_at = coalesce(public.organizer_player_access.joined_at, now()),
      joined_via = coalesce(public.organizer_player_access.joined_via, 'registration'),
      updated_at = now()
    RETURNING id INTO v_access_id;

    v_local_id := public._ensure_granted_player_local_as(
      v_identity.canonical_riviera_jugador_id, v_host
    );
  END IF;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.tournament_open_registration_entries (
    registration_id, tournament_id, riviera_jugador_id, official_player_key,
    riviera_id, status, source, cancellation_token_hash, display_name_snapshot,
    confirmed_at, preferred_side
  ) VALUES (
    v_cfg.id,
    v_cfg.tournament_id,
    v_identity.canonical_riviera_jugador_id,
    v_identity.official_player_key,
    v_identity.riviera_id,
    v_status,
    'public_riviera_id',
    v_token_hash,
    v_identity.display_name,
    CASE WHEN v_status = 'confirmed' THEN now() ELSE NULL END,
    v_side
  ) RETURNING id INTO v_entry_id;

  IF v_status = 'confirmed' THEN
    IF v_cfg.mode_type = 'americano' THEN
      PERFORM public._open_reg_sync_americano_roster(v_cfg.entity_id);
    ELSIF v_cfg.mode_type = 'duelo_2v2' THEN
      PERFORM public._open_reg_sync_duelo_slots(v_cfg.entity_id);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'entry_id', v_entry_id,
    'status', v_status,
    'riviera_id', v_identity.riviera_id,
    'nombre', v_identity.display_name,
    'cancellation_token', v_token,
    'preferred_side', v_side,
    'message', CASE v_status
      WHEN 'confirmed' THEN 'Asistencia confirmada. Ya estás dentro.'
      WHEN 'waitlist' THEN 'Cupo lleno. Quedaste en lista de espera.'
      WHEN 'pending_approval' THEN 'Solicitud enviada. El club debe aprobarte.'
      ELSE 'Registrado.'
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_tournament_open_registration(text, text, text) TO anon, authenticated;

-- DTO público: incluir preferred_side en entries
CREATE OR REPLACE FUNCTION public.get_tournament_open_registration_public(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg public.tournament_open_registration;
  v_org uuid;
  v_title text;
  v_desc text;
  v_confirmed int;
  v_waitlist int;
  v_entries jsonb;
  v_finished boolean := false;
  v_started boolean := false;
BEGIN
  SELECT * INTO v_cfg
  FROM public.tournament_open_registration
  WHERE public_slug = trim(coalesce(p_slug, ''))
    AND enabled = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  v_org := public._open_reg_organizer_id(v_cfg.mode_type, v_cfg.entity_id);
  v_title := coalesce(nullif(trim(v_cfg.title_public), ''), public._open_reg_entity_title(v_cfg.mode_type, v_cfg.entity_id));

  IF v_cfg.mode_type = 'duelo_2v2' THEN
    SELECT descripcion, estado IN ('en_juego', 'finalizado'), estado = 'finalizado'
    INTO v_desc, v_started, v_finished
    FROM public.duelos_2v2 WHERE id = v_cfg.entity_id;
  ELSE
    SELECT description, coalesce(is_started, false), coalesce(is_finished, false)
    INTO v_desc, v_started, v_finished
    FROM public.tournaments WHERE id = v_cfg.entity_id;
  END IF;

  SELECT count(*)::int INTO v_confirmed
  FROM public.tournament_open_registration_entries e
  WHERE e.registration_id = v_cfg.id AND e.status = 'confirmed';

  SELECT count(*)::int INTO v_waitlist
  FROM public.tournament_open_registration_entries e
  WHERE e.registration_id = v_cfg.id AND e.status = 'waitlist';

  SELECT coalesce(jsonb_agg(x.obj ORDER BY x.sort_ts), '[]'::jsonb)
  INTO v_entries
  FROM (
    SELECT
      jsonb_build_object(
        'id', e.id,
        'status', e.status,
        'riviera_id', e.riviera_id,
        'nombre', CASE
          WHEN v_cfg.display_full_name THEN coalesce(e.display_name_snapshot, rj.nombre)
          ELSE split_part(coalesce(e.display_name_snapshot, rj.nombre), ' ', 1)
            || CASE
              WHEN array_length(regexp_split_to_array(trim(coalesce(e.display_name_snapshot, rj.nombre)), '\s+'), 1) > 1
              THEN ' ' || left(split_part(coalesce(e.display_name_snapshot, rj.nombre), ' ', 2), 1) || '.'
              ELSE ''
            END
        END,
        'foto_url', CASE WHEN v_cfg.display_photo THEN rj.foto_url ELSE NULL END,
        'rating', CASE WHEN v_cfg.display_rating THEN rj.rating ELSE NULL END,
        'categoria', rj.categoria,
        'preferred_side', e.preferred_side
      ) AS obj,
      coalesce(e.confirmed_at, e.created_at) AS sort_ts
    FROM public.tournament_open_registration_entries e
    JOIN public.riviera_jugadores rj ON rj.id = e.riviera_jugador_id
    WHERE e.registration_id = v_cfg.id
      AND e.status IN ('confirmed', 'waitlist')
  ) x;

  RETURN jsonb_build_object(
    'ok', true,
    'slug', v_cfg.public_slug,
    'mode_type', v_cfg.mode_type,
    'entity_id', v_cfg.entity_id,
    'registration_id', v_cfg.id,
    'tournament_id', v_cfg.tournament_id,
    'organizador_id', v_org,
    'name', v_title,
    'description', v_desc,
    'status', v_cfg.status,
    'capacity', v_cfg.capacity,
    'confirmed_count', v_confirmed,
    'waitlist_count', v_waitlist,
    'spots_left', greatest(v_cfg.capacity - v_confirmed, 0),
    'waitlist_enabled', v_cfg.waitlist_enabled,
    'approval_required', v_cfg.approval_required,
    'registration_deadline', v_cfg.registration_deadline,
    'scheduled_at', v_cfg.scheduled_at,
    'duration_minutes', v_cfg.duration_minutes,
    'category_label', v_cfg.category_label,
    'rama_label', v_cfg.rama_label,
    'location_label', v_cfg.location_label,
    'display_rating', v_cfg.display_rating,
    'display_photo', v_cfg.display_photo,
    'entries', v_entries,
    'is_finished', coalesce(v_finished, false),
    'is_started', coalesce(v_started, false)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tournament_open_registration_public(text) TO anon, authenticated;

-- Recargar esquema PostgREST para que vea join(..., preferred_side)
NOTIFY pgrst, 'reload schema';
