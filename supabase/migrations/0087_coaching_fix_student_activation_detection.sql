-- ==============================================================================
-- 0087_coaching_fix_student_activation_detection.sql
-- Riviera Coaching — Distinción Real de Cuentas en verify_student_invitation
-- No interpretar auth.users.encrypted_password como cuenta previamente activada.
-- Distingue alumnos invitados nuevos de alumnos con cuenta STUDENT_ONLY ya activada.
-- ==============================================================================

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

  -- Distinción REAL de cuenta activada previamente:
  -- Una cuenta es pre-existente y ya activada SOLO si ya tiene un vínculo activo en coach_student_account_links.
  -- Nunca basarse en auth.users.encrypted_password, pues generateLink inserta un registro técnico con hash.
  SELECT EXISTS (
    SELECT 1 FROM public.coach_student_account_links al
    JOIN auth.users u ON u.id = al.auth_user_id
    WHERE lower(btrim(u.email)) = lower(btrim(v_invitation.email))
      AND al.is_active = true
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

COMMENT ON FUNCTION public.verify_student_invitation(text) IS
  'Valida tokens de invitación para alumnos. Distingue cuentas sin activar de cuentas previamente activadas según coach_student_account_links.';

