-- ══════════════════════════════════════════════════════════════════════════════
-- Reta Abierta / Riviera Match — autoinscripción pública por Riviera ID
--
-- Fuente de verdad de convocatoria: tournament_open_registration(+_entries).
-- Integración con pool del club: membership (joined_via = 'registration') cuando
-- el jugador no es del organizador anfitrión; el organizador sigue formando pairs.
--
-- NO crea participaciones deportivas, puntos ni rating al inscribirse.
-- Riesgo MVP: inscripción solo con Riviera ID (sin OTP) — documentado en producto.
--
-- Idempotente. Ejecutar en Supabase SQL Editor (staging → prod).
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Config 1:1 por torneo/reta ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tournament_open_registration (
  tournament_id uuid PRIMARY KEY
    REFERENCES public.tournaments(id) ON DELETE CASCADE,
  public_slug text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'paused', 'closed', 'cancelled')),
  capacity integer NOT NULL DEFAULT 4
    CHECK (capacity > 0 AND capacity <= 64),
  waitlist_enabled boolean NOT NULL DEFAULT true,
  approval_required boolean NOT NULL DEFAULT false,
  registration_deadline timestamptz NULL,
  -- Metadatos de convocatoria (la tabla tournaments no tiene fecha/hora)
  scheduled_at timestamptz NULL,
  duration_minutes integer NULL CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  category_label text NULL,
  location_label text NULL,
  display_rating boolean NOT NULL DEFAULT true,
  display_photo boolean NOT NULL DEFAULT true,
  display_full_name boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tournament_open_registration_slug_unique UNIQUE (public_slug)
);

CREATE INDEX IF NOT EXISTS idx_tor_open_reg_enabled_status
  ON public.tournament_open_registration (enabled, status)
  WHERE enabled = true;

COMMENT ON TABLE public.tournament_open_registration IS
  'Reta Abierta: config de autoinscripción pública por Riviera ID (1:1 con tournaments).';

-- ── Entradas de inscripción ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tournament_open_registration_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL
    REFERENCES public.tournaments(id) ON DELETE CASCADE,
  riviera_jugador_id uuid NOT NULL
    REFERENCES public.riviera_jugadores(id) ON DELETE RESTRICT,
  official_player_key uuid NULL,
  riviera_id text NOT NULL,
  status text NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'waitlist', 'cancelled', 'removed', 'pending_approval')),
  source text NOT NULL DEFAULT 'public_riviera_id'
    CHECK (source IN ('public_riviera_id', 'organizer')),
  cancellation_token_hash text NULL,
  display_name_snapshot text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz NULL,
  cancelled_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Una inscripción activa (no cancelada/removed) por jugador y reta
CREATE UNIQUE INDEX IF NOT EXISTS uq_tor_open_reg_active_player
  ON public.tournament_open_registration_entries (tournament_id, riviera_jugador_id)
  WHERE status IN ('confirmed', 'waitlist', 'pending_approval');

CREATE INDEX IF NOT EXISTS idx_tor_open_reg_entries_tournament_status
  ON public.tournament_open_registration_entries (tournament_id, status);

CREATE INDEX IF NOT EXISTS idx_tor_open_reg_entries_riviera_id
  ON public.tournament_open_registration_entries (riviera_id);

COMMENT ON TABLE public.tournament_open_registration_entries IS
  'Reta Abierta: inscripciones públicas. confirmed/waitlist = activas; cancelled/removed conservan auditoría.';

-- Realtime
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_open_registration;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_open_registration_entries;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.tournament_open_registration ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_open_registration_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tor_open_reg_select_owner ON public.tournament_open_registration;
CREATE POLICY tor_open_reg_select_owner
  ON public.tournament_open_registration FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_id AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tor_open_reg_write_owner ON public.tournament_open_registration;
CREATE POLICY tor_open_reg_write_owner
  ON public.tournament_open_registration FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_id AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_id AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tor_open_reg_entries_select_owner ON public.tournament_open_registration_entries;
CREATE POLICY tor_open_reg_entries_select_owner
  ON public.tournament_open_registration_entries FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_id AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tor_open_reg_entries_write_owner ON public.tournament_open_registration_entries;
CREATE POLICY tor_open_reg_entries_write_owner
  ON public.tournament_open_registration_entries FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_id AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_id AND t.user_id = auth.uid()
    )
  );

-- Anon: sin SELECT directo; solo vía RPC SECURITY DEFINER.

