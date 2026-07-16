-- ══════════════════════════════════════════════════════════════════════════════
-- Convocatoria Riviera — RPCs multi-modo (compatibles con Reta Abierta v1)
-- Ejecutar DESPUÉS de convocatoria-riviera-generalize.sql
-- ══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Whitelist estricta: exclusiones explícitas + allowlist
CREATE OR REPLACE FUNCTION public._assert_convocatoria_mode_allowed(p_mode text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v text := lower(trim(coalesce(p_mode, '')));
BEGIN
  IF v IN ('liga', 'torneo', 'torneo_express', 'evento_multicategoria', 'mini-torneo') THEN
    RAISE EXCEPTION 'modo excluido de convocatoria';
  END IF;
  IF v NOT IN ('reta', 'americano', 'duelo_2v2') THEN
    RAISE EXCEPTION 'mode_type inválido';
  END IF;
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public._assert_convocatoria_mode_allowed(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._assert_convocatoria_mode_allowed(text) FROM anon, authenticated;

-- Upsert por modo + entidad (idempotente: no duplica slug)
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
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Autenticación requerida'; END IF;
  v_mode := public._assert_convocatoria_mode_allowed(p_mode_type);
  IF p_entity_id IS NULL THEN RAISE EXCEPTION 'entity_id requerido'; END IF;

  v_org := public._open_reg_organizer_id(v_mode, p_entity_id);
  IF v_org IS NULL OR v_org <> v_uid THEN
    RAISE EXCEPTION 'Evento no encontrado o sin permiso';
  END IF;

  v_tournament := CASE WHEN v_mode = 'duelo_2v2' THEN NULL ELSE p_entity_id END;

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
    coalesce(p_capacity, CASE WHEN v_mode = 'duelo_2v2' THEN 4 ELSE 8 END),
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
    capacity = coalesce(p_capacity, tor.capacity),
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

-- Compat: upsert_tournament_open_registration → mode reta por defecto
CREATE OR REPLACE FUNCTION public.upsert_tournament_open_registration(
  p_tournament_id uuid,
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
  p_display_full_name boolean DEFAULT NULL
)
RETURNS public.tournament_open_registration
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mode text := 'reta';
BEGIN
  -- Si el torneo está marcado como americano en config, preferir americano
  IF EXISTS (
    SELECT 1 FROM public.tournament_public_config c
    WHERE c.tournament_id = p_tournament_id
      AND (
        c.format = 'americano'
        OR (c.americano_live IS NOT NULL AND c.americano_live <> 'null'::jsonb)
      )
  ) THEN
    v_mode := 'americano';
  END IF;

  RETURN public.upsert_open_game_registration(
    v_mode, p_tournament_id, p_enabled, p_status, p_capacity, p_waitlist_enabled,
    p_approval_required, p_registration_deadline, p_scheduled_at, p_duration_minutes,
    p_category_label, p_location_label, p_display_rating, p_display_photo,
    p_display_full_name, NULL, NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_tournament_open_registration(
  uuid, boolean, text, integer, boolean, boolean, timestamptz, timestamptz,
  integer, text, text, boolean, boolean, boolean
) TO authenticated;
REVOKE ALL ON FUNCTION public.upsert_tournament_open_registration(
  uuid, boolean, text, integer, boolean, boolean, timestamptz, timestamptz,
  integer, text, text, boolean, boolean, boolean
) FROM anon;

-- DTO público por slug
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

CREATE OR REPLACE FUNCTION public.preview_riviera_id_for_open_registration(
  p_slug text,
  p_riviera_id text
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg public.tournament_open_registration;
  v_norm text;
  v_identity record;
  v_rj public.riviera_jugadores%ROWTYPE;
BEGIN
  SELECT * INTO v_cfg FROM public.tournament_open_registration
  WHERE public_slug = trim(coalesce(p_slug, '')) AND enabled = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  v_norm := public._normalize_riviera_id_loose(p_riviera_id);
  IF v_norm IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_riviera_id');
  END IF;

  SELECT * INTO v_identity FROM public._resolve_identity_by_riviera_id(v_norm);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'riviera_id_not_found', 'riviera_id', v_norm);
  END IF;

  SELECT * INTO v_rj FROM public.riviera_jugadores WHERE id = v_identity.canonical_riviera_jugador_id;

  RETURN jsonb_build_object(
    'ok', true,
    'riviera_id', v_identity.riviera_id,
    'jugador_id', v_identity.canonical_riviera_jugador_id,
    'nombre', v_identity.display_name,
    'foto_url', CASE WHEN v_cfg.display_photo THEN v_rj.foto_url ELSE NULL END,
    'rating', CASE WHEN v_cfg.display_rating THEN v_rj.rating ELSE NULL END,
    'categoria', v_rj.categoria,
    'club_origen_id', v_identity.registration_organizer_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_riviera_id_for_open_registration(text, text) TO anon, authenticated;

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

CREATE OR REPLACE FUNCTION public.cancel_tournament_open_registration(
  p_slug text,
  p_cancellation_token text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_cfg public.tournament_open_registration;
  v_hash text;
  v_entry public.tournament_open_registration_entries%ROWTYPE;
BEGIN
  SELECT * INTO v_cfg FROM public.tournament_open_registration
  WHERE public_slug = trim(coalesce(p_slug, '')) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF length(trim(coalesce(p_cancellation_token, ''))) < 16 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  v_hash := encode(extensions.digest(trim(p_cancellation_token), 'sha256'), 'hex');

  SELECT * INTO v_entry
  FROM public.tournament_open_registration_entries e
  WHERE e.registration_id = v_cfg.id
    AND e.cancellation_token_hash = v_hash
    AND e.status IN ('confirmed', 'waitlist', 'pending_approval')
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  UPDATE public.tournament_open_registration_entries
  SET status = 'cancelled', cancelled_at = now(), updated_at = now(),
      cancellation_token_hash = NULL
  WHERE id = v_entry.id;

  IF v_entry.status = 'confirmed' THEN
    IF v_cfg.mode_type = 'americano' THEN
      PERFORM public._open_reg_sync_americano_roster(v_cfg.entity_id);
    ELSIF v_cfg.mode_type = 'duelo_2v2' THEN
      PERFORM public._open_reg_sync_duelo_slots(v_cfg.entity_id);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'entry_id', v_entry.id,
    'previous_status', v_entry.status,
    'message', 'Inscripción cancelada.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_tournament_open_registration(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_tournament_open_registration_entries(p_tournament_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Autenticación requerida'; END IF;
  IF public._open_reg_organizer_id('reta', p_tournament_id) <> v_uid
     AND public._open_reg_organizer_id('americano', p_tournament_id) <> v_uid THEN
    RAISE EXCEPTION 'Sin permiso';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', e.id, 'status', e.status, 'riviera_id', e.riviera_id,
      'riviera_jugador_id', e.riviera_jugador_id,
      'nombre', coalesce(e.display_name_snapshot, rj.nombre),
      'foto_url', rj.foto_url, 'categoria', rj.categoria, 'rating', rj.rating,
      'created_at', e.created_at, 'confirmed_at', e.confirmed_at, 'cancelled_at', e.cancelled_at
    ) ORDER BY e.created_at)
    FROM public.tournament_open_registration_entries e
    JOIN public.tournament_open_registration r ON r.id = e.registration_id
    JOIN public.riviera_jugadores rj ON rj.id = e.riviera_jugador_id
    WHERE r.entity_id = p_tournament_id
      AND r.mode_type IN ('reta', 'americano')
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_tournament_open_registration_entries(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.list_tournament_open_registration_entries(uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.list_open_game_registration_entries(
  p_mode_type text,
  p_entity_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_mode text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Autenticación requerida'; END IF;
  v_mode := public._assert_convocatoria_mode_allowed(p_mode_type);
  IF public._open_reg_organizer_id(v_mode, p_entity_id) <> v_uid THEN
    RAISE EXCEPTION 'Sin permiso';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', e.id, 'status', e.status, 'riviera_id', e.riviera_id,
      'riviera_jugador_id', e.riviera_jugador_id,
      'nombre', coalesce(e.display_name_snapshot, rj.nombre),
      'foto_url', rj.foto_url, 'categoria', rj.categoria, 'rating', rj.rating,
      'created_at', e.created_at, 'confirmed_at', e.confirmed_at, 'cancelled_at', e.cancelled_at
    ) ORDER BY e.created_at)
    FROM public.tournament_open_registration_entries e
    JOIN public.tournament_open_registration r ON r.id = e.registration_id
    JOIN public.riviera_jugadores rj ON rj.id = e.riviera_jugador_id
    WHERE r.mode_type = v_mode AND r.entity_id = p_entity_id
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_open_game_registration_entries(text, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.list_open_game_registration_entries(text, uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.promote_tournament_open_registration_entry(p_entry_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_entry public.tournament_open_registration_entries%ROWTYPE;
  v_cfg public.tournament_open_registration;
  v_confirmed int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Autenticación requerida'; END IF;

  SELECT * INTO v_entry FROM public.tournament_open_registration_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;

  SELECT * INTO v_cfg FROM public.tournament_open_registration WHERE id = v_entry.registration_id FOR UPDATE;
  IF public._open_reg_organizer_id(v_cfg.mode_type, v_cfg.entity_id) <> v_uid THEN
    RAISE EXCEPTION 'Sin permiso';
  END IF;

  IF v_entry.status NOT IN ('waitlist', 'pending_approval') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  SELECT count(*)::int INTO v_confirmed
  FROM public.tournament_open_registration_entries
  WHERE registration_id = v_cfg.id AND status = 'confirmed';

  IF v_confirmed >= v_cfg.capacity THEN
    RETURN jsonb_build_object('ok', false, 'error', 'full');
  END IF;

  UPDATE public.tournament_open_registration_entries
  SET status = 'confirmed', confirmed_at = now(), updated_at = now()
  WHERE id = v_entry.id;

  IF v_cfg.mode_type = 'americano' THEN
    PERFORM public._open_reg_sync_americano_roster(v_cfg.entity_id);
  ELSIF v_cfg.mode_type = 'duelo_2v2' THEN
    PERFORM public._open_reg_sync_duelo_slots(v_cfg.entity_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'entry_id', v_entry.id, 'status', 'confirmed');
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_tournament_open_registration_entry(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.promote_tournament_open_registration_entry(uuid) FROM anon;

-- Cierra convocatoria al iniciar el juego (idempotente)
CREATE OR REPLACE FUNCTION public.close_open_game_registration(
  p_mode_type text,
  p_entity_id uuid
)
RETURNS public.tournament_open_registration
LANGUAGE plpgsql
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

  v_org := public._open_reg_organizer_id(v_mode, p_entity_id);
  IF v_org IS NULL OR v_org <> v_uid THEN
    RAISE EXCEPTION 'Evento no encontrado o sin permiso';
  END IF;

  UPDATE public.tournament_open_registration
  SET status = 'closed',
      enabled = true,
      updated_at = now()
  WHERE mode_type = v_mode AND entity_id = p_entity_id
  RETURNING * INTO v_row;

  RETURN v_row; -- NULL si no había convocatoria (ok)
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_open_game_registration(text, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.close_open_game_registration(text, uuid) FROM anon;

NOTIFY pgrst, 'reload schema';
