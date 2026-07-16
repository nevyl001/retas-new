-- ══════════════════════════════════════════════════════════════════════════════
-- Convocatoria Riviera — generalización multi-modo (Reta / Americano / Duelo 2v2)
--
-- Evoluciona tournament_open_registration sin romper slugs ni datos existentes.
-- Modos: reta | americano | duelo_2v2
-- Excluidos: liga, torneo express, torneos formales.
--
-- Prerrequisito recomendado: supabase/reta-abierta-open-registration.sql
-- Idempotente. NO ejecutar en producción desde el agente; staging manual.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ── Base tables (si aún no existen) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tournament_open_registration (
  tournament_id uuid REFERENCES public.tournaments(id) ON DELETE CASCADE,
  public_slug text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'open',
  capacity integer NOT NULL DEFAULT 4
    CHECK (capacity > 0 AND capacity <= 64),
  waitlist_enabled boolean NOT NULL DEFAULT true,
  approval_required boolean NOT NULL DEFAULT false,
  registration_deadline timestamptz NULL,
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

CREATE TABLE IF NOT EXISTS public.tournament_open_registration_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid REFERENCES public.tournaments(id) ON DELETE CASCADE,
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

-- ── Evolución de columnas ───────────────────────────────────────────────────

ALTER TABLE public.tournament_open_registration
  ADD COLUMN IF NOT EXISTS id uuid,
  ADD COLUMN IF NOT EXISTS mode_type text,
  ADD COLUMN IF NOT EXISTS entity_id uuid,
  ADD COLUMN IF NOT EXISTS title_public text,
  ADD COLUMN IF NOT EXISTS rama_label text;

UPDATE public.tournament_open_registration
SET
  id = coalesce(id, gen_random_uuid()),
  mode_type = coalesce(nullif(mode_type, ''), 'reta'),
  entity_id = coalesce(entity_id, tournament_id)
WHERE id IS NULL OR entity_id IS NULL OR mode_type IS NULL;

ALTER TABLE public.tournament_open_registration
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN id SET NOT NULL,
  ALTER COLUMN mode_type SET DEFAULT 'reta',
  ALTER COLUMN mode_type SET NOT NULL;

-- status: permitir draft (recrear check)
DO $$
BEGIN
  ALTER TABLE public.tournament_open_registration
    DROP CONSTRAINT IF EXISTS tournament_open_registration_status_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.tournament_open_registration
  DROP CONSTRAINT IF EXISTS tournament_open_registration_status_check;

ALTER TABLE public.tournament_open_registration
  ADD CONSTRAINT tournament_open_registration_status_check
  CHECK (status IN ('draft', 'open', 'paused', 'closed', 'cancelled'));

DO $$
BEGIN
  ALTER TABLE public.tournament_open_registration
    DROP CONSTRAINT IF EXISTS tournament_open_registration_mode_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.tournament_open_registration
  ADD CONSTRAINT tournament_open_registration_mode_check
  CHECK (mode_type IN ('reta', 'americano', 'duelo_2v2'));

-- PK: pasar de tournament_id → id
DO $$
DECLARE
  pk_name text;
BEGIN
  SELECT c.conname INTO pk_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'tournament_open_registration'
    AND c.contype = 'p'
  LIMIT 1;

  IF pk_name IS NOT NULL AND pk_name <> 'tournament_open_registration_pkey_id' THEN
    EXECUTE format('ALTER TABLE public.tournament_open_registration DROP CONSTRAINT %I', pk_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tournament_open_registration_pkey_id'
  ) THEN
    ALTER TABLE public.tournament_open_registration
      ADD CONSTRAINT tournament_open_registration_pkey_id PRIMARY KEY (id);
  END IF;
END $$;

-- tournament_id deja de ser PK obligatorio (duelo no tiene tournament)
ALTER TABLE public.tournament_open_registration
  ALTER COLUMN tournament_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tor_open_reg_mode_entity
  ON public.tournament_open_registration (mode_type, entity_id);

-- Entries: registration_id
ALTER TABLE public.tournament_open_registration_entries
  ADD COLUMN IF NOT EXISTS registration_id uuid;

UPDATE public.tournament_open_registration_entries e
SET registration_id = r.id
FROM public.tournament_open_registration r
WHERE e.registration_id IS NULL
  AND e.tournament_id IS NOT NULL
  AND r.tournament_id = e.tournament_id;

UPDATE public.tournament_open_registration_entries e
SET registration_id = r.id
FROM public.tournament_open_registration r
WHERE e.registration_id IS NULL
  AND r.entity_id = e.tournament_id;

ALTER TABLE public.tournament_open_registration_entries
  ALTER COLUMN tournament_id DROP NOT NULL;

DO $$
BEGIN
  ALTER TABLE public.tournament_open_registration_entries
    DROP CONSTRAINT IF EXISTS tournament_open_registration_entries_registration_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.tournament_open_registration_entries
  DROP CONSTRAINT IF EXISTS tournament_open_registration_entries_registration_id_fkey;

ALTER TABLE public.tournament_open_registration_entries
  ADD CONSTRAINT tournament_open_registration_entries_registration_id_fkey
  FOREIGN KEY (registration_id)
  REFERENCES public.tournament_open_registration(id)
  ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tor_open_reg_active_player_reg
  ON public.tournament_open_registration_entries (registration_id, riviera_jugador_id)
  WHERE status IN ('confirmed', 'waitlist', 'pending_approval');

CREATE INDEX IF NOT EXISTS idx_tor_open_reg_entries_registration_status
  ON public.tournament_open_registration_entries (registration_id, status);

-- Duelo: permitir slots vacíos para convocatoria abierta
ALTER TABLE public.duelos_2v2
  ALTER COLUMN pareja_a_j1_nombre DROP NOT NULL,
  ALTER COLUMN pareja_a_j2_nombre DROP NOT NULL,
  ALTER COLUMN pareja_b_j1_nombre DROP NOT NULL,
  ALTER COLUMN pareja_b_j2_nombre DROP NOT NULL;

ALTER TABLE public.duelos_2v2
  ALTER COLUMN pareja_a_j1_nombre SET DEFAULT '',
  ALTER COLUMN pareja_a_j2_nombre SET DEFAULT '',
  ALTER COLUMN pareja_b_j1_nombre SET DEFAULT '',
  ALTER COLUMN pareja_b_j2_nombre SET DEFAULT '';

COMMENT ON TABLE public.tournament_open_registration IS
  'Convocatoria Riviera (WhatsApp): config pública multi-modo (reta/americano/duelo_2v2).';

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_open_registration;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_open_registration_entries;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.tournament_open_registration ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_open_registration_entries ENABLE ROW LEVEL SECURITY;

-- ── Helpers ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._normalize_riviera_id_loose(p_input text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v text;
BEGIN
  v := upper(trim(coalesce(p_input, '')));
  v := regexp_replace(v, '[[:space:]]+', '', 'g');
  IF v ~ '^RIV[0-9]{8}$' THEN v := 'RIV-' || substr(v, 4);
  ELSIF v ~ '^[0-9]{8}$' THEN v := 'RIV-' || v;
  END IF;
  IF v !~ '^RIV-[0-9]{8}$' THEN RETURN NULL; END IF;
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public._normalize_riviera_id_loose(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._normalize_riviera_id_loose(text) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public._tor_open_reg_slug()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public, extensions
AS $$
  SELECT 'ra-' || encode(extensions.gen_random_bytes(5), 'hex');
$$;

CREATE OR REPLACE FUNCTION public._open_reg_organizer_id(p_mode text, p_entity uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid;
BEGIN
  IF p_mode = 'duelo_2v2' THEN
    SELECT organizador_id INTO v FROM public.duelos_2v2 WHERE id = p_entity;
  ELSE
    SELECT user_id INTO v FROM public.tournaments WHERE id = p_entity;
  END IF;
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public._open_reg_organizer_id(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._open_reg_organizer_id(text, uuid) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public._open_reg_entity_title(p_mode text, p_entity uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v text;
BEGIN
  IF p_mode = 'duelo_2v2' THEN
    SELECT nombre INTO v FROM public.duelos_2v2 WHERE id = p_entity;
  ELSE
    SELECT name INTO v FROM public.tournaments WHERE id = p_entity;
  END IF;
  RETURN coalesce(v, 'Convocatoria');
END;
$$;

REVOKE ALL ON FUNCTION public._open_reg_entity_title(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._open_reg_entity_title(text, uuid) FROM anon, authenticated;

-- Clon local sin auth.uid (reutilizado)
CREATE OR REPLACE FUNCTION public._ensure_granted_player_local_as(
  p_source_jugador_id uuid,
  p_grantee uuid
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_access public.organizer_player_access%ROWTYPE;
  v_source public.riviera_jugadores%ROWTYPE;
  v_local_id uuid;
  v_nombre text;
  v_categoria text;
  v_slug text;
BEGIN
  IF p_grantee IS NULL OR p_source_jugador_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_access FROM public.organizer_player_access opa
  WHERE opa.jugador_id = p_source_jugador_id
    AND opa.grantee_organizer_id = p_grantee AND opa.is_active = true LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_access.local_jugador_id IS NOT NULL THEN RETURN v_access.local_jugador_id; END IF;

  SELECT * INTO v_source FROM public.riviera_jugadores WHERE id = p_source_jugador_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_nombre := coalesce(nullif(trim(v_access.local_display_name), ''), v_source.nombre);
  v_categoria := coalesce(nullif(trim(v_access.local_category), ''), v_source.categoria::text);
  v_slug := public._ensure_unique_jugador_slug(
    p_grantee, public._slugify_jugador_nombre(v_nombre), coalesce(v_source.genero, 'M')
  );

  INSERT INTO public.riviera_jugadores (
    nombre, slug, email, telefono, whatsapp, nivel, categoria, edad,
    mano_dominante, en_cancha, pais_codigo, genero, club, foto_url,
    instagram_url, facebook_url, tiktok_url, visible_publico, suma_ranking,
    organizador_id, estado, legacy_player_id, rating, rating_partidos, rating_fiabilidad
  ) VALUES (
    v_nombre, v_slug, v_source.email, v_source.telefono, v_source.whatsapp,
    v_source.nivel, v_categoria, v_source.edad, v_source.mano_dominante,
    v_source.en_cancha, v_source.pais_codigo, v_source.genero, v_source.club,
    v_source.foto_url, v_source.instagram_url, v_source.facebook_url,
    v_source.tiktok_url, false, true, p_grantee, 'activo',
    v_source.legacy_player_id,
    COALESCE(v_source.rating, 3), COALESCE(v_source.rating_partidos, 0),
    COALESCE(v_source.rating_fiabilidad, 0.2)
  ) RETURNING id INTO v_local_id;

  BEGIN PERFORM public._create_empty_jugador_stats(v_local_id); EXCEPTION WHEN OTHERS THEN NULL; END;

  UPDATE public.organizer_player_access
  SET local_jugador_id = v_local_id, updated_at = now() WHERE id = v_access.id;

  RETURN v_local_id;
END;
$$;

REVOKE ALL ON FUNCTION public._ensure_granted_player_local_as(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._ensure_granted_player_local_as(uuid, uuid) FROM anon, authenticated;

-- Sync Americano roster (sin iniciar rondas / sin career)
CREATE OR REPLACE FUNCTION public._open_reg_sync_americano_roster(p_tournament_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_live jsonb;
  v_phase text;
  v_roster jsonb := '[]'::jsonb;
  v_ranking jsonb := '[]'::jsonb;
  r record;
  v_pid text;
BEGIN
  SELECT americano_live INTO v_live
  FROM public.tournament_public_config WHERE tournament_id = p_tournament_id;

  v_phase := coalesce(v_live->>'tournamentPhase', 'registration');
  IF v_phase IN ('playing', 'finished') THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT e.display_name_snapshot, e.riviera_jugador_id, rj.nombre, rj.legacy_player_id,
           opa.local_jugador_id
    FROM public.tournament_open_registration_entries e
    JOIN public.tournament_open_registration cfg ON cfg.id = e.registration_id
    JOIN public.riviera_jugadores rj ON rj.id = e.riviera_jugador_id
    LEFT JOIN public.organizer_player_access opa
      ON opa.jugador_id = e.riviera_jugador_id
     AND opa.grantee_organizer_id = (SELECT user_id FROM public.tournaments WHERE id = p_tournament_id)
     AND opa.is_active = true
    WHERE cfg.entity_id = p_tournament_id
      AND cfg.mode_type = 'americano'
      AND e.status = 'confirmed'
    ORDER BY coalesce(e.confirmed_at, e.created_at)
  LOOP
    v_pid := coalesce(
      nullif(r.legacy_player_id::text, ''),
      nullif(r.local_jugador_id::text, ''),
      r.riviera_jugador_id::text
    );
    v_roster := v_roster || jsonb_build_array(jsonb_build_object(
      'id', v_pid,
      'name', coalesce(nullif(trim(r.display_name_snapshot), ''), r.nombre)
    ));
    v_ranking := v_ranking || jsonb_build_array(jsonb_build_object(
      'id', v_pid,
      'name', coalesce(nullif(trim(r.display_name_snapshot), ''), r.nombre),
      'stats', jsonb_build_object(
        'pointsFor', 0, 'pointsAgainst', 0, 'gamesPlayed', 0, 'roundsOnBench', 0
      )
    ));
  END LOOP;

  INSERT INTO public.tournament_public_config AS tpc (tournament_id, format, americano_live)
  VALUES (
    p_tournament_id,
    'americano',
    jsonb_build_object(
      'version', 1,
      'savedAt', to_jsonb(now()::text),
      'tournamentPhase', 'registration',
      'roster', v_roster,
      'ranking', v_ranking,
      'rounds', '[]'::jsonb
    )
  )
  ON CONFLICT (tournament_id) DO UPDATE SET
    americano_live = CASE
      WHEN coalesce(tpc.americano_live->>'tournamentPhase', 'registration') IN ('playing', 'finished')
        THEN tpc.americano_live
      ELSE jsonb_build_object(
        'version', 1,
        'savedAt', to_jsonb(now()::text),
        'tournamentPhase', 'registration',
        'roster', v_roster,
        'ranking', v_ranking,
        'rounds', coalesce(tpc.americano_live->'rounds', '[]'::jsonb)
      )
    END;
EXCEPTION WHEN undefined_column OR undefined_table THEN
  NULL;
END;
$$;

REVOKE ALL ON FUNCTION public._open_reg_sync_americano_roster(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._open_reg_sync_americano_roster(uuid) FROM anon, authenticated;

-- Sync Duelo slots desde confirmados (orden de inscripción)
CREATE OR REPLACE FUNCTION public._open_reg_sync_duelo_slots(p_duelo_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ids uuid[] := ARRAY[]::uuid[];
  names text[] := ARRAY[]::text[];
  r record;
  n int;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.duelos_2v2 d
    WHERE d.id = p_duelo_id AND d.estado IN ('en_juego', 'finalizado')
      AND d.pareja_a_j1_id IS NOT NULL AND d.pareja_a_j2_id IS NOT NULL
      AND d.pareja_b_j1_id IS NOT NULL AND d.pareja_b_j2_id IS NOT NULL
      AND coalesce(d.sets_pareja_a, 0) + coalesce(d.sets_pareja_b, 0) > 0
  ) THEN
    -- Si ya hay marcador, no tocar slots
    RETURN;
  END IF;

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
    ORDER BY coalesce(e.confirmed_at, e.created_at)
    LIMIT 4
  LOOP
    ids := ids || coalesce(r.local_jugador_id, r.riviera_jugador_id);
    names := names || r.nombre;
  END LOOP;

  n := coalesce(array_length(ids, 1), 0);

  UPDATE public.duelos_2v2 SET
    pareja_a_j1_id = CASE WHEN n >= 1 THEN ids[1] ELSE NULL END,
    pareja_a_j1_nombre = CASE WHEN n >= 1 THEN names[1] ELSE '' END,
    pareja_a_j2_id = CASE WHEN n >= 2 THEN ids[2] ELSE NULL END,
    pareja_a_j2_nombre = CASE WHEN n >= 2 THEN names[2] ELSE '' END,
    pareja_b_j1_id = CASE WHEN n >= 3 THEN ids[3] ELSE NULL END,
    pareja_b_j1_nombre = CASE WHEN n >= 3 THEN names[3] ELSE '' END,
    pareja_b_j2_id = CASE WHEN n >= 4 THEN ids[4] ELSE NULL END,
    pareja_b_j2_nombre = CASE WHEN n >= 4 THEN names[4] ELSE '' END,
    estado = CASE WHEN n >= 4 THEN 'configuracion' ELSE 'configuracion' END,
    updated_at = now()
  WHERE id = p_duelo_id;
END;
$$;

REVOKE ALL ON FUNCTION public._open_reg_sync_duelo_slots(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._open_reg_sync_duelo_slots(uuid) FROM anon, authenticated;

-- ── RLS policies (owner por modo) ───────────────────────────────────────────

DROP POLICY IF EXISTS tor_open_reg_select_owner ON public.tournament_open_registration;
CREATE POLICY tor_open_reg_select_owner
  ON public.tournament_open_registration FOR SELECT TO authenticated
  USING (public._open_reg_organizer_id(mode_type, entity_id) = auth.uid());

DROP POLICY IF EXISTS tor_open_reg_write_owner ON public.tournament_open_registration;
CREATE POLICY tor_open_reg_write_owner
  ON public.tournament_open_registration FOR ALL TO authenticated
  USING (public._open_reg_organizer_id(mode_type, entity_id) = auth.uid())
  WITH CHECK (public._open_reg_organizer_id(mode_type, entity_id) = auth.uid());

DROP POLICY IF EXISTS tor_open_reg_entries_select_owner ON public.tournament_open_registration_entries;
CREATE POLICY tor_open_reg_entries_select_owner
  ON public.tournament_open_registration_entries FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tournament_open_registration r
      WHERE r.id = registration_id
        AND public._open_reg_organizer_id(r.mode_type, r.entity_id) = auth.uid()
    )
  );

DROP POLICY IF EXISTS tor_open_reg_entries_write_owner ON public.tournament_open_registration_entries;
CREATE POLICY tor_open_reg_entries_write_owner
  ON public.tournament_open_registration_entries FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tournament_open_registration r
      WHERE r.id = registration_id
        AND public._open_reg_organizer_id(r.mode_type, r.entity_id) = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tournament_open_registration r
      WHERE r.id = registration_id
        AND public._open_reg_organizer_id(r.mode_type, r.entity_id) = auth.uid()
    )
  );

REVOKE ALL ON TABLE public.tournament_open_registration FROM anon;
REVOKE ALL ON TABLE public.tournament_open_registration_entries FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tournament_open_registration TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tournament_open_registration_entries TO authenticated;

NOTIFY pgrst, 'reload schema';
