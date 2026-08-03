-- ══════════════════════════════════════════════════════════════════════════════
-- BLK-07 — Verificación manual de 0001_te_select_master_admin.sql
--
-- Solo lectura + intentos de escritura dentro de una transacción que TERMINA
-- EN ROLLBACK (nunca hace COMMIT). No se ejecuta en CI (requiere credenciales
-- de base de datos para SET LOCAL role/request.jwt.claims, no solo la anon
-- key) — mismo patrón y misma limitación ya documentados en
-- supabase/audit-multiclub-isolation-readonly.sql.
--
-- PENDIENTE DE EJECUCIÓN MANUAL: reemplaza los 4 placeholders de abajo con
-- IDs reales de staging antes de correr:
--   :admin_maestro_id   -- un user_id presente en admin_users
--   :organizador_a_id   -- dueño real de al menos un torneo_express PRIVADO
--   :organizador_b_id   -- otro organizador, sin relación con el torneo de A
--   :torneo_privado_id  -- un torneo_express de A con is_torneo_express_public(...) = false
--
-- Ejecutar: supabase db query --linked -f supabase/migrations/0001_verify_te_select_master_admin.sql
--   -v admin_maestro_id=... -v organizador_a_id=... -v organizador_b_id=... -v torneo_privado_id=...
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TEMP TABLE te_master_admin_verify_results (
  caso text,
  esperado text,
  obtenido text,
  ok boolean
);
GRANT INSERT, SELECT ON te_master_admin_verify_results TO authenticated, anon;

-- ── CASO 1: Admin Maestro ve el torneo privado de A ─────────────────────
SET LOCAL request.jwt.claims = json_build_object('sub', :'admin_maestro_id', 'role', 'authenticated')::text;
SET LOCAL role authenticated;

DO $$
DECLARE
  v_count int;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'admin_maestro_id no resuelve is_master_admin() = true — confirma la tabla admin_users';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.torneo_express
  WHERE id = :'torneo_privado_id'::uuid;

  INSERT INTO te_master_admin_verify_results VALUES (
    '1. Admin Maestro lee torneo privado de A',
    '1 fila',
    v_count::text,
    v_count = 1
  );
END $$;

RESET role;

-- ── CASO 2: organizador A (dueño) ve su propio torneo privado ───────────
SET LOCAL request.jwt.claims = json_build_object('sub', :'organizador_a_id', 'role', 'authenticated')::text;
SET LOCAL role authenticated;

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.torneo_express
  WHERE id = :'torneo_privado_id'::uuid;

  INSERT INTO te_master_admin_verify_results VALUES (
    '2. Organizador A (dueño) lee su propio torneo privado',
    '1 fila',
    v_count::text,
    v_count = 1
  );
END $$;

RESET role;

-- ── CASO 3: organizador B (ajeno, no admin) NO ve el torneo privado de A ─
SET LOCAL request.jwt.claims = json_build_object('sub', :'organizador_b_id', 'role', 'authenticated')::text;
SET LOCAL role authenticated;

DO $$
DECLARE
  v_count int;
BEGIN
  IF public.is_master_admin() THEN
    RAISE EXCEPTION 'organizador_b_id resuelve is_master_admin() = true — elige otro organizador de prueba';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.torneo_express
  WHERE id = :'torneo_privado_id'::uuid;

  INSERT INTO te_master_admin_verify_results VALUES (
    '3. Organizador B (ajeno) NO ve el torneo privado de A',
    '0 filas',
    v_count::text,
    v_count = 0
  );
END $$;

RESET role;

-- ── CASO 4: autenticado sin fila en admin_users tampoco ve el privado ───
-- (mismo caso que 3 desde otro ángulo: confirma que basta con NO estar en
-- admin_users, sin depender de qué organizador se use como "ajeno")

-- ── CASO 5: anon no ve el torneo privado ─────────────────────────────────
SET LOCAL request.jwt.claims = '{"role":"anon"}';
SET LOCAL role anon;

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.torneo_express
  WHERE id = :'torneo_privado_id'::uuid;

  INSERT INTO te_master_admin_verify_results VALUES (
    '5. anon NO ve el torneo privado de A',
    '0 filas',
    v_count::text,
    v_count = 0
  );
END $$;

RESET role;

-- ── CASO 6: la nueva policy es SELECT-only — Admin Maestro NO puede
--    escribir sobre el torneo de A a través de ella (INSERT/UPDATE/DELETE
--    siguen exigiendo organizador_id = auth.uid() vía te_mutate_auth) ──
SET LOCAL request.jwt.claims = json_build_object('sub', :'admin_maestro_id', 'role', 'authenticated')::text;
SET LOCAL role authenticated;

DO $$
DECLARE
  v_rows int;
BEGIN
  UPDATE public.torneo_express
  SET nombre = nombre
  WHERE id = :'torneo_privado_id'::uuid;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  INSERT INTO te_master_admin_verify_results VALUES (
    '6. Admin Maestro NO puede UPDATE el torneo de A (solo SELECT)',
    '0 filas afectadas',
    v_rows::text,
    v_rows = 0
  );
END $$;

RESET role;

-- ── Resultado ─────────────────────────────────────────────────────────────
SELECT * FROM te_master_admin_verify_results ORDER BY caso;

DO $$
DECLARE
  v_failed int;
BEGIN
  SELECT count(*) INTO v_failed FROM te_master_admin_verify_results WHERE NOT ok;
  IF v_failed > 0 THEN
    RAISE WARNING '% caso(s) fallaron — revisar antes de dar por cerrado BLK-07', v_failed;
  ELSE
    RAISE NOTICE 'Los 6 casos de BLK-07 pasaron.';
  END IF;
END $$;

-- Nunca se hace COMMIT en este archivo de verificación.
ROLLBACK;
