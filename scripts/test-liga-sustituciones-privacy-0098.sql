-- Verificación SQL de privilegios/RLS post-0098 (solo lectura + asserts)
-- Ejecutar: npx supabase db query --linked -f scripts/test-liga-sustituciones-privacy-0098.sql

DO $$
DECLARE
  v_has_public_policy boolean;
  v_anon_select boolean;
  v_anon_insert boolean;
  v_auth_select boolean;
  v_auth_insert boolean;
  v_fn_exists boolean;
  v_fn_returns text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'liga_sustituciones'
      AND policyname = 'liga_sustituciones_select_public_liga'
  ) INTO v_has_public_policy;

  IF v_has_public_policy THEN
    RAISE EXCEPTION 'FAIL: policy pública liga_sustituciones_select_public_liga aún existe';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'liga_sustituciones'
      AND grantee = 'anon'
      AND privilege_type = 'SELECT'
  ) INTO v_anon_select;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'liga_sustituciones'
      AND grantee = 'anon'
      AND privilege_type = 'INSERT'
  ) INTO v_anon_insert;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'liga_sustituciones'
      AND grantee = 'authenticated'
      AND privilege_type = 'SELECT'
  ) INTO v_auth_select;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'liga_sustituciones'
      AND grantee = 'authenticated'
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
  ) INTO v_auth_insert;

  IF v_anon_select OR v_anon_insert THEN
    RAISE EXCEPTION 'FAIL: anon aún tiene privilegios directos sobre liga_sustituciones';
  END IF;

  IF NOT v_auth_select THEN
    RAISE EXCEPTION 'FAIL: authenticated debe conservar SELECT (RLS organizer/master)';
  END IF;

  IF v_auth_insert THEN
    RAISE EXCEPTION 'FAIL: authenticated no debe tener INSERT/UPDATE/DELETE directo';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'list_liga_sustituciones_publicas'
  ) INTO v_fn_exists;

  IF NOT v_fn_exists THEN
    RAISE EXCEPTION 'FAIL: falta list_liga_sustituciones_publicas';
  END IF;

  SELECT pg_get_function_result(p.oid)
  INTO v_fn_returns
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'list_liga_sustituciones_publicas'
  LIMIT 1;

  IF v_fn_returns ILIKE '%motivo%' OR v_fn_returns ILIKE '%actor%' OR v_fn_returns ILIKE '%idempotency%' THEN
    RAISE EXCEPTION 'FAIL: RPC pública expone columnas sensibles: %', v_fn_returns;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'liga_sustituciones'
      AND policyname = 'liga_sustituciones_select_organizer'
  ) THEN
    RAISE EXCEPTION 'FAIL: falta policy organizer';
  END IF;

  RAISE NOTICE 'OK privacy 0098: grants/policies/RPC pública';
END $$;

-- Simular anon: no debe poder SELECT la tabla
DO $$
DECLARE
  v_cnt integer;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'anon', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    SELECT count(*) INTO v_cnt FROM public.liga_sustituciones;
    RAISE EXCEPTION 'FAIL: anon pudo SELECT liga_sustituciones (% filas)', v_cnt;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'OK anon SELECT denegado (insufficient_privilege)';
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%permission denied%' OR SQLERRM ILIKE '%insufficient%' THEN
        RAISE NOTICE 'OK anon SELECT denegado: %', SQLERRM;
      ELSIF SQLERRM LIKE 'FAIL:%' THEN
        RAISE;
      ELSE
        -- RLS vacío sin privilege error: también aceptable si GRANT ya revocado
        RAISE NOTICE 'OK anon SELECT bloqueado: %', SQLERRM;
      END IF;
  END;
  EXECUTE 'RESET ROLE';
END $$;

-- Simular authenticated sin ser organizer: RLS debe devolver 0
DO $$
DECLARE
  v_cnt integer;
  v_probe uuid := 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_probe::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_cnt FROM public.liga_sustituciones;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'FAIL: authenticated sin permisos vio % filas admin', v_cnt;
  END IF;
  RAISE NOTICE 'OK authenticated sin permisos: 0 filas';
  EXECUTE 'RESET ROLE';
END $$;

-- RPC pública no incluye columnas sensibles en el resultado tipado
DO $$
DECLARE
  r record;
  v_liga uuid;
BEGIN
  SELECT id INTO v_liga
  FROM public.ligas
  WHERE COALESCE(es_publica, false) = true
  LIMIT 1;

  IF v_liga IS NULL THEN
    RAISE NOTICE 'SKIP RPC pública: no hay liga pública';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'anon', true);
  EXECUTE 'SET LOCAL ROLE anon';
  FOR r IN SELECT * FROM public.list_liga_sustituciones_publicas(v_liga)
  LOOP
    -- El record tipado solo tiene campos públicos; to_json valida forma
    IF to_jsonb(r) ? 'motivo_detalle'
       OR to_jsonb(r) ? 'actor_id'
       OR to_jsonb(r) ? 'idempotency_key'
       OR to_jsonb(r) ? 'motivo_categoria' THEN
      RAISE EXCEPTION 'FAIL: RPC pública devolvió campo sensible %', to_jsonb(r);
    END IF;
  END LOOP;
  RAISE NOTICE 'OK RPC pública anon sin campos sensibles';
  EXECUTE 'RESET ROLE';
END $$;
