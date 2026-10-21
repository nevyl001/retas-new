-- ==============================================================================
-- 0079_coaching_student_exclusive_access.sql
-- Riviera Coaching — Acceso Exclusivo para Alumnos por Riviera ID (STUDENT_ONLY)
-- ==============================================================================

-- 1. EXTENDER TABLA DE VÍNCULOS DE CUENTA DE ALUMNO CON CONTROL DE ACTIVACIÓN
ALTER TABLE public.coach_student_account_links
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS student_email text,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cs_account_links_active
  ON public.coach_student_account_links(jugador_id, is_active);

-- 2. TABLA DE INVITACIONES PARA ACCESO EXCLUSIVO DE ALUMNOS
CREATE TABLE IF NOT EXISTS public.coach_student_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizador_id uuid NOT NULL,
  jugador_id uuid NOT NULL REFERENCES public.riviera_jugadores(id) ON DELETE CASCADE,
  coach_id uuid REFERENCES public.riviera_coaches(id) ON DELETE SET NULL,
  email text NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')) DEFAULT 'PENDING',
  invitation_token text NOT NULL UNIQUE,
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cs_invitations_org_jugador
  ON public.coach_student_invitations(organizador_id, jugador_id);

CREATE INDEX IF NOT EXISTS idx_cs_invitations_token
  ON public.coach_student_invitations(invitation_token);

CREATE INDEX IF NOT EXISTS idx_cs_invitations_email
  ON public.coach_student_invitations(lower(btrim(email)));

ALTER TABLE public.coach_student_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS csi_select ON public.coach_student_invitations;
CREATE POLICY csi_select ON public.coach_student_invitations
  FOR SELECT
  TO authenticated
  USING (
    organizador_id = auth.uid()
    OR invited_by = auth.uid()
    OR COALESCE(public.is_master_admin(), false)
  );

GRANT SELECT ON public.coach_student_invitations TO authenticated;
GRANT ALL ON public.coach_student_invitations TO service_role;

