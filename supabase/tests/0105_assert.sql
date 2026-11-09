-- Asserts de 0105 (contacto identidad global).
--
-- ORDEN OBLIGATORIO:
--   1) Aplicar primero: supabase/migrations/0105_liga_inscritos_contacto_identidad_global.sql
--   2) Luego este assert.
-- Si sales con "FAIL: rpc contacto inscritos / migración 0105 no aplicada",
-- la migración no está en esa base todavía.

CREATE OR REPLACE FUNCTION public._assert(cond boolean, msg text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT cond THEN
    RAISE EXCEPTION 'FAIL: %', msg;
  END IF;
  RAISE NOTICE 'PASS: %', msg;
END;
$$;

SELECT public._assert(
  to_regprocedure('public.liga_inscritos_contacto_autorizado(uuid)') IS NOT NULL,
  'rpc contacto inscritos / migración 0105 no aplicada'
);

SELECT public._assert(
  to_regprocedure('public.liga_jugador_resolver_contacto(uuid)') IS NOT NULL,
  'rpc resolver contacto / migración 0105 incompleta'
);

SELECT public._assert(
  NOT has_function_privilege(
    'anon',
    'public.liga_inscritos_contacto_autorizado(uuid)',
    'EXECUTE'
  ),
  'anon sin EXECUTE contacto'
);

SELECT public._assert(
  has_function_privilege(
    'authenticated',
    'public.liga_inscritos_contacto_autorizado(uuid)',
    'EXECUTE'
  ),
  'authenticated con EXECUTE contacto'
);

-- Anon no puede invocar.
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM public.liga_inscritos_contacto_autorizado(
    '33333333-3333-4333-8333-333333333333'
  );
  RAISE EXCEPTION 'FAIL: anon leyó contacto';
EXCEPTION
  WHEN insufficient_privilege OR others THEN
    IF SQLERRM LIKE 'FAIL:%' THEN
      RAISE;
    END IF;
    RAISE NOTICE 'PASS: anon bloqueado en contacto inscritos';
END $$;