REVOKE ALL ON TABLE public.tournament_open_registration FROM anon;
REVOKE ALL ON TABLE public.tournament_open_registration_entries FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tournament_open_registration TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tournament_open_registration_entries TO authenticated;

-- ── Helpers ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._normalize_riviera_id_loose(p_input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text;
BEGIN
  v := upper(trim(coalesce(p_input, '')));
  v := regexp_replace(v, '[[:space:]]+', '', 'g');
  IF v ~ '^RIV[0-9]{8}$' THEN
    v := 'RIV-' || substr(v, 4);
  ELSIF v ~ '^[0-9]{8}$' THEN
    v := 'RIV-' || v;
  END IF;
  IF v !~ '^RIV-[0-9]{8}$' THEN
    RETURN NULL;
  END IF;
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public._normalize_riviera_id_loose(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._normalize_riviera_id_loose(text) FROM anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public._tor_open_reg_slug()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public, extensions
AS $$
  SELECT 'ra-' || encode(extensions.gen_random_bytes(5), 'hex');
$$;

-- Clon local para un grantee concreto (anon join no tiene auth.uid()).
CREATE OR REPLACE FUNCTION public._ensure_granted_player_local_as(
  p_source_jugador_id uuid,
  p_grantee uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access public.organizer_player_access%ROWTYPE;
  v_source public.riviera_jugadores%ROWTYPE;
  v_local_id uuid;
  v_nombre text;
  v_categoria text;
  v_slug text;
BEGIN
  IF p_grantee IS NULL OR p_source_jugador_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO v_access
  FROM public.organizer_player_access opa
  WHERE opa.jugador_id = p_source_jugador_id
    AND opa.grantee_organizer_id = p_grantee
    AND opa.is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_access.local_jugador_id IS NOT NULL THEN
    RETURN v_access.local_jugador_id;
  END IF;

  SELECT * INTO v_source
  FROM public.riviera_jugadores rj
  WHERE rj.id = p_source_jugador_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_nombre := coalesce(nullif(trim(v_access.local_display_name), ''), v_source.nombre);
  v_categoria := coalesce(nullif(trim(v_access.local_category), ''), v_source.categoria::text);

  v_slug := public._ensure_unique_jugador_slug(
    p_grantee,
    public._slugify_jugador_nombre(v_nombre),
    coalesce(v_source.genero, 'M')
  );

  INSERT INTO public.riviera_jugadores (
    nombre, slug, email, telefono, whatsapp, nivel, categoria, edad,
    mano_dominante, en_cancha, pais_codigo, genero, club, foto_url,
    instagram_url, facebook_url, tiktok_url, visible_publico, suma_ranking,
    organizador_id, estado, legacy_player_id, rating, rating_partidos, rating_fiabilidad
  )
  VALUES (
    v_nombre, v_slug, v_source.email, v_source.telefono, v_source.whatsapp,
    v_source.nivel, v_categoria, v_source.edad, v_source.mano_dominante,
    v_source.en_cancha, v_source.pais_codigo, v_source.genero, v_source.club,
    v_source.foto_url, v_source.instagram_url, v_source.facebook_url,
    v_source.tiktok_url, false, true, p_grantee, 'activo',
    v_source.legacy_player_id,
    COALESCE(v_source.rating, 3),
    COALESCE(v_source.rating_partidos, 0),
    COALESCE(v_source.rating_fiabilidad, 0.2)
  )
  RETURNING id INTO v_local_id;

  BEGIN
    PERFORM public._create_empty_jugador_stats(v_local_id);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  UPDATE public.organizer_player_access
  SET local_jugador_id = v_local_id, updated_at = now()
  WHERE id = v_access.id;

  RETURN v_local_id;
END;
$$;

REVOKE ALL ON FUNCTION public._ensure_granted_player_local_as(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._ensure_granted_player_local_as(uuid, uuid) FROM anon, authenticated;

-- ── Upsert config (organizador) ─────────────────────────────────────────────

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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.tournament_open_registration;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id = p_tournament_id AND t.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Torneo no encontrado o sin permiso';
  END IF;

  INSERT INTO public.tournament_open_registration AS tor (
    tournament_id,
    public_slug,
    enabled,
    status,
    capacity,
    waitlist_enabled,
    approval_required,
    registration_deadline,
    scheduled_at,
    duration_minutes,
    category_label,
    location_label,
    display_rating,
    display_photo,
    display_full_name
  )
  VALUES (
    p_tournament_id,
    public._tor_open_reg_slug(),
    coalesce(p_enabled, false),
    coalesce(p_status, 'open'),
    coalesce(p_capacity, 4),
    coalesce(p_waitlist_enabled, true),
    coalesce(p_approval_required, false),
    p_registration_deadline,
    p_scheduled_at,
    p_duration_minutes,
    nullif(trim(coalesce(p_category_label, '')), ''),
    nullif(trim(coalesce(p_location_label, '')), ''),
    coalesce(p_display_rating, true),
    coalesce(p_display_photo, true),
    coalesce(p_display_full_name, true)
  )
  ON CONFLICT (tournament_id) DO UPDATE SET
    enabled = coalesce(p_enabled, tor.enabled),
    status = coalesce(p_status, tor.status),
    capacity = coalesce(p_capacity, tor.capacity),
    waitlist_enabled = coalesce(p_waitlist_enabled, tor.waitlist_enabled),
    approval_required = coalesce(p_approval_required, tor.approval_required),
    registration_deadline = CASE
      WHEN p_registration_deadline IS DISTINCT FROM NULL THEN p_registration_deadline
      ELSE tor.registration_deadline
    END,
    scheduled_at = CASE
      WHEN p_scheduled_at IS DISTINCT FROM NULL THEN p_scheduled_at
      ELSE tor.scheduled_at
    END,
    duration_minutes = coalesce(p_duration_minutes, tor.duration_minutes),
    category_label = coalesce(nullif(trim(coalesce(p_category_label, '')), ''), tor.category_label),
    location_label = coalesce(nullif(trim(coalesce(p_location_label, '')), ''), tor.location_label),
    display_rating = coalesce(p_display_rating, tor.display_rating),
    display_photo = coalesce(p_display_photo, tor.display_photo),
    display_full_name = coalesce(p_display_full_name, tor.display_full_name),
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
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

-- ── DTO público ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_tournament_open_registration_public(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg public.tournament_open_registration;
  v_t public.tournaments;
  v_confirmed int;
  v_waitlist int;
  v_entries jsonb;
BEGIN
  SELECT * INTO v_cfg
  FROM public.tournament_open_registration
  WHERE public_slug = trim(coalesce(p_slug, ''))
    AND enabled = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT * INTO v_t FROM public.tournaments WHERE id = v_cfg.tournament_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT count(*)::int INTO v_confirmed
  FROM public.tournament_open_registration_entries e
  WHERE e.tournament_id = v_cfg.tournament_id AND e.status = 'confirmed';

  SELECT count(*)::int INTO v_waitlist
  FROM public.tournament_open_registration_entries e
  WHERE e.tournament_id = v_cfg.tournament_id AND e.status = 'waitlist';

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
        'categoria', rj.categoria
      ) AS obj,
      coalesce(e.confirmed_at, e.created_at) AS sort_ts
    FROM public.tournament_open_registration_entries e
    JOIN public.riviera_jugadores rj ON rj.id = e.riviera_jugador_id
    WHERE e.tournament_id = v_cfg.tournament_id
      AND e.status IN ('confirmed', 'waitlist')
  ) x;

  RETURN jsonb_build_object(
    'ok', true,
    'slug', v_cfg.public_slug,
    'tournament_id', v_cfg.tournament_id,
    'organizador_id', v_t.user_id,
    'name', v_t.name,
    'description', v_t.description,
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
    'location_label', v_cfg.location_label,
    'display_rating', v_cfg.display_rating,
    'display_photo', v_cfg.display_photo,
    'entries', v_entries,
    'is_finished', coalesce(v_t.is_finished, false),
    'is_started', coalesce(v_t.is_started, false)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tournament_open_registration_public(text) TO anon, authenticated;

-- ── Preview Riviera ID (mínimo, sin contacto) ───────────────────────────────

CREATE OR REPLACE FUNCTION public.preview_riviera_id_for_open_registration(
  p_slug text,
  p_riviera_id text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg public.tournament_open_registration;
  v_norm text;
  v_identity record;
  v_rj public.riviera_jugadores%ROWTYPE;
BEGIN
  SELECT * INTO v_cfg
  FROM public.tournament_open_registration
  WHERE public_slug = trim(coalesce(p_slug, ''))
    AND enabled = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  v_norm := public._normalize_riviera_id_loose(p_riviera_id);
  IF v_norm IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_riviera_id');
  END IF;

  SELECT * INTO v_identity
  FROM public._resolve_identity_by_riviera_id(v_norm);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'riviera_id_not_found', 'riviera_id', v_norm);
  END IF;

  SELECT * INTO v_rj
  FROM public.riviera_jugadores
  WHERE id = v_identity.canonical_riviera_jugador_id;

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

-- ── Join atómico ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.join_tournament_open_registration(
  p_slug text,
  p_riviera_id text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_cfg public.tournament_open_registration;
  v_t public.tournaments;
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
BEGIN
  SELECT * INTO v_cfg
  FROM public.tournament_open_registration
  WHERE public_slug = trim(coalesce(p_slug, ''))
  FOR UPDATE;

  IF NOT FOUND OR v_cfg.enabled IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_cfg.status IN ('closed', 'cancelled', 'paused') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'registration_' || v_cfg.status);
  END IF;

  IF v_cfg.registration_deadline IS NOT NULL AND now() > v_cfg.registration_deadline THEN
    RETURN jsonb_build_object('ok', false, 'error', 'deadline_passed');
  END IF;

  SELECT * INTO v_t FROM public.tournaments WHERE id = v_cfg.tournament_id FOR UPDATE;
  IF NOT FOUND OR coalesce(v_t.is_finished, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tournament_unavailable');
  END IF;

  v_host := v_t.user_id;

  v_norm := public._normalize_riviera_id_loose(p_riviera_id);
  IF v_norm IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_riviera_id');
  END IF;

  SELECT * INTO v_identity
  FROM public._resolve_identity_by_riviera_id(v_norm);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'riviera_id_not_found', 'riviera_id', v_norm);
  END IF;

  PERFORM pg_advisory_xact_lock(
    250715,
    hashtext(v_cfg.tournament_id::text || ':' || v_identity.canonical_riviera_jugador_id::text)
  );

  SELECT * INTO v_existing
  FROM public.tournament_open_registration_entries e
  WHERE e.tournament_id = v_cfg.tournament_id
    AND e.riviera_jugador_id = v_identity.canonical_riviera_jugador_id
    AND e.status IN ('confirmed', 'waitlist', 'pending_approval')
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'already_registered',
      'status', v_existing.status,
      'entry_id', v_existing.id
    );
  END IF;

  SELECT count(*)::int INTO v_confirmed
  FROM public.tournament_open_registration_entries e
  WHERE e.tournament_id = v_cfg.tournament_id AND e.status = 'confirmed';

  IF v_cfg.approval_required THEN
    v_status := 'pending_approval';
  ELSIF v_confirmed < v_cfg.capacity THEN
    v_status := 'confirmed';
  ELSIF v_cfg.waitlist_enabled THEN
    v_status := 'waitlist';
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'full');
  END IF;

  -- Membresía en pool del club anfitrión (sin auth del organizador).
  -- Si el jugador ya es del host, no hace falta grant.
  v_owner := v_identity.registration_organizer_id;
  IF v_owner IS NOT NULL AND v_owner <> v_host THEN
    PERFORM pg_advisory_xact_lock(
      212012,
      hashtext(v_host::text || ':' || v_identity.canonical_riviera_jugador_id::text)
    );

    INSERT INTO public.organizer_player_access (
      jugador_id,
      owner_organizador_id,
      grantee_organizer_id,
      access_type,
      granted_by_admin_id,
      is_active,
      is_public_ranking,
      joined_at,
      joined_via
    )
    VALUES (
      v_identity.canonical_riviera_jugador_id,
      v_owner,
      v_host,
      'granted_by_admin',
      NULL,
      true,
      false,
      now(),
      'registration'
    )
    ON CONFLICT (grantee_organizer_id, jugador_id) DO UPDATE SET
      is_active = true,
      left_at = NULL,
      joined_at = coalesce(public.organizer_player_access.joined_at, now()),
      joined_via = coalesce(public.organizer_player_access.joined_via, 'registration'),
      updated_at = now()
    RETURNING id INTO v_access_id;

    v_local_id := public._ensure_granted_player_local_as(
      v_identity.canonical_riviera_jugador_id,
      v_host
    );
  END IF;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.tournament_open_registration_entries (
    tournament_id,
    riviera_jugador_id,
    official_player_key,
    riviera_id,
    status,
    source,
    cancellation_token_hash,
    display_name_snapshot,
    confirmed_at
  )
  VALUES (
    v_cfg.tournament_id,
    v_identity.canonical_riviera_jugador_id,
    v_identity.official_player_key,
    v_identity.riviera_id,
    v_status,
    'public_riviera_id',
    v_token_hash,
    v_identity.display_name,
    CASE WHEN v_status = 'confirmed' THEN now() ELSE NULL END
  )
  RETURNING id INTO v_entry_id;

  RETURN jsonb_build_object(
    'ok', true,
    'entry_id', v_entry_id,
    'status', v_status,
    'riviera_id', v_identity.riviera_id,
    'nombre', v_identity.display_name,
    'cancellation_token', v_token,
    'message', CASE v_status
      WHEN 'confirmed' THEN 'Asistencia confirmada. Ya estás dentro de la reta.'
      WHEN 'waitlist' THEN 'Cupo lleno. Quedaste en lista de espera.'
      WHEN 'pending_approval' THEN 'Solicitud enviada. El club debe aprobarte.'
      ELSE 'Registrado.'
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_tournament_open_registration(text, text) TO anon, authenticated;

-- ── Cancelación por token ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cancel_tournament_open_registration(
  p_slug text,
  p_cancellation_token text
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
BEGIN
  SELECT * INTO v_cfg
  FROM public.tournament_open_registration
  WHERE public_slug = trim(coalesce(p_slug, ''))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF length(trim(coalesce(p_cancellation_token, ''))) < 16 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  v_hash := encode(extensions.digest(trim(p_cancellation_token), 'sha256'), 'hex');

  SELECT * INTO v_entry
  FROM public.tournament_open_registration_entries e
  WHERE e.tournament_id = v_cfg.tournament_id
    AND e.cancellation_token_hash = v_hash
    AND e.status IN ('confirmed', 'waitlist', 'pending_approval')
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  UPDATE public.tournament_open_registration_entries
  SET
    status = 'cancelled',
    cancelled_at = now(),
    updated_at = now(),
    cancellation_token_hash = NULL
  WHERE id = v_entry.id;

  RETURN jsonb_build_object(
    'ok', true,
    'entry_id', v_entry.id,
    'previous_status', v_entry.status,
    'message', 'Inscripción cancelada.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_tournament_open_registration(text, text) TO anon, authenticated;

-- Organizer: list entries
CREATE OR REPLACE FUNCTION public.list_tournament_open_registration_entries(p_tournament_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id = p_tournament_id AND t.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Sin permiso';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', e.id,
      'status', e.status,
      'riviera_id', e.riviera_id,
      'riviera_jugador_id', e.riviera_jugador_id,
      'nombre', coalesce(e.display_name_snapshot, rj.nombre),
      'foto_url', rj.foto_url,
      'categoria', rj.categoria,
      'rating', rj.rating,
      'created_at', e.created_at,
      'confirmed_at', e.confirmed_at,
      'cancelled_at', e.cancelled_at
    ) ORDER BY e.created_at)
    FROM public.tournament_open_registration_entries e
    JOIN public.riviera_jugadores rj ON rj.id = e.riviera_jugador_id
    WHERE e.tournament_id = p_tournament_id
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_tournament_open_registration_entries(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.list_tournament_open_registration_entries(uuid) FROM anon;

-- Promote waitlist → confirmed (manual)
CREATE OR REPLACE FUNCTION public.promote_tournament_open_registration_entry(p_entry_id uuid)
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
  v_confirmed int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida';
  END IF;

  SELECT * INTO v_entry
  FROM public.tournament_open_registration_entries
  WHERE id = p_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id = v_entry.tournament_id AND t.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Sin permiso';
  END IF;

  SELECT * INTO v_cfg
  FROM public.tournament_open_registration
  WHERE tournament_id = v_entry.tournament_id
  FOR UPDATE;

  IF v_entry.status NOT IN ('waitlist', 'pending_approval') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  SELECT count(*)::int INTO v_confirmed
  FROM public.tournament_open_registration_entries
  WHERE tournament_id = v_entry.tournament_id AND status = 'confirmed';

  IF v_confirmed >= v_cfg.capacity THEN
    RETURN jsonb_build_object('ok', false, 'error', 'full');
  END IF;

  UPDATE public.tournament_open_registration_entries
  SET status = 'confirmed', confirmed_at = now(), updated_at = now()
  WHERE id = v_entry.id;

  RETURN jsonb_build_object('ok', true, 'entry_id', v_entry.id, 'status', 'confirmed');
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_tournament_open_registration_entry(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.promote_tournament_open_registration_entry(uuid) FROM anon;

NOTIFY pgrst, 'reload schema';
