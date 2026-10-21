-- =============================================================================
-- MIGRACIÓN 0085: CIERRE DEFINITIVO DEL ACCESO DEL ALUMNO
-- 
-- 1. check_student_invitation_account: Búsqueda autorizada y completa de cuentas
--    en auth.users sin paginación limitada a 50 registros. Rechaza cuentas
--    administrativas, cuentas de entrenador y cuentas vinculadas a otro Riviera ID.
-- 2. claim_student_invitation: RPC reforzada que valida sesión GoTrue confirmada,
--    bloquea colisiones con otros Riviera IDs, rechaza cuentas privilegiadas,
--    asegura STUDENT_ONLY y registra el vínculo multiclub legítimo.
-- 3. verify_student_invitation: Resuelve el nombre comercial del club mediante
--    get_organizador_display_name para que nunca exponga el correo del organizador.
-- =============================================================================

BEGIN;

-- ── 1. RPC AUTORIZADA DE BÚSQUEDA DE CUENTAS EXISTENTES ────────────────────
CREATE OR REPLACE FUNCTION public.check_student_invitation_account(
  p_email text,
  p_target_jugador_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_clean_email text := lower(btrim(COALESCE(p_email, '')));
  v_user record;
  v_is_admin boolean := false;
  v_is_coach boolean := false;
  v_linked_link record;
  v_account_type text;
BEGIN
  IF v_clean_email = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Correo electrónico requerido');
  END IF;

  -- 1. Búsqueda exhaustiva por índice en auth.users
  SELECT u.id, u.email, u.email_confirmed_at, u.raw_app_meta_data, u.raw_user_meta_data
  INTO v_user
  FROM auth.users u
  WHERE lower(btrim(u.email)) = v_clean_email
  LIMIT 1;

  IF v_user.id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'exists', false,
      'can_invite', true,
      'can_invite_as_new', true
    );
  END IF;

  -- 2. Comprobar si la cuenta es administrativa de club o master admin
  IF EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = v_user.id
  ) OR EXISTS (
    SELECT 1 FROM public.organizador_game_modes WHERE organizador_id = v_user.id
  ) OR COALESCE(v_user.raw_app_meta_data->>'account_type', '') = 'CLUB_ADMIN'
    OR COALESCE(v_user.raw_user_meta_data->>'account_type', '') = 'CLUB_ADMIN' THEN
    v_is_admin := true;
  END IF;

  -- 3. Comprobar si la cuenta es de entrenador
  IF EXISTS (
    SELECT 1 FROM public.riviera_coaches WHERE auth_user_id = v_user.id
  ) OR COALESCE(v_user.raw_app_meta_data->>'account_type', '') = 'COACH_ONLY'
    OR COALESCE(v_user.raw_user_meta_data->>'account_type', '') = 'COACH_ONLY' THEN
    v_is_coach := true;
  END IF;

  -- Si es cuenta administrativa o de entrenador, rechazar terminantemente
  IF v_is_admin OR v_is_coach THEN
    RETURN jsonb_build_object(
      'ok', true,
      'exists', true,
      'is_privileged', true,
      'is_admin', v_is_admin,
      'is_coach', v_is_coach,
      'can_invite', false,
      'error', 'El correo ' || v_clean_email || ' pertenece a una cuenta administrativa o de entrenador. No puede utilizarse para un acceso exclusivo de alumno. Solicita al alumno un correo particular alternativo.'
    );
  END IF;

  -- 4. Comprobar si la cuenta ya está vinculada a otro alumno con Riviera ID distinto
  SELECT al.jugador_id, i.riviera_id INTO v_linked_link
  FROM public.coach_student_account_links al
  LEFT JOIN public.riviera_official_player_identity i ON i.canonical_riviera_jugador_id = al.jugador_id
  WHERE al.auth_user_id = v_user.id
  LIMIT 1;

  IF v_linked_link.jugador_id IS NOT NULL AND v_linked_link.jugador_id <> p_target_jugador_id THEN
    RETURN jsonb_build_object(
      'ok', true,
      'exists', true,
      'is_other_student', true,
      'can_invite', false,
      'error', 'El correo ya está vinculado a otro alumno con Riviera ID ' || COALESCE(v_linked_link.riviera_id, 'distinto') || '. Bloqueado por seguridad.'
    );
  END IF;

  -- 5. Cuenta STUDENT_ONLY legítima del mismo alumno
  v_account_type := COALESCE(
    v_user.raw_app_meta_data->>'account_type',
    v_user.raw_user_meta_data->>'account_type',
    'STUDENT_ONLY'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'exists', true,
    'user_id', v_user.id,
    'email_confirmed', (v_user.email_confirmed_at IS NOT NULL),
    'account_type', v_account_type,
    'is_same_student', (v_linked_link.jugador_id = p_target_jugador_id),
    'can_invite', true
  );
