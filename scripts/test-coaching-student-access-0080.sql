DO $$
DECLARE
  v_org_id_1 uuid := '00000000-0000-0000-0000-000000000081'::uuid;
  v_org_id_2 uuid := '00000000-0000-0000-0000-000000000082'::uuid;
  v_coach_id_1 uuid := '00000000-0000-0000-0000-000000000083'::uuid;
  v_coach_id_2 uuid := '00000000-0000-0000-0000-000000000084'::uuid;
  v_student_id uuid := '00000000-0000-0000-0000-000000000085'::uuid;
  v_auth_student_id uuid := '00000000-0000-0000-0000-000000000086'::uuid;
  v_student_email text := 'student.test0080@riviera-test.com';

  v_raw_token text := 'testtoken0080abcdef1234567890abcdef1234567890abcdef1234567890';
  v_token_hash text;
  v_verify_res jsonb;
  v_claim_res jsonb;
  v_overview_res jsonb;
  v_proc_count integer;
  v_test_failed boolean;
  v_err_msg text;
BEGIN
  RAISE NOTICE '── INICIO DE VERIFICACIÓN FUNCIONAL 0080 (SECURITY HARDENING & MULTICLUB) ──';

  -- 1. LIMPIEZA PREVIA POR IDEMPOTENCIA
  DELETE FROM public.coach_student_invitations WHERE organizador_id IN (v_org_id_1, v_org_id_2);
  DELETE FROM public.coach_student_account_links WHERE organizador_id IN (v_org_id_1, v_org_id_2);
  DELETE FROM public.coach_player_class_balances WHERE organizador_id IN (v_org_id_1, v_org_id_2);
  DELETE FROM public.coach_player_relationships WHERE organizador_id IN (v_org_id_1, v_org_id_2);
  DELETE FROM public.coach_club_memberships WHERE organizador_id IN (v_org_id_1, v_org_id_2);
  DELETE FROM public.riviera_official_player_identity WHERE canonical_riviera_jugador_id = v_student_id;
  DELETE FROM public.riviera_jugadores WHERE id = v_student_id;
  DELETE FROM public.riviera_coaches WHERE id IN (v_coach_id_1, v_coach_id_2);
  DELETE FROM public.organizador_game_modes WHERE organizador_id IN (v_org_id_1, v_org_id_2);
  DELETE FROM auth.users WHERE id IN (v_org_id_1, v_org_id_2, v_auth_student_id, '00000000-0000-0000-0000-000000000087'::uuid, '00000000-0000-0000-0000-000000000088'::uuid);

  -- 2. VERIFICAR QUE activate_student_invitation FUE ELIMINADA DE DEFINITIVO
  SELECT count(*) INTO v_proc_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'activate_student_invitation';

  IF v_proc_count > 0 THEN
    RAISE EXCEPTION 'TEST 1 FALLÓ: activate_student_invitation aún existe en public (% funciones encontradas)', v_proc_count;
  END IF;
  RAISE NOTICE '✓ TEST 1 PASÓ: activate_student_invitation está completamente eliminada.';

  -- 3. SETUP DE DATOS LIMPIOS PARA CLUB 1, CLUB 2 Y ALUMNO
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (v_org_id_1, 'org1_0080@test.com', '{"nombre":"Club Alpha 0080"}'::jsonb)
  ON CONFLICT (id) DO UPDATE SET raw_user_meta_data = '{"nombre":"Club Alpha 0080"}'::jsonb;

  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (v_org_id_2, 'org2_0080@test.com', '{"nombre":"Club Beta 0080"}'::jsonb)
  ON CONFLICT (id) DO UPDATE SET raw_user_meta_data = '{"nombre":"Club Beta 0080"}'::jsonb;

  INSERT INTO public.organizador_game_modes (organizador_id, coaching_enabled)
  VALUES (v_org_id_1, true), (v_org_id_2, true)
  ON CONFLICT (organizador_id) DO UPDATE SET coaching_enabled = true;

  INSERT INTO auth.users (id, email)
  VALUES ('00000000-0000-0000-0000-000000000087'::uuid, 'coach1_0080@test.com'),
         ('00000000-0000-0000-0000-000000000088'::uuid, 'coach2_0080@test.com')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.riviera_coaches (id, auth_user_id, nombre)
  VALUES (v_coach_id_1, '00000000-0000-0000-0000-000000000087'::uuid, 'Coach Alpha 0080'),
         (v_coach_id_2, '00000000-0000-0000-0000-000000000088'::uuid, 'Coach Beta 0080')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.coach_club_memberships (organizador_id, coach_id, status)
  VALUES (v_org_id_1, v_coach_id_1, 'ACTIVE'),
         (v_org_id_2, v_coach_id_2, 'ACTIVE')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.riviera_jugadores (id, nombre, slug, organizador_id)
  VALUES (v_student_id, 'Alumno Multiclub 0080', 'alumno-multiclub-0080', v_org_id_1)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.riviera_official_player_identity (canonical_riviera_jugador_id, riviera_id, riviera_id_serial)
  VALUES (v_student_id, 'RIV-99990080', 99990080)
  ON CONFLICT (canonical_riviera_jugador_id) DO UPDATE SET riviera_id = 'RIV-99990080', riviera_id_serial = 99990080;

  INSERT INTO public.coach_player_relationships (id, organizador_id, coach_id, jugador_id, status, is_primary)
  VALUES ('00000000-0000-0000-0000-000000000089'::uuid, v_org_id_1, v_coach_id_1, v_student_id, 'ACTIVE', true),
         ('00000000-0000-0000-0000-00000000008a'::uuid, v_org_id_2, v_coach_id_2, v_student_id, 'ACTIVE', false)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.coach_player_class_balances (relationship_id, organizador_id, coach_id, jugador_id, balance_classes, total_classes_given)
  VALUES ('00000000-0000-0000-0000-000000000089'::uuid, v_org_id_1, v_coach_id_1, v_student_id, 8, 2),
         ('00000000-0000-0000-0000-00000000008a'::uuid, v_org_id_2, v_coach_id_2, v_student_id, 5, 1)
  ON CONFLICT (relationship_id) DO UPDATE SET balance_classes = EXCLUDED.balance_classes;

  -- 3. INSERTAR INVITACIÓN CON TOKEN HASH (SHA-256)
  v_token_hash := encode(extensions.digest(v_raw_token::bytea, 'sha256'), 'hex');

  INSERT INTO public.coach_student_invitations (
    organizador_id, coach_id, jugador_id, email, token_hash, status, expires_at, invited_by
  ) VALUES (
    v_org_id_1, v_coach_id_1, v_student_id, v_student_email, v_token_hash, 'PENDING', now() + interval '7 days', v_org_id_1
  );
  RAISE NOTICE '✓ TEST 2 PASÓ: Invitación insertada con token_hash SHA-256';

  -- 4. VERIFICAR INVITACIÓN PÚBLICA MEDIANTE HASH
  v_verify_res := public.verify_student_invitation(v_raw_token);
  IF (v_verify_res->>'ok')::boolean IS NOT TRUE 
     OR v_verify_res->>'student_name' <> 'Alumno Multiclub 0080'
     OR v_verify_res->>'riviera_id' <> 'RIV-99990080' THEN
    RAISE EXCEPTION 'TEST 3 FALLÓ: verify_student_invitation no devolvió los datos esperados: %', v_verify_res;
  END IF;
  RAISE NOTICE '✓ TEST 3 PASÓ: verify_student_invitation verificó exitosamente el hash del token';

  -- 5. RECLAMAR VÍNCULO PARA USUARIO AUTH EXISTENTE
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at)
  VALUES (v_auth_student_id, v_student_email, '{"nombre":"Alumno Multiclub 0080"}'::jsonb, '{"account_type":"STUDENT_ONLY"}'::jsonb, now())
  ON CONFLICT (id) DO UPDATE SET email_confirmed_at = now();

  PERFORM set_config('request.jwt.claim.sub', v_auth_student_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_student_id::text)::text, true);

  v_claim_res := public.claim_student_invitation(v_raw_token);
  IF (v_claim_res->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST 4 FALLÓ: claim_student_invitation devolvió error: %', v_claim_res;
  END IF;
  RAISE NOTICE '✓ TEST 4 PASÓ: claim_student_invitation vinculó al alumno con su cuenta Auth';

  -- 6. VERIFICAR MODELO MULTICLUB (MISMO ALUMNO Y MISMO AUTH USER EN CLUB 2)
  -- Insertar vínculo para Club 2
  INSERT INTO public.coach_student_account_links (
    organizador_id, jugador_id, auth_user_id, is_active, verification_method, student_email
  ) VALUES (
    v_org_id_2, v_student_id, v_auth_student_id, true, 'CLUB_ADMIN', v_student_email
  ) ON CONFLICT (organizador_id, jugador_id) DO UPDATE SET is_active = true;

  -- Comprobar que existen 2 vínculos independientes para el mismo jugador
  IF (SELECT count(*) FROM public.coach_student_account_links WHERE jugador_id = v_student_id) <> 2 THEN
    RAISE EXCEPTION 'TEST 5 FALLÓ: No se mantuvieron los dos vínculos independientes multiclub';
  END IF;
  RAISE NOTICE '✓ TEST 5 PASÓ: Modelo multiclub admite múltiples vínculos con UNIQUE(organizador_id, jugador_id)';

  -- 7. CONSULTAR OVERVIEW DEL ALUMNO CON AMBOS CLUBES ACTIVOS
  v_overview_res := public.get_student_coaching_overview();
  IF (v_overview_res->>'ok')::boolean IS NOT TRUE OR jsonb_array_length(v_overview_res->'relationships') <> 2 THEN
    RAISE EXCEPTION 'TEST 6 FALLÓ: get_student_coaching_overview esperaba 2 relaciones, obtenido: %', v_overview_res;
  END IF;
  RAISE NOTICE '✓ TEST 6 PASÓ: get_student_coaching_overview devuelve los 2 clubes activos';

  -- 8. DESACTIVAR ALUMNO EN CLUB 1 SIN AFECTAR CLUB 2
  PERFORM set_config('request.jwt.claim.sub', v_org_id_1::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_org_id_1::text)::text, true);

  PERFORM public.deactivate_student_access(v_org_id_1, v_student_id);

  IF (SELECT is_active FROM public.coach_student_account_links WHERE organizador_id = v_org_id_1 AND jugador_id = v_student_id) IS NOT FALSE THEN
    RAISE EXCEPTION 'TEST 7 FALLÓ: Club 1 no quedó desactivado';
  END IF;

  IF (SELECT is_active FROM public.coach_student_account_links WHERE organizador_id = v_org_id_2 AND jugador_id = v_student_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST 7 FALLÓ: Club 2 debió permanecer activo y no ser afectado';
  END IF;
  RAISE NOTICE '✓ TEST 7 PASÓ: Desactivación en Club 1 aislada; Club 2 permanece intacto';

  -- 9. OVERVIEW COMO ALUMNO DEBE EXCLUIR CLUB 1 Y MANTENER CLUB 2
  PERFORM set_config('request.jwt.claim.sub', v_auth_student_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_student_id::text)::text, true);

  v_overview_res := public.get_student_coaching_overview();
  IF (v_overview_res->>'ok')::boolean IS NOT TRUE 
     OR jsonb_array_length(v_overview_res->'relationships') <> 1
     OR (v_overview_res->'relationships'->0->'club'->>'organizador_id')::uuid <> v_org_id_2 THEN
    RAISE EXCEPTION 'TEST 8 FALLÓ: get_student_coaching_overview debió filtrar el club desactivado: %', v_overview_res;
  END IF;
  RAISE NOTICE '✓ TEST 8 PASÓ: Overview excluye clubes desactivados y muestra clubes activos';

  -- 10. ENDURECIMIENTO DE SEGURIDAD: CUENTA STUDENT_ONLY NO PUEDE EJECUTAR RPCS ADMINISTRATIVAS
  -- Intentar llamar a adjust_coach_student_classes desde la cuenta STUDENT_ONLY
  v_test_failed := false;
  BEGIN
    PERFORM public.adjust_coach_student_classes(
      p_organizador_id := v_org_id_1,
      p_coach_id := v_coach_id_1,
      p_student_id := v_student_id,
      p_delta := 1,
      p_motivo := 'Intento no autorizado'
    );
  EXCEPTION WHEN OTHERS THEN
    v_test_failed := true;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_test_failed OR v_err_msg NOT LIKE '%cuentas de alumno%' THEN
    RAISE EXCEPTION 'TEST 9 FALLÓ: adjust_coach_student_classes debió rechazar cuenta STUDENT_ONLY. Error: %', v_err_msg;
  END IF;
  RAISE NOTICE '✓ TEST 9 PASÓ: adjust_coach_student_classes rechaza llamadas de cuentas STUDENT_ONLY';

  -- Intentar llamar a assign_coach_classes desde la cuenta STUDENT_ONLY
  v_test_failed := false;
  BEGIN
    PERFORM public.assign_coach_classes(
      p_relationship_id := '00000000-0000-0000-0000-000000000089'::uuid,
      p_class_count := 2
    );
  EXCEPTION WHEN OTHERS THEN
    v_test_failed := true;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_test_failed OR v_err_msg NOT LIKE '%cuentas de alumno%' THEN
    RAISE EXCEPTION 'TEST 10 FALLÓ: assign_coach_classes debió rechazar cuenta STUDENT_ONLY. Error: %', v_err_msg;
  END IF;
  RAISE NOTICE '✓ TEST 10 PASÓ: assign_coach_classes rechaza llamadas de cuentas STUDENT_ONLY';

  -- 11. LIMPIEZA DE DATOS DE PRUEBA
  DELETE FROM public.coach_student_invitations WHERE organizador_id IN (v_org_id_1, v_org_id_2);
  DELETE FROM public.coach_student_account_links WHERE organizador_id IN (v_org_id_1, v_org_id_2);
  DELETE FROM public.coach_player_class_balances WHERE organizador_id IN (v_org_id_1, v_org_id_2);
  DELETE FROM public.coach_player_relationships WHERE organizador_id IN (v_org_id_1, v_org_id_2);
  DELETE FROM public.coach_club_memberships WHERE organizador_id IN (v_org_id_1, v_org_id_2);
  DELETE FROM public.riviera_official_player_identity WHERE canonical_riviera_jugador_id = v_student_id;
  DELETE FROM public.riviera_jugadores WHERE id = v_student_id;
  DELETE FROM public.riviera_coaches WHERE id IN (v_coach_id_1, v_coach_id_2);
  DELETE FROM public.organizador_game_modes WHERE organizador_id IN (v_org_id_1, v_org_id_2);
  DELETE FROM auth.users WHERE id IN (v_org_id_1, v_org_id_2, v_auth_student_id, '00000000-0000-0000-0000-000000000087'::uuid, '00000000-0000-0000-0000-000000000088'::uuid);

  RAISE NOTICE '── TODOS LOS TESTS DE 0080 PASARON EXITOSAMENTE (10/10) ──';
END;
$$;
