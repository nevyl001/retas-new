-- ══════════════════════════════════════════════════════════════════════════════
-- RIVIERA 2.1.2 — Player Membership Engine — RPCs
-- Agregar jugador existente por Riviera ID exacto (sin UI / QR / backfill).
--
-- Prerrequisitos:
--   organizer-player-access.sql
--   riviera-career-identity-2.0.1-ddl.sql
--   riviera-career-identity-2.0.2-engine.sql
--   riviera-player-membership-2.1.1-schema.sql
--
-- Reglas:
--   - Búsqueda exacta por riviera_id (formato RIV-00000001)
--   - No crea Carrera Deportiva ni Riviera ID
--   - No modifica debut_organizer_id / debut_at
--   - No duplica profile_link, organizer_player_access, riviera_jugadores
--   - Transaccional (función + advisory lock)
--
-- Idempotente: sí (add/list/leave) | Reversible: bloque ROLLBACK al final
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF to_regclass('public.organizer_player_access') IS NULL THEN
    RAISE EXCEPTION 'Prerrequisito: organizer-player-access.sql';
  END IF;

  IF to_regprocedure('public.ensure_granted_player_local(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Prerrequisito: organizer-player-access.sql (ensure_granted_player_local)';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organizer_player_access'
      AND column_name = 'joined_via'
  ) THEN
    RAISE EXCEPTION 'Prerrequisito: riviera-player-membership-2.1.1-schema.sql';
  END IF;
END $$;

-- ── Helper interno: normalizar entrada Riviera ID (exacta, sin búsqueda parcial) ──

