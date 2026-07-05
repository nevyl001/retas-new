-- ══════════════════════════════════════════════════════════════════════════════
-- SPRINT 2.0.2 — Riviera Platform 2.0 / Riviera ID Engine
-- Secuencia global + helpers internos + RPC ensure_riviera_identity
--
-- Prerrequisitos:
--   riviera-official-multi-club-romc1.sql
--   riviera-career-identity-2.0.1-ddl.sql
--
-- Reutiliza (sin tablas paralelas):
--   riviera_official_player_identity
--   official_player_key
--   canonical_riviera_jugador_id
--   riviera_official_player_profile_link
--
-- La app NO invoca esta RPC hasta sprints posteriores — comportamiento idéntico.
-- Idempotente: sí | Reversible: bloque ROLLBACK al final
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Guard: prerrequisitos ──

DO $$
BEGIN
  IF to_regclass('public.riviera_official_player_identity') IS NULL THEN
    RAISE EXCEPTION 'Prerrequisito: riviera-official-multi-club-romc1.sql';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'riviera_official_player_identity'
      AND column_name = 'riviera_id'
  ) THEN
    RAISE EXCEPTION 'Prerrequisito: riviera-career-identity-2.0.1-ddl.sql';
  END IF;
END $$;

-- ── 1. Secuencia global Riviera ID ──

CREATE SEQUENCE IF NOT EXISTS public.riviera_id_serial_seq
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

COMMENT ON SEQUENCE public.riviera_id_serial_seq IS
  'Secuencia global para Riviera ID (RIV-00000001). Nunca se reinicia; huecos por concurrencia son aceptables.';

-- Sincronizar secuencia si ya existen serial asignados (re-ejecución idempotente)
SELECT setval(
  'public.riviera_id_serial_seq',
  GREATEST(
    1,
    COALESCE(
      (SELECT max(i.riviera_id_serial) FROM public.riviera_official_player_identity i),
      0
    )
  ),
  true
);

-- ── 2. Helpers internos (no expuestos a la app) ──

CREATE OR REPLACE FUNCTION public._format_riviera_id(p_serial bigint)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public
AS $$
  SELECT 'RIV-' || lpad(p_serial::text, 8, '0');
$$;

COMMENT ON FUNCTION public._format_riviera_id(bigint) IS
  'Formato congelado Riviera ID: RIV- + 8 dígitos zero-padded.';

CREATE OR REPLACE FUNCTION public._allocate_riviera_id_serial()
RETURNS bigint
LANGUAGE sql
VOLATILE
STRICT
SET search_path = public
AS $$
  SELECT nextval('public.riviera_id_serial_seq');
$$;

COMMENT ON FUNCTION public._allocate_riviera_id_serial() IS
  'Asignación atómica del siguiente serial global (nextval).';

