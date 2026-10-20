-- =============================================================================
-- 0063_coaching_invitations_and_rls_fixes.sql
-- Riviera Coaching — Correcciones RLS, Búsqueda y Vinculaciones Reales
-- Inmutable: NO modifica 0039_riviera_coaching_core.sql
-- =============================================================================

-- ── 1) RLS: Permitir que el Organizador asigne jugadores a coaches activos ────
DROP POLICY IF EXISTS cpr_insert_org ON public.coach_player_relationships;
CREATE POLICY cpr_insert_org ON public.coach_player_relationships
  FOR INSERT TO authenticated
  WITH CHECK (
    organizador_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.coach_club_memberships m
      WHERE m.coach_id = coach_player_relationships.coach_id
        AND m.organizador_id = auth.uid()
        AND m.status = 'ACTIVE'
    )
  );

-- ── 2) RLS: Permitir que el Organizador desvincule o borre relaciones de su club ─
DROP POLICY IF EXISTS cpr_delete_org ON public.coach_player_relationships;
CREATE POLICY cpr_delete_org ON public.coach_player_relationships
  FOR DELETE TO authenticated
  USING (
    organizador_id = auth.uid() OR public.is_master_admin()
  );

-- ── 3) Búsqueda segura de coach para invitación/vinculación ──────────────────
-- Permite al organizador autenticado consultar si un coach ya existe en la
-- plataforma global por su código oficial (RIV-C-#####) o por correo.
CREATE OR REPLACE FUNCTION public.lookup_coach_for_invitation(p_query text)
RETURNS TABLE (
  coach_id uuid,
  coach_code text,
  nombre text,
  foto_url text,
  bio text,
  especialidades text[],
  fuerzas text[],
  already_member boolean,
  membership_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := auth.uid();
  v_normalized text := lower(btrim(COALESCE(p_query, '')));
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida';
  END IF;

  IF v_normalized = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id AS coach_id,
    c.coach_code,
    c.nombre,
    c.foto_url,
    c.bio,
    c.especialidades,
    c.fuerzas,
    EXISTS (
      SELECT 1 FROM public.coach_club_memberships m
      WHERE m.coach_id = c.id
        AND m.organizador_id = v_org_id
        AND m.status = 'ACTIVE'
    ) AS already_member,
    (
      SELECT m.status FROM public.coach_club_memberships m
      WHERE m.coach_id = c.id
        AND m.organizador_id = v_org_id
      LIMIT 1
    ) AS membership_status
  FROM public.riviera_coaches c
  LEFT JOIN auth.users u ON u.id = c.auth_user_id
  WHERE lower(c.coach_code) = v_normalized
     OR lower(u.email) = v_normalized
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_coach_for_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_coach_for_invitation(text) TO authenticated;

-- ── 4) Vinculación atómica de coach existente al club del organizador ────────
CREATE OR REPLACE FUNCTION public.link_existing_coach_to_club(p_coach_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := auth.uid();
  v_membership_id uuid;
  v_status text;
  v_coach record;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida';
  END IF;

  SELECT id, coach_code, nombre, foto_url, bio, especialidades, fuerzas
  INTO v_coach
  FROM public.riviera_coaches
  WHERE id = p_coach_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Coach no encontrado'
    );
  END IF;

  INSERT INTO public.coach_club_memberships (coach_id, organizador_id, status)
  VALUES (p_coach_id, v_org_id, 'ACTIVE')
  ON CONFLICT (coach_id, organizador_id)
  DO UPDATE SET status = 'ACTIVE', updated_at = now()
  RETURNING id, status INTO v_membership_id, v_status;

  RETURN jsonb_build_object(
    'ok', true,
    'membership_id', v_membership_id,
    'status', v_status,
    'coach', jsonb_build_object(
      'id', v_coach.id,
      'coach_code', v_coach.coach_code,
      'nombre', v_coach.nombre,
      'foto_url', v_coach.foto_url,
      'bio', v_coach.bio,
      'especialidades', v_coach.especialidades,
      'fuerzas', v_coach.fuerzas
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.link_existing_coach_to_club(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_existing_coach_to_club(uuid) TO authenticated;

-- ── 5) Vinculación segura de alumno a coach por Riviera ID ───────────────────
CREATE OR REPLACE FUNCTION public.link_player_to_coach_by_riviera_id(
  p_coach_id uuid,
  p_riviera_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := auth.uid();
  v_norm_riviera_id text;
  v_jugador_id uuid;
  v_jugador_nombre text;
  v_rel_id uuid;
  v_status text;
  v_is_primary boolean;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida';
  END IF;

  v_norm_riviera_id := upper(btrim(COALESCE(p_riviera_id, '')));
  IF v_norm_riviera_id !~ '^RIV-[0-9]{8}$' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Formato de Riviera ID inválido. Debe ser RIV-########'
    );
  END IF;

  -- Verificar que el coach pertenezca activamente al club del organizador
  IF NOT EXISTS (
    SELECT 1 FROM public.coach_club_memberships
    WHERE coach_id = p_coach_id
      AND organizador_id = v_org_id
      AND status = 'ACTIVE'
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El coach no tiene membresía activa en este club'
    );
  END IF;

  -- Resolver jugador oficial canónico
  SELECT rj.id, rj.nombre
  INTO v_jugador_id, v_jugador_nombre
  FROM public.riviera_official_player_identity i
  JOIN public.riviera_jugadores rj ON rj.id = i.canonical_riviera_jugador_id
  WHERE upper(trim(i.riviera_id)) = v_norm_riviera_id
  LIMIT 1;

  IF v_jugador_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No se encontró un jugador registrado con ese Riviera ID'
    );
  END IF;

  -- Insertar o reactivar vínculo
  INSERT INTO public.coach_player_relationships (
    coach_id,
    jugador_id,
    organizador_id,
    status
  )
  VALUES (
    p_coach_id,
    v_jugador_id,
    v_org_id,
    'ACTIVE'
  )
  ON CONFLICT (coach_id, jugador_id, organizador_id)
  DO UPDATE SET
    status = 'ACTIVE',
    ended_at = NULL,
    updated_at = now()
  RETURNING id, status, is_primary INTO v_rel_id, v_status, v_is_primary;

  RETURN jsonb_build_object(
    'ok', true,
    'relationship_id', v_rel_id,
    'jugador_id', v_jugador_id,
    'jugador_nombre', v_jugador_nombre,
    'riviera_id', v_norm_riviera_id,
    'status', v_status,
    'is_primary', v_is_primary
  );
END;
$$;

REVOKE ALL ON FUNCTION public.link_player_to_coach_by_riviera_id(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_player_to_coach_by_riviera_id(uuid, text) TO authenticated;

