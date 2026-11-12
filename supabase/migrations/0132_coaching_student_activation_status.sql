-- El acceso activo de un alumno exige contraseña configurada.
-- Un vínculo o un correo no bastan para mostrar ACCESO ACTIVO.
-- No modifica filas de alumnos ni contraseñas.

BEGIN;

CREATE OR REPLACE FUNCTION public.student_auth_has_password(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = p_user_id
      AND encrypted_password IS NOT NULL
      AND length(encrypted_password) > 0
  );
$$;

REVOKE ALL ON FUNCTION public.student_auth_has_password(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.student_auth_has_password(uuid) TO service_role;

COMMENT ON FUNCTION public.student_auth_has_password(uuid) IS
  'Indica si el usuario Auth ya definió contraseña. Solo service_role. No devuelve el secreto.';

CREATE OR REPLACE FUNCTION public.get_club_student_access_status(
  p_organizador_id uuid,
  p_jugador_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_authorized boolean;
  v_has_relationship boolean;
  v_link record;
  v_invitation record;
  v_jugador record;
  v_has_password boolean := false;
  v_auth_email text;
  v_confirmed_at timestamptz;
  v_activated_at timestamptz;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  PERFORM public.check_student_only_restriction();

  v_is_authorized := public.is_master_admin() OR (p_organizador_id = v_caller);
  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado para consultar este club');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.coach_player_relationships
    WHERE organizador_id = p_organizador_id
      AND jugador_id = p_jugador_id
      AND status IN ('ACTIVE', 'PAUSED')
  ) INTO v_has_relationship;

  IF NOT v_has_relationship AND NOT public.is_master_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El club no administra este perfil deportivo.');
  END IF;

  SELECT id, nombre, email INTO v_jugador
  FROM public.riviera_jugadores
  WHERE id = p_jugador_id;

  IF v_jugador.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Alumno no encontrado');
  END IF;

  SELECT * INTO v_link
  FROM public.coach_student_account_links
  WHERE organizador_id = p_organizador_id
    AND jugador_id = p_jugador_id;

  IF v_link.id IS NOT NULL AND v_link.auth_user_id IS NOT NULL THEN
    SELECT
      (encrypted_password IS NOT NULL AND length(encrypted_password) > 0),
      email,
      email_confirmed_at
    INTO v_has_password, v_auth_email, v_confirmed_at
    FROM auth.users
    WHERE id = v_link.auth_user_id;
  END IF;

  SELECT accepted_at INTO v_activated_at
  FROM public.coach_student_invitations
  WHERE organizador_id = p_organizador_id
    AND jugador_id = p_jugador_id
    AND status = 'ACCEPTED'
    AND accepted_at IS NOT NULL
  ORDER BY accepted_at DESC
  LIMIT 1;

  IF v_activated_at IS NULL AND v_has_password THEN
    v_activated_at := COALESCE(v_confirmed_at, v_link.created_at);
  END IF;

  SELECT * INTO v_invitation
  FROM public.coach_student_invitations
  WHERE organizador_id = p_organizador_id
    AND jugador_id = p_jugador_id
    AND status = 'PENDING'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_link.id IS NOT NULL AND NOT v_link.is_active THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'DEACTIVATED',
      'email', COALESCE(v_link.student_email, v_auth_email, v_jugador.email),
      'auth_user_id', v_link.auth_user_id,
      'is_active', false,
      'password_configured', v_has_password,
      'deactivated_at', v_link.deactivated_at,
      'activated_at', CASE WHEN v_has_password THEN v_activated_at ELSE NULL END,
      'created_at', v_link.created_at,
      'verification_method', v_link.verification_method
    );
  END IF;

  IF v_link.id IS NOT NULL AND v_link.is_active AND v_has_password THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'ACTIVE',
      'email', COALESCE(v_link.student_email, v_auth_email, v_jugador.email),
      'auth_user_id', v_link.auth_user_id,
      'is_active', true,
      'password_configured', true,
      'activated_at', v_activated_at,
      'created_at', v_link.created_at,
      'verification_method', v_link.verification_method
    );
  END IF;

  IF v_invitation.id IS NOT NULL OR (v_link.id IS NOT NULL AND NOT v_has_password) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'INVITATION_PENDING',
      'email', COALESCE(v_invitation.email, v_link.student_email, v_auth_email, v_jugador.email),
      'password_configured', false,
      'invited_at', v_invitation.invited_at,
      'expires_at', v_invitation.expires_at,
      'invitation_expired', v_invitation.id IS NOT NULL AND v_invitation.expires_at <= now(),
      'attempts_count', v_invitation.attempts_count
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'NO_ACCESS',
    'email', v_jugador.email,
    'password_configured', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_club_student_access_status(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_club_student_access_status(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reactivate_student_access(
  p_organizador_id uuid,
  p_jugador_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_authorized boolean;
  v_updated integer := 0;
  v_exists boolean := false;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  PERFORM public.check_student_only_restriction();

  v_is_authorized := public.is_master_admin() OR (p_organizador_id = v_caller);
  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.coach_student_account_links
    WHERE organizador_id = p_organizador_id
      AND jugador_id = p_jugador_id
  ) INTO v_exists;

  IF NOT v_exists THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Este alumno todavía no tiene una cuenta que reactivar. Envíale la invitación.'
    );
  END IF;

  UPDATE public.coach_student_account_links AS al
  SET is_active = true,
      deactivated_at = NULL,
      deactivated_by = NULL,
      updated_at = now()
  WHERE al.organizador_id = p_organizador_id
    AND al.jugador_id = p_jugador_id
    AND EXISTS (
      SELECT 1
      FROM auth.users u
      WHERE u.id = al.auth_user_id
        AND u.encrypted_password IS NOT NULL
        AND length(u.encrypted_password) > 0
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El alumno todavía no creó su contraseña. Reenvía la invitación para que active su cuenta.'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'ACTIVE',
    'message', 'Acceso de alumno reactivado en este club.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reactivate_student_access(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reactivate_student_access(uuid, uuid) TO authenticated, service_role;

-- El login con Riviera ID debe poder comprobar la contraseña aunque el club
-- haya pausado el acceso. La función de login decide después si entrega sesión.
CREATE OR REPLACE FUNCTION public.resolve_student_login_identifier(
  p_identifier text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_clean text := upper(btrim(COALESCE(p_identifier, '')));
  v_email text;
BEGIN
  IF v_clean = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Identificador no proporcionado.');
  END IF;

  IF position('@' in v_clean) > 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'email', lower(btrim(p_identifier)),
      'resolved_from', 'email'
    );
  END IF;

  IF NOT (v_clean ~ '^RIV-[0-9A-Z]{3,16}$') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Identificador no válido.');
  END IF;

  SELECT COALESCE(NULLIF(btrim(al.student_email), ''), u.email)
  INTO v_email
  FROM public.riviera_official_player_identity i
  JOIN public.coach_student_account_links al
    ON al.jugador_id = i.canonical_riviera_jugador_id
  LEFT JOIN auth.users u
    ON u.id = al.auth_user_id
  WHERE upper(btrim(i.riviera_id)) = v_clean
  ORDER BY al.is_active DESC, al.updated_at DESC
  LIMIT 1;

  IF v_email IS NULL THEN
    SELECT COALESCE(NULLIF(btrim(inv.email), ''), u.email)
    INTO v_email
    FROM public.riviera_official_player_identity i
    JOIN public.coach_student_invitations inv
      ON inv.jugador_id = i.canonical_riviera_jugador_id
    LEFT JOIN auth.users u
      ON u.id = inv.auth_user_id
    WHERE upper(btrim(i.riviera_id)) = v_clean
      AND inv.status IN ('ACCEPTED', 'PENDING')
    ORDER BY inv.created_at DESC
    LIMIT 1;
  END IF;

  IF v_email IS NULL OR btrim(v_email) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Identificador no válido.');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'email', lower(btrim(v_email)),
    'riviera_id', v_clean,
    'resolved_from', 'riviera_id'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_student_login_identifier(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_student_login_identifier(text) TO service_role;

COMMENT ON FUNCTION public.resolve_student_login_identifier(text) IS
  'Resuelve el correo de un alumno desde su Riviera ID. Solo service_role. No indica si la cuenta existe al cliente.';

NOTIFY pgrst, 'reload schema';

COMMIT;
