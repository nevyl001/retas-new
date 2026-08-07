-- =============================================================================
-- LOCAL ONLY — Padel Court Series (PCS) organizador fixture
-- Fuente de verdad de modos/branding = configuración oficial de PRODUCCIÓN.
-- Auth password: SOLO desarrollo local (PcsLocal2026!). NUNCA la de prod.
-- Idempotente: seguro re-ejecutar / db reset.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_org_id constant uuid := '35e31ab8-2a2f-4526-9e84-e130c85f8ca9';
  v_email constant text := 'padelcourtseries@gmail.com';
  v_name constant text := 'Padel Court Series';
  -- Password local de desarrollo únicamente. No es la de producción.
  v_local_password constant text := 'PcsLocal2026!';
BEGIN
  -- 1) auth.users (idempotent)
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = v_org_id) THEN
    UPDATE auth.users
    SET
      email = v_email,
      encrypted_password = crypt(v_local_password, gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      raw_app_meta_data = COALESCE(
        raw_app_meta_data,
        '{"provider":"email","providers":["email"]}'::jsonb
      ),
      raw_user_meta_data = jsonb_build_object('name', v_name),
      updated_at = now()
    WHERE id = v_org_id;
  ELSE
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
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_org_id,
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_local_password, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', v_name),
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  END IF;

  -- 2) auth.identities (required for email/password login)
  IF EXISTS (
    SELECT 1 FROM auth.identities
    WHERE user_id = v_org_id AND provider = 'email'
  ) THEN
    UPDATE auth.identities
    SET
      provider_id = v_email,
      identity_data = jsonb_build_object(
        'sub', v_org_id::text,
        'email', v_email,
        'email_verified', true
      ),
      updated_at = now()
    WHERE user_id = v_org_id AND provider = 'email';
  ELSE
    INSERT INTO auth.identities (
      id,
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    )
    VALUES (
      gen_random_uuid(),
      v_email,
      v_org_id,
      jsonb_build_object(
        'sub', v_org_id::text,
        'email', v_email,
        'email_verified', true
      ),
      'email',
      now(),
      now(),
      now()
    );
  END IF;

  -- 3) public.users (trigger may create OGM defaults — overwritten in step 4)
  INSERT INTO public.users (id, email, name, created_at, updated_at)
  VALUES (v_org_id, v_email, v_name, now(), now())
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    name = EXCLUDED.name,
    updated_at = now();

  -- 4) organizador_game_modes — EXACT mirror of production PCS config
  --    Overwrites trigger defaults (RR/duelo) with official prod flags.
  INSERT INTO public.organizador_game_modes (
    organizador_id,
    reta_equipos,
    round_robin,
    americano,
    mini_torneo,
    liga,
    duelo_2v2,
    permite_ajuste_puntos_manuales,
    visible_ranking_oficial,
    premium_branding_enabled,
    branding_key,
    updated_at
  )
  VALUES (
    v_org_id,
    false,  -- reta_equipos
    false,  -- round_robin
    false,  -- americano
    true,   -- mini_torneo (Torneos)
    false,  -- liga
    false,  -- duelo_2v2
    true,   -- permite_ajuste_puntos_manuales
    false,  -- visible_ranking_oficial
    true,   -- premium_branding_enabled
    'padel-court-series',
    now()
  )
  ON CONFLICT (organizador_id) DO UPDATE
  SET
    reta_equipos = EXCLUDED.reta_equipos,
    round_robin = EXCLUDED.round_robin,
    americano = EXCLUDED.americano,
    mini_torneo = EXCLUDED.mini_torneo,
    liga = EXCLUDED.liga,
    duelo_2v2 = EXCLUDED.duelo_2v2,
    permite_ajuste_puntos_manuales = EXCLUDED.permite_ajuste_puntos_manuales,
    visible_ranking_oficial = EXCLUDED.visible_ranking_oficial,
    premium_branding_enabled = EXCLUDED.premium_branding_enabled,
    branding_key = EXCLUDED.branding_key,
    updated_at = now();
END $$;
