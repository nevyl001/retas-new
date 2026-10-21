-- ==============================================================================
-- 0081_coaching_revoke_legacy_rpcs_and_email_verification.sql
-- Riviera Coaching — Revocación de RPCs Antiguas y Verificación Real de Identidad
-- ==============================================================================

-- 1. REVOCAR Y ELIMINAR DEFINITIVAMENTE FUNCIONES OBSOLETAS EXPUESTAS
DO $$
BEGIN
  BEGIN
    EXECUTE 'REVOKE ALL ON FUNCTION public.create_or_invite_student_access(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated';
  EXCEPTION WHEN undefined_function THEN
    NULL;
  END;

  BEGIN
    EXECUTE 'REVOKE ALL ON FUNCTION public.resend_student_invitation(uuid, uuid) FROM PUBLIC, anon, authenticated';
  EXCEPTION WHEN undefined_function THEN
    NULL;
  END;
END $$;

DROP FUNCTION IF EXISTS public.create_or_invite_student_access(uuid, uuid, text, uuid);
DROP FUNCTION IF EXISTS public.resend_student_invitation(uuid, uuid);

-- 2. EXTENDER PERMISOS DE VERIFICACIÓN EN coach_student_account_links
ALTER TABLE public.coach_student_account_links
  DROP CONSTRAINT IF EXISTS coach_student_account_links_verification_method_check;

ALTER TABLE public.coach_student_account_links
  ADD CONSTRAINT coach_student_account_links_verification_method_check
  CHECK (verification_method IN ('CLUB_ADMIN', 'VERIFIED_EMAIL_MATCH', 'STUDENT_AUTH_VERIFIED', 'EMAIL_VERIFIED'));

-- 3. ACTUALIZAR verify_student_invitation PARA EXPONER ESTADO REAL DE VERIFICACIÓN DE EMAIL
DROP FUNCTION IF EXISTS public.verify_student_invitation(text);

