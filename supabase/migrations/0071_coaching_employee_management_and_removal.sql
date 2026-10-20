-- ==============================================================================
-- 0071_coaching_employee_management_and_removal.sql
-- Riviera Coaching — Gestión de Empleados, Eliminación de Coaches,
-- Privacidad de Notas del Club, Protección de Auditoría y Seguimiento de Clases
-- ==============================================================================

-- ── 1. ACTUALIZAR CHECK CONSTRAINT EN coach_club_memberships ─────────────────
-- Permitir estado 'REMOVED' además de ACTIVE, INACTIVE, PENDING, CANCELLED, ARCHIVED
ALTER TABLE public.coach_club_memberships
  DROP CONSTRAINT IF EXISTS coach_club_memberships_status_check;

ALTER TABLE public.coach_club_memberships
  ADD CONSTRAINT coach_club_memberships_status_check
  CHECK (status IN ('ACTIVE', 'INACTIVE', 'PENDING', 'CANCELLED', 'ARCHIVED', 'REMOVED'));

-- Agregar columnas de eliminación atómica y trazabilidad
ALTER TABLE public.coach_club_memberships
  ADD COLUMN IF NOT EXISTS removed_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS removal_reason text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS removed_by uuid REFERENCES auth.users(id) DEFAULT NULL;

-- ── 2. SEPARACIÓN Y PRIVACIDAD TOTAL DE NOTAS DEL CLUB ───────────────────────
-- Las notas y disponibilidad interna del club se aíslan en una tabla privada.
-- El entrenador tiene CERO permisos de lectura sobre esta tabla.
CREATE TABLE IF NOT EXISTS public.coach_club_private_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizador_id uuid NOT NULL,
  coach_id uuid NOT NULL REFERENCES public.riviera_coaches(id) ON DELETE CASCADE,
  club_notas text,
  club_disponibilidad text,
  last_edited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_edited_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coach_club_private_notes_org_coach_key UNIQUE (organizador_id, coach_id)
);

CREATE INDEX IF NOT EXISTS idx_coach_private_notes_org_coach
  ON public.coach_club_private_notes(organizador_id, coach_id);

-- Migrar notas existentes desde coach_club_memberships
INSERT INTO public.coach_club_private_notes (organizador_id, coach_id, club_notas, club_disponibilidad, last_edited_by, last_edited_at)
SELECT organizador_id, coach_id, club_notas, club_disponibilidad, last_edited_by, last_edited_at
FROM public.coach_club_memberships
WHERE (club_notas IS NOT NULL AND club_notas <> '')
   OR (club_disponibilidad IS NOT NULL AND club_disponibilidad <> '')
ON CONFLICT (organizador_id, coach_id) DO UPDATE SET
  club_notas = EXCLUDED.club_notas,
  club_disponibilidad = EXCLUDED.club_disponibilidad,
  last_edited_by = EXCLUDED.last_edited_by,
  last_edited_at = EXCLUDED.last_edited_at;

-- Limpiar las notas de coach_club_memberships para que no queden expuestas en lecturas de membresía
UPDATE public.coach_club_memberships
SET club_notas = NULL;

-- RLS en coach_club_private_notes: EXCLUSIVO del organizador del club o Master Admin
ALTER TABLE public.coach_club_private_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ccpn_org_select ON public.coach_club_private_notes;
CREATE POLICY ccpn_org_select ON public.coach_club_private_notes
  FOR SELECT
  TO authenticated
  USING (
    organizador_id = auth.uid()
    OR COALESCE(public.is_master_admin(), false)
  );