-- 3. FUNCIONES DE APOYO PARA ROLES Y SEGURIDAD
-- Blindar triggers de nuevo usuario para no otorgar permisos de organizador a cuentas STUDENT_ONLY
CREATE OR REPLACE FUNCTION public.handle_new_organizador_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Si el usuario es exclusivamente alumno o coach, NO crear configuración de organizador
  IF public.is_restricted_sub_account(NEW.id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.organizador_game_modes (organizador_id)
  VALUES (NEW.id)
  ON CONFLICT (organizador_id) DO NOTHING;

  INSERT INTO public.riviera_official_ranking_emitters (
    organizador_id,
    is_active,
    notes
  )
  VALUES (NEW.id, true, 'Auto: registro organizador')
  ON CONFLICT (organizador_id) DO UPDATE
  SET is_active = true, updated_at = now();

  RETURN NEW;
END;
$$;

-- 4. RPC: get_club_student_access_status
-- Permite al club consultar el estado de activación de un alumno:
--   NO_ACCESS: sin cuenta ni invitación activa
--   INVITATION_PENDING: invitación enviada esperando activación
--   ACTIVE: cuenta activa vinculada al Riviera ID
--   DEACTIVATED: acceso pausado por el club
CREATE OR REPLACE FUNCTION public.get_club_student_access_status(
  p_organizador_id uuid,
  p_jugador_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_authorized boolean;
  v_link record;
  v_invitation record;
  v_user record;
  v_jugador record;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  v_is_authorized := public.is_master_admin() OR (p_organizador_id = v_caller);
  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado para consultar este club');
  END IF;

  SELECT id, nombre, email INTO v_jugador
  FROM public.riviera_jugadores
  WHERE id = p_jugador_id;

  IF v_jugador.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Alumno no encontrado');
  END IF;

  -- 1. Comprobar si ya existe vínculo en coach_student_account_links
  SELECT * INTO v_link
  FROM public.coach_student_account_links
  WHERE jugador_id = p_jugador_id;

  IF v_link.id IS NOT NULL THEN
    SELECT id, email, created_at, raw_app_meta_data INTO v_user
    FROM auth.users
    WHERE id = v_link.auth_user_id;

    RETURN jsonb_build_object(
      'ok', true,
      'status', CASE WHEN v_link.is_active THEN 'ACTIVE' ELSE 'DEACTIVATED' END,
      'email', COALESCE(v_link.student_email, v_user.email, v_jugador.email),
      'auth_user_id', v_link.auth_user_id,
      'is_active', v_link.is_active,
      'deactivated_at', v_link.deactivated_at,
      'created_at', v_link.created_at,
      'account_type', COALESCE(v_user.raw_app_meta_data->>'account_type', 'STUDENT_ONLY'),
      'verification_method', v_link.verification_method
    );
  END IF;

  -- 2. Comprobar si hay una invitación pendiente válida
  SELECT * INTO v_invitation
  FROM public.coach_student_invitations
  WHERE organizador_id = p_organizador_id
    AND jugador_id = p_jugador_id
    AND status = 'PENDING'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_invitation.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'INVITATION_PENDING',
      'email', v_invitation.email,
      'invited_at', v_invitation.invited_at,
      'expires_at', v_invitation.expires_at,
      'invitation_token', v_invitation.invitation_token
    );
  END IF;

  -- 3. Sin acceso
  RETURN jsonb_build_object(
    'ok', true,
    'status', 'NO_ACCESS',
    'email', v_jugador.email
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_club_student_access_status(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_club_student_access_status(uuid, uuid) TO authenticated, service_role;

-- 5. RPC: create_or_invite_student_access
-- Permite al propietario del club crear el acceso o generar la invitación
CREATE OR REPLACE FUNCTION public.create_or_invite_student_access(
  p_organizador_id uuid,
  p_jugador_id uuid,
  p_student_email text,
  p_coach_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_authorized boolean;
  v_norm_email text := lower(btrim(COALESCE(p_student_email, '')));
  v_jugador record;
  v_existing_user record;
  v_existing_link record;
  v_token text;
  v_invitation_id uuid;
  v_is_org_user boolean;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  v_is_authorized := public.is_master_admin() OR (p_organizador_id = v_caller);
  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado para gestionar accesos en este club');
  END IF;

  IF v_norm_email = '' OR v_norm_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ingresa un correo electrónico válido para el alumno.');
  END IF;

  -- Resolver jugador oficial
  SELECT rj.id, rj.nombre, rj.email, i.riviera_id INTO v_jugador
  FROM public.riviera_jugadores rj
  LEFT JOIN public.riviera_official_player_identity i ON i.canonical_riviera_jugador_id = rj.id
  WHERE rj.id = p_jugador_id;

  IF v_jugador.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Perfil del alumno no encontrado.');
  END IF;

  -- Comprobar si ya existe un vínculo activo o previo para este alumno
  SELECT * INTO v_existing_link
  FROM public.coach_student_account_links
  WHERE jugador_id = p_jugador_id;

  -- Caso 1: Ya existe en auth.users
  SELECT id, email, raw_app_meta_data INTO v_existing_user
  FROM auth.users
  WHERE lower(btrim(email)) = v_norm_email;

  IF v_existing_user.id IS NOT NULL THEN
    -- Si el jugador ya estaba vinculado a esta misma cuenta Auth
    IF v_existing_link.id IS NOT NULL THEN
      IF v_existing_link.auth_user_id = v_existing_user.id THEN
        IF NOT v_existing_link.is_active THEN
          UPDATE public.coach_student_account_links
          SET is_active = true,
              deactivated_at = NULL,
              deactivated_by = NULL,
              student_email = v_norm_email,
              updated_at = now()
          WHERE id = v_existing_link.id;

          RETURN jsonb_build_object(
            'ok', true,
            'status', 'ACTIVE',
            'auth_user_id', v_existing_user.id,
            'email', v_norm_email,
            'message', 'Acceso de alumno reactivado exitosamente.'
          );
        ELSE
          RETURN jsonb_build_object(
            'ok', true,
            'status', 'ACTIVE',
            'auth_user_id', v_existing_user.id,
            'email', v_norm_email,
            'message', 'El alumno ya cuenta con acceso activo vinculado a este Riviera ID.'
          );
        END IF;
      ELSE
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'Este perfil deportivo ya está vinculado a otra cuenta de usuario diferente.'
        );
      END IF;
    END IF;

    -- Comprobar si el usuario existente ya está vinculado a otro jugador
    SELECT * INTO v_existing_link
    FROM public.coach_student_account_links
    WHERE auth_user_id = v_existing_user.id
      AND jugador_id <> p_jugador_id;

    IF v_existing_link.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'Este correo electrónico ya está asociado a otro jugador en el sistema.'
      );
    END IF;

    -- Verificar si el usuario existente es un organizador legítimo
    v_is_org_user := EXISTS (
      SELECT 1 FROM public.organizador_game_modes WHERE organizador_id = v_existing_user.id
    ) OR (v_existing_user.raw_app_meta_data->>'account_type' = 'CLUB_ADMIN');

    -- Vincular cuenta existente directamente sin sobreescribir roles de organizador
    INSERT INTO public.coach_student_account_links (
      jugador_id,
      auth_user_id,
      organizador_id,
      verification_method,
      is_active,
      student_email
    ) VALUES (
      p_jugador_id,
      v_existing_user.id,
      p_organizador_id,
      'CLUB_ADMIN',
      true,
      v_norm_email
    ) ON CONFLICT (jugador_id) DO UPDATE
    SET auth_user_id = v_existing_user.id,
        organizador_id = p_organizador_id,
        is_active = true,
        student_email = v_norm_email,
        deactivated_at = NULL,
        deactivated_by = NULL,
        updated_at = now();

    -- Si NO es organizador, asegurar account_type = 'STUDENT_ONLY'
    IF NOT v_is_org_user AND COALESCE(v_existing_user.raw_app_meta_data->>'account_type', '') = '' THEN
      UPDATE auth.users
      SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"account_type":"STUDENT_ONLY"}'::jsonb
      WHERE id = v_existing_user.id;
    END IF;

    -- Actualizar email del jugador si no lo tenía
    IF v_jugador.email IS NULL OR v_jugador.email = '' THEN
      UPDATE public.riviera_jugadores SET email = v_norm_email WHERE id = p_jugador_id;
    END IF;

    -- Marcar cualquier invitación pendiente como aceptada
    UPDATE public.coach_student_invitations
    SET status = 'ACCEPTED', accepted_at = now(), accepted_by = v_existing_user.id, updated_at = now()
    WHERE jugador_id = p_jugador_id AND status = 'PENDING';

    RETURN jsonb_build_object(
      'ok', true,
      'status', 'ACTIVE',
      'auth_user_id', v_existing_user.id,
      'email', v_norm_email,
      'message', 'Cuenta existente vinculada exitosamente con su Riviera ID.'
    );
  END IF;

  -- Caso 2: El alumno NO tiene cuenta Auth previa -> Generar invitación segura
  -- Generar token aleatorio criptográficamente seguro
  v_token := encode(gen_random_bytes(24), 'hex');

  -- Desactivar o revocar invitaciones pendientes previas
  UPDATE public.coach_student_invitations
  SET status = 'REVOKED', revoked_at = now(), revoked_by = v_caller, updated_at = now()
  WHERE organizador_id = p_organizador_id
    AND jugador_id = p_jugador_id
    AND status = 'PENDING';

  INSERT INTO public.coach_student_invitations (
    organizador_id,
    jugador_id,
    coach_id,
    email,
    status,
    invitation_token,
    invited_by,
    invited_at,
    expires_at
  ) VALUES (
    p_organizador_id,
    p_jugador_id,
    p_coach_id,
    v_norm_email,
    'PENDING',
    v_token,
    v_caller,
    now(),
    now() + interval '7 days'
  )
  RETURNING id INTO v_invitation_id;

  -- Actualizar email en perfil deportivo si estaba vacío
  IF v_jugador.email IS NULL OR v_jugador.email = '' THEN
    UPDATE public.riviera_jugadores SET email = v_norm_email WHERE id = p_jugador_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'INVITATION_PENDING',
    'invitation_token', v_token,
    'email', v_norm_email,
    'student_name', v_jugador.nombre,
    'riviera_id', v_jugador.riviera_id,
    'expires_at', (now() + interval '7 days'),
    'message', 'Invitación generada exitosamente. Comparte el enlace con el alumno para activar su contraseña.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_or_invite_student_access(uuid, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_or_invite_student_access(uuid, uuid, text, uuid) TO authenticated, service_role;

-- 6. RPC: resend_student_invitation
CREATE OR REPLACE FUNCTION public.resend_student_invitation(
  p_organizador_id uuid,
  p_jugador_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_authorized boolean;
  v_invitation record;
  v_token text;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  v_is_authorized := public.is_master_admin() OR (p_organizador_id = v_caller);
  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado');
  END IF;

  SELECT * INTO v_invitation
  FROM public.coach_student_invitations
  WHERE organizador_id = p_organizador_id
    AND jugador_id = p_jugador_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_invitation.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No existe una invitación previa para este alumno.');
  END IF;

  v_token := encode(gen_random_bytes(24), 'hex');

  UPDATE public.coach_student_invitations
  SET status = 'PENDING',
      invitation_token = v_token,
      invited_at = now(),
      expires_at = now() + interval '7 days',
      revoked_at = NULL,
      revoked_by = NULL,
      updated_at = now()
  WHERE id = v_invitation.id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'INVITATION_PENDING',
    'invitation_token', v_token,
    'email', v_invitation.email,
    'expires_at', (now() + interval '7 days'),
    'message', 'Invitación renovada exitosamente.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resend_student_invitation(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resend_student_invitation(uuid, uuid) TO authenticated, service_role;

-- 7. RPC: deactivate_student_access
CREATE OR REPLACE FUNCTION public.deactivate_student_access(
  p_organizador_id uuid,
  p_jugador_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_authorized boolean;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  v_is_authorized := public.is_master_admin() OR (p_organizador_id = v_caller);
  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado');
  END IF;

  -- Desactivar vínculo sin borrar el historial
  UPDATE public.coach_student_account_links
  SET is_active = false,
      deactivated_at = now(),
      deactivated_by = v_caller,
      updated_at = now()
  WHERE jugador_id = p_jugador_id;

  -- Revocar invitaciones pendientes
  UPDATE public.coach_student_invitations
  SET status = 'REVOKED', revoked_at = now(), revoked_by = v_caller, updated_at = now()
  WHERE organizador_id = p_organizador_id
    AND jugador_id = p_jugador_id
    AND status = 'PENDING';

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'DEACTIVATED',
    'message', 'El acceso a Riviera Coaching ha sido desactivado. El Riviera ID y los saldos permanecen intactos.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_student_access(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_student_access(uuid, uuid) TO authenticated, service_role;

-- 8. RPC: reactivate_student_access
CREATE OR REPLACE FUNCTION public.reactivate_student_access(
  p_organizador_id uuid,
  p_jugador_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_authorized boolean;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  v_is_authorized := public.is_master_admin() OR (p_organizador_id = v_caller);
  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado');
  END IF;

  UPDATE public.coach_student_account_links
  SET is_active = true,
      deactivated_at = NULL,
      deactivated_by = NULL,
      updated_at = now()
  WHERE jugador_id = p_jugador_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'ACTIVE',
    'message', 'Acceso de alumno reactivado exitosamente.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reactivate_student_access(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reactivate_student_access(uuid, uuid) TO authenticated, service_role;

-- 9. RPC: verify_student_invitation
-- Permite al frontend validar un token de invitación antes de pedir contraseña
CREATE OR REPLACE FUNCTION public.verify_student_invitation(
  p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invitation record;
  v_jugador record;
  v_org_user record;
  v_coach record;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token de invitación no proporcionado.');
  END IF;

  SELECT * INTO v_invitation
  FROM public.coach_student_invitations
  WHERE invitation_token = btrim(p_token);

  IF v_invitation.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitación no válida.');
  END IF;

  IF v_invitation.status = 'ACCEPTED' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Esta invitación ya fue activada previamente. Inicia sesión con tu correo y contraseña.'
    );
  END IF;

  IF v_invitation.status = 'REVOKED' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Esta invitación fue cancelada por el club. Solicita una nueva invitación.'
    );
  END IF;

  IF v_invitation.expires_at < now() THEN
    UPDATE public.coach_student_invitations SET status = 'EXPIRED', updated_at = now() WHERE id = v_invitation.id;
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'La invitación ha expirado. Solicita al club que te reenvíe la invitación.'
    );
  END IF;

  SELECT rj.id, rj.nombre, rj.email, i.riviera_id INTO v_jugador
  FROM public.riviera_jugadores rj
  LEFT JOIN public.riviera_official_player_identity i ON i.canonical_riviera_jugador_id = rj.id
  WHERE rj.id = v_invitation.jugador_id;

  SELECT COALESCE(raw_user_meta_data->>'nombre', email) as nombre INTO v_org_user
  FROM auth.users
  WHERE id = v_invitation.organizador_id;

  SELECT nombre INTO v_coach
  FROM public.riviera_coaches
  WHERE id = v_invitation.coach_id;

  RETURN jsonb_build_object(
    'ok', true,
    'invitation_id', v_invitation.id,
    'email', v_invitation.email,
    'student_name', v_jugador.nombre,
    'riviera_id', v_jugador.riviera_id,
    'club_name', v_org_user.nombre,
    'coach_name', v_coach.nombre,
    'expires_at', v_invitation.expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_student_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_student_invitation(text) TO anon, authenticated, service_role;

-- 10. RPC: activate_student_invitation
-- Establece la contraseña definitiva del alumno en auth.users y vincula su cuenta
CREATE OR REPLACE FUNCTION public.activate_student_invitation(
  p_token text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_invitation record;
  v_jugador record;
  v_user_id uuid;
  v_existing_auth record;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token de activación inválido.');
  END IF;

  IF p_password IS NULL OR length(p_password) < 6 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La contraseña debe tener al menos 6 caracteres.');
  END IF;

  SELECT * INTO v_invitation
  FROM public.coach_student_invitations
  WHERE invitation_token = btrim(p_token)
  FOR UPDATE;

  IF v_invitation.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitación no encontrada.');
  END IF;

  IF v_invitation.status <> 'PENDING' OR v_invitation.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La invitación ya no está activa o ha expirado.');
  END IF;

  -- Resolver jugador oficial
  SELECT rj.id, rj.nombre, rj.email, i.riviera_id INTO v_jugador
  FROM public.riviera_jugadores rj
  LEFT JOIN public.riviera_official_player_identity i ON i.canonical_riviera_jugador_id = rj.id
  WHERE rj.id = v_invitation.jugador_id;

  IF v_jugador.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Perfil del alumno no encontrado.');
  END IF;

  -- Comprobar si ya existe un auth.user con este correo
  SELECT id, email INTO v_existing_auth
  FROM auth.users
  WHERE lower(btrim(email)) = lower(btrim(v_invitation.email));

  IF v_existing_auth.id IS NOT NULL THEN
    v_user_id := v_existing_auth.id;

    -- Actualizar contraseña definitiva y confirmar correo
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"provider":"email","providers":["email"],"account_type":"STUDENT_ONLY"}'::jsonb,
        raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
          'name', v_jugador.nombre,
          'account_type', 'STUDENT_ONLY',
          'riviera_id', v_jugador.riviera_id
        ),
        updated_at = now()
    WHERE id = v_user_id;
  ELSE
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      is_sso_user,
      is_anonymous
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      lower(btrim(v_invitation.email)),
      extensions.crypt(p_password, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"],"account_type":"STUDENT_ONLY"}'::jsonb,
      jsonb_build_object(
        'name', v_jugador.nombre,
        'account_type', 'STUDENT_ONLY',
        'riviera_id', v_jugador.riviera_id
      ),
      now(),
      now(),
      false,
      false
    );

    -- Insertar en auth.identities para compatibilidad con GoTrue email login
    INSERT INTO auth.identities (
      id,
      user_id,
      provider_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      v_user_id,
      v_user_id,
      v_user_id::text,
      jsonb_build_object('sub', v_user_id::text, 'email', lower(btrim(v_invitation.email))),
      'email',
      now(),
      now(),
      now()
    ) ON CONFLICT (provider, provider_id) DO NOTHING;
  END IF;

  -- Insertar o actualizar en public.users
  INSERT INTO public.users (
    id,
    email,
    name,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    lower(btrim(v_invitation.email)),
    v_jugador.nombre,
    now(),
    now()
  ) ON CONFLICT (id) DO UPDATE
  SET email = lower(btrim(v_invitation.email)),
      name = COALESCE(public.users.name, v_jugador.nombre),
      updated_at = now();

  -- Vincular oficialmente en coach_student_account_links
  INSERT INTO public.coach_student_account_links (
    jugador_id,
    auth_user_id,
    organizador_id,
    verification_method,
    is_active,
    student_email
  ) VALUES (
    v_invitation.jugador_id,
    v_user_id,
    v_invitation.organizador_id,
    'CLUB_ADMIN',
    true,
    lower(btrim(v_invitation.email))
  ) ON CONFLICT (jugador_id) DO UPDATE
  SET auth_user_id = v_user_id,
      organizador_id = v_invitation.organizador_id,
      is_active = true,
      student_email = lower(btrim(v_invitation.email)),
      deactivated_at = NULL,
      deactivated_by = NULL,
      updated_at = now();

  -- Marcar invitación como aceptada
  UPDATE public.coach_student_invitations
  SET status = 'ACCEPTED',
      accepted_at = now(),
      accepted_by = v_user_id,
      updated_at = now()
  WHERE id = v_invitation.id;

  RETURN jsonb_build_object(
    'ok', true,
    'email', lower(btrim(v_invitation.email)),
    'student_name', v_jugador.nombre,
    'riviera_id', v_jugador.riviera_id,
    'auth_user_id', v_user_id,
    'message', '¡Cuenta activada exitosamente! Ya puedes iniciar sesión con tu contraseña.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.activate_student_invitation(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_student_invitation(text, text) TO anon, authenticated, service_role;

-- 11. ACTUALIZAR get_student_coaching_overview
-- Considera el estado is_active y devuelve estado desactivado con claridad
CREATE OR REPLACE FUNCTION public.get_student_coaching_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_email text;
  v_email_confirmed_at timestamptz;
  v_verified_jugador_ids uuid[] := '{}';
  v_official_keys uuid[] := '{}';
  v_user_riviera_id text;
  v_results jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Usuario no autenticado.'
    );
  END IF;

  -- Comprobar si tiene vínculo de estudiante pero está desactivado por el club
  IF EXISTS (
    SELECT 1 FROM public.coach_student_account_links
    WHERE auth_user_id = v_caller AND is_active = false
  ) AND NOT EXISTS (
    SELECT 1 FROM public.coach_student_account_links
    WHERE auth_user_id = v_caller AND is_active = true
  ) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'linked', false,
      'is_deactivated', true,
      'message', 'Tu acceso a Riviera Coaching ha sido desactivado temporalmente por tu club. Consulta con la administración de tu club.'
    );
  END IF;

  SELECT lower(btrim(email)), email_confirmed_at
  INTO v_caller_email, v_email_confirmed_at
  FROM auth.users
  WHERE id = v_caller;

  -- 1. Identidades verificadas explícitas (SOLO VÍNCULOS ACTIVOS)
  SELECT COALESCE(array_agg(DISTINCT jugador_id), '{}')
  INTO v_verified_jugador_ids
  FROM (
    SELECT jugador_id FROM public.coach_student_account_links WHERE auth_user_id = v_caller AND is_active = true
    UNION
    SELECT jugador_id FROM public.rewards_player_links WHERE auth_user_id = v_caller
  ) verified;

  -- 2. Match de correo exacto (solo confirmado y no ambiguo)
  IF (v_verified_jugador_ids IS NULL OR array_length(v_verified_jugador_ids, 1) IS NULL)
     AND v_caller_email IS NOT NULL AND v_caller_email <> ''
     AND v_email_confirmed_at IS NOT NULL THEN

    SELECT COALESCE(array_agg(id), '{}')
    INTO v_verified_jugador_ids
    FROM public.riviera_jugadores
    WHERE lower(btrim(email)) = v_caller_email;

    IF array_length(v_verified_jugador_ids, 1) > 1 THEN
      v_verified_jugador_ids := '{}';
    END IF;
  END IF;

  -- Si no hay jugador verificado
  IF v_verified_jugador_ids IS NULL OR array_length(v_verified_jugador_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'linked', false,
      'message', 'No tienes un perfil deportivo vinculado a tu cuenta.',
      'relationships', '[]'::jsonb
    );
  END IF;

  -- 3. Expansión canónica por clave oficial
  SELECT COALESCE(array_agg(DISTINCT official_player_key), '{}')
  INTO v_official_keys
  FROM public.riviera_official_player_identity
  WHERE canonical_riviera_jugador_id = ANY(v_verified_jugador_ids);

  IF v_official_keys IS NOT NULL AND array_length(v_official_keys, 1) > 0 THEN
    SELECT COALESCE(array_agg(DISTINCT canonical_riviera_jugador_id), v_verified_jugador_ids)
    INTO v_verified_jugador_ids
    FROM public.riviera_official_player_identity
    WHERE official_player_key = ANY(v_official_keys);
  END IF;

  SELECT riviera_id INTO v_user_riviera_id
  FROM public.riviera_official_player_identity
  WHERE canonical_riviera_jugador_id = ANY(v_verified_jugador_ids)
  LIMIT 1;

  -- 4. Construir resumen con privacidad estricta
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'relationship_id', r.id,
      'status', r.status,
      'is_primary', (r.status = 'ACTIVE' AND r.is_primary),
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
        'foto_url', rj.foto_url,
        'riviera_id', COALESCE(
          (SELECT i.riviera_id FROM public.riviera_official_player_identity i 
           WHERE i.canonical_riviera_jugador_id = rj.id LIMIT 1),
          v_user_riviera_id
        ),
        'rivieraId', COALESCE(
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
      'upcoming_sessions', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', sch.id,
            'starts_at', sch.starts_at,
            'ends_at', sch.ends_at,
            'duration_minutes', sch.duration_minutes,
            'court', sch.court,
            'focus', sch.focus,
            'status', sch.status
          ) ORDER BY sch.starts_at ASC
        )
        FROM public.coach_sessions sch
        WHERE sch.relationship_id = r.id
          AND sch.status = 'SCHEDULED'
          AND sch.starts_at >= now() - interval '2 hours'
      ), '[]'::jsonb),
      'ledger', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', l.id,
            'delta', l.delta,
            'tipo', l.tipo,
            'created_at', l.created_at,
            'session', CASE WHEN s.id IS NOT NULL THEN jsonb_build_object(
              'id', s.id,
              'starts_at', s.starts_at,
              'duration_minutes', s.duration_minutes,
              'court', s.court,
              'focus', s.focus,
              'worked_on', s.worked_on,
              'improvements', s.improvements,
              'next_goals', s.next_goals,
              'motivational_message', s.motivational_message
            ) ELSE NULL END
          ) ORDER BY l.created_at DESC
        )
        FROM (
          SELECT id, delta, tipo, created_at, session_id
          FROM public.coach_class_ledger
          WHERE relationship_id = r.id
          ORDER BY created_at DESC
          LIMIT 50
        ) l
        LEFT JOIN public.coach_sessions s ON s.id = l.session_id
      ), '[]'::jsonb)
    ) ORDER BY (CASE WHEN r.status = 'ACTIVE' THEN 0 WHEN r.status = 'PAUSED' THEN 1 ELSE 2 END), r.is_primary DESC, r.created_at DESC
  ), '[]'::jsonb)
  INTO v_results
  FROM public.coach_player_relationships r
  JOIN public.riviera_coaches c ON c.id = r.coach_id
  JOIN public.riviera_jugadores rj ON rj.id = r.jugador_id
  LEFT JOIN public.users u ON u.id = r.organizador_id
  LEFT JOIN public.organizador_game_modes ogm ON ogm.organizador_id = r.organizador_id
  LEFT JOIN public.coach_player_class_balances b ON b.relationship_id = r.id
  WHERE r.jugador_id = ANY(v_verified_jugador_ids)
    AND r.status IN ('ACTIVE', 'PAUSED', 'ENDED');

  RETURN jsonb_build_object(
    'ok', true,
    'linked', true,
    'riviera_id', v_user_riviera_id,
    'rivieraId', v_user_riviera_id,
    'relationships', COALESCE(v_results, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_coaching_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_coaching_overview() TO authenticated, service_role;

-- 12. GUARDAS EN RPCs ADMINISTRATIVAS PARA RECHAZAR CUENTAS STUDENT_ONLY
CREATE OR REPLACE FUNCTION public.check_student_only_restriction()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.is_student_only_account(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Las cuentas de alumno únicamente tienen acceso de consulta personal y no pueden realizar operaciones administrativas.';
  END IF;
END;
$$;
