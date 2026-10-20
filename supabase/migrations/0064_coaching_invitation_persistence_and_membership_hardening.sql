-- =============================================================================
-- 0064_coaching_invitation_persistence_and_membership_hardening.sql
-- Riviera Coaching — Persistencia Real de PENDING, Blindaje RLS y RPCs de Membresía
-- Inmutable: NO modifica 0039 ni 0063. Neutraliza y endurece el backend.
--
-- NOTA DE AUDITORÍA:
-- Este script queda preparado localmente para su futura ejecución controlada.
-- NO se ejecuta automáticamente en producción durante la Entrega B.
-- El próximo número de migración para el Ledger de Clases será 0065.
-- =============================================================================

-- ── 1) Ampliar restricción de status en coach_club_memberships ───────────────
-- El esquema original de 0039 admitía únicamente ('ACTIVE', 'INACTIVE').
-- Se actualiza para admitir 'PENDING' (invitaciones enviadas pendientes de activación).
ALTER TABLE public.coach_club_memberships
  DROP CONSTRAINT IF EXISTS coach_club_memberships_status_check;

ALTER TABLE public.coach_club_memberships
  ADD CONSTRAINT coach_club_memberships_status_check
  CHECK (status IN ('ACTIVE', 'INACTIVE', 'PENDING'));

ALTER TABLE public.coach_club_memberships
  ALTER COLUMN status SET DEFAULT 'PENDING';

-- ── 2) Columnas de auditoría del ciclo de vida de membresías ─────────────────
ALTER TABLE public.coach_club_memberships
  ADD COLUMN IF NOT EXISTS invited_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.coach_club_memberships.status IS
  'Estado de membresía técnica: ACTIVE (operativo), INACTIVE (desactivado), PENDING (invitación oficial enviada).';

-- ── 3) Revocar mutaciones directas sobre coach_club_memberships ──────────────
-- Se revoca INSERT, UPDATE, DELETE a usuarios autenticados y anónimos.
-- Toda mutación debe realizarse exclusivamente a través de funciones seguras
-- (SECURITY DEFINER) o funciones backend autorizadas (service_role).
REVOKE INSERT, UPDATE, DELETE ON public.coach_club_memberships FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.coach_club_memberships TO authenticated;

-- ── 4) Blindaje de políticas RLS en coach_club_memberships ───────────────────
-- Eliminar políticas previas potencialmente permisivas
DROP POLICY IF EXISTS ccm_mutate_org ON public.coach_club_memberships;
DROP POLICY IF EXISTS ccm_select_org ON public.coach_club_memberships;
DROP POLICY IF EXISTS ccm_select_coach ON public.coach_club_memberships;
DROP POLICY IF EXISTS ccm_select ON public.coach_club_memberships;

-- Lectura segura: el organizador puede ver los registros de su club, el coach
-- sus propias membresías, o el Administrador Maestro todas.
CREATE POLICY ccm_select ON public.coach_club_memberships
  FOR SELECT TO authenticated
  USING (
    public.is_master_admin()
    OR organizador_id = auth.uid()
    OR coach_id IN (
      SELECT rc.id FROM public.riviera_coaches rc
      WHERE rc.auth_user_id = auth.uid()
    )
  );

-- ── 5) Búsqueda segura de coaches para invitación (Blindaje 0063) ────────────
-- Asegura que solo organizadores con coaching_enabled = true o Master Admins
-- puedan consultar la existencia global de un coach.
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
  v_has_access boolean;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida';
  END IF;

  v_has_access := public.is_master_admin() OR EXISTS (
    SELECT 1 FROM public.organizador_game_modes ogm
    WHERE ogm.organizador_id = v_org_id
      AND ogm.coaching_enabled = true
  );

  IF NOT v_has_access THEN
    RAISE EXCEPTION 'No autorizado: el club no tiene habilitado Riviera Coaching o carece de permisos de organizador.';
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

-- ── 6) Vinculación endurecida de coach existente (Sustituye 0063) ────────────
-- Neutraliza la inserción directa de 'ACTIVE' de 0063.
-- Registra SIEMPRE la solicitud en estado 'PENDING'.
-- Si ya es 'ACTIVE', lo informa sin duplicar ni alterar.
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
  v_has_access boolean;
  v_existing record;
