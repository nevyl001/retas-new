-- ==============================================================================
-- scripts/test-coaching-cierre-0081.sql
-- Setup y Verificación de Cierre de Seguridad 0081 en Supabase
-- ==============================================================================

DO $$
DECLARE
  v_org_id_1 uuid := '00000000-0000-0000-0000-000000000091'::uuid;
  v_coach_id_1 uuid := '00000000-0000-0000-0000-000000000092'::uuid;
  v_student_id uuid := '00000000-0000-0000-0000-000000000093'::uuid;
  v_auth_student_id uuid := '00000000-0000-0000-0000-000000000094'::uuid;
  v_existing_user_id uuid := '00000000-0000-0000-0000-000000000095'::uuid;
  v_org_id_2 uuid := '00000000-0000-0000-0000-000000000096'::uuid;
  v_coach_id_2 uuid := '00000000-0000-0000-0000-000000000097'::uuid;

  v_raw_token_new text := 'token_zaid_0081_abc1234567890abcdef1234567890abcdef12345';
  v_token_hash_new text;

  v_raw_token_existing text := 'token_exist_0081_abc1234567890abcdef1234567890abcdef12345';
  v_token_hash_existing text;

  v_res jsonb;
  v_proc_count integer;
BEGIN
  RAISE NOTICE '── INICIO SETUP TEST FIXTURE 0081 ──';

  -- 1. LIMPIEZA PREVIA
  DELETE FROM public.coach_student_invitations WHERE organizador_id IN (v_org_id_1, v_org_id_2);
  DELETE FROM public.coach_student_account_links WHERE organizador_id IN (v_org_id_1, v_org_id_2) OR auth_user_id IN (v_auth_student_id, v_existing_user_id);
  DELETE FROM public.coach_player_class_balances WHERE organizador_id IN (v_org_id_1, v_org_id_2);
  DELETE FROM public.coach_player_relationships WHERE organizador_id IN (v_org_id_1, v_org_id_2);
  DELETE FROM public.coach_club_memberships WHERE organizador_id IN (v_org_id_1, v_org_id_2);
  DELETE FROM public.riviera_official_player_identity WHERE canonical_riviera_jugador_id = v_student_id;
  DELETE FROM public.riviera_jugadores WHERE id = v_student_id;
  DELETE FROM public.riviera_coaches WHERE id IN (v_coach_id_1, v_coach_id_2);
  DELETE FROM public.organizador_game_modes WHERE organizador_id IN (v_org_id_1, v_org_id_2);
  DELETE FROM public.users WHERE id IN (v_org_id_1, v_org_id_2, v_auth_student_id, v_existing_user_id);
  DELETE FROM auth.identities WHERE user_id IN (v_auth_student_id, v_existing_user_id);
  DELETE FROM auth.users WHERE id IN (v_org_id_1, v_org_id_2, v_auth_student_id, v_existing_user_id, '00000000-0000-0000-0000-000000000098'::uuid, '00000000-0000-0000-0000-000000000099'::uuid);

  -- 2. VERIFICAR ELIMINACIÓN DE RPCS ANTIGUAS
  SELECT count(*) INTO v_proc_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN ('create_or_invite_student_access', 'resend_student_invitation');

  IF v_proc_count > 0 THEN
    RAISE EXCEPTION 'TEST FALLÓ: Funciones obsoletas aún existen en pg_proc (% encontradas)', v_proc_count;
  END IF;
  RAISE NOTICE '✓ RPCs obsoletas no existen en el esquema public.';

  -- 3. CLUB 1 (Hack Pádel Test) Y CLUB 2 (Club Riviera Test)
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (v_org_id_1, 'hackpadel_0081@test.com', '{"nombre":"Hack Pádel Test"}'::jsonb),
         (v_org_id_2, 'rivieraclub_0081@test.com', '{"nombre":"Club Riviera Test"}'::jsonb);

  INSERT INTO public.users (id, email, name)
  VALUES (v_org_id_1, 'hackpadel_0081@test.com', 'Hack Pádel Test'),
         (v_org_id_2, 'rivieraclub_0081@test.com', 'Club Riviera Test');

  INSERT INTO public.organizador_game_modes (organizador_id, coaching_enabled)
  VALUES (v_org_id_1, true), (v_org_id_2, true)
  ON CONFLICT (organizador_id) DO UPDATE SET coaching_enabled = true;

  -- 4. COACHES
  INSERT INTO auth.users (id, email)
  VALUES ('00000000-0000-0000-0000-000000000098'::uuid, 'coach_javier_0081@test.com'),
         ('00000000-0000-0000-0000-000000000099'::uuid, 'coach_segundo_0081@test.com');

  INSERT INTO public.riviera_coaches (id, auth_user_id, nombre)
  VALUES (v_coach_id_1, '00000000-0000-0000-0000-000000000098'::uuid, 'Coach Javier Test'),
         (v_coach_id_2, '00000000-0000-0000-0000-000000000099'::uuid, 'Coach Segundo Test');

  INSERT INTO public.coach_club_memberships (organizador_id, coach_id, status)
  VALUES (v_org_id_1, v_coach_id_1, 'ACTIVE'),
         (v_org_id_2, v_coach_id_2, 'ACTIVE');

  -- 5. ALUMNO (Zaid) Y RIVIERA ID
  INSERT INTO public.riviera_jugadores (id, nombre, slug, organizador_id)
  VALUES (v_student_id, 'Zaid Piloto 0081', 'zaid-piloto-0081', v_org_id_1);

  INSERT INTO public.riviera_official_player_identity (canonical_riviera_jugador_id, riviera_id, riviera_id_serial)
  VALUES (v_student_id, 'RIV-77770081', 77770081);

  -- Relación Club 1: 12 clases disponibles
  INSERT INTO public.coach_player_relationships (id, organizador_id, coach_id, jugador_id, status, is_primary)
  VALUES ('00000000-0000-0000-0000-00000000009a'::uuid, v_org_id_1, v_coach_id_1, v_student_id, 'ACTIVE', true);

  INSERT INTO public.coach_player_class_balances (relationship_id, organizador_id, coach_id, jugador_id, balance_classes, total_classes_given)
  VALUES ('00000000-0000-0000-0000-00000000009a'::uuid, v_org_id_1, v_coach_id_1, v_student_id, 12, 3);

  -- 6. USUARIO AUTH ALUMNO NUEVO (inicialmente email_confirmed_at = NULL para probar rechazo de email no verificado)
  -- Nota: Usamos una contraseña hash válida de bcrypt para cuando se confirme el login real
  -- "$2a$10$wE9mG5Pcm6fG.yD6kO5hie1b0zZ2VjI9o9zO/L5c0J.W7aT1oJcWW" = "PilotoPassword123!"
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    aud, role, confirmation_token, recovery_token, email_change,
    email_change_token_current, email_change_token_new, phone_change,
    phone_change_token, reauthentication_token, is_super_admin
  ) VALUES (
    v_auth_student_id,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'zaid.piloto.0081@appriviera-pilot.com',
    '$2a$10$wE9mG5Pcm6fG.yD6kO5hie1b0zZ2VjI9o9zO/L5c0J.W7aT1oJcWW',
    NULL, -- CORREO NO CONFIRMADO INICIALMENTE
    '{"provider":"email","providers":["email"],"role":"student","account_type":"STUDENT_ONLY","roles":["student"]}'::jsonb,
    '{"name":"Zaid Piloto 0081","account_type":"STUDENT_ONLY"}'::jsonb,
    now(), now(),
    'authenticated', 'authenticated', '', '', '', '', '', '', '', '', false
  );

  INSERT INTO auth.identities (
    id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_auth_student_id,
    v_auth_student_id::text,
    v_auth_student_id,
    jsonb_build_object('sub', v_auth_student_id::text, 'email', 'zaid.piloto.0081@appriviera-pilot.com'),
    'email',
    now(), now(), now()
  );

  INSERT INTO public.users (id, email, name)
  VALUES (v_auth_student_id, 'zaid.piloto.0081@appriviera-pilot.com', 'Zaid Piloto 0081');

  -- 7. INSERTAR INVITACIÓN CON HASH SHA-256
  v_token_hash_new := encode(extensions.digest(v_raw_token_new::bytea, 'sha256'), 'hex');

  INSERT INTO public.coach_student_invitations (
    organizador_id, coach_id, jugador_id, email, token_hash, auth_user_id, status, expires_at, invited_by
  ) VALUES (
    v_org_id_1, v_coach_id_1, v_student_id, 'zaid.piloto.0081@appriviera-pilot.com',
    v_token_hash_new, v_auth_student_id, 'PENDING', now() + interval '7 days', v_org_id_1
  );

  -- 8. COMPROBAR verify_student_invitation
  v_res := public.verify_student_invitation(v_raw_token_new);
  RAISE NOTICE 'verify_student_invitation resultado: %', v_res;

  IF (v_res->>'ok')::boolean IS NOT true THEN
    RAISE EXCEPTION 'verify_student_invitation falló: %', v_res->>'error';
  END IF;

  IF (v_res->>'is_email_verified')::boolean IS NOT false THEN
    RAISE EXCEPTION 'is_email_verified debió ser false para correo no verificado, pero fue %', v_res->>'is_email_verified';
  END IF;
  RAISE NOTICE '✓ verify_student_invitation detecta correctamente correo NO verificado (is_email_verified = false).';

  RAISE NOTICE '── FIXTURE 0081 CREADO EXITOSAMENTE ──';
END $$;