-- Asigna riviera_id + serial a una identidad existente si aún no tiene (atómico)
CREATE OR REPLACE FUNCTION public._assign_riviera_id_to_identity(p_official_player_key uuid)
RETURNS TABLE (
  assigned boolean,
  riviera_id text,
  riviera_id_serial bigint
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_serial bigint;
  v_formatted text;
  v_existing record;
BEGIN
  IF p_official_player_key IS NULL THEN
    RAISE EXCEPTION 'official_player_key requerido';
  END IF;

  SELECT i.riviera_id, i.riviera_id_serial
  INTO v_existing
  FROM public.riviera_official_player_identity i
  WHERE i.official_player_key = p_official_player_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Identidad no encontrada: %', p_official_player_key;
  END IF;

  IF v_existing.riviera_id IS NOT NULL THEN
    assigned := false;
    riviera_id := v_existing.riviera_id;
    riviera_id_serial := v_existing.riviera_id_serial;
    RETURN NEXT;
    RETURN;
  END IF;

  v_serial := public._allocate_riviera_id_serial();
  v_formatted := public._format_riviera_id(v_serial);

  UPDATE public.riviera_official_player_identity i
  SET
    riviera_id_serial = v_serial,
    riviera_id = v_formatted
  WHERE i.official_player_key = p_official_player_key
    AND i.riviera_id IS NULL;

  IF FOUND THEN
    assigned := true;
    riviera_id := v_formatted;
    riviera_id_serial := v_serial;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Carrera concurrente: otra transacción asignó primero
  SELECT i.riviera_id, i.riviera_id_serial
  INTO v_existing
  FROM public.riviera_official_player_identity i
  WHERE i.official_player_key = p_official_player_key;

  assigned := false;
  riviera_id := v_existing.riviera_id;
  riviera_id_serial := v_existing.riviera_id_serial;
  RETURN NEXT;
END;
$$;

-- Debut Riviera inmutable: solo escribe si debut_at IS NULL
CREATE OR REPLACE FUNCTION public._ensure_debut_riviera_if_missing(
  p_official_player_key uuid,
  p_registration_jugador_id uuid,
  p_fallback_at timestamptz DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated boolean := false;
  v_row_count integer;
BEGIN
  IF p_official_player_key IS NULL OR p_registration_jugador_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.riviera_official_player_identity i
  SET
    debut_organizer_id = rj.organizador_id,
    debut_at = coalesce(p_fallback_at, now())
  FROM public.riviera_jugadores rj
  WHERE i.official_player_key = p_official_player_key
    AND i.debut_at IS NULL
    AND rj.id = p_registration_jugador_id;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_updated := v_row_count > 0;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public._format_riviera_id(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._format_riviera_id(bigint) FROM anon, authenticated;

REVOKE ALL ON FUNCTION public._allocate_riviera_id_serial() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._allocate_riviera_id_serial() FROM anon, authenticated;

REVOKE ALL ON FUNCTION public._assign_riviera_id_to_identity(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._assign_riviera_id_to_identity(uuid) FROM anon, authenticated;

REVOKE ALL ON FUNCTION public._ensure_debut_riviera_if_missing(uuid, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._ensure_debut_riviera_if_missing(uuid, uuid, timestamptz) FROM anon, authenticated;

-- ── 3. RPC pública: ensure_riviera_identity ──

CREATE OR REPLACE FUNCTION public.ensure_riviera_identity(p_riviera_jugador_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_jugador record;
  v_key uuid;
  v_link record;
  v_grant record;
  v_origin record;
  v_canonical_id uuid;
  v_link_id uuid;
  v_link_source text;
  v_identity_created boolean := false;
  v_link_created boolean := false;
  v_assign record;
  v_debut_set boolean := false;
  v_identity record;
BEGIN
  IF p_riviera_jugador_id IS NULL THEN
    RAISE EXCEPTION 'riviera_jugador_id requerido';
  END IF;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida';
  END IF;

  -- Lock transaccional por jugador (anti-carrera)
  PERFORM pg_advisory_xact_lock(200202, hashtext(p_riviera_jugador_id::text));

  SELECT rj.id, rj.organizador_id, rj.nombre, rj.created_at
  INTO v_jugador
  FROM public.riviera_jugadores rj
  WHERE rj.id = p_riviera_jugador_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jugador no encontrado';
  END IF;

  IF NOT public.is_master_admin()
     AND v_jugador.organizador_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'Sin permiso para asegurar identidad de este jugador';
  END IF;

  -- ── A) Perfil ya vinculado ──
  SELECT l.id, l.official_player_key, l.link_source
  INTO v_link
  FROM public.riviera_official_player_profile_link l
  WHERE l.riviera_jugador_id = p_riviera_jugador_id;

  IF FOUND THEN
    v_key := v_link.official_player_key;
    v_link_source := v_link.link_source;

    SELECT * INTO v_assign
    FROM public._assign_riviera_id_to_identity(v_key);

    v_debut_set := public._ensure_debut_riviera_if_missing(
      v_key,
      (SELECT i.canonical_riviera_jugador_id
       FROM public.riviera_official_player_identity i
       WHERE i.official_player_key = v_key),
      NULL
    );

    SELECT
      i.official_player_key,
      i.riviera_id,
      i.riviera_id_serial,
      i.canonical_riviera_jugador_id,
      i.debut_organizer_id,
      i.debut_at,
      i.created_at
    INTO v_identity
    FROM public.riviera_official_player_identity i
    WHERE i.official_player_key = v_key;

    RETURN jsonb_build_object(
      'official_player_key', v_identity.official_player_key,
      'riviera_id', v_identity.riviera_id,
      'riviera_id_serial', v_identity.riviera_id_serial,
      'riviera_jugador_id', p_riviera_jugador_id,
      'registration_jugador_id', v_identity.canonical_riviera_jugador_id,
      'debut_organizer_id', v_identity.debut_organizer_id,
      'debut_at', v_identity.debut_at,
      'link_source', v_link_source,
      'identity_created', false,
      'link_created', false,
      'riviera_id_assigned', coalesce(v_assign.assigned, false),
      'debut_assigned', v_debut_set
    );
  END IF;

  -- ── B) Identidad resoluble vía grant (origen ya tiene carrera) ──
  v_key := public._resolve_official_player_key(p_riviera_jugador_id);

  IF v_key IS NOT NULL THEN
    SELECT opa.id, opa.jugador_id
    INTO v_grant
    FROM public.organizer_player_access opa
    WHERE opa.is_active = true
      AND opa.local_jugador_id = p_riviera_jugador_id
    LIMIT 1;

    v_link_source := CASE
      WHEN v_grant.jugador_id IS NOT NULL THEN 'granted_local'
      ELSE 'owner'
    END;

    INSERT INTO public.riviera_official_player_profile_link (
      official_player_key,
      riviera_jugador_id,
      organizer_id,
      link_source,
      organizer_player_access_id,
      created_by
    )
    VALUES (
      v_key,
      p_riviera_jugador_id,
      v_jugador.organizador_id,
      v_link_source,
      v_grant.id,
      v_actor
    )
    ON CONFLICT (riviera_jugador_id) DO NOTHING
    RETURNING id INTO v_link_id;

    v_link_created := v_link_id IS NOT NULL;

    IF NOT v_link_created THEN
      SELECT l.link_source INTO v_link_source
      FROM public.riviera_official_player_profile_link l
      WHERE l.riviera_jugador_id = p_riviera_jugador_id;
    END IF;

    SELECT * INTO v_assign
    FROM public._assign_riviera_id_to_identity(v_key);

    v_debut_set := public._ensure_debut_riviera_if_missing(
      v_key,
      (SELECT i.canonical_riviera_jugador_id
       FROM public.riviera_official_player_identity i
       WHERE i.official_player_key = v_key),
      NULL
    );

    SELECT
      i.official_player_key,
      i.riviera_id,
      i.riviera_id_serial,
      i.canonical_riviera_jugador_id,
      i.debut_organizer_id,
      i.debut_at
    INTO v_identity
    FROM public.riviera_official_player_identity i
    WHERE i.official_player_key = v_key;

    RETURN jsonb_build_object(
      'official_player_key', v_identity.official_player_key,
      'riviera_id', v_identity.riviera_id,
      'riviera_id_serial', v_identity.riviera_id_serial,
      'riviera_jugador_id', p_riviera_jugador_id,
      'registration_jugador_id', v_identity.canonical_riviera_jugador_id,
      'debut_organizer_id', v_identity.debut_organizer_id,
      'debut_at', v_identity.debut_at,
      'link_source', v_link_source,
      'identity_created', false,
      'link_created', v_link_created,
      'riviera_id_assigned', coalesce(v_assign.assigned, false),
      'debut_assigned', v_debut_set
    );
  END IF;

  -- ── C) Grant activo: crear carrera en origen (Organizador de Registro) ──
  SELECT
    opa.id AS access_id,
    opa.jugador_id AS origin_jugador_id
  INTO v_grant
  FROM public.organizer_player_access opa
  WHERE opa.is_active = true
    AND opa.local_jugador_id = p_riviera_jugador_id
  LIMIT 1;

  IF v_grant.origin_jugador_id IS NOT NULL THEN
    SELECT rj.id, rj.organizador_id, rj.nombre, rj.created_at
    INTO v_origin
    FROM public.riviera_jugadores rj
    WHERE rj.id = v_grant.origin_jugador_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Jugador origen del grant no encontrado';
    END IF;

    v_canonical_id := v_origin.id;

    INSERT INTO public.riviera_official_player_identity (
      canonical_riviera_jugador_id,
      created_by
    )
    VALUES (v_canonical_id, v_actor)
    ON CONFLICT ON CONSTRAINT ropi_canonical_jugador_unique DO NOTHING
    RETURNING official_player_key INTO v_key;

    IF v_key IS NULL THEN
      SELECT i.official_player_key
      INTO v_key
      FROM public.riviera_official_player_identity i
      WHERE i.canonical_riviera_jugador_id = v_canonical_id;
      v_identity_created := false;
    ELSE
      v_identity_created := true;
    END IF;

    INSERT INTO public.riviera_official_player_profile_link (
      official_player_key,
      riviera_jugador_id,
      organizer_id,
      link_source,
      created_by
    )
    VALUES (
      v_key,
      v_origin.id,
      v_origin.organizador_id,
      'owner',
      v_actor
    )
    ON CONFLICT (riviera_jugador_id) DO NOTHING;

    INSERT INTO public.riviera_official_player_profile_link (
      official_player_key,
      riviera_jugador_id,
      organizer_id,
      link_source,
      organizer_player_access_id,
      created_by
    )
    VALUES (
      v_key,
      p_riviera_jugador_id,
      v_jugador.organizador_id,
      'granted_local',
      v_grant.access_id,
      v_actor
    )
    ON CONFLICT (riviera_jugador_id) DO NOTHING
    RETURNING id INTO v_link_id;

    v_link_created := v_link_id IS NOT NULL;
    v_link_source := 'granted_local';

    INSERT INTO public.riviera_official_player_totals (official_player_key, points_total)
    VALUES (v_key, 0)
    ON CONFLICT (official_player_key) DO NOTHING;

    PERFORM public._ensure_debut_riviera_if_missing(
      v_key,
      v_canonical_id,
      coalesce(v_origin.created_at, now())
    );

    SELECT * INTO v_assign
    FROM public._assign_riviera_id_to_identity(v_key);

    SELECT
      i.official_player_key,
      i.riviera_id,
      i.riviera_id_serial,
      i.canonical_riviera_jugador_id,
      i.debut_organizer_id,
      i.debut_at
    INTO v_identity
    FROM public.riviera_official_player_identity i
    WHERE i.official_player_key = v_key;

    RETURN jsonb_build_object(
      'official_player_key', v_identity.official_player_key,
      'riviera_id', v_identity.riviera_id,
      'riviera_id_serial', v_identity.riviera_id_serial,
      'riviera_jugador_id', p_riviera_jugador_id,
      'registration_jugador_id', v_identity.canonical_riviera_jugador_id,
      'debut_organizer_id', v_identity.debut_organizer_id,
      'debut_at', v_identity.debut_at,
      'link_source', v_link_source,
      'identity_created', v_identity_created,
      'link_created', v_link_created,
      'riviera_id_assigned', coalesce(v_assign.assigned, false),
      'debut_assigned', true
    );
  END IF;

  -- ── D) Nueva Carrera Deportiva (registro inicial en este organizador) ──
  v_canonical_id := p_riviera_jugador_id;

  INSERT INTO public.riviera_official_player_identity (
    canonical_riviera_jugador_id,
    created_by
  )
  VALUES (v_canonical_id, v_actor)
  ON CONFLICT ON CONSTRAINT ropi_canonical_jugador_unique DO NOTHING
  RETURNING official_player_key INTO v_key;

  IF v_key IS NULL THEN
    SELECT i.official_player_key
    INTO v_key
    FROM public.riviera_official_player_identity i
    WHERE i.canonical_riviera_jugador_id = v_canonical_id;

    IF v_key IS NULL THEN
      RAISE EXCEPTION 'No se pudo crear ni resolver identidad para jugador %', p_riviera_jugador_id;
    END IF;

    v_identity_created := false;

    INSERT INTO public.riviera_official_player_profile_link (
      official_player_key,
      riviera_jugador_id,
      organizer_id,
      link_source,
      created_by
    )
    VALUES (
      v_key,
      p_riviera_jugador_id,
      v_jugador.organizador_id,
      'owner',
      v_actor
    )
    ON CONFLICT (riviera_jugador_id) DO NOTHING
    RETURNING id INTO v_link_id;

    v_link_created := v_link_id IS NOT NULL;
    v_link_source := 'owner';

    SELECT * INTO v_assign
    FROM public._assign_riviera_id_to_identity(v_key);

    v_debut_set := public._ensure_debut_riviera_if_missing(v_key, v_canonical_id, NULL);

    SELECT
      i.official_player_key,
      i.riviera_id,
      i.riviera_id_serial,
      i.canonical_riviera_jugador_id,
      i.debut_organizer_id,
      i.debut_at
    INTO v_identity
    FROM public.riviera_official_player_identity i
    WHERE i.official_player_key = v_key;

    RETURN jsonb_build_object(
      'official_player_key', v_identity.official_player_key,
      'riviera_id', v_identity.riviera_id,
      'riviera_id_serial', v_identity.riviera_id_serial,
      'riviera_jugador_id', p_riviera_jugador_id,
      'registration_jugador_id', v_identity.canonical_riviera_jugador_id,
      'debut_organizer_id', v_identity.debut_organizer_id,
      'debut_at', v_identity.debut_at,
      'link_source', v_link_source,
      'identity_created', v_identity_created,
      'link_created', v_link_created,
      'riviera_id_assigned', coalesce(v_assign.assigned, false),
      'debut_assigned', v_debut_set
    );
  END IF;

  v_identity_created := true;
  v_link_source := 'owner';

  INSERT INTO public.riviera_official_player_profile_link (
    official_player_key,
    riviera_jugador_id,
    organizer_id,
    link_source,
    created_by
  )
  VALUES (
    v_key,
    p_riviera_jugador_id,
    v_jugador.organizador_id,
    'owner',
    v_actor
  )
  RETURNING id INTO v_link_id;

  v_link_created := true;

  INSERT INTO public.riviera_official_player_totals (official_player_key, points_total)
  VALUES (v_key, 0);

  PERFORM public._ensure_debut_riviera_if_missing(
    v_key,
    v_canonical_id,
    coalesce(v_jugador.created_at, now())
  );

  SELECT * INTO v_assign
  FROM public._assign_riviera_id_to_identity(v_key);

  SELECT
    i.official_player_key,
    i.riviera_id,
    i.riviera_id_serial,
    i.canonical_riviera_jugador_id,
    i.debut_organizer_id,
    i.debut_at
  INTO v_identity
  FROM public.riviera_official_player_identity i
  WHERE i.official_player_key = v_key;

  RETURN jsonb_build_object(
    'official_player_key', v_identity.official_player_key,
    'riviera_id', v_identity.riviera_id,
    'riviera_id_serial', v_identity.riviera_id_serial,
    'riviera_jugador_id', p_riviera_jugador_id,
    'registration_jugador_id', v_identity.canonical_riviera_jugador_id,
    'debut_organizer_id', v_identity.debut_organizer_id,
    'debut_at', v_identity.debut_at,
    'link_source', v_link_source,
    'identity_created', v_identity_created,
    'link_created', v_link_created,
    'riviera_id_assigned', coalesce(v_assign.assigned, false),
    'debut_assigned', true
  );
END;
$$;

COMMENT ON FUNCTION public.ensure_riviera_identity(uuid) IS
  'Sprint 2.0.2 — Asegura Carrera Deportiva + Riviera ID para un riviera_jugador_id. '
  'Idempotente; reutiliza identidad existente; grant-aware. '
  'Auth: organizador dueño del perfil o Admin Maestro. No expuesto en UI aún.';

GRANT EXECUTE ON FUNCTION public.ensure_riviera_identity(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.ensure_riviera_identity(uuid) FROM anon;

-- ── 4. Validación post-deploy (NOTICE) ──

DO $$
DECLARE
  v_formatted text;
BEGIN
  v_formatted := public._format_riviera_id(1);
  IF v_formatted <> 'RIV-00000001' THEN
    RAISE EXCEPTION 'Formato Riviera ID inválido: %', v_formatted;
  END IF;

  RAISE NOTICE 'Sprint 2.0.2 OK — secuencia=%, formato_ejemplo=%, RPC=ensure_riviera_identity',
    (SELECT last_value FROM public.riviera_id_serial_seq),
    public._format_riviera_id(1852);
END $$;

NOTIFY pgrst, 'reload schema';

-- ══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK Sprint 2.0.2
-- No elimina identidades/Riviera IDs ya asignados (datos válidos).
-- ══════════════════════════════════════════════════════════════════════════════
--
-- REVOKE EXECUTE ON FUNCTION public.ensure_riviera_identity(uuid) FROM authenticated;
-- DROP FUNCTION IF EXISTS public.ensure_riviera_identity(uuid);
-- DROP FUNCTION IF EXISTS public._ensure_debut_riviera_if_missing(uuid, uuid, timestamptz);
-- DROP FUNCTION IF EXISTS public._assign_riviera_id_to_identity(uuid);
-- DROP FUNCTION IF EXISTS public._allocate_riviera_id_serial();
-- DROP FUNCTION IF EXISTS public._format_riviera_id(bigint);
-- DROP SEQUENCE IF EXISTS public.riviera_id_serial_seq;
--
-- NOTIFY pgrst, 'reload schema';
--
-- ══════════════════════════════════════════════════════════════════════════════
