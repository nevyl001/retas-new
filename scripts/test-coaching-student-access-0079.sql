DO $$
DECLARE
  v_org_id uuid := '00000000-0000-0000-0000-000000000091'::uuid;
  v_coach_id uuid := '00000000-0000-0000-0000-000000000092'::uuid;
  v_student_id uuid := '00000000-0000-0000-0000-000000000093'::uuid;
  v_rel_id uuid := '00000000-0000-0000-0000-000000000094'::uuid;
  v_student_email text := 'student.test0079@riviera-test.com';
  
  v_res jsonb;
  v_status_res jsonb;
  v_inv_token text;
  v_student_user_id uuid;
  v_verify_res jsonb;
  v_activate_res jsonb;
  v_overview_res jsonb;
  v_is_restricted boolean;
BEGIN
  RAISE NOTICE '── INICIO DE VERIFICACIÓN FUNCIONAL 0079 (STUDENT_ONLY ACCESS) ──';

  -- 1. SETUP DE DATOS AISLADOS DE PRUEBA
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (v_org_id, 'org0079@test.com', '{"nombre":"Hack Pádel Test"}'::jsonb)
  ON CONFLICT (id) DO UPDATE SET raw_user_meta_data = '{"nombre":"Hack Pádel Test"}'::jsonb;

  INSERT INTO public.organizador_game_modes (organizador_id, coaching_enabled)
  VALUES (v_org_id, true)
  ON CONFLICT (organizador_id) DO UPDATE SET coaching_enabled = true;

  INSERT INTO auth.users (id, email)
  VALUES ('00000000-0000-0000-0000-000000000095'::uuid, 'coach0079@test.com')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.riviera_coaches (id, auth_user_id, nombre)
  VALUES (v_coach_id, '00000000-0000-0000-0000-000000000095'::uuid, 'Coach Test 0079')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.riviera_jugadores (id, nombre, slug, organizador_id)
  VALUES (v_student_id, 'Alumno Test 0079', 'alumno-test-0079', v_org_id)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.riviera_official_player_identity (canonical_riviera_jugador_id, riviera_id, riviera_id_serial)
  VALUES (v_student_id, 'RIV-99990079', 99990079)
  ON CONFLICT (canonical_riviera_jugador_id) DO UPDATE SET riviera_id = 'RIV-99990079', riviera_id_serial = 99990079;

  INSERT INTO public.coach_club_memberships (organizador_id, coach_id, status)
  VALUES (v_org_id, v_coach_id, 'ACTIVE')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.coach_player_relationships (id, organizador_id, coach_id, jugador_id, status, is_primary)
  VALUES (v_rel_id, v_org_id, v_coach_id, v_student_id, 'ACTIVE', true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.coach_player_class_balances (relationship_id, organizador_id, coach_id, jugador_id, balance_classes, total_classes_given)
  VALUES (v_rel_id, v_org_id, v_coach_id, v_student_id, 10, 2)
  ON CONFLICT (relationship_id) DO UPDATE SET balance_classes = 10, total_classes_given = 2;

  -- Simular usuario autenticado como organizador
  PERFORM set_config('request.jwt.claim.sub', v_org_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_org_id::text)::text, true);

  -- 2. VERIFICAR ESTADO INICIAL: NO_ACCESS
  v_status_res := public.get_club_student_access_status(v_org_id, v_student_id);
  IF (v_status_res->>'ok')::boolean IS NOT TRUE OR v_status_res->>'status' <> 'NO_ACCESS' THEN
    RAISE EXCEPTION 'TEST 1 FALLÓ: Esperado NO_ACCESS, obtenido: %', v_status_res;
  END IF;
  RAISE NOTICE '✓ TEST 1 PASÓ: Estado inicial es NO_ACCESS';

  -- 3. CREAR INVITACIÓN PARA EL ALUMNO
  v_res := public.create_or_invite_student_access(
    p_organizador_id := v_org_id,
    p_jugador_id := v_student_id,
    p_student_email := v_student_email,
    p_coach_id := v_coach_id
  );

  IF (v_res->>'ok')::boolean IS NOT TRUE OR v_res->>'status' <> 'INVITATION_PENDING' THEN
    RAISE EXCEPTION 'TEST 2 FALLÓ: No se pudo generar invitación: %', v_res;
  END IF;

  v_inv_token := v_res->>'invitation_token';
  IF v_inv_token IS NULL OR length(v_inv_token) < 20 THEN
    RAISE EXCEPTION 'TEST 2 FALLÓ: Token inválido: %', v_inv_token;
  END IF;
  RAISE NOTICE '✓ TEST 2 PASÓ: Invitación generada correctamente con token %', substring(v_inv_token, 1, 8);

  -- 4. VERIFICAR QUE EL ESTADO AHORA ES INVITATION_PENDING
  v_status_res := public.get_club_student_access_status(v_org_id, v_student_id);
  IF (v_status_res->>'status' <> 'INVITATION_PENDING') THEN
    RAISE EXCEPTION 'TEST 3 FALLÓ: Esperado INVITATION_PENDING, obtenido: %', v_status_res;
  END IF;
  RAISE NOTICE '✓ TEST 3 PASÓ: Estado es INVITATION_PENDING';

  -- 5. VALIDAR TOKEN PÚBLICO (anon/unauthenticated)
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);

  v_verify_res := public.verify_student_invitation(v_inv_token);
  IF (v_verify_res->>'ok')::boolean IS NOT TRUE 
     OR v_verify_res->>'student_name' <> 'Alumno Test 0079'
     OR v_verify_res->>'riviera_id' <> 'RIV-99990079' THEN
    RAISE EXCEPTION 'TEST 4 FALLÓ: verify_student_invitation devolvió datos incorrectos: %', v_verify_res;
  END IF;
  RAISE NOTICE '✓ TEST 4 PASÓ: Token verificado públicamente con nombre y Riviera ID correctos';

  -- 6. ACTIVAR CUENTA CON CONTRASEÑA DEFINITIVA
  v_activate_res := public.activate_student_invitation(v_inv_token, 'PassSecret123!');
  IF (v_activate_res->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST 5 FALLÓ: activate_student_invitation falló: %', v_activate_res;
  END IF;

  v_student_user_id := (v_activate_res->>'auth_user_id')::uuid;
  IF v_student_user_id IS NULL THEN
    RAISE EXCEPTION 'TEST 5 FALLÓ: No devolvió auth_user_id';
  END IF;
  RAISE NOTICE '✓ TEST 5 PASÓ: Invitación activada para usuario %', v_student_user_id;

  -- 7. VERIFICAR METADATOS Y ROL EN auth.users
  SELECT (raw_app_meta_data->>'account_type' = 'STUDENT_ONLY') INTO v_is_restricted
  FROM auth.users
  WHERE id = v_student_user_id;

  IF NOT COALESCE(v_is_restricted, false) THEN
    RAISE EXCEPTION 'TEST 6 FALLÓ: auth.users no tiene account_type = STUDENT_ONLY';
  END IF;

  -- Verificar que is_student_only_account lo detecta
  IF NOT public.is_student_only_account(v_student_user_id) THEN
    RAISE EXCEPTION 'TEST 6 FALLÓ: is_student_only_account no devolvió true';
  END IF;
  RAISE NOTICE '✓ TEST 6 PASÓ: Rol STUDENT_ONLY asignado y validado';

  -- 8. SIMULAR SESIÓN DEL ALUMNO Y CONSULTAR get_student_coaching_overview
  PERFORM set_config('request.jwt.claim.sub', v_student_user_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_student_user_id::text)::text, true);

  v_overview_res := public.get_student_coaching_overview();
  IF (v_overview_res->>'ok')::boolean IS NOT TRUE 
     OR (v_overview_res->>'linked')::boolean IS NOT TRUE 
     OR v_overview_res->>'rivieraId' <> 'RIV-99990079' THEN
    RAISE EXCEPTION 'TEST 7 FALLÓ: get_student_coaching_overview devolvió datos incorrectos: %', v_overview_res;
  END IF;

  IF jsonb_array_length(v_overview_res->'relationships') = 0 THEN
    RAISE EXCEPTION 'TEST 7 FALLÓ: No se devolvieron relaciones de coaching para el alumno';
  END IF;
  RAISE NOTICE '✓ TEST 7 PASÓ: Alumno consulta get_student_coaching_overview exitosamente con balance de clases';

  -- 9. COMPROBAR QUE check_student_only_restriction() BLOQUEA AL ALUMNO
  BEGIN
    PERFORM public.check_student_only_restriction();
    RAISE EXCEPTION 'TEST 8 FALLÓ: check_student_only_restriction debió lanzar excepción para alumno';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Las cuentas de alumno únicamente tienen acceso de consulta personal%' THEN
      RAISE NOTICE '✓ TEST 8 PASÓ: Restricción administrativa bloqueó la operación al alumno';
    ELSE
      RAISE EXCEPTION 'TEST 8 FALLÓ con error inesperado: %', SQLERRM;
    END IF;
  END;

  -- 10. EL CLUB DESACTIVA EL ACCESO DEL ALUMNO
  PERFORM set_config('request.jwt.claim.sub', v_org_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_org_id::text)::text, true);

  v_res := public.deactivate_student_access(v_org_id, v_student_id);
  IF (v_res->>'ok')::boolean IS NOT TRUE OR v_res->>'status' <> 'DEACTIVATED' THEN
    RAISE EXCEPTION 'TEST 9 FALLÓ: No se pudo desactivar acceso: %', v_res;
  END IF;

  v_status_res := public.get_club_student_access_status(v_org_id, v_student_id);
  IF v_status_res->>'status' <> 'DEACTIVATED' THEN
    RAISE EXCEPTION 'TEST 9 FALLÓ: Estado esperado DEACTIVATED, obtenido: %', v_status_res;
  END IF;
  RAISE NOTICE '✓ TEST 9 PASÓ: Club desactivó el acceso del alumno correctamente';

  -- 11. EL ALUMNO INTENTA CONSULTAR OVERVIEW CON ACCESO DESACTIVADO
  PERFORM set_config('request.jwt.claim.sub', v_student_user_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_student_user_id::text)::text, true);

  v_overview_res := public.get_student_coaching_overview();
  IF (v_overview_res->>'is_deactivated')::boolean IS NOT TRUE 
     OR (v_overview_res->>'linked')::boolean IS TRUE THEN
    RAISE EXCEPTION 'TEST 10 FALLÓ: Esperado is_deactivated = true y linked = false, obtenido: %', v_overview_res;
  END IF;
  RAISE NOTICE '✓ TEST 10 PASÓ: Alumno ve mensaje de acceso pausado sin borrar su historial ni saldos';

  -- 12. EL CLUB REACTIVA EL ACCESO
  PERFORM set_config('request.jwt.claim.sub', v_org_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_org_id::text)::text, true);

  v_res := public.reactivate_student_access(v_org_id, v_student_id);
  IF (v_res->>'ok')::boolean IS NOT TRUE OR v_res->>'status' <> 'ACTIVE' THEN
    RAISE EXCEPTION 'TEST 11 FALLÓ: Reactivación falló: %', v_res;
  END IF;
  RAISE NOTICE '✓ TEST 11 PASÓ: Club reactivó el acceso exitosamente';

  -- 13. LIMPIEZA DE DATOS AISLADOS DE PRUEBA
  DELETE FROM public.coach_student_invitations WHERE jugador_id = v_student_id;
  DELETE FROM public.coach_student_account_links WHERE jugador_id = v_student_id;
  DELETE FROM public.coach_player_class_balances WHERE relationship_id = v_rel_id;
  DELETE FROM public.coach_player_relationships WHERE id = v_rel_id;
  DELETE FROM public.coach_club_memberships WHERE coach_id = v_coach_id;
  DELETE FROM public.riviera_official_player_identity WHERE canonical_riviera_jugador_id = v_student_id;
  DELETE FROM public.riviera_jugadores WHERE id = v_student_id;
  DELETE FROM public.riviera_coaches WHERE id = v_coach_id;
  DELETE FROM public.organizador_game_modes WHERE organizador_id = v_org_id;
  DELETE FROM auth.identities WHERE user_id = v_student_user_id;
  DELETE FROM public.users WHERE id = v_student_user_id;
  DELETE FROM auth.users WHERE id IN (v_org_id, '00000000-0000-0000-0000-000000000095'::uuid, v_student_user_id);

  RAISE NOTICE '── TODAS LAS PRUEBAS DE 0079 PASARON EXITOSAMENTE (LIMPIEZA COMPLETADA) ──';
END $$;