BEGIN
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Autenticación requerida');
  END IF;

  -- Comprobación estricta de permisos de organizador
  v_has_access := public.is_master_admin() OR EXISTS (
    SELECT 1 FROM public.organizador_game_modes ogm
    WHERE ogm.organizador_id = v_org_id
      AND ogm.coaching_enabled = true
  );

  IF NOT v_has_access THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No autorizado: el club no tiene habilitado Riviera Coaching o carece de permisos de organizador.'
    );
  END IF;

  -- Verificar existencia del coach
  SELECT id, coach_code, nombre, foto_url, bio, especialidades, fuerzas
  INTO v_coach
  FROM public.riviera_coaches
  WHERE id = p_coach_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Coach no encontrado');
  END IF;

  -- Consultar relación previa si existe
  SELECT id, status INTO v_existing
  FROM public.coach_club_memberships
  WHERE coach_id = p_coach_id
    AND organizador_id = v_org_id;

  IF FOUND THEN
    IF v_existing.status = 'ACTIVE' THEN
      RETURN jsonb_build_object(
        'ok', true,
        'already_member', true,
        'membership_id', v_existing.id,
        'status', 'ACTIVE',
        'message', 'El coach ya es miembro activo de tu club.'
      );
    END IF;

    IF v_existing.status = 'PENDING' THEN
      RETURN jsonb_build_object(
        'ok', true,
        'already_member', false,
        'membership_id', v_existing.id,
        'status', 'PENDING',
        'message', 'La solicitud de vinculación ya se encuentra pendiente de aceptación.'
      );
    END IF;

    -- Si estaba INACTIVE, reactivar como solicitud PENDING
    UPDATE public.coach_club_memberships
    SET
      status = 'PENDING',
      invited_by = v_org_id,
      invited_at = now(),
      updated_at = now()
    WHERE id = v_existing.id
    RETURNING id, status INTO v_membership_id, v_status;
  ELSE
    -- Nueva asociación: SIEMPRE en estado PENDING
    INSERT INTO public.coach_club_memberships (
      coach_id,
      organizador_id,
      status,
      invited_by,
      invited_at,
      updated_at
    )
    VALUES (
      p_coach_id,
      v_org_id,
      'PENDING',
      v_org_id,
      now(),
      now()
    )
    RETURNING id, status INTO v_membership_id, v_status;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'already_member', false,
    'membership_id', v_membership_id,
    'status', v_status,
    'message', 'Solicitud de incorporación registrada en estado PENDING.',
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

-- ── 7) Función segura para que un coach acepte formalmente una invitación ────
-- Solo el coach titular autenticado puede aceptar la invitación de su membresía.
CREATE OR REPLACE FUNCTION public.accept_coach_club_invitation(p_membership_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_coach_id uuid;
  v_membership record;
  v_updated_id uuid;
  v_club_authorized boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Autenticación requerida');
  END IF;

  -- Resolver el coach del usuario autenticado
  SELECT id INTO v_coach_id
  FROM public.riviera_coaches
  WHERE auth_user_id = v_user_id;

  IF v_coach_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El usuario actual no tiene perfil de coach registrado'
    );
  END IF;

  -- Obtener la membresía con bloqueo FOR UPDATE para prevenir carreras con desactivación concurrente
  SELECT * INTO v_membership
  FROM public.coach_club_memberships
  WHERE id = p_membership_id
    AND coach_id = v_coach_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Invitación no encontrada o no pertenece a tu perfil de coach'
    );
  END IF;

  -- Comprobar que el club emisor siga autorizado para Riviera Coaching
  v_club_authorized := public.is_master_admin() OR EXISTS (
    SELECT 1 FROM public.organizador_game_modes ogm
    WHERE ogm.organizador_id = v_membership.organizador_id
      AND ogm.coaching_enabled = true
  );

  IF NOT v_club_authorized THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No autorizado: el club no tiene habilitado Riviera Coaching actualmente.'
    );
  END IF;

  -- Estado ACTIVE: idempotente
  IF v_membership.status = 'ACTIVE' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'membership_id', p_membership_id,
      'status', 'ACTIVE',
      'message', 'La invitación ya se encuentra activa.'
    );
  END IF;

  -- Estado INACTIVE: rechazar activación; requiere nueva invitación del club
  IF v_membership.status = 'INACTIVE' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'La membresía se encuentra inactiva. Requiere una nueva invitación formal del club.'
    );
  END IF;

  -- Estado distinto de PENDING
  IF v_membership.status <> 'PENDING' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Solo las invitaciones en estado PENDING pueden ser aceptadas.'
    );
  END IF;

  -- Transición atómica y condicional de PENDING a ACTIVE
  UPDATE public.coach_club_memberships
  SET
    status = 'ACTIVE',
    activated_at = COALESCE(activated_at, now()),
    updated_at = now()
  WHERE id = p_membership_id
    AND coach_id = v_coach_id
    AND status = 'PENDING'
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Conflicto de concurrencia: la invitación ya no se encuentra en estado PENDING.'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'membership_id', p_membership_id,
    'status', 'ACTIVE',
    'message', 'Invitación aceptada exitosamente. Ahora eres coach activo del club.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_coach_club_invitation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_coach_club_invitation(uuid) TO authenticated;