END;
$$;

COMMENT ON FUNCTION public.check_student_invitation_account(text, uuid) IS
  'Comprobación autorizada y exhaustiva de cuentas para invitaciones de alumno. Bloquea cuentas privilegiadas y colisiones de Riviera ID.';

REVOKE ALL ON FUNCTION public.check_student_invitation_account(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_student_invitation_account(text, uuid) TO authenticated, service_role;


-- ── 2. ACTUALIZAR verify_student_invitation CON NOMBRE COMERCIAL ───────────
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
  v_coach record;
  v_club_name text;
  v_is_existing_account boolean := false;
  v_is_email_verified boolean := false;
BEGIN
  IF v_clean_token = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token de invitación no proporcionado.');
  END IF;

  v_hash := encode(extensions.digest(v_clean_token::bytea, 'sha256'), 'hex');

  SELECT * INTO v_invitation
  FROM public.coach_student_invitations
  WHERE (token_hash = v_hash OR invitation_token = v_clean_token)
  LIMIT 1;

  IF v_invitation.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitación no encontrada o token inválido.');
  END IF;

  IF v_invitation.status = 'ACCEPTED' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'is_already_accepted', true,
      'error', 'Esta invitación ya fue activada previamente. Inicia sesión con tu correo y contraseña.'
    );
  END IF;

  IF v_invitation.status = 'REVOKED' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Esta invitación fue cancelada por el club. Solicita una nueva invitación a tu entrenador o administración.'
    );
  END IF;

  IF v_invitation.expires_at < now() THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Esta invitación ha expirado. Solicita a tu club que te envíe una nueva invitación.'
    );
  END IF;

  IF COALESCE(v_invitation.attempts_count, 0) >= 10 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Demasiados intentos fallidos. Por seguridad, la invitación fue bloqueada. Solicita una nueva.'
    );
  END IF;

  -- Resolver datos de jugador y Riviera ID canónico
  SELECT rj.id, rj.nombre, rj.email, i.riviera_id INTO v_jugador
  FROM public.riviera_jugadores rj
  LEFT JOIN public.riviera_official_player_identity i ON i.canonical_riviera_jugador_id = rj.id
  WHERE rj.id = v_invitation.jugador_id;

  -- Resolver nombre comercial real del club (Hack Pádel, etc.)
  v_club_name := public.get_organizador_display_name(v_invitation.organizador_id);

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
    'club_name', v_club_name,
    'coach_name', v_coach.nombre,
    'expires_at', v_invitation.expires_at,
    'is_existing_account', v_is_existing_account,
    'is_email_verified', v_is_email_verified
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_student_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_student_invitation(text) TO anon, authenticated, service_role;


-- ── 3. ACTUALIZAR claim_student_invitation CON BLINDAJE REFORZADO ───────────
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
      'error', 'Tu correo electrónico debe estar verificado antes de vincular tu perfil.'
    );
  END IF;

  -- Bloquear cuentas administrativas o de entrenador
  IF EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = v_caller
  ) OR EXISTS (
    SELECT 1 FROM public.organizador_game_modes WHERE organizador_id = v_caller
  ) OR EXISTS (
    SELECT 1 FROM public.riviera_coaches WHERE auth_user_id = v_caller
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Esta cuenta es administrativa o de entrenador. El acceso de alumno requiere una cuenta exclusiva de alumno.'
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

  -- Bloquear si el usuario ya está vinculado a otro alumno con Riviera ID distinto
  IF EXISTS (
    SELECT 1 FROM public.coach_student_account_links
    WHERE auth_user_id = v_caller AND jugador_id <> v_invitation.jugador_id
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Esta cuenta ya está vinculada a otro perfil deportivo de alumno con un Riviera ID diferente.'
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

  -- Vincular multiclub de forma segura
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

  -- Asegurar metadatos STUDENT_ONLY de forma segura en auth.users
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"account_type": "STUDENT_ONLY", "role": "student"}'::jsonb,
      raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"account_type": "STUDENT_ONLY"}'::jsonb
  WHERE id = v_caller
    AND COALESCE(raw_app_meta_data->>'account_type', '') <> 'STUDENT_ONLY';

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
    'message', '¡Perfil deportivo vinculado exitosamente a tu cuenta de alumno!'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_student_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_student_invitation(text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

