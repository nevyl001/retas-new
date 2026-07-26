-- ══════════════════════════════════════════════════════════════════════════════
-- HOTFIX DE SEGURIDAD — admin_sync_auth_email_identity sin validación de admin
--
-- Vulnerabilidad (confirmada explotable con la anon key pública, auditoría 2026-07-26):
--   La función es SECURITY DEFINER y tenía EXECUTE otorgado a PUBLIC (default de
--   Postgres al crearse, nunca revocado). Su cuerpo no validaba auth.uid() ni rol
--   alguno: aceptaba cualquier p_user_id y reescribía directamente auth.users.email
--   y auth.identities. Cualquier usuario anónimo podía cambiar el correo de login
--   de cualquier organizador y luego tomar la cuenta vía "olvidé mi contraseña".
--
-- Fix mínimo (corregido): la protección NO puede ser un guard is_master_admin()
-- dentro del cuerpo, porque el único caller real (Edge Function
-- admin-actualizar-email-usuario) invoca esta función con el cliente
-- service_role SIN reenviar el JWT del usuario final — dentro de esa llamada
-- auth.uid() es NULL, así que un guard is_master_admin() aquí adentro
-- bloquearía también la llamada legítima. La protección real ya vive en el
-- Edge Function (supabaseCaller.auth.getUser() + verificación contra
-- admin_users con el cliente service_role, ANTES de invocar esta RPC — ver
-- supabase/functions/admin-actualizar-email-usuario/index.ts líneas 121-157).
-- Aquí la protección es a nivel de GRANT: se revoca el EXECUTE implícito de
-- PUBLIC/anon/authenticated y se deja EXCLUSIVAMENTE a service_role, que solo
-- puede invocarse desde código de servidor de confianza (nunca desde el
-- navegador) — nadie más que ese Edge Function puede llamar esta función.
--
-- El cuerpo de la función queda IDÉNTICO al original de producción (sin
-- ningún guard interno) — no se cambia la firma, el nombre, el tipo de
-- retorno ni ninguna línea de la lógica.
--
-- Idempotente: CREATE OR REPLACE FUNCTION y REVOKE/GRANT son repetibles sin error.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_sync_auth_email_identity(p_user_id uuid, p_new_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'auth', 'public'
AS $function$
DECLARE
  v_old_email text;
  v_identities_updated integer := 0;
  v_normalized text := lower(trim(p_new_email));
BEGIN
  IF p_user_id IS NULL OR v_normalized IS NULL OR v_normalized = '' THEN
    RAISE EXCEPTION 'Parámetros inválidos';
  END IF;

  SELECT email INTO v_old_email
  FROM auth.users
  WHERE id = p_user_id;

  IF v_old_email IS NULL THEN
    RAISE EXCEPTION 'Usuario de acceso no encontrado';
  END IF;

  UPDATE auth.users
  SET
    email = v_normalized,
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now(),
    role = CASE WHEN role = 'anonymous' THEN 'authenticated' ELSE role END,
    aud = CASE WHEN aud = 'anonymous' THEN 'authenticated' ELSE aud END,
    is_anonymous = false
  WHERE id = p_user_id;

  UPDATE auth.identities
  SET
    provider_id = v_normalized,
    email = v_normalized,
    identity_data = jsonb_set(
      jsonb_set(
        COALESCE(identity_data, '{}'::jsonb),
        '{email}',
        to_jsonb(v_normalized),
        true
      ),
      '{email_verified}',
      'true'::jsonb,
      true
    ),
    updated_at = now()
  WHERE user_id = p_user_id
    AND provider = 'email';

  GET DIAGNOSTICS v_identities_updated = ROW_COUNT;

  IF v_identities_updated = 0 THEN
    INSERT INTO auth.identities (
      id,
      provider_id,
      user_id,
      identity_data,
      provider,
      email,
      created_at,
      updated_at
    )
    VALUES (
      gen_random_uuid(),
      v_normalized,
      p_user_id,
      jsonb_build_object(
        'email', v_normalized,
        'email_verified', true,
        'sub', p_user_id::text
      ),
      'email',
      v_normalized,
      now(),
      now()
    );
    v_identities_updated := 1;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', p_user_id,
    'old_email', v_old_email,
    'new_email', v_normalized,
    'identities_updated', v_identities_updated
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_sync_auth_email_identity(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_sync_auth_email_identity(uuid, text) TO service_role;
