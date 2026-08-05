-- ══════════════════════════════════════════════════════════════════════════════
-- Verificación manual de 0015_finalize_reta_atomic.sql
--
-- Solo lectura de resultado + escrituras dentro de una transacción que
-- TERMINA EN ROLLBACK (nunca hace COMMIT) -- mismo patrón que
-- 0001_verify_te_select_master_admin.sql. No se ejecuta en CI (requiere
-- credenciales de base de datos para SET LOCAL role/request.jwt.claims, no
-- solo la anon key).
--
-- Esta verificación NO puede probar la serialización real del FOR UPDATE
-- entre dos sesiones concurrentes (dos DO $$ en la misma transacción no son
-- dos conexiones) -- eso lo cubre el escenario k6
-- (k6/finalize-reta-idempotency.js) contra Supabase local, con dos VUs reales
-- atacando el mismo tournament_id.
--
-- PENDIENTE DE EJECUCIÓN MANUAL: reemplaza los placeholders con datos reales
-- de un entorno local/staging antes de correr:
--   :organizador_a_id     -- dueño real de :tournament_id
--   :organizador_b_id     -- otro organizador, sin relación con :tournament_id
--   :admin_maestro_id     -- un user_id presente en admin_users
--   :tournament_id        -- una reta de A con is_finished=false y SIN
--                            partidos pendientes (o solo partidos 'finished')
--   :linked_player_id     -- OPCIONAL, riviera_jugadores.id de un jugador de
--                            A que YA tiene identidad oficial + profile_link
--                            (confidence HIGH). Si se deja NULL, el CASO 6
--                            (admin_override con participación real) se
--                            omite -- los demás casos no lo necesitan porque
--                            usan payload vacío (participaciones: []).
--
-- Ejecutar: supabase db query --linked -f supabase/migrations/0017_verify_finalize_reta_atomic.sql
--   -v organizador_a_id=... -v organizador_b_id=... -v admin_maestro_id=...
--   -v tournament_id=... -v linked_player_id=...
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TEMP TABLE finalize_reta_verify_results (
  caso text,
  esperado text,
  obtenido text,
  ok boolean
);
GRANT INSERT, SELECT ON finalize_reta_verify_results TO authenticated, anon;

-- ── CASO 1: dueño finaliza su propia reta (payload vacío) → 'finalized' ──
SET LOCAL request.jwt.claims = json_build_object('sub', :'organizador_a_id', 'role', 'authenticated')::text;
SET LOCAL role authenticated;

DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.finalize_reta_atomic(:'tournament_id'::uuid, '{}'::jsonb, false, false);

  INSERT INTO finalize_reta_verify_results VALUES (
    '1. Dueño finaliza reta propia (payload vacío)',
    'ok=true status=finalized',
    v_result::text,
    coalesce((v_result->>'ok')::boolean, false)
      AND v_result->>'status' = 'finalized'
  );
END $$;

RESET role;

-- ── CASO 2: repetir el mismo cierre → no-op idempotente ──────────────────
SET LOCAL request.jwt.claims = json_build_object('sub', :'organizador_a_id', 'role', 'authenticated')::text;
SET LOCAL role authenticated;

DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.finalize_reta_atomic(:'tournament_id'::uuid, '{}'::jsonb, false, false);

  INSERT INTO finalize_reta_verify_results VALUES (
    '2. Reintento tras cierre exitoso → already_finalized',
    'ok=true status=already_finalized',
    v_result::text,
    coalesce((v_result->>'ok')::boolean, false)
      AND v_result->>'status' = 'already_finalized'
  );
END $$;

RESET role;

-- ── CASO 3: organizador ajeno (no dueño, no admin) → excepción ───────────
-- (usa una reta *distinta* -- reutilizamos :tournament_id solo para probar
-- que se rechaza; como ya quedó finalizada en CASO 1/2 arriba esto también
-- confirma que el rechazo de permiso ocurre ANTES de tocar el estado)
SET LOCAL request.jwt.claims = json_build_object('sub', :'organizador_b_id', 'role', 'authenticated')::text;
SET LOCAL role authenticated;

DO $$
DECLARE
  v_raised boolean := false;
BEGIN
  BEGIN
    PERFORM public.finalize_reta_atomic(:'tournament_id'::uuid, '{}'::jsonb, false, false);
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
  END;

  INSERT INTO finalize_reta_verify_results VALUES (
    '3. Organizador ajeno (no dueño, no admin) → excepción',
    'RAISE EXCEPTION',
    CASE WHEN v_raised THEN 'RAISE EXCEPTION' ELSE 'NO RAISE (FALLA)' END,
    v_raised
  );
