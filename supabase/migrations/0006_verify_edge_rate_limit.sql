-- ══════════════════════════════════════════════════════════════════════════════
-- Verificación manual de 0006_edge_rate_limit.sql
--
-- Solo lectura + escritura dentro de una transacción que TERMINA EN ROLLBACK.
-- No se ejecuta en CI (requiere credenciales de base de datos, mismo patrón
-- que supabase/audit-multiclub-isolation-readonly.sql).
--
-- Ejecutar: supabase db query --linked -f supabase/migrations/0006_verify_edge_rate_limit.sql
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TEMP TABLE rate_limit_verify_results (caso text, esperado text, obtenido text, ok boolean);

-- ── CASO 1: primeras N llamadas dentro del límite -> allowed=true ───────
DO $$
DECLARE
  v_result jsonb;
  v_i int;
  v_all_allowed boolean := true;
BEGIN
  FOR v_i IN 1..5 LOOP
    v_result := public.check_rate_limit('verify:caso1', 5, 60);
    IF NOT (v_result->>'allowed')::boolean THEN
      v_all_allowed := false;
    END IF;
  END LOOP;

  INSERT INTO rate_limit_verify_results VALUES (
    '1. Primeras 5 llamadas (límite=5) todas allowed=true',
    'true', v_all_allowed::text, v_all_allowed
  );
END $$;

-- ── CASO 2: la 6a llamada excede el límite -> allowed=false + retry_after > 0 ──
DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.check_rate_limit('verify:caso1', 5, 60);
  INSERT INTO rate_limit_verify_results VALUES (
    '2. 6a llamada (límite=5) -> allowed=false',
    'false', (v_result->>'allowed'), (v_result->>'allowed') = 'false'
  );
  INSERT INTO rate_limit_verify_results VALUES (
    '2b. retry_after_seconds > 0',
    '> 0', (v_result->>'retry_after_seconds'),
    (v_result->>'retry_after_seconds')::int > 0
  );
END $$;

-- ── CASO 3: bucket_key distinto no se ve afectado (aislamiento por bucket) ──
DO $$
DECLARE v_result jsonb;
BEGIN
  v_result := public.check_rate_limit('verify:caso3-otro-bucket', 5, 60);
  INSERT INTO rate_limit_verify_results VALUES (
    '3. Bucket distinto, 1a llamada -> allowed=true',
    'true', (v_result->>'allowed'), (v_result->>'allowed') = 'true'
  );
END $$;

-- ── CASO 4: ventana expirada resetea el contador ─────────────────────────
DO $$
DECLARE v_result jsonb;
BEGIN
  -- Fuerza la ventana al pasado para simular expiración sin esperar de verdad.
  UPDATE public._edge_rate_limits
  SET window_start = now() - interval '2 minutes'
  WHERE bucket_key = 'verify:caso1';

  v_result := public.check_rate_limit('verify:caso1', 5, 60);
  INSERT INTO rate_limit_verify_results VALUES (
    '4. Ventana expirada -> contador resetea a 1, allowed=true',
    'true / count=1',
    (v_result->>'allowed') || ' / count=' || (v_result->>'count'),
    (v_result->>'allowed') = 'true' AND (v_result->>'count') = '1'
  );
END $$;

-- ── CASO 5: concurrencia real -- 20 llamadas "simultáneas" al mismo bucket
--    vía un loop en una sola sesión no prueba locking real; la prueba de
--    concurrencia real con dos sesiones psql paralelas está documentada en
--    el reporte de Fase B (no repetible aquí sin psql). Este caso confirma
--    al menos que el conteo nunca excede el número de llamadas realizadas
--    (no hay pérdida de incrementos ni duplicación).
DO $$
DECLARE
  v_result jsonb;
  v_i int;
BEGIN
  DELETE FROM public._edge_rate_limits WHERE bucket_key = 'verify:caso5';
  FOR v_i IN 1..20 LOOP
    v_result := public.check_rate_limit('verify:caso5', 1000, 60);
  END LOOP;
  INSERT INTO rate_limit_verify_results VALUES (
    '5. 20 llamadas secuenciales -> count final = 20 exacto',
    '20', (v_result->>'count'), (v_result->>'count') = '20'
  );
END $$;

-- ── CASO 6: anon/authenticated NO pueden llamar la función directo ───────
DO $$
DECLARE v_failed boolean := false;
BEGIN
  BEGIN
    PERFORM set_config('role', 'anon', true);
    PERFORM public.check_rate_limit('verify:caso6', 5, 60);
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed := true;
  END;
  PERFORM set_config('role', 'postgres', true);
  INSERT INTO rate_limit_verify_results VALUES (
    '6. anon NO puede ejecutar check_rate_limit directo',
    'insufficient_privilege', v_failed::text, v_failed
  );
END $$;

SELECT * FROM rate_limit_verify_results ORDER BY caso;

DO $$
DECLARE v_failed int;
BEGIN
  SELECT count(*) INTO v_failed FROM rate_limit_verify_results WHERE NOT ok;
  IF v_failed > 0 THEN
    RAISE WARNING '% caso(s) fallaron', v_failed;
  ELSE
    RAISE NOTICE 'Todos los casos de rate limiting pasaron.';
  END IF;
END $$;

ROLLBACK;