CREATE OR REPLACE FUNCTION public.verify_student_invitation(
  p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_clean_token text := btrim(COALESCE(p_token, ''));
  v_hash text;
  v_invitation record;
  v_jugador record;
  v_org_user record;
  v_coach record;
  v_is_existing_account boolean := false;
  v_is_email_verified boolean := false;
BEGIN
  IF v_clean_token = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token de invitación no proporcionado.');
  END IF;

  v_hash := encode(extensions.digest(v_clean_token::bytea, 'sha256'), 'hex');

  -- Buscar por token_hash (o fallback a invitation_token para transicional)
  SELECT * INTO v_invitation
  FROM public.coach_student_invitations
  WHERE token_hash = v_hash OR invitation_token = v_clean_token
  LIMIT 1;

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
      'error', 'La invitación ha expirado. Solicita a tu club que te reenvíe la invitación.'
    );
  END IF;

  -- Comprobar reintentos contra fuerza bruta
  IF v_invitation.attempts_count >= 5 THEN
    UPDATE public.coach_student_invitations SET status = 'REVOKED', updated_at = now() WHERE id = v_invitation.id;
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Demasiados intentos fallidos. Por seguridad, la invitación fue bloqueada. Solicita una nueva.'
    );
  END IF;

  -- Resolver datos de jugador
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

  -- Comprobar si ya existe una cuenta Auth activa previa para este correo con contraseña
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE lower(btrim(email)) = lower(btrim(v_invitation.email))
      AND encrypted_password IS NOT NULL
      AND encrypted_password <> ''
  ) INTO v_is_existing_account;

  -- Comprobar si el correo ya está verificado en auth.users
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE lower(btrim(email)) = lower(btrim(v_invitation.email))
      AND email_confirmed_at IS NOT NULL
  ) INTO v_is_email_verified;

  RETURN jsonb_build_object(
    'ok', true,
    'invitation_id', v_invitation.id,
    'email', v_invitation.email,
    'student_name', v_jugador.nombre,
    'riviera_id', v_jugador.riviera_id,
    'club_name', v_org_user.nombre,
    'coach_name', v_coach.nombre,
    'expires_at', v_invitation.expires_at,
    'is_existing_account', v_is_existing_account,
    'is_email_verified', v_is_email_verified
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_student_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_student_invitation(text) TO anon, authenticated, service_role;

-- 3. ACTUALIZAR claim_student_invitation EXIGIENDO CORREO VERIFICADO
DROP FUNCTION IF EXISTS public.claim_student_invitation(text);

CREATE OR REPLACE FUNCTION public.claim_student_invitation(
  p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_email text;
  v_email_confirmed_at timestamptz;
  v_clean_token text := btrim(COALESCE(p_token, ''));
  v_hash text;
  v_invitation record;
  v_jugador record;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Debes iniciar sesión con tu cuenta para vincular tu perfil.');
  END IF;

  SELECT lower(btrim(email)), email_confirmed_at INTO v_caller_email, v_email_confirmed_at
  FROM auth.users
  WHERE id = v_caller;

  IF v_email_confirmed_at IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Tu correo electrónico debe estar verificado para vincular tu perfil.'
    );
  END IF;

  IF v_clean_token = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token de invitación no proporcionado.');
  END IF;

  v_hash := encode(extensions.digest(v_clean_token::bytea, 'sha256'), 'hex');

  SELECT * INTO v_invitation
  FROM public.coach_student_invitations
  WHERE (token_hash = v_hash OR invitation_token = v_clean_token)
  FOR UPDATE;

  IF v_invitation.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitación no encontrada.');
  END IF;

  IF v_invitation.status <> 'PENDING' OR v_invitation.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta invitación ya no está activa o ha expirado.');
  END IF;

  -- Comprobar que el usuario autenticado coincide con el correo invitado
  IF lower(btrim(v_invitation.email)) <> v_caller_email THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'La cuenta autenticada (' || v_caller_email || ') no coincide con el correo de la invitación (' || v_invitation.email || ').'
    );
  END IF;

  -- Comprobar que el club mantiene relación con el alumno
  IF NOT EXISTS (
    SELECT 1 FROM public.coach_player_relationships
    WHERE organizador_id = v_invitation.organizador_id
      AND jugador_id = v_invitation.jugador_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El club no administra este perfil deportivo.');
  END IF;

  -- Vincular multiclub de forma segura sin alterar contraseñas ni roles
  INSERT INTO public.coach_student_account_links (
    organizador_id,
    jugador_id,
    auth_user_id,
    verification_method,
    is_active,
    student_email
  ) VALUES (
    v_invitation.organizador_id,
    v_invitation.jugador_id,
    v_caller,
    'STUDENT_AUTH_VERIFIED',
    true,
    v_caller_email
  ) ON CONFLICT (organizador_id, jugador_id) DO UPDATE
  SET auth_user_id = v_caller,
      is_active = true,
      student_email = v_caller_email,
      verification_method = 'STUDENT_AUTH_VERIFIED',
      deactivated_at = NULL,
      deactivated_by = NULL,
      updated_at = now();

  -- Marcar invitación como aceptada
  UPDATE public.coach_student_invitations
  SET status = 'ACCEPTED',
      accepted_at = now(),
      accepted_by = v_caller,
      updated_at = now()
  WHERE id = v_invitation.id;

  SELECT rj.nombre, i.riviera_id INTO v_jugador
  FROM public.riviera_jugadores rj
  LEFT JOIN public.riviera_official_player_identity i ON i.canonical_riviera_jugador_id = rj.id
  WHERE rj.id = v_invitation.jugador_id;

  RETURN jsonb_build_object(
    'ok', true,
    'student_name', v_jugador.nombre,
    'riviera_id', v_jugador.riviera_id,
    'message', '¡Perfil deportivo vinculado exitosamente a tu cuenta de AppRiviera!'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_student_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_student_invitation(text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
