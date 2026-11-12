-- El club administra el acceso de sus coaches.
-- Una membresía con cuenta de autenticación queda ACTIVE.
-- El coach no puede aceptarse a sí mismo.
-- No borra clases, alumnos ni el identificador RIV-C.
-- Idempotente: solo cambia filas que siguen en PENDING y ya tienen auth_user_id.

CREATE OR REPLACE FUNCTION public.accept_coach_club_invitation(p_membership_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN jsonb_build_object(
    'ok', false,
    'membership_id', p_membership_id,
    'error', 'El club administra el acceso de sus coaches. No hay invitaciones que aceptar.'
  );
END;
$$;

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
  v_previous text;
BEGIN
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Autenticación requerida');
  END IF;

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

  SELECT id, auth_user_id, coach_code, nombre, foto_url, bio, especialidades, fuerzas
  INTO v_coach
  FROM public.riviera_coaches
  WHERE id = p_coach_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Coach no encontrado');
  END IF;

  IF v_coach.auth_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'status', 'PENDING',
      'error', 'Este coach todavía no tiene credenciales. Configúralas desde el club para habilitarlo.'
    );
  END IF;

  SELECT id, status INTO v_existing
  FROM public.coach_club_memberships
  WHERE coach_id = p_coach_id
    AND organizador_id = v_org_id;

  IF FOUND AND v_existing.status = 'ACTIVE' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_member', true,
      'membership_id', v_existing.id,
      'status', 'ACTIVE',
      'message', 'El coach ya es miembro activo de tu club.'
    );
  END IF;

  v_previous := CASE WHEN FOUND THEN v_existing.status ELSE NULL END;

  INSERT INTO public.coach_club_memberships (
    coach_id,
    organizador_id,
    status,
    invited_by,
    invited_at,
    activated_at,
    deactivated_at,
    cancelled_at,
    updated_at
  )
  VALUES (
    p_coach_id,
    v_org_id,
    'ACTIVE',
    v_org_id,
    now(),
    now(),
    NULL,
    NULL,
    now()
  )
  ON CONFLICT (coach_id, organizador_id) DO UPDATE
  SET
    status = 'ACTIVE',
    activated_at = COALESCE(public.coach_club_memberships.activated_at, now()),
    deactivated_at = NULL,
    cancelled_at = NULL,
    removed_at = NULL,
    updated_at = now()
  RETURNING id, status INTO v_membership_id, v_status;

  INSERT INTO public.coach_club_membership_audit_log (
    membership_id, coach_id, organizador_id, action, performed_by,
    previous_status, new_status, details
  ) VALUES (
    v_membership_id, p_coach_id, v_org_id,
    CASE WHEN v_previous IS NULL THEN 'CLUB_REGISTER' ELSE 'CLUB_ACTIVATE' END,
    v_org_id,
    v_previous, 'ACTIVE',
    jsonb_build_object('access', 'club_controlled')
  );

  RETURN jsonb_build_object(
    'ok', true,
    'already_member', false,
    'membership_id', v_membership_id,
    'status', 'ACTIVE',
    'message', 'Coach activo en tu club. Puede iniciar sesión con sus credenciales.',
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

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT m.id, m.coach_id, m.organizador_id
    FROM public.coach_club_memberships m
    JOIN public.riviera_coaches c ON c.id = m.coach_id
    WHERE m.status = 'PENDING'
      AND c.auth_user_id IS NOT NULL
  LOOP
    UPDATE public.coach_club_memberships
    SET
      status = 'ACTIVE',
      activated_at = COALESCE(activated_at, now()),
      updated_at = now()
    WHERE id = r.id
      AND status = 'PENDING';

    IF FOUND THEN
      INSERT INTO public.coach_club_membership_audit_log (
        membership_id, coach_id, organizador_id, action, performed_by,
        previous_status, new_status, details
      ) VALUES (
        r.id, r.coach_id, r.organizador_id, 'CLUB_ACTIVATE', NULL,
        'PENDING', 'ACTIVE',
        jsonb_build_object('motivo', 'club_controla_acceso', 'migracion', '0130')
      );
    END IF;
  END LOOP;
END $$;