DROP POLICY IF EXISTS ccpn_org_all ON public.coach_club_private_notes;
CREATE POLICY ccpn_org_all ON public.coach_club_private_notes
  FOR ALL
  TO authenticated
  USING (
    organizador_id = auth.uid()
    OR COALESCE(public.is_master_admin(), false)
  )
  WITH CHECK (
    organizador_id = auth.uid()
    OR COALESCE(public.is_master_admin(), false)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_club_private_notes TO authenticated;
GRANT ALL ON public.coach_club_private_notes TO service_role;

-- ── 3. PROTECCIÓN DE AUDITORÍA (coach_club_membership_audit_log) ──────────────
-- Permitir que membership_id sea nulo en caso de desvinculación sin cascadas destructivas
ALTER TABLE public.coach_club_membership_audit_log
  ALTER COLUMN membership_id DROP NOT NULL;

-- Corregir política de lectura: el entrenador NUNCA debe consultar la auditoría interna del club
DROP POLICY IF EXISTS ccm_audit_select ON public.coach_club_membership_audit_log;
CREATE POLICY ccm_audit_select ON public.coach_club_membership_audit_log
  FOR SELECT
  TO authenticated
  USING (
    organizador_id = auth.uid()
    OR COALESCE(public.is_master_admin(), false)
  );

-- ── 4. EXTENSIÓN DE SEGUIMIENTO EN coach_sessions ────────────────────────────
-- Campos para temas trabajados, mejoras observadas, próximos objetivos y mensaje motivante
ALTER TABLE public.coach_sessions
  ADD COLUMN IF NOT EXISTS improvements text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS next_goals text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS motivational_message text DEFAULT NULL;

-- ── 5. RPC ATÓMICA: remove_coach_from_club ────────────────────────────────────
-- Elimina a un entrenador del club en CUALQUIER MOMENTO y desde CUALQUIER ESTADO
-- (PENDING, ACTIVE, INACTIVE, CANCELLED, ARCHIVED).
-- No destruye historial ni saldos ni la identidad global del entrenador.
CREATE OR REPLACE FUNCTION public.remove_coach_from_club(
  p_organizador_id uuid,
  p_coach_id uuid,
  p_motivo text DEFAULT NULL
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
  v_now timestamptz := now();
BEGIN
  -- 1. Validar autenticación
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  -- 2. Validar que el solicitante es dueño autorizado del club o Administrador Maestro
  IF v_caller <> p_organizador_id AND NOT v_is_master THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No tienes permisos para eliminar entrenadores de este club.'
    );
  END IF;

  -- 3. Bloquear la membresía correspondiente para evitar carreras de estado
  SELECT id, status, organizador_id, coach_id
  INTO v_membership
  FROM public.coach_club_memberships
  WHERE coach_id = p_coach_id AND organizador_id = p_organizador_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El entrenador no tiene asociación registrada en este club.'
    );
  END IF;

  -- 4. Idempotencia: si ya estaba eliminado, devolver éxito sin efectos adicionales
  IF v_membership.status = 'REMOVED' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'status', 'REMOVED',
      'message', 'El entrenador ya había sido eliminado de este club previamente.'
    );
  END IF;

  -- 5. Revocar inmediatamente los permisos operativos en este club y marcar como REMOVED
  UPDATE public.coach_club_memberships
  SET
    status = 'REMOVED',
    removed_at = v_now,
    removal_reason = NULLIF(trim(p_motivo), ''),
    removed_by = v_caller,
    deactivated_at = COALESCE(deactivated_at, v_now),
    archived_at = COALESCE(archived_at, v_now),
    last_edited_by = v_caller,
    last_edited_at = v_now,
    updated_at = v_now
  WHERE id = v_membership.id;

  -- 6. Suspender relaciones activas de alumnos en este club para este coach
  -- Conserva saldos, historial y relaciones; previene nuevas clases hasta reasignar
  UPDATE public.coach_player_relationships
  SET
    status = 'PAUSED',
    updated_at = v_now
  WHERE organizador_id = p_organizador_id
    AND coach_id = p_coach_id
    AND status = 'ACTIVE';

  -- 7. Registrar en la bitácora de auditoría inmutable
  INSERT INTO public.coach_club_membership_audit_log (
    membership_id,
    coach_id,
    organizador_id,
    action,
    performed_by,
    previous_status,
    new_status,
    details
  ) VALUES (
    v_membership.id,
    p_coach_id,
    p_organizador_id,
    'REMOVE_COACH',
    v_caller,
    v_membership.status,
    'REMOVED',
    jsonb_build_object(
      'motivo', NULLIF(trim(p_motivo), ''),
      'removed_at', v_now
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'status', 'REMOVED',
    'message', 'Entrenador eliminado de tu club exitosamente. Se ha conservado todo el historial de actividades.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.remove_coach_from_club(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_coach_from_club(uuid, uuid, text) TO authenticated, service_role;

-- ── 6. ACTUALIZAR RPC get_club_coach_detail ───────────────────────────────────
-- Integra lectura de notas privadas desde coach_club_private_notes y campos de seguimiento
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
  v_private_notes record;
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

  -- 1. Consultar perfil global del coach
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
    m.cancelled_at, m.archived_at, m.removed_at, m.removal_reason,
    m.club_fuerzas, m.club_especialidades, m.last_edited_at, m.created_at
  INTO v_membership
  FROM public.coach_club_memberships m
  WHERE m.coach_id = p_coach_id AND m.organizador_id = p_organizador_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El coach no tiene registro de membresía en este club.');
  END IF;

  -- 3. Consultar notas privadas aisladas (exclusivas del club)
  SELECT club_notas, club_disponibilidad
  INTO v_private_notes
  FROM public.coach_club_private_notes
  WHERE organizador_id = p_organizador_id AND coach_id = p_coach_id;

  -- 4. Consultar datos del club
  SELECT u.id, COALESCE(u.name, ogm.branding_key, 'Club Riviera') as nombre, ogm.branding_key
  INTO v_club
  FROM public.users u
  LEFT JOIN public.organizador_game_modes ogm ON ogm.organizador_id = u.id
  WHERE u.id = p_organizador_id;

  -- 5. Consultar alumnos vinculados en este club
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

  -- 6. Sesiones impartidas por este coach en este club con detalle de seguimiento
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
      'improvements', s.improvements,
      'next_goals', s.next_goals,
      'motivational_message', s.motivational_message,
      'status', s.status,
      'created_at', s.created_at
    ) ORDER BY s.starts_at DESC
  ), '[]'::jsonb)
  INTO v_sessions
  FROM public.coach_sessions s
  LEFT JOIN public.coach_player_relationships r ON r.id = s.relationship_id
  LEFT JOIN public.riviera_jugadores rj ON rj.id = r.jugador_id
  WHERE s.coach_id = p_coach_id AND s.organizador_id = p_organizador_id;

  -- 7. Historial de movimientos (Ledger de clases en este club)
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

  -- 8. Bitácora de auditoría confidencial del club
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
  WHERE a.coach_id = p_coach_id AND a.organizador_id = p_organizador_id;

  -- 9. Métricas agregadas
  SELECT
    COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN delta < 0 THEN ABS(delta) ELSE 0 END), 0)
  INTO v_total_assigned, v_total_given
  FROM public.coach_class_ledger
  WHERE coach_id = p_coach_id AND organizador_id = p_organizador_id;

  SELECT COALESCE(SUM(balance_classes), 0)
  INTO v_current_balance
  FROM public.coach_player_class_balances
  WHERE coach_id = p_coach_id AND organizador_id = p_organizador_id;

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
      'especialidades', v_coach.especialidades,
      'fuerzas', v_coach.fuerzas,
      'certificaciones', v_coach.certificaciones,
      'experiencia', v_coach.experiencia,
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
      'removed_at', v_membership.removed_at,
      'removal_reason', v_membership.removal_reason,
      'club_fuerzas', v_membership.club_fuerzas,
      'club_especialidades', v_membership.club_especialidades,
      'club_notas', v_private_notes.club_notas,
      'club_disponibilidad', v_private_notes.club_disponibilidad,
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
        SELECT COUNT(*) FROM public.coach_player_relationships
        WHERE coach_id = p_coach_id AND organizador_id = p_organizador_id AND status = 'ACTIVE'
      ),
      'total_classes_assigned', v_total_assigned,
      'total_classes_given', v_total_given,
      'current_balance', v_current_balance
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_club_coach_detail(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_club_coach_detail(uuid, uuid) TO authenticated, service_role;

-- ── 7. ACTUALIZAR RPC update_coach_club_membership_settings ──────────────────
-- Guarda club_notas y club_disponibilidad en coach_club_private_notes
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

  -- 1. Actualizar configuración pública del club en coach_club_memberships
  UPDATE public.coach_club_memberships
  SET
    club_fuerzas = p_club_fuerzas,
    club_especialidades = p_club_especialidades,
    club_notas = NULL, -- Notas administrativas privadas aisladas fuera de esta tabla
    last_edited_by = v_caller,
    last_edited_at = now(),
    updated_at = now()
  WHERE id = v_membership.id;

  -- 2. Guardar notas privadas en coach_club_private_notes (inaccesible para el coach)
  INSERT INTO public.coach_club_private_notes (
    organizador_id,
    coach_id,
    club_notas,
    club_disponibilidad,
    last_edited_by,
    last_edited_at
  ) VALUES (
    p_organizador_id,
    p_coach_id,
    p_club_notas,
    p_club_disponibilidad,
    v_caller,
    now()
  )
  ON CONFLICT (organizador_id, coach_id) DO UPDATE SET
    club_notas = EXCLUDED.club_notas,
    club_disponibilidad = EXCLUDED.club_disponibilidad,
    last_edited_by = v_caller,
    last_edited_at = now();

  -- 3. Registrar auditoría
  INSERT INTO public.coach_club_membership_audit_log (
    membership_id, coach_id, organizador_id, action, performed_by,
    previous_status, new_status, details
  ) VALUES (
    v_membership.id, p_coach_id, p_organizador_id, 'UPDATE_SETTINGS', v_caller,
    v_membership.status, v_membership.status,
    jsonb_build_object(
      'fuerzas', p_club_fuerzas,
      'especialidades', p_club_especialidades
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'message', 'Configuración del entrenador actualizada correctamente para este club.'
  );
END;
$$;

-- ── 8. ACTUALIZAR RPC record_coach_class_session ──────────────────────────────
-- Soporta campos de seguimiento: worked_on, improvements, next_goals, motivational_message
CREATE OR REPLACE FUNCTION public.record_coach_class_session(
  p_relationship_id uuid,
  p_notas text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_session_id uuid DEFAULT NULL,
  p_worked_on text[] DEFAULT '{}',
  p_improvements text DEFAULT NULL,
  p_next_goals text DEFAULT NULL,
  p_motivational_message text DEFAULT NULL,
  p_duration_minutes integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_rel record;
  v_coach record;
  v_membership record;
  v_sess record;
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_balance record;
  v_new_balance integer;
  v_new_total integer;
  v_trimmed_key text := NULLIF(trim(p_idempotency_key), '');
  v_session_id uuid := p_session_id;
  v_existing_op record;
  v_effective_duration integer := COALESCE(p_duration_minutes, 60);
BEGIN
  -- 1. Validar identidad del invocador
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  -- 2. Exigir clave de idempotencia obligatoria
  IF v_trimmed_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Clave de idempotencia requerida para registrar la clase impartida.');
  END IF;

  -- 3. Obtener relación coach-alumno
  SELECT r.id, r.organizador_id, r.coach_id, r.jugador_id, r.status
  INTO v_rel
  FROM public.coach_player_relationships r
  WHERE r.id = p_relationship_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Relación coach-alumno no encontrada.');
  END IF;

  IF v_rel.status <> 'ACTIVE' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No se puede registrar una clase en una relación inactiva o finalizada.');
  END IF;

  -- 4. Obtener datos del coach asignado
  SELECT id, auth_user_id, nombre INTO v_coach
  FROM public.riviera_coaches
  WHERE id = v_rel.coach_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Perfil de coach no encontrado.');
  END IF;

  -- 5. Autorización: El coach que imparte la clase, el organizador del club o Master Admin
  IF v_coach.auth_user_id <> v_caller AND v_rel.organizador_id <> v_caller AND v_is_master IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No tienes autorización para registrar clases para este alumno.');
  END IF;

  -- 6. OBLIGATORIO: Comprobar que el coach tiene membresía ACTIVE en el club (no REMOVED ni INACTIVE)
  SELECT id, status INTO v_membership
  FROM public.coach_club_memberships
  WHERE coach_id = v_rel.coach_id AND organizador_id = v_rel.organizador_id;

  IF NOT FOUND OR v_membership.status <> 'ACTIVE' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El coach no cuenta con una asociación activa con el club correspondiente.'
    );
  END IF;

  -- 7. Comprobar que el club tiene coaching habilitado
  IF NOT EXISTS (
    SELECT 1 FROM public.organizador_game_modes
    WHERE organizador_id = v_rel.organizador_id AND coaching_enabled = true
  ) AND v_is_master IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El club no tiene el servicio de Coaching habilitado.'
    );
  END IF;

  -- 8. Validar Idempotencia después de autorizaciones y verificar coincidencia estricta
  SELECT id, tipo, relationship_id, organizador_id, recorded_by, delta, session_id
  INTO v_existing_op
  FROM public.coach_class_ledger
  WHERE idempotency_key = v_trimmed_key;

  IF FOUND THEN
    IF v_existing_op.recorded_by <> v_caller
       OR v_existing_op.relationship_id <> p_relationship_id
       OR v_existing_op.tipo <> 'CLASS_DEBIT'
       OR v_existing_op.delta <> -1 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'Conflicto de idempotencia: la clave ya fue utilizada en otra operación o con parámetros distintos.'
      );
    END IF;

    SELECT balance_classes, total_classes_given INTO v_balance
    FROM public.coach_player_class_balances
    WHERE relationship_id = p_relationship_id;

    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'session_id', v_existing_op.session_id,
      'remaining_balance', COALESCE(v_balance.balance_classes, 0),
      'total_classes_given', COALESCE(v_balance.total_classes_given, 0),
      'message', 'Operación idempotente: esta clase ya había sido registrada previamente.'
    );
  END IF;

  -- 9. Bloquear y verificar saldo disponible (FOR UPDATE previene condiciones de carrera concurrentes)
  SELECT id, balance_classes, total_classes_given
  INTO v_balance
  FROM public.coach_player_class_balances
  WHERE relationship_id = v_rel.id
  FOR UPDATE;

  IF NOT FOUND OR v_balance.balance_classes < 1 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El alumno no tiene clases disponibles. Solicita al club asignar nuevas clases.'
    );
  END IF;

  -- 10. Gestión de la Sesión Real (Identidad propia y regla: 1 sesión = 1 descuento)
  IF v_session_id IS NOT NULL THEN
    SELECT id, coach_id, organizador_id, status INTO v_sess
    FROM public.coach_sessions
    WHERE id = v_session_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Sesión de coaching no encontrada.');
    END IF;

    IF v_sess.coach_id <> v_rel.coach_id OR v_sess.organizador_id <> v_rel.organizador_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'La sesión no coincide con el coach o el club correspondiente.');
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.coach_class_ledger WHERE session_id = v_session_id
    ) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'Esta sesión ya generó un descuento de clase previamente.'
      );
    END IF;

    UPDATE public.coach_sessions
    SET status = 'COMPLETED',
        relationship_id = v_rel.id,
        jugador_id = v_rel.jugador_id,
        duration_minutes = v_effective_duration,
        worked_on = COALESCE(p_worked_on, worked_on),
        improvements = COALESCE(p_improvements, improvements),
        next_goals = COALESCE(p_next_goals, next_goals),
        motivational_message = COALESCE(p_motivational_message, motivational_message),
        notes_summary = COALESCE(p_notas, notes_summary),
        updated_at = now()
    WHERE id = v_session_id;
  ELSE
    INSERT INTO public.coach_sessions (
      coach_id,
      relationship_id,
      organizador_id,
      jugador_id,
      starts_at,
      ends_at,
      duration_minutes,
      status,
      worked_on,
      improvements,
      next_goals,
      motivational_message,
      notes_summary
    )
    VALUES (
      v_rel.coach_id,
      v_rel.id,
      v_rel.organizador_id,
      v_rel.jugador_id,
      now() - (v_effective_duration || ' minutes')::interval,
      now(),
      v_effective_duration,
      'COMPLETED',
      COALESCE(p_worked_on, '{}'::text[]),
      p_improvements,
      p_next_goals,
      p_motivational_message,
      p_notas
    )
    RETURNING id INTO v_session_id;
  END IF;

  -- 11. Descontar exactamente 1 clase e incrementar total impartidas
  UPDATE public.coach_player_class_balances
  SET balance_classes = balance_classes - 1,
      total_classes_given = total_classes_given + 1,
      updated_at = now()
  WHERE id = v_balance.id
  RETURNING balance_classes, total_classes_given INTO v_new_balance, v_new_total;

  -- 12. Registrar movimiento inmutable en el ledger con enlace a la sesión
  INSERT INTO public.coach_class_ledger (
    relationship_id,
    organizador_id,
    coach_id,
    jugador_id,
    session_id,
    delta,
    tipo,
    notas,
    idempotency_key,
    recorded_by
  )
  VALUES (
    v_rel.id,
    v_rel.organizador_id,
    v_rel.coach_id,
    v_rel.jugador_id,
    v_session_id,
    -1,
    'CLASS_DEBIT',
    COALESCE(p_motivational_message, p_notas),
    v_trimmed_key,
    v_caller
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'session_id', v_session_id,
    'remaining_balance', v_new_balance,
    'total_classes_given', v_new_total
  );
