-- Riviera Coaching — Resolución Segura de Identificador (Riviera ID / Correo) para Login de Alumnos
-- Migración: 0088_coaching_student_riviera_id_login.sql
-- Propósito:
-- Permite al alumno iniciar sesión ingresando tanto su correo electrónico como su Riviera ID oficial (ej. RIV-00000107).
-- La función resuelve el email legítimo asociado para signInWithPassword sin exponer directorios de jugadores.

BEGIN;

CREATE OR REPLACE FUNCTION public.resolve_student_login_identifier(
  p_identifier text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_clean text := upper(btrim(COALESCE(p_identifier, '')));
  v_email text;
  v_auth_user_id uuid;
BEGIN
  IF v_clean = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Identificador no proporcionado.');
  END IF;

  -- 1. Si contiene '@', es directamente un correo electrónico
  IF position('@' in v_clean) > 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'email', lower(btrim(p_identifier)),
      'resolved_from', 'email'
    );
  END IF;

  -- 2. Validar formato de Riviera ID canónico (RIV-XXXXX o RIV-XXXXXXXX)
  IF NOT (v_clean ~ '^RIV-[0-9A-Z]{3,16}$') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Formato de Riviera ID no válido. Utiliza tu correo o tu Riviera ID oficial (ej. RIV-00000107).'
    );
  END IF;

  -- 3. Prioridad 1: Vínculo activo de alumno en coach_student_account_links
  SELECT COALESCE(NULLIF(btrim(al.student_email), ''), u.email), al.auth_user_id
  INTO v_email, v_auth_user_id
  FROM public.riviera_official_player_identity i
  JOIN public.coach_student_account_links al
    ON al.jugador_id = i.canonical_riviera_jugador_id
  LEFT JOIN auth.users u
    ON u.id = al.auth_user_id
  WHERE upper(btrim(i.riviera_id)) = v_clean
    AND al.is_active = true
  ORDER BY al.updated_at DESC
  LIMIT 1;

  -- 4. Prioridad 2: Invitación aceptada o pendiente en coach_student_invitations
  IF v_email IS NULL THEN
    SELECT COALESCE(NULLIF(btrim(inv.email), ''), u.email), inv.auth_user_id
    INTO v_email, v_auth_user_id
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

  -- 5. Prioridad 3: Perfil registrado en riviera_jugadores
  IF v_email IS NULL THEN
    SELECT rj.email
    INTO v_email
    FROM public.riviera_official_player_identity i
    JOIN public.riviera_jugadores rj
      ON rj.id = i.canonical_riviera_jugador_id
    WHERE upper(btrim(i.riviera_id)) = v_clean
      AND rj.email IS NOT NULL AND btrim(rj.email) <> ''
    LIMIT 1;
  END IF;

  IF v_email IS NULL OR btrim(v_email) = '' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No se encontró ninguna cuenta de alumno asociada al Riviera ID ' || v_clean || '. Verifica tu identificador o ingresa con tu correo registrado.'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'email', lower(btrim(v_email)),
    'riviera_id', v_clean,
    'resolved_from', 'riviera_id'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_student_login_identifier(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_student_login_identifier(text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.resolve_student_login_identifier(text) IS
  'Resuelve el correo de login de un alumno a partir de su Riviera ID oficial para autenticación con contraseña.';

NOTIFY pgrst, 'reload schema';

COMMIT;
