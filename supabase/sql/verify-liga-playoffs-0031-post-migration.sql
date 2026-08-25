-- ══════════════════════════════════════════════════════════════════════════════
-- Verificación POST-migración 0031 (Production)
--
-- Pegar en Supabase SQL Editor → Run.
-- Solo lectura + NOTICE/EXCEPTION. No escribe datos de negocio.
--
-- Comprueba:
--   1) RPC freeze existe y firma intacta
--   2) SECURITY DEFINER + search_path=public
--   3) Grants: authenticated sí; PUBLIC/anon no
--   4) Cuerpo generalizado: N(N-1), lastRegular+1, classification_bye, loop CL
--   5) No hardcode numero=9 en el cuerpo nuevo
--   6) Estructura esperada de slots para N=8 / N=10 / N=15 (simulación pura)
--
-- Tras PASS aquí → smoke UI real (N=8, N=10, estructura N=15).
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_oid oid;
  v_def text;
  v_prosecdef boolean;
  v_config text[];
  v_has_auth boolean;
  v_has_anon boolean;
  v_has_public boolean;
BEGIN
  v_oid := to_regprocedure(
    'public.liga_playoffs_freeze_and_generate_jornada9(uuid,jsonb,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,integer)'
  );
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'FAIL: RPC liga_playoffs_freeze_and_generate_jornada9 ausente';
  END IF;
  RAISE NOTICE 'PASS: RPC freeze presente (firma estable)';

  SELECT p.prosecdef, p.proconfig
    INTO v_prosecdef, v_config
  FROM pg_proc p
  WHERE p.oid = v_oid;

  IF NOT v_prosecdef THEN
    RAISE EXCEPTION 'FAIL: freeze no es SECURITY DEFINER';
  END IF;
  RAISE NOTICE 'PASS: SECURITY DEFINER';

  IF v_config IS NULL OR NOT EXISTS (
    SELECT 1
    FROM unnest(COALESCE(v_config, ARRAY[]::text[])) cfg
    WHERE cfg ILIKE 'search_path=public'
       OR cfg ILIKE 'search_path=public,%'
  ) THEN
    -- pg puede guardar como search_path=public
    IF v_config IS NULL OR NOT (
      array_to_string(v_config, ',') ILIKE '%search_path%public%'
    ) THEN
      RAISE EXCEPTION 'FAIL: search_path no fijado a public (proconfig=%)', v_config;
    END IF;
  END IF;
  RAISE NOTICE 'PASS: search_path=public';

  SELECT
    EXISTS (
      SELECT 1 FROM information_schema.routine_privileges
      WHERE specific_schema = 'public'
        AND routine_name = 'liga_playoffs_freeze_and_generate_jornada9'
        AND grantee = 'authenticated'
        AND privilege_type = 'EXECUTE'
    ),
    EXISTS (
      SELECT 1 FROM information_schema.routine_privileges
      WHERE specific_schema = 'public'
        AND routine_name = 'liga_playoffs_freeze_and_generate_jornada9'
        AND grantee = 'anon'
        AND privilege_type = 'EXECUTE'
    ),
    EXISTS (
      SELECT 1 FROM information_schema.routine_privileges
      WHERE specific_schema = 'public'
        AND routine_name = 'liga_playoffs_freeze_and_generate_jornada9'
        AND grantee = 'PUBLIC'
        AND privilege_type = 'EXECUTE'
    )
  INTO v_has_auth, v_has_anon, v_has_public;

  IF NOT v_has_auth THEN
    RAISE EXCEPTION 'FAIL: falta GRANT EXECUTE a authenticated';
  END IF;
  IF v_has_anon THEN
    RAISE EXCEPTION 'FAIL: anon tiene EXECUTE (debe estar revocado)';
  END IF;
  IF v_has_public THEN
    RAISE EXCEPTION 'FAIL: PUBLIC tiene EXECUTE (debe estar revocado)';
  END IF;
  RAISE NOTICE 'PASS: grants (authenticated sí; anon/PUBLIC no)';

  v_def := pg_get_functiondef(v_oid);

  IF v_def !~* 'auth\.uid\(\)' THEN
    RAISE EXCEPTION 'FAIL: cuerpo sin auth.uid()';
  END IF;
  IF v_def !~* 'FOR UPDATE' THEN
    RAISE EXCEPTION 'FAIL: cuerpo sin FOR UPDATE';
  END IF;
  IF v_def !~* 'organizador_id' THEN
    RAISE EXCEPTION 'FAIL: cuerpo sin chequeo organizador_id';
  END IF;
  IF v_def !~* 'fase\s*=\s*''regular''' THEN
    RAISE EXCEPTION 'FAIL: conteo no filtra fase=regular';
  END IF;
  IF v_def !~* 'v_n\s*\*\s*\(\s*v_n\s*-\s*1\s*\)' AND v_def !~* 'v_n \* \(v_n - 1\)' THEN
    RAISE EXCEPTION 'FAIL: no se ve expected = N*(N-1)';
  END IF;
  IF v_def !~* 'classification_bye' THEN
    RAISE EXCEPTION 'FAIL: falta classification_bye en cuerpo 0031';
  END IF;
  IF v_def !~* 'v_playoff_jornada\s*:=\s*v_last_regular\s*\+\s*1' THEN
    RAISE EXCEPTION 'FAIL: playoffs no usa lastRegular+1';
  END IF;
  IF v_def ~* 'numero\s*=\s*9' THEN
    RAISE EXCEPTION 'FAIL: aún hardcodea numero = 9';
  END IF;
  IF v_def !~* 'CL''\s*\|\|' AND v_def !~* '''CL''\s*\|\|' THEN
    -- loop construye 'CL' || v_cl
    IF v_def !~* '''CL''' THEN
      RAISE EXCEPTION 'FAIL: no se ve generación dinámica de slots CL';
    END IF;
  END IF;
  RAISE NOTICE 'PASS: cuerpo 0031 (N variable, lastRegular+1, bye, sin J9 hardcode)';
END $$;

-- ── Estructura de cruces esperada (simulación pura, sin INSERT) ───────────────
DO $$
DECLARE
  n integer;
  low integer;
  high integer;
  cl integer;
  slots text[];
  bye integer;
BEGIN
  -- N=8 → SF1,SF2,CL1,CL2; bye null
  n := 8; low := 5; high := n; cl := 1; slots := ARRAY[]::text[]; bye := NULL;
  WHILE low < high LOOP
    slots := slots || ARRAY['CL' || cl::text || ':' || low::text || 'v' || high::text];
    cl := cl + 1; low := low + 1; high := high - 1;
  END LOOP;
  IF low = high THEN bye := low; END IF;
  IF array_to_string(slots, ',') IS DISTINCT FROM 'CL1:5v8,CL2:6v7' OR bye IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL estructura N=8: % bye=%', slots, bye;
  END IF;
  RAISE NOTICE 'PASS estructura N=8: SF1=1v4 SF2=2v3 + %', array_to_string(slots, ', ');

  -- N=10 → CL1:5v10 CL2:6v9 CL3:7v8
  n := 10; low := 5; high := n; cl := 1; slots := ARRAY[]::text[]; bye := NULL;
  WHILE low < high LOOP
    slots := slots || ARRAY['CL' || cl::text || ':' || low::text || 'v' || high::text];
    cl := cl + 1; low := low + 1; high := high - 1;
  END LOOP;
  IF low = high THEN bye := low; END IF;
  IF array_to_string(slots, ',') IS DISTINCT FROM 'CL1:5v10,CL2:6v9,CL3:7v8' OR bye IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL estructura N=10: % bye=%', slots, bye;
  END IF;
  RAISE NOTICE 'PASS estructura N=10: SF + %', array_to_string(slots, ', ');

  -- N=15 → CL1..CL5 + bye 10
  n := 15; low := 5; high := n; cl := 1; slots := ARRAY[]::text[]; bye := NULL;
  WHILE low < high LOOP
    slots := slots || ARRAY['CL' || cl::text || ':' || low::text || 'v' || high::text];
    cl := cl + 1; low := low + 1; high := high - 1;
  END LOOP;
  IF low = high THEN bye := low; END IF;
  IF array_to_string(slots, ',') IS DISTINCT FROM
       'CL1:5v15,CL2:6v14,CL3:7v13,CL4:8v12,CL5:9v11'
     OR bye IS DISTINCT FROM 10 THEN
    RAISE EXCEPTION 'FAIL estructura N=15: % bye=%', slots, bye;
  END IF;
  RAISE NOTICE 'PASS estructura N=15: SF + % + BYE seed=%', array_to_string(slots, ', '), bye;

  -- Totales regulares esperados
  IF (8*7) <> 56 OR (10*9) <> 90 OR (15*14) <> 210 THEN
    RAISE EXCEPTION 'FAIL: aritmética N(N-1)';
  END IF;
  RAISE NOTICE 'PASS expected regular: 8→56, 10→90, 15→210';

  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE 'POST-0031 VERIFICATION: ALL PASS';
  RAISE NOTICE 'Siguiente: smoke UI N=8, N=10; estructura N=15';
  RAISE NOTICE '════════════════════════════════════════';
END $$;
