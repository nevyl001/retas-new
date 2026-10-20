-- ==============================================================================
-- 0070_coaching_club_coach_management.sql
-- Riviera Coaching — Panel Administrativo Individual, Edición Local y Gestión de Membresías
-- ==============================================================================

-- 1. ACTUALIZAR CHECK CONSTRAINT DE STATUS EN coach_club_memberships
-- Permite los estados: ACTIVE, INACTIVE, PENDING, CANCELLED, ARCHIVED
ALTER TABLE public.coach_club_memberships
  DROP CONSTRAINT IF EXISTS coach_club_memberships_status_check;

ALTER TABLE public.coach_club_memberships
  ADD CONSTRAINT coach_club_memberships_status_check
  CHECK (status IN ('ACTIVE', 'INACTIVE', 'PENDING', 'CANCELLED', 'ARCHIVED'));

-- 2. CAMPOS DE CONFIGURACIÓN PROPIOS DEL CLUB EN coach_club_memberships
-- Respeta la separación estricta: los datos del club no modifican la identidad global de riviera_coaches
ALTER TABLE public.coach_club_memberships
  ADD COLUMN IF NOT EXISTS club_fuerzas text[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS club_especialidades text[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS club_notas text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS club_disponibilidad text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_edited_by uuid REFERENCES auth.users(id) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_edited_at timestamptz DEFAULT NULL;

-- 3. TABLA DE AUDITORÍA DE MEMBRESÍAS DEL CLUB
CREATE TABLE IF NOT EXISTS public.coach_club_membership_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL REFERENCES public.coach_club_memberships(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES public.riviera_coaches(id) ON DELETE CASCADE,
  organizador_id uuid NOT NULL,
  action text NOT NULL,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_status text,
  new_status text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_audit_membership
  ON public.coach_club_membership_audit_log(membership_id);

CREATE INDEX IF NOT EXISTS idx_coach_audit_org
  ON public.coach_club_membership_audit_log(organizador_id);

CREATE INDEX IF NOT EXISTS idx_coach_audit_coach
  ON public.coach_club_membership_audit_log(coach_id);

ALTER TABLE public.coach_club_membership_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ccm_audit_select ON public.coach_club_membership_audit_log;
CREATE POLICY ccm_audit_select ON public.coach_club_membership_audit_log
  FOR SELECT
  TO authenticated
  USING (
    organizador_id = auth.uid()
    OR coach_id = public.current_riviera_coach_id()
    OR COALESCE(public.is_master_admin(), false)
  );

GRANT SELECT ON public.coach_club_membership_audit_log TO authenticated;
GRANT ALL ON public.coach_club_membership_audit_log TO service_role;

-- 4. RPC: ACTUALIZAR CONFIGURACIÓN PROPIA DEL CLUB PARA UN ENTRENADOR
CREATE OR REPLACE FUNCTION public.update_coach_club_membership_settings(
  p_organizador_id uuid,
  p_coach_id uuid,
  p_club_fuerzas text[],
  p_club_especialidades text[],
  p_club_notas text,
  p_club_disponibilidad text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_membership record;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  IF v_caller <> p_organizador_id AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No tienes permisos para administrar coaches en este club.');
  END IF;

  SELECT id, status INTO v_membership
  FROM public.coach_club_memberships
  WHERE coach_id = p_coach_id AND organizador_id = p_organizador_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El entrenador no tiene membresía registrada en este club.');
  END IF;

  UPDATE public.coach_club_memberships
  SET
    club_fuerzas = p_club_fuerzas,
    club_especialidades = p_club_especialidades,
    club_notas = p_club_notas,
    club_disponibilidad = p_club_disponibilidad,
    last_edited_by = v_caller,
    last_edited_at = now(),
    updated_at = now()
  WHERE id = v_membership.id;

  -- Registrar en auditoría
  INSERT INTO public.coach_club_membership_audit_log (
    membership_id, coach_id, organizador_id, action, performed_by,
    previous_status, new_status, details
  ) VALUES (
    v_membership.id, p_coach_id, p_organizador_id, 'UPDATE_SETTINGS', v_caller,
    v_membership.status, v_membership.status,
    jsonb_build_object(
      'fuerzas', p_club_fuerzas,
      'especialidades', p_club_especialidades,
      'notas', p_club_notas,
      'disponibilidad', p_club_disponibilidad
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'message', 'Configuración del entrenador actualizada correctamente para este club.'
  );
END;
$$;

-- 5. RPC: CANCELAR INVITACIÓN PENDIENTE
CREATE OR REPLACE FUNCTION public.cancel_coach_club_invitation(
  p_organizador_id uuid,
  p_coach_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_membership record;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  IF v_caller <> p_organizador_id AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No tienes permisos para administrar este club.');
  END IF;

  SELECT id, status INTO v_membership
  FROM public.coach_club_memberships
  WHERE coach_id = p_coach_id AND organizador_id = p_organizador_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No se encontró la invitación para este entrenador en tu club.');
  END IF;

  IF v_membership.status <> 'PENDING' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo las invitaciones en estado PENDING pueden ser canceladas.');
  END IF;

  UPDATE public.coach_club_memberships
  SET
    status = 'CANCELLED',
    cancelled_at = now(),
    last_edited_by = v_caller,
    last_edited_at = now(),
    updated_at = now()
  WHERE id = v_membership.id;

  INSERT INTO public.coach_club_membership_audit_log (
    membership_id, coach_id, organizador_id, action, performed_by,
    previous_status, new_status, details
  ) VALUES (
    v_membership.id, p_coach_id, p_organizador_id, 'CANCEL_INVITATION', v_caller,
    'PENDING', 'CANCELLED', jsonb_build_object('cancelled_at', now())
  );

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'CANCELLED',
    'message', 'Invitación cancelada correctamente. El coach no podrá activarse con esta invitación.'
  );
END;
$$;

-- 6. RPC: ARCHIVAR Y DESARCHIVAR COACH DEL CLUB
CREATE OR REPLACE FUNCTION public.archive_coach_from_club(
  p_organizador_id uuid,
  p_coach_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_membership record;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  IF v_caller <> p_organizador_id AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No tienes permisos para administrar este club.');
  END IF;

  SELECT id, status INTO v_membership
  FROM public.coach_club_memberships
  WHERE coach_id = p_coach_id AND organizador_id = p_organizador_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No se encontró la membresía del entrenador.');
  END IF;

  IF v_membership.status = 'ACTIVE' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Primero debes desvincular al entrenador antes de archivarlo.');
  END IF;

  UPDATE public.coach_club_memberships
  SET
    status = 'ARCHIVED',
    archived_at = now(),
    last_edited_by = v_caller,
    last_edited_at = now(),
    updated_at = now()
  WHERE id = v_membership.id;

  INSERT INTO public.coach_club_membership_audit_log (
    membership_id, coach_id, organizador_id, action, performed_by,
    previous_status, new_status, details
  ) VALUES (
    v_membership.id, p_coach_id, p_organizador_id, 'ARCHIVE_COACH', v_caller,
    v_membership.status, 'ARCHIVED', jsonb_build_object('archived_at', now())
  );

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'ARCHIVED',
    'message', 'Entrenador archivado. Oculto de la lista principal.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.unarchive_coach_from_club(
  p_organizador_id uuid,
  p_coach_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_membership record;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  IF v_caller <> p_organizador_id AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No tienes permisos para administrar este club.');
  END IF;

  SELECT id, status INTO v_membership
  FROM public.coach_club_memberships
  WHERE coach_id = p_coach_id AND organizador_id = p_organizador_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No se encontró la membresía del entrenador.');
  END IF;

  IF v_membership.status <> 'ARCHIVED' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La membresía no se encuentra archivada.');
  END IF;

  UPDATE public.coach_club_memberships
  SET
    status = 'INACTIVE',
    archived_at = NULL,
    last_edited_by = v_caller,
    last_edited_at = now(),
    updated_at = now()
  WHERE id = v_membership.id;

  INSERT INTO public.coach_club_membership_audit_log (
    membership_id, coach_id, organizador_id, action, performed_by,
    previous_status, new_status, details
  ) VALUES (
    v_membership.id, p_coach_id, p_organizador_id, 'UNARCHIVE_COACH', v_caller,
    'ARCHIVED', 'INACTIVE', jsonb_build_object('unarchived_at', now())
  );

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'INACTIVE',
    'message', 'Entrenador restaurado a la lista como inactivo.'
  );
END;
$$;

-- 7. ACTUALIZAR link_existing_coach_to_club PARA ADMITIR ARCHIVED Y CANCELLED
CREATE OR REPLACE FUNCTION public.link_existing_coach_to_club(p_coach_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

    -- Si estaba INACTIVE, CANCELLED o ARCHIVED, reactivar como solicitud PENDING
    UPDATE public.coach_club_memberships
    SET
      status = 'PENDING',
      invited_by = v_org_id,
      invited_at = now(),
      cancelled_at = NULL,
      archived_at = NULL,
      updated_at = now()
    WHERE id = v_existing.id
    RETURNING id, status INTO v_membership_id, v_status;

    INSERT INTO public.coach_club_membership_audit_log (
      membership_id, coach_id, organizador_id, action, performed_by,
      previous_status, new_status, details
    ) VALUES (
      v_existing.id, p_coach_id, v_org_id, 'REINVITE_COACH', v_org_id,
      v_existing.status, 'PENDING', jsonb_build_object('invited_at', now())
    );
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

    INSERT INTO public.coach_club_membership_audit_log (
      membership_id, coach_id, organizador_id, action, performed_by,
      previous_status, new_status, details
    ) VALUES (
      v_membership_id, p_coach_id, v_org_id, 'INITIAL_INVITE', v_org_id,
      NULL, 'PENDING', jsonb_build_object('invited_at', now())
    );
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

-- 8. RPC DEFINITIVA: get_club_coach_detail (Panel Individual Completo)
-- Consulta exclusiva para el organizador del club autenticado con todos los datos de su actividad
CREATE OR REPLACE FUNCTION public.get_club_coach_detail(
  p_organizador_id uuid,
  p_coach_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_coach record;
  v_membership record;
  v_club record;
  v_students jsonb;
  v_sessions jsonb;
  v_ledger jsonb;
  v_audit jsonb;
  v_total_assigned integer := 0;
  v_total_given integer := 0;
  v_current_balance integer := 0;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  IF v_caller <> p_organizador_id AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No tienes permisos para consultar la actividad de este club.');
  END IF;

  -- 1. Consultar perfil del coach
  SELECT
    c.id, c.coach_code, c.nombre, c.foto_url, c.bio, c.filosofia,
    c.especialidades, c.fuerzas, c.certificaciones, c.experiencia,
    c.created_at, u.email
  INTO v_coach
  FROM public.riviera_coaches c
  LEFT JOIN auth.users u ON u.id = c.auth_user_id
  WHERE c.id = p_coach_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Coach no encontrado.');
  END IF;

  -- 2. Consultar membresía del coach en este club
  SELECT
    m.id, m.status, m.invited_at, m.activated_at, m.deactivated_at,
    m.cancelled_at, m.archived_at, m.club_fuerzas, m.club_especialidades,
    m.club_notas, m.club_disponibilidad, m.last_edited_at, m.created_at
  INTO v_membership
  FROM public.coach_club_memberships m
  WHERE m.coach_id = p_coach_id AND m.organizador_id = p_organizador_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El coach no tiene registro de membresía en este club.');
  END IF;

  -- 3. Consultar datos del club
  SELECT u.id, COALESCE(u.name, ogm.branding_key, 'Club Riviera') as nombre, ogm.branding_key
  INTO v_club
  FROM public.users u
  LEFT JOIN public.organizador_game_modes ogm ON ogm.organizador_id = u.id
  WHERE u.id = p_organizador_id;

  -- 4. Consultar alumnos vinculados en este club
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'relationship_id', r.id,
      'jugador_id', r.jugador_id,
      'nombre', rj.nombre,
      'foto_url', rj.foto_url,
      'categoria', rj.categoria,
      'rama', rj.genero,
      'genero', rj.genero,
      'riviera_id', COALESCE(
        (SELECT i.riviera_id FROM public.riviera_official_player_identity i WHERE i.canonical_riviera_jugador_id = r.jugador_id LIMIT 1),
        ''
      ),
      'is_primary', r.is_primary,
      'status', r.status,
      'started_at', r.started_at,
      'balance_classes', COALESCE(b.balance_classes, 0),
      'total_classes_given', COALESCE(b.total_classes_given, 0),
      'updated_at', b.updated_at
    ) ORDER BY r.status ASC, r.created_at DESC
  ), '[]'::jsonb)
  INTO v_students
  FROM public.coach_player_relationships r
  JOIN public.riviera_jugadores rj ON rj.id = r.jugador_id
  LEFT JOIN public.coach_player_class_balances b ON b.relationship_id = r.id
  WHERE r.coach_id = p_coach_id AND r.organizador_id = p_organizador_id;

  -- 5. Sesiones impartidas por este coach en este club
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'relationship_id', s.relationship_id,
      'jugador_nombre', COALESCE(rj.nombre, 'Alumno'),
      'starts_at', s.starts_at,
      'ends_at', s.ends_at,
      'duration_minutes', s.duration_minutes,
      'focus', s.focus,
      'worked_on', s.worked_on,
      'notes_summary', s.notes_summary,
      'status', s.status,
      'created_at', s.created_at
    ) ORDER BY s.starts_at DESC
  ), '[]'::jsonb)
  INTO v_sessions
  FROM public.coach_sessions s
  LEFT JOIN public.coach_player_relationships r ON r.id = s.relationship_id
  LEFT JOIN public.riviera_jugadores rj ON rj.id = r.jugador_id
  WHERE s.coach_id = p_coach_id AND s.organizador_id = p_organizador_id;

  -- 6. Historial inmutable de movimientos (Ledger de clases en este club)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', l.id,
      'relationship_id', l.relationship_id,
      'jugador_id', l.jugador_id,
      'jugador_nombre', COALESCE(rj.nombre, 'Alumno'),
      'delta', l.delta,
      'tipo', l.tipo,
      'notas', l.notas,
      'recorded_by', l.recorded_by,
      'created_at', l.created_at
    ) ORDER BY l.created_at DESC
  ), '[]'::jsonb)
  INTO v_ledger
  FROM public.coach_class_ledger l
  LEFT JOIN public.riviera_jugadores rj ON rj.id = l.jugador_id
  WHERE l.coach_id = p_coach_id AND l.organizador_id = p_organizador_id;

  -- 7. Métricas acumuladas del coach en este club
  SELECT
    COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN delta < 0 THEN ABS(delta) ELSE 0 END), 0),
    COALESCE(SUM(delta), 0)
  INTO v_total_assigned, v_total_given, v_current_balance
  FROM public.coach_class_ledger
  WHERE coach_id = p_coach_id AND organizador_id = p_organizador_id;

  -- 8. Auditoría de acciones sobre la membresía del club
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'action', a.action,
      'previous_status', a.previous_status,
      'new_status', a.new_status,
      'details', a.details,
      'created_at', a.created_at
    ) ORDER BY a.created_at DESC
  ), '[]'::jsonb)
  INTO v_audit
  FROM public.coach_club_membership_audit_log a
  WHERE a.membership_id = v_membership.id;

  RETURN jsonb_build_object(
    'ok', true,
    'coach', jsonb_build_object(
      'id', v_coach.id,
      'coach_code', v_coach.coach_code,
      'nombre', v_coach.nombre,
      'email', v_coach.email,
      'foto_url', v_coach.foto_url,
      'bio', v_coach.bio,
      'filosofia', v_coach.filosofia,
      'certificaciones', v_coach.certificaciones,
      'experiencia', v_coach.experiencia,
      'especialidades', v_coach.especialidades,
      'fuerzas', v_coach.fuerzas,
      'created_at', v_coach.created_at
    ),
    'membership', jsonb_build_object(
      'id', v_membership.id,
      'status', v_membership.status,
      'invited_at', v_membership.invited_at,
      'activated_at', v_membership.activated_at,
      'deactivated_at', v_membership.deactivated_at,
      'cancelled_at', v_membership.cancelled_at,
      'archived_at', v_membership.archived_at,
      'club_fuerzas', v_membership.club_fuerzas,
      'club_especialidades', v_membership.club_especialidades,
      'club_notas', v_membership.club_notas,
      'club_disponibilidad', v_membership.club_disponibilidad,
      'last_edited_at', v_membership.last_edited_at,
      'created_at', v_membership.created_at
    ),
    'club', jsonb_build_object(
      'id', v_club.id,
      'nombre', v_club.nombre,
      'branding_key', v_club.branding_key
    ),
    'students', v_students,
    'sessions', v_sessions,
    'ledger', v_ledger,
    'audit_log', v_audit,
    'stats', jsonb_build_object(
      'total_students', jsonb_array_length(v_students),
      'active_students', (
        SELECT count(*)
        FROM public.coach_player_relationships
        WHERE coach_id = p_coach_id AND organizador_id = p_organizador_id AND status = 'ACTIVE'
      ),
      'total_classes_assigned', v_total_assigned,
      'total_classes_given', v_total_given,
      'current_balance', v_current_balance
    )
  );
END;
$$;

-- 9. PERMISOS Y PRIVILEGIOS EXPLÍCITOS
GRANT EXECUTE ON FUNCTION public.update_coach_club_membership_settings(uuid, uuid, text[], text[], text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_coach_club_invitation(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.archive_coach_from_club(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unarchive_coach_from_club(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_club_coach_detail(uuid, uuid) TO authenticated, service_role;