CREATE OR REPLACE FUNCTION public._normalize_riviera_id_exact(p_input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_trimmed text;
BEGIN
  v_trimmed := trim(coalesce(p_input, ''));
  IF v_trimmed = '' THEN
    RETURN NULL;
  END IF;

  IF v_trimmed !~ '^RIV-[0-9]{8}$' THEN
    RETURN NULL;
  END IF;

  RETURN v_trimmed;
END;
$$;

REVOKE ALL ON FUNCTION public._normalize_riviera_id_exact(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._normalize_riviera_id_exact(text) FROM anon, authenticated;

-- ── Helper interno: resolver identidad por Riviera ID exacto ──

CREATE OR REPLACE FUNCTION public._resolve_identity_by_riviera_id(p_riviera_id text)
RETURNS TABLE (
  official_player_key uuid,
  riviera_id text,
  riviera_id_serial bigint,
  canonical_riviera_jugador_id uuid,
  registration_organizer_id uuid,
  display_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized text;
BEGIN
  v_normalized := public._normalize_riviera_id_exact(p_riviera_id);
  IF v_normalized IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    i.official_player_key,
    i.riviera_id,
    i.riviera_id_serial,
    i.canonical_riviera_jugador_id,
    coalesce(i.debut_organizer_id, rj.organizador_id) AS registration_organizer_id,
    rj.nombre::text AS display_name
  FROM public.riviera_official_player_identity i
  JOIN public.riviera_jugadores rj
    ON rj.id = i.canonical_riviera_jugador_id
  WHERE i.riviera_id = v_normalized
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public._resolve_identity_by_riviera_id(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._resolve_identity_by_riviera_id(text) FROM anon, authenticated;

-- ── Helper interno: enlazar perfil local ↔ identidad (sin tocar identity/debut) ──

CREATE OR REPLACE FUNCTION public._link_membership_local_profile(
  p_official_player_key uuid,
  p_local_jugador_id uuid,
  p_organizer_id uuid,
  p_access_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_inserted uuid;
BEGIN
  IF p_official_player_key IS NULL OR p_local_jugador_id IS NULL OR p_organizer_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.riviera_official_player_profile_link (
    official_player_key,
    riviera_jugador_id,
    organizer_id,
    link_source,
    organizer_player_access_id,
    created_by
  )
  VALUES (
    p_official_player_key,
    p_local_jugador_id,
    p_organizer_id,
    'granted_local',
    p_access_id,
    v_actor
  )
  ON CONFLICT (riviera_jugador_id) DO NOTHING
  RETURNING id INTO v_inserted;

  RETURN v_inserted IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public._link_membership_local_profile(uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._link_membership_local_profile(uuid, uuid, uuid, uuid) FROM anon, authenticated;

-- ── RPC: resolve_player_by_riviera_id ──

CREATE OR REPLACE FUNCTION public.resolve_player_by_riviera_id(p_riviera_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grantee uuid := auth.uid();
  v_identity record;
  v_existing record;
  v_already_member boolean := false;
BEGIN
  IF v_grantee IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida';
  END IF;

  SELECT *
  INTO v_identity
  FROM public._resolve_identity_by_riviera_id(p_riviera_id);

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'found', false,
      'riviera_id', public._normalize_riviera_id_exact(p_riviera_id)
    );
  END IF;

  SELECT opa.id, opa.local_jugador_id
  INTO v_existing
  FROM public.organizer_player_access opa
  WHERE opa.grantee_organizer_id = v_grantee
    AND opa.jugador_id = v_identity.canonical_riviera_jugador_id
    AND opa.is_active = true
  LIMIT 1;

  IF FOUND THEN
    v_already_member := true;
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'riviera_id', v_identity.riviera_id,
    'display_name', v_identity.display_name,
    'registration_organizer_id', v_identity.registration_organizer_id,
    'already_member', v_already_member,
    'local_jugador_id', v_existing.local_jugador_id,
    'membership_id', v_existing.id
  );
END;
$$;

COMMENT ON FUNCTION public.resolve_player_by_riviera_id(text) IS
  'Sprint 2.1.2 — Resuelve jugador por Riviera ID exacto (RIV-00000001). '
  'Solo nombre público + estado de membresía del organizador actual. '
  'No busca por nombre/correo/teléfono. No crea identidad.';

GRANT EXECUTE ON FUNCTION public.resolve_player_by_riviera_id(text) TO authenticated;
REVOKE ALL ON FUNCTION public.resolve_player_by_riviera_id(text) FROM anon;

-- ── RPC: add_organizer_membership_by_riviera_id ──

CREATE OR REPLACE FUNCTION public.add_organizer_membership_by_riviera_id(p_riviera_id text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grantee uuid := auth.uid();
  v_identity record;
  v_owner uuid;
  v_access_id uuid;
  v_local_id uuid;
  v_existing public.organizer_player_access%ROWTYPE;
  v_created boolean := false;
  v_reactivated boolean := false;
  v_link_created boolean := false;
BEGIN
  IF v_grantee IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida';
  END IF;

  SELECT *
  INTO v_identity
  FROM public._resolve_identity_by_riviera_id(p_riviera_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Riviera ID no encontrado';
  END IF;

  v_owner := v_identity.registration_organizer_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Organizador de Registro no resuelto';
  END IF;

  IF v_owner = v_grantee THEN
    RAISE EXCEPTION 'El jugador ya pertenece a tu organizador de registro';
  END IF;

  PERFORM pg_advisory_xact_lock(
    212012,
    hashtext(v_grantee::text || ':' || v_identity.canonical_riviera_jugador_id::text)
  );

  SELECT *
  INTO v_existing
  FROM public.organizer_player_access opa
  WHERE opa.grantee_organizer_id = v_grantee
    AND opa.jugador_id = v_identity.canonical_riviera_jugador_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.is_active THEN
      v_access_id := v_existing.id;
    ELSE
      UPDATE public.organizer_player_access
      SET
        is_active = true,
        left_at = NULL,
        joined_at = now(),
        joined_via = 'riviera_id',
        access_type = 'granted_by_admin',
        updated_at = now()
      WHERE id = v_existing.id
      RETURNING id INTO v_access_id;

      v_reactivated := true;

      IF v_existing.local_jugador_id IS NOT NULL THEN
        UPDATE public.riviera_jugadores rj
        SET
          estado = 'activo',
          suma_ranking = true,
          updated_at = now()
        WHERE rj.id = v_existing.local_jugador_id
          AND rj.organizador_id = v_grantee;
      END IF;
    END IF;
  ELSE
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
      v_grantee,
      'granted_by_admin',
      NULL,
      true,
      false,
      now(),
      'riviera_id'
    )
    RETURNING id INTO v_access_id;

    v_created := true;
  END IF;

  v_local_id := public.ensure_granted_player_local(v_identity.canonical_riviera_jugador_id);

  v_link_created := public._link_membership_local_profile(
    v_identity.official_player_key,
    v_local_id,
    v_grantee,
    v_access_id
  );

  RETURN jsonb_build_object(
    'membership_id', v_access_id,
    'local_jugador_id', v_local_id,
    'source_jugador_id', v_identity.canonical_riviera_jugador_id,
    'riviera_id', v_identity.riviera_id,
    'display_name', v_identity.display_name,
    'registration_organizer_id', v_owner,
    'created', v_created,
    'reactivated', v_reactivated,
    'already_member', NOT v_created AND NOT v_reactivated,
    'profile_link_created', v_link_created
  );
END;
$$;

COMMENT ON FUNCTION public.add_organizer_membership_by_riviera_id(text) IS
  'Sprint 2.1.2 — Alta de membresía por Riviera ID exacto. '
  'Reutiliza Carrera existente; crea clon local + profile_link si faltan. '
  'No asigna Riviera ID ni modifica debut. Idempotente si ya activa.';

GRANT EXECUTE ON FUNCTION public.add_organizer_membership_by_riviera_id(text) TO authenticated;
REVOKE ALL ON FUNCTION public.add_organizer_membership_by_riviera_id(text) FROM anon;

-- ── RPC: leave_organizer_membership ──

CREATE OR REPLACE FUNCTION public.leave_organizer_membership(p_local_jugador_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grantee uuid := auth.uid();
  v_access public.organizer_player_access%ROWTYPE;
  v_left_at timestamptz := now();
BEGIN
  IF v_grantee IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida';
  END IF;

  IF p_local_jugador_id IS NULL THEN
    RAISE EXCEPTION 'local_jugador_id requerido';
  END IF;

  SELECT *
  INTO v_access
  FROM public.organizer_player_access opa
  WHERE opa.grantee_organizer_id = v_grantee
    AND opa.is_active = true
    AND (
      opa.local_jugador_id = p_local_jugador_id
      OR (
        opa.local_jugador_id IS NULL
        AND opa.jugador_id = p_local_jugador_id
      )
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membresía activa no encontrada para este jugador';
  END IF;

  IF v_access.owner_organizador_id = v_grantee
     AND v_access.access_type = 'owner' THEN
    RAISE EXCEPTION 'No puedes abandonar la membresía de registro del jugador';
  END IF;

  UPDATE public.organizer_player_access
  SET
    is_active = false,
    left_at = v_left_at,
    updated_at = v_left_at
  WHERE id = v_access.id;

  IF v_access.local_jugador_id IS NOT NULL THEN
    UPDATE public.riviera_jugadores rj
    SET
      estado = 'archivado',
      suma_ranking = false,
      visible_publico = false,
      updated_at = v_left_at
    WHERE rj.id = v_access.local_jugador_id
      AND rj.organizador_id = v_grantee;
  END IF;

  RETURN jsonb_build_object(
    'membership_id', v_access.id,
    'local_jugador_id', v_access.local_jugador_id,
    'source_jugador_id', v_access.jugador_id,
    'left_at', v_left_at,
    'joined_via', v_access.joined_via
  );
END;
$$;

COMMENT ON FUNCTION public.leave_organizer_membership(uuid) IS
  'Sprint 2.1.2 — Baja de membresía del organizador actual (soft). '
  'Archiva clon local; conserva Carrera, profile_link e historial.';

GRANT EXECUTE ON FUNCTION public.leave_organizer_membership(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.leave_organizer_membership(uuid) FROM anon;

-- ── RPC: list_organizer_memberships ──

CREATE OR REPLACE FUNCTION public.list_organizer_memberships()
RETURNS TABLE (
  membership_id uuid,
  source_jugador_id uuid,
  local_jugador_id uuid,
  riviera_id text,
  display_name text,
  registration_organizer_id uuid,
  joined_at timestamptz,
  joined_via text,
  access_type text,
  is_public_ranking boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grantee uuid := auth.uid();
BEGIN
  IF v_grantee IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida';
  END IF;

  RETURN QUERY
  SELECT
    opa.id AS membership_id,
    opa.jugador_id AS source_jugador_id,
    opa.local_jugador_id,
    i.riviera_id,
    coalesce(rj_local.nombre, rj_source.nombre)::text AS display_name,
    opa.owner_organizador_id AS registration_organizer_id,
    opa.joined_at,
    opa.joined_via,
    opa.access_type,
    opa.is_public_ranking
  FROM public.organizer_player_access opa
  JOIN public.riviera_jugadores rj_source
    ON rj_source.id = opa.jugador_id
  LEFT JOIN public.riviera_jugadores rj_local
    ON rj_local.id = opa.local_jugador_id
  LEFT JOIN public.riviera_official_player_identity i
    ON i.canonical_riviera_jugador_id = opa.jugador_id
  WHERE opa.grantee_organizer_id = v_grantee
    AND opa.is_active = true
  ORDER BY opa.joined_at DESC NULLS LAST, opa.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.list_organizer_memberships() IS
  'Sprint 2.1.2 — Lista membresías activas del organizador autenticado.';

GRANT EXECUTE ON FUNCTION public.list_organizer_memberships() TO authenticated;
REVOKE ALL ON FUNCTION public.list_organizer_memberships() FROM anon;

-- ── Validación post-deploy (NOTICE) ──

DO $$
BEGIN
  IF to_regprocedure('public.resolve_player_by_riviera_id(text)') IS NULL
     OR to_regprocedure('public.add_organizer_membership_by_riviera_id(text)') IS NULL
     OR to_regprocedure('public.leave_organizer_membership(uuid)') IS NULL
     OR to_regprocedure('public.list_organizer_memberships()') IS NULL THEN
    RAISE EXCEPTION '2.1.2 FAIL: RPCs incompletas';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.resolve_player_by_riviera_id(text)', 'EXECUTE') THEN
    RAISE EXCEPTION '2.1.2 FAIL: falta GRANT resolve';
  END IF;

  RAISE NOTICE 'Sprint 2.1.2 OK — RPCs=resolve,add,leave,list';
END $$;

NOTIFY pgrst, 'reload schema';

-- ══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK 2.1.2
-- No revierte membresías/datos creados; solo elimina RPCs.
-- ══════════════════════════════════════════════════════════════════════════════
--
-- REVOKE EXECUTE ON FUNCTION public.list_organizer_memberships() FROM authenticated;
-- DROP FUNCTION IF EXISTS public.list_organizer_memberships();
-- REVOKE EXECUTE ON FUNCTION public.leave_organizer_membership(uuid) FROM authenticated;
-- DROP FUNCTION IF EXISTS public.leave_organizer_membership(uuid);
-- REVOKE EXECUTE ON FUNCTION public.add_organizer_membership_by_riviera_id(text) FROM authenticated;
-- DROP FUNCTION IF EXISTS public.add_organizer_membership_by_riviera_id(text);
-- REVOKE EXECUTE ON FUNCTION public.resolve_player_by_riviera_id(text) FROM authenticated;
-- DROP FUNCTION IF EXISTS public.resolve_player_by_riviera_id(text);
-- DROP FUNCTION IF EXISTS public._link_membership_local_profile(uuid, uuid, uuid, uuid);
-- DROP FUNCTION IF EXISTS public._resolve_identity_by_riviera_id(text);
-- DROP FUNCTION IF EXISTS public._normalize_riviera_id_exact(text);
--
-- NOTIFY pgrst, 'reload schema';
--
-- ══════════════════════════════════════════════════════════════════════════════
