-- Sincroniza auth.users + auth.identities tras cambio de correo por admin.
-- Invocada desde la Edge Function admin-actualizar-email-usuario (service_role).
-- Ejecutar en Supabase → SQL Editor.

CREATE OR REPLACE FUNCTION public.admin_sync_auth_email_identity(
  p_user_id uuid,
  p_new_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.admin_sync_auth_email_identity(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_sync_auth_email_identity(uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ── Reparar cuenta ya rota (Hackpadel / ejemplo) ──
-- Sustituye el UUID y el correo si hace falta:
-- SELECT public.admin_sync_auth_email_identity(
--   'e724de97-3552-4a01-a269-f621e6f1ed26'::uuid,
--   'aaronduran2020@gmail.com'
-- );
