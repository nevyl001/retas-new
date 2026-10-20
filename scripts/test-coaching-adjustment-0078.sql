DO $$
DECLARE
  v_org_id uuid := '00000000-0000-0000-0000-000000000078'::uuid;
  v_coach_id uuid := '00000000-0000-0000-0000-000000000079'::uuid;
  v_student_id uuid := '00000000-0000-0000-0000-000000000080'::uuid;
  v_rel_id uuid := '00000000-0000-0000-0000-000000000081'::uuid;
  v_orig_ledger_id uuid := '00000000-0000-0000-0000-000000000082'::uuid;
  v_session_id uuid := '00000000-0000-0000-0000-000000000083'::uuid;
  v_debit_ledger_id uuid := '00000000-0000-0000-0000-000000000084'::uuid;
  
  v_res jsonb;
  v_bal_check integer;
  v_ledger_count integer;
BEGIN
  RAISE NOTICE '── INICIO DE VERIFICACIÓN FUNCIONAL HOTFIX 0078 ──';

  -- 1. SETUP DE DATOS AISLADOS DE PRUEBA
  INSERT INTO auth.users (id, email)
  VALUES (v_org_id, 'test0078@test.com')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.organizador_game_modes (organizador_id, coaching_enabled)
  VALUES (v_org_id, true)
  ON CONFLICT (organizador_id) DO UPDATE SET coaching_enabled = true;

  INSERT INTO auth.users (id, email)
  VALUES ('00000000-0000-0000-0000-000000000085'::uuid, 'coachtest0078@test.com')
  ON CONFLICT (id) DO NOTHING;

  -- Crear entrenador y alumno de prueba
  INSERT INTO public.riviera_coaches (id, auth_user_id, nombre)
  VALUES (v_coach_id, '00000000-0000-0000-0000-000000000085'::uuid, 'Coach Test 0078')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.riviera_jugadores (id, nombre, slug, organizador_id)
  VALUES (v_student_id, 'Alumno Test 0078', 'alumno-test-0078', v_org_id)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.coach_club_memberships (organizador_id, coach_id, status)
  VALUES (v_org_id, v_coach_id, 'ACTIVE')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.coach_player_relationships (id, organizador_id, coach_id, jugador_id, status, is_primary)
  VALUES (v_rel_id, v_org_id, v_coach_id, v_student_id, 'ACTIVE', true)
  ON CONFLICT (id) DO NOTHING;

  -- Saldo inicial: 19 clases
  INSERT INTO public.coach_player_class_balances (relationship_id, organizador_id, coach_id, jugador_id, balance_classes, total_classes_given)
  VALUES (v_rel_id, v_org_id, v_coach_id, v_student_id, 19, 0)
  ON CONFLICT (relationship_id) DO UPDATE SET balance_classes = 19, total_classes_given = 0;

  INSERT INTO public.coach_class_ledger (id, relationship_id, organizador_id, coach_id, jugador_id, delta, tipo, notas, recorded_by)
  VALUES (v_orig_ledger_id, v_rel_id, v_org_id, v_coach_id, v_student_id, 19, 'PACKAGE_CREDIT', 'Abono inicial 19 clases', v_org_id)
  ON CONFLICT (id) DO NOTHING;

  -- Simular usuario autenticado como el organizador del club
  PERFORM set_config('request.jwt.claim.sub', v_org_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_org_id::text)::text, true);

  -- 2. CASO B & C: AJUSTE DE SALDO DE 19 A 10 (DELTA = -9) SIN LEDGER DE REFERENCIA
  v_res := public.adjust_coach_student_classes(
    p_organizador_id := v_org_id,
    p_coach_id := v_coach_id,
    p_student_id := v_student_id,
    p_delta := -9,
    p_motivo := 'Corrección por error de captura al abonar clases',
    p_reference_ledger_id := NULL,
    p_idempotency_key := 'test-key-zaid-sim-1',
    p_expected_current_balance := 19
  );

  IF (v_res->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'CASO B FALLÓ: adjust_coach_student_classes devolvió error: %', v_res;
  END IF;

  IF (v_res->>'new_balance')::integer <> 10 OR (v_res->>'delta')::integer <> -9 THEN
    RAISE EXCEPTION 'CASO B FALLÓ: balance devuelto incorrecto: %', v_res;
  END IF;

  SELECT balance_classes INTO v_bal_check
  FROM public.coach_player_class_balances
  WHERE relationship_id = v_rel_id;

  IF v_bal_check <> 10 THEN
    RAISE EXCEPTION 'CASO B FALLÓ: balance en tabla es % (esperado 10)', v_bal_check;
  END IF;
  RAISE NOTICE '✓ CASO B & C superado: Ajuste 19 a 10 exitoso (saldo resultante = 10, delta = -9)';

  -- 3. VERIFICAR QUE EL MOVIMIENTO ORIGINAL PERMANECE INTACTO
  SELECT count(*) INTO v_ledger_count
  FROM public.coach_class_ledger
  WHERE relationship_id = v_rel_id;

  IF v_ledger_count < 2 THEN
    RAISE EXCEPTION 'CASO B.5 FALLÓ: el historial se redujo a % movimientos', v_ledger_count;
  END IF;
  RAISE NOTICE '✓ CASO B.5 superado: Historial contable intacto (% movimientos registrados)', v_ledger_count;

  -- 4. REPETIR CON LA MISMA CLAVE DE IDEMPOTENCIA
  v_res := public.adjust_coach_student_classes(
    p_organizador_id := v_org_id,
    p_coach_id := v_coach_id,
    p_student_id := v_student_id,
    p_delta := -9,
    p_motivo := 'Corrección por error de captura al abonar clases',
    p_reference_ledger_id := NULL,
    p_idempotency_key := 'test-key-zaid-sim-1',
    p_expected_current_balance := 19
  );

  IF (v_res->>'ok')::boolean IS NOT TRUE OR (v_res->>'idempotent')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'CASO B.6 FALLÓ: reintento idempotente falló: %', v_res;
  END IF;

  SELECT balance_classes INTO v_bal_check
  FROM public.coach_player_class_balances
  WHERE relationship_id = v_rel_id;

  IF v_bal_check <> 10 THEN
    RAISE EXCEPTION 'CASO B.7 FALLÓ: balance post-idempotencia es % (esperado 10, no doble descuento)', v_bal_check;
  END IF;
  RAISE NOTICE '✓ CASO B.6 & B.7 superado: Idempotencia estricta validada (saldo sigue en 10, sin doble descuento)';

  -- 5. CASO D: PERMISOS — OTRO CLUB O USUARIO NO AUTORIZADO ES RECHAZADO
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-999999999999', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-999999999999')::text, true);

  v_res := public.adjust_coach_student_classes(
    p_organizador_id := v_org_id,
    p_coach_id := v_coach_id,
    p_student_id := v_student_id,
    p_delta := -1,
    p_motivo := 'Intento no autorizado',
    p_reference_ledger_id := NULL,
    p_idempotency_key := 'unauthorized-key-1'
  );

  IF (v_res->>'ok')::boolean IS TRUE THEN
    RAISE EXCEPTION 'CASO D FALLÓ: usuario no autorizado pudo ejecutar el ajuste';
  END IF;
  RAISE NOTICE '✓ CASO D superado: Rechazo correcto para usuario no autorizado (% )', v_res->>'error';

  -- Volver a autenticar como club
  PERFORM set_config('request.jwt.claim.sub', v_org_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_org_id::text)::text, true);

  -- 6. CASO E: REVERSIÓN DE CLASE IMPARTIDA POR ERROR
  -- Insertar sesión COMPLETED con débito
  INSERT INTO public.coach_sessions (id, organizador_id, coach_id, jugador_id, relationship_id, starts_at, ends_at, duration_minutes, status)
  VALUES (v_session_id, v_org_id, v_coach_id, v_student_id, v_rel_id, now() - interval '2 hours', now() - interval '1 hour', 60, 'COMPLETED')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.coach_class_ledger (id, relationship_id, organizador_id, coach_id, jugador_id, delta, tipo, notas, session_id, recorded_by)
  VALUES (v_debit_ledger_id, v_rel_id, v_org_id, v_coach_id, v_student_id, -1, 'CLASS_DEBIT', 'Descuento por sesión', v_session_id, v_org_id)
  ON CONFLICT (id) DO NOTHING;

  -- Ajustar contador de impartidas para probar reintegro
  UPDATE public.coach_player_class_balances
  SET balance_classes = 10, total_classes_given = 1
  WHERE relationship_id = v_rel_id;

  v_res := public.revert_coach_class_session(
    p_organizador_id := v_org_id,
    p_session_id := v_session_id,
    p_motivo := 'Sesión marcada como completada por error',
    p_idempotency_key := 'revert-test-key-1'
  );

  IF (v_res->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'CASO E FALLÓ: revert_coach_class_session falló: %', v_res;
  END IF;

  IF (v_res->>'new_balance')::integer <> 11 OR (v_res->>'total_classes_given')::integer <> 0 THEN
    RAISE EXCEPTION 'CASO E FALLÓ: balance o total_classes_given incorrecto post-reversión: %', v_res;
  END IF;
  RAISE NOTICE '✓ CASO E superado: Reversión de sesión exitosa (+1 saldo = 11, impartidas = 0)';

  -- Reversión repetida con misma clave -> idempotente
  v_res := public.revert_coach_class_session(
    p_organizador_id := v_org_id,
    p_session_id := v_session_id,
    p_motivo := 'Sesión marcada como completada por error',
    p_idempotency_key := 'revert-test-key-1'
  );
  IF (v_res->>'ok')::boolean IS NOT TRUE OR (v_res->>'idempotent')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'CASO E.2 FALLÓ: idempotencia de reversión falló: %', v_res;
  END IF;

  -- Reversión repetida con diferente clave -> rechazo por sesión ya revertida
  v_res := public.revert_coach_class_session(
    p_organizador_id := v_org_id,
    p_session_id := v_session_id,
    p_motivo := 'Segundo intento',
    p_idempotency_key := 'revert-test-key-2'
  );
  IF (v_res->>'ok')::boolean IS TRUE THEN
    RAISE EXCEPTION 'CASO E.3 FALLÓ: se permitió revertir dos veces la misma sesión';
  END IF;
  RAISE NOTICE '✓ CASO E.2 & E.3 superado: Doble reversión bloqueada correctamente';

  -- 7. CLEANUP COMPLETO DE DATOS DE PRUEBA
  DELETE FROM public.coach_audit_log WHERE entity_id = v_rel_id OR payload->>'session_id' = v_session_id::text;
  DELETE FROM public.coach_class_ledger WHERE relationship_id = v_rel_id;
  DELETE FROM public.coach_sessions WHERE id = v_session_id;
  DELETE FROM public.coach_player_class_balances WHERE relationship_id = v_rel_id;
  DELETE FROM public.coach_player_relationships WHERE id = v_rel_id;
  DELETE FROM public.coach_club_memberships WHERE organizador_id = v_org_id AND coach_id = v_coach_id;
  DELETE FROM public.riviera_jugadores WHERE id = v_student_id;
  DELETE FROM public.riviera_coaches WHERE id = v_coach_id;
  DELETE FROM public.organizador_game_modes WHERE organizador_id = v_org_id;
  DELETE FROM auth.users WHERE id IN (v_org_id, '00000000-0000-0000-0000-000000000085'::uuid);

  RAISE NOTICE '✓ Limpieza completada. Ningún dato real de Zaid, Gabriel o Hack Pádel fue tocado.';
  RAISE NOTICE '── TODOS LOS CASOS DE PRUEBA DE 0078 FUERON SUPERADOS EXITOSAMENTE ──';
END $$;