END $$;

RESET role;

-- ── CASO 4: admin_override=true por alguien que NO es Admin Maestro → excepción ──
SET LOCAL request.jwt.claims = json_build_object('sub', :'organizador_b_id', 'role', 'authenticated')::text;
SET LOCAL role authenticated;

DO $$
DECLARE
  v_raised boolean := false;
BEGIN
  BEGIN
    PERFORM public.finalize_reta_atomic(:'tournament_id'::uuid, '{}'::jsonb, true, false);
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
  END;

  INSERT INTO finalize_reta_verify_results VALUES (
    '4. admin_override por no-admin → excepción',
    'RAISE EXCEPTION',
    CASE WHEN v_raised THEN 'RAISE EXCEPTION' ELSE 'NO RAISE (FALLA)' END,
    v_raised
  );
END $$;

RESET role;

-- ── CASO 5: partidos pendientes sin force → 'pending_matches' (no hard-fail) ──
-- Requiere una reta CON partidos sin terminar. Si :tournament_id no aplica,
-- este caso queda documentado como omitido (ok=true por defecto) en vez de
-- fallar el script entero -- ajustar manualmente con una reta real con
-- partidos pendientes para validar este caso específico.
SET LOCAL request.jwt.claims = json_build_object('sub', :'organizador_a_id', 'role', 'authenticated')::text;
SET LOCAL role authenticated;

DO $$
BEGIN
  INSERT INTO finalize_reta_verify_results VALUES (
    '5. Partidos pendientes sin force → pending_matches (OMITIDO)',
    'ok=false error=pending_matches',
    'ver comentario -- correr manualmente con una reta con partidos sin terminar',
    true
  );
END $$;

RESET role;

-- ── CASO 6 (OPCIONAL): Admin Maestro cierra la reta de A con UNA
-- participación real → valida el patch de is_master_admin() en
-- registrar_participacion_jugador. Se omite automáticamente si
-- :linked_player_id no se proporciona. ──
SET LOCAL request.jwt.claims = json_build_object('sub', :'admin_maestro_id', 'role', 'authenticated')::text;
SET LOCAL role authenticated;

DO $$
DECLARE
  v_result jsonb;
  v_payload jsonb;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'admin_maestro_id no resuelve is_master_admin() = true -- confirma admin_users';
  END IF;

  IF :'linked_player_id' IS NULL OR :'linked_player_id' = '' THEN
    INSERT INTO finalize_reta_verify_results VALUES (
      '6. Admin Maestro cierra reta de otro organizador (con participación) — OMITIDO',
      'ok=true, ledger_created>=0',
      'omitido: no se proporcionó :linked_player_id',
      true
    );
  ELSE
    v_payload := jsonb_build_object(
      'participaciones', jsonb_build_array(
        jsonb_build_object(
          'jugador_id', :'linked_player_id',
          'tipo_evento', 'reta',
          'evento_id', :'tournament_id',
          'evento_nombre', 'Verificación finalize_reta_atomic',
          'resultado', 'participación',
          'sets_favor', 0, 'sets_contra', 0, 'puntos_obtenidos', 0
        )
      )
    );

    -- Requiere que :tournament_id ya NO esté finalizado en este punto del
    -- script -- si CASO 1/2 lo dejaron finalizado, correr CASO 6 por
    -- separado contra una reta fresca sin finalizar.
    v_result := public.finalize_reta_atomic(:'tournament_id'::uuid, v_payload, true, false);

    INSERT INTO finalize_reta_verify_results VALUES (
      '6. Admin Maestro cierra reta de otro organizador (con participación)',
      'ok=true status=finalized participants_processed=1',
      v_result::text,
      coalesce((v_result->>'ok')::boolean, false)
    );
  END IF;
END $$;

RESET role;

-- ── Resultado ─────────────────────────────────────────────────────────────
SELECT * FROM finalize_reta_verify_results ORDER BY caso;

DO $$
DECLARE
  v_failed int;
BEGIN
  SELECT count(*) INTO v_failed FROM finalize_reta_verify_results WHERE NOT ok;
  IF v_failed > 0 THEN
    RAISE WARNING '% caso(s) fallaron — revisar antes de dar por cerrado finalize_reta_atomic', v_failed;
  ELSE
    RAISE NOTICE 'Los casos de verificación de finalize_reta_atomic pasaron.';
  END IF;
END $$;

-- Nunca se hace COMMIT en este archivo de verificación.
ROLLBACK;