END;
$$;

-- Sobrecarga retrocompatible con 4 argumentos
CREATE OR REPLACE FUNCTION public.record_coach_class_session(
  p_relationship_id uuid,
  p_notas text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_session_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.record_coach_class_session(
    p_relationship_id,
    p_notas,
    p_idempotency_key,
    p_session_id,
    '{}'::text[],
    NULL,
    NULL,
    NULL,
    60
  );
END;
$$;

-- ── 9. ACTUALIZAR RPC get_student_coaching_overview ───────────────────────────
-- Expone los campos de seguimiento: worked_on, improvements, next_goals, motivational_message
CREATE OR REPLACE FUNCTION public.get_student_coaching_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_verified_jugador_ids uuid[];
  v_official_keys text[];
  v_user_riviera_id text;
  v_results jsonb;
BEGIN
  IF v_auth_uid IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Usuario no autenticado.'
    );
  END IF;

  -- 1. Identificar perfiles deportivos verificados vinculados a esta cuenta auth
  SELECT ARRAY_AGG(id) INTO v_verified_jugador_ids
  FROM (
    SELECT DISTINCT jugador_id AS id
    FROM public.jugador_auth_links
    WHERE auth_user_id = v_auth_uid
    UNION
    SELECT id
    FROM public.riviera_jugadores
    WHERE auth_user_id = v_auth_uid
  ) t;

  -- 2. Resolver claves canónicas verificadas
  SELECT ARRAY_AGG(official_player_key) INTO v_official_keys
  FROM public.riviera_official_player_identity
  WHERE canonical_riviera_jugador_id = ANY(v_verified_jugador_ids);

  -- 3. Resolver Riviera ID del alumno
  SELECT i.riviera_id INTO v_user_riviera_id
  FROM public.riviera_official_player_identity i
  WHERE i.canonical_riviera_jugador_id = ANY(v_verified_jugador_ids)
     OR i.official_player_key = ANY(v_official_keys)
  ORDER BY i.created_at ASC
  LIMIT 1;

  -- Si no hay perfiles verificados para este usuario, retornar estado limpio
  IF array_length(v_verified_jugador_ids, 1) IS NULL OR array_length(v_verified_jugador_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'linked', false,
      'riviera_id', NULL,
      'relationships', '[]'::jsonb
    );
  END IF;

  -- 4. Construir resumen con detalle de sesiones y seguimiento deportivo
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'relationship_id', r.id,
      'status', r.status,
      'is_primary', r.is_primary,
      'started_at', r.started_at,
      'ended_at', r.ended_at,
      'club', jsonb_build_object(
        'organizador_id', r.organizador_id,
        'nombre', COALESCE(u.name, ogm.branding_key, 'Club Riviera'),
        'branding_key', ogm.branding_key
      ),
      'coach', jsonb_build_object(
        'id', c.id,
        'nombre', c.nombre,
        'coach_code', c.coach_code,
        'foto_url', c.foto_url,
        'especialidades', c.especialidades
      ),
      'player', jsonb_build_object(
        'id', rj.id,
        'nombre', rj.nombre,
        'riviera_id', COALESCE(
          (SELECT i.riviera_id FROM public.riviera_official_player_identity i 
           WHERE i.canonical_riviera_jugador_id = rj.id LIMIT 1),
          v_user_riviera_id
        )
      ),
      'balance', jsonb_build_object(
        'balance_classes', COALESCE(b.balance_classes, 0),
        'total_classes_given', COALESCE(b.total_classes_given, 0),
        'updated_at', b.updated_at
      ),
      'ledger', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', l.id,
            'delta', l.delta,
            'tipo', l.tipo,
            'notas', l.notas,
            'created_at', l.created_at,
            'session', CASE WHEN s.id IS NOT NULL THEN jsonb_build_object(
              'id', s.id,
              'starts_at', s.starts_at,
              'duration_minutes', s.duration_minutes,
              'focus', s.focus,
              'worked_on', s.worked_on,
              'improvements', s.improvements,
              'next_goals', s.next_goals,
              'motivational_message', s.motivational_message,
              'notes_summary', s.notes_summary
            ) ELSE NULL END
          ) ORDER BY l.created_at DESC
        )
        FROM (
          SELECT id, delta, tipo, notas, created_at, session_id
          FROM public.coach_class_ledger
          WHERE relationship_id = r.id
          ORDER BY created_at DESC
          LIMIT 50
        ) l
        LEFT JOIN public.coach_sessions s ON s.id = l.session_id
      ), '[]'::jsonb)
    ) ORDER BY r.is_primary DESC, r.created_at DESC
  ), '[]'::jsonb)
  INTO v_results
  FROM public.coach_player_relationships r
  JOIN public.riviera_coaches c ON c.id = r.coach_id
  JOIN public.riviera_jugadores rj ON rj.id = r.jugador_id
  LEFT JOIN public.users u ON u.id = r.organizador_id
  LEFT JOIN public.organizador_game_modes ogm ON ogm.organizador_id = r.organizador_id
  LEFT JOIN public.coach_player_class_balances b ON b.relationship_id = r.id
  WHERE r.jugador_id = ANY(v_verified_jugador_ids)
    AND r.status = 'ACTIVE';

  RETURN jsonb_build_object(
    'ok', true,
    'linked', true,
    'riviera_id', v_user_riviera_id,
    'relationships', COALESCE(v_results, '[]'::jsonb)
  );
END;
$$;

