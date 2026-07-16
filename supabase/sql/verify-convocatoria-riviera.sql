-- Verify Convocatoria Riviera (servicio global)
-- Ejecutar en staging tras generalize + rpcs (+ patch opcional).

DO $$
DECLARE
  missing text := '';
BEGIN
  IF to_regclass('public.tournament_open_registration') IS NULL THEN
    missing := missing || 'table tournament_open_registration; ';
  END IF;
  IF to_regclass('public.tournament_open_registration_entries') IS NULL THEN
    missing := missing || 'table entries; ';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tournament_open_registration'
      AND column_name='mode_type'
  ) THEN
    missing := missing || 'column mode_type; ';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tournament_open_registration'
      AND column_name='entity_id'
  ) THEN
    missing := missing || 'column entity_id; ';
  END IF;

  IF to_regprocedure('public.upsert_open_game_registration(text,uuid,boolean,text,integer,boolean,boolean,timestamptz,timestamptz,integer,text,text,boolean,boolean,boolean,text,text)') IS NULL THEN
    missing := missing || 'fn upsert_open_game_registration; ';
  END IF;

  IF to_regprocedure('public.get_tournament_open_registration_public(text)') IS NULL THEN
    missing := missing || 'fn get public; ';
  END IF;

  IF to_regprocedure('public.join_tournament_open_registration(text,text,text)') IS NULL THEN
    missing := missing || 'fn join(text,text,text) preferred_side; ';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tournament_open_registration_entries'
      AND column_name='preferred_side'
  ) THEN
    missing := missing || 'column entries.preferred_side; ';
  END IF;

  IF to_regprocedure('public.cancel_tournament_open_registration(text,text)') IS NULL THEN
    missing := missing || 'fn cancel; ';
  END IF;

  IF to_regprocedure('public.close_open_game_registration(text,uuid)') IS NULL THEN
    missing := missing || 'fn close_open_game_registration; ';
  END IF;

  IF to_regprocedure('public._assert_convocatoria_mode_allowed(text)') IS NULL THEN
    missing := missing || 'fn _assert_convocatoria_mode_allowed; ';
  END IF;

  IF to_regprocedure('public._tor_open_reg_slug()') IS NULL THEN
    missing := missing || 'fn _tor_open_reg_slug; ';
  END IF;

  -- pgcrypto en extensions
  IF to_regprocedure('extensions.gen_random_bytes(integer)') IS NULL
     AND to_regprocedure('public.gen_random_bytes(integer)') IS NULL THEN
    missing := missing || 'pgcrypto gen_random_bytes; ';
  END IF;

  -- Anon no debe tener SELECT directo
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema='public'
      AND table_name IN ('tournament_open_registration','tournament_open_registration_entries')
      AND grantee='anon' AND privilege_type='SELECT'
  ) THEN
    missing := missing || 'anon SELECT grant (debe revocarse); ';
  END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION 'VERIFY FAILED: %', missing;
  END IF;

  RAISE NOTICE 'VERIFY OK: convocatoria riviera servicio global';
END $$;

-- Smoke: exclusiones backend
DO $$
BEGIN
  BEGIN
    PERFORM public._assert_convocatoria_mode_allowed('liga');
    RAISE EXCEPTION 'VERIFY FAILED: liga debió rechazarse';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%excluido%' AND SQLERRM NOT ILIKE '%inválido%' THEN
      RAISE;
    END IF;
  END;

  BEGIN
    PERFORM public._assert_convocatoria_mode_allowed('torneo_express');
    RAISE EXCEPTION 'VERIFY FAILED: torneo_express debió rechazarse';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%excluido%' AND SQLERRM NOT ILIKE '%inválido%' THEN
      RAISE;
    END IF;
  END;

  PERFORM public._assert_convocatoria_mode_allowed('reta');
  PERFORM public._assert_convocatoria_mode_allowed('americano');
  PERFORM public._assert_convocatoria_mode_allowed('duelo_2v2');
  RAISE NOTICE 'VERIFY OK: whitelist/exclusiones mode_type';
END $$;

SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef AS security_definer,
       array_to_string(p.proconfig, ', ') AS config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'join_tournament_open_registration',
    'get_tournament_open_registration_public',
    'upsert_open_game_registration',
    'cancel_tournament_open_registration',
    'close_open_game_registration',
    '_tor_open_reg_slug',
    '_assert_convocatoria_mode_allowed'
  )
ORDER BY p.proname;