-- ── 8) Función segura para desactivación de un coach por el organizador ───────
-- Desactiva al coach (status = 'INACTIVE') sin eliminar registros ni historial.
-- Solo el organizador titular del club o Master Admin puede ejecutarla.
CREATE OR REPLACE FUNCTION public.deactivate_coach_from_club(
  p_coach_id uuid,
  p_organizador_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_target_org_id uuid;
  v_has_access boolean;
  v_membership record;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Autenticación requerida');
  END IF;

  v_target_org_id := COALESCE(p_organizador_id, v_caller_id);

  -- Comprobación: debe ser el dueño del club o Master Admin
  v_has_access := public.is_master_admin() OR (
    v_caller_id = v_target_org_id
    AND EXISTS (
      SELECT 1 FROM public.organizador_game_modes ogm
      WHERE ogm.organizador_id = v_caller_id
        AND ogm.coaching_enabled = true
    )
  );

  IF NOT v_has_access THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No autorizado: no tienes permisos para administrar este club.'
    );
  END IF;

  -- Buscar membresía
  SELECT id, status INTO v_membership
  FROM public.coach_club_memberships
  WHERE coach_id = p_coach_id
    AND organizador_id = v_target_org_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El coach no tiene registro de membresía en este club.'
    );
  END IF;

  IF v_membership.status = 'INACTIVE' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'membership_id', v_membership.id,
      'status', 'INACTIVE',
      'message', 'El coach ya se encuentra inactivo en tu club.'
    );
  END IF;

  -- Transición controlada a INACTIVE (preservando historial)
  UPDATE public.coach_club_memberships
  SET
    status = 'INACTIVE',
    deactivated_at = now(),
    updated_at = now()
  WHERE id = v_membership.id;

  RETURN jsonb_build_object(
    'ok', true,
    'membership_id', v_membership.id,
    'status', 'INACTIVE',
    'message', 'Coach desactivado del club correctamente.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_coach_from_club(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_coach_from_club(uuid, uuid) TO authenticated;

-- ── 9) Bloquear mutaciones directas y vinculaciones prematuras de alumnos (Entrega B) ─
-- La Entrega B se limita a Club -> Coach (identidad, invitaciones y membresías).
-- El modelo operativo definitivo establece que el COACH será quien vincule a sus
-- alumnos por Riviera ID y registre sus clases disponibles (Entrega C).
-- Se revocan mutaciones directas y se neutraliza cualquier vinculación prematura.

-- Revocar mutaciones sobre coach_player_relationships
REVOKE INSERT, UPDATE, DELETE ON public.coach_player_relationships FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.coach_player_relationships TO authenticated;

-- Eliminar políticas de mutación de relaciones coach-alumno de 0039 y 0063
DROP POLICY IF EXISTS cpr_insert_coach ON public.coach_player_relationships;
DROP POLICY IF EXISTS cpr_insert_org ON public.coach_player_relationships;
DROP POLICY IF EXISTS cpr_update_coach_or_org ON public.coach_player_relationships;
DROP POLICY IF EXISTS cpr_delete_org ON public.coach_player_relationships;

-- Neutralizar la RPC link_player_to_coach_by_riviera_id de 0063 hasta la Entrega C
CREATE OR REPLACE FUNCTION public.link_player_to_coach_by_riviera_id(
  p_coach_id uuid,
  p_riviera_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN jsonb_build_object(
    'ok', false,
    'error', 'La vinculación operativa de alumnos está reservada para la Entrega C (Coach -> Alumno por Riviera ID).'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.link_player_to_coach_by_riviera_id(uuid, text) FROM PUBLIC, anon, authenticated;

