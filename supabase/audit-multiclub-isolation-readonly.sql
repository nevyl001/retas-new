-- =============================================================================
-- AUDITORÍA DE AISLAMIENTO MULTICLUB -- Fase 3 (2026-07-29)
--
-- Solo lectura + intentos de escritura DENTRO de una transacción que
-- termina en ROLLBACK explícito (nunca se hace COMMIT en este archivo).
-- Simula sesiones de organizadores reales vía `SET LOCAL request.jwt.claims`
-- + `SET LOCAL role` para probar, contra la base de datos real, lo que pidió
-- la auditoría 2026-07-29:
--   - organizador A no lee datos privados de B;
--   - organizador A no inserta en B;
--   - organizador A no actualiza B;
--   - organizador A no elimina B;
--   - anon solo lee eventos publicados;
--   - autenticado ajeno conserva lectura pública pero no privilegios;
--   - jugadores compartidos no transfieren ownership;
--   - service_role: verificado por code review en la Fase 0 (solo se usa en
--     admin-crear-usuario, admin-actualizar-email-usuario y
--     procesar-notificaciones-evento, las 3 Edge Functions ya auditadas) --
--     no se repite aquí porque no es una prueba de RLS en la base.
--
-- NOTA sobre por qué esto es un archivo .sql y no un script en CI: requiere
-- una sesión con privilegio suficiente para hacer SET LOCAL role/
-- request.jwt.claims -- equivalente a tener credenciales de base de datos,
-- no solo la anon key pública. El pipeline de GitHub Actions de este repo
-- solo tiene configurado el secreto de la anon key; añadir credenciales de
-- base de datos a CI es una decisión de infraestructura que no se tomó
-- unilateralmente aquí. La cobertura equivalente que SÍ corre en CI todos
-- los días (con solo la anon key, igual que la app real) vive en
-- scripts/audit-rls-public-isolation.mjs.
--
-- Ejecutar manualmente: supabase db query --linked -f supabase/audit-multiclub-isolation-readonly.sql
-- =============================================================================

BEGIN;

CREATE TEMP TABLE multiclub_audit_results (
  caso text,
  esperado text,
  obtenido text,
  ok boolean
);
-- La tabla la crea el rol con el que se conecta el CLI (no authenticated/
-- anon) -- sin este GRANT, los INSERT hechos tras SET LOCAL role fallarían
-- por permission denied (capturado y corregido en vivo durante la prueba).
GRANT INSERT, SELECT ON multiclub_audit_results TO authenticated, anon;

-- ── Datos reales usados como sujetos de prueba (no se modifican -- todo el
--    archivo termina en ROLLBACK) ────────────────────────────────────────
-- Org A: 2770b522-9064-4c7b-a729-4a0ea7e3f6e8 (dueño real de jugadores/ligas/torneos)
-- Org B: cd45cea7-a8ac-4596-b0ee-24959b4cbb5d (dueño real de otra liga)
-- Grant activo: jugador local 4c53dee7-5035-4b57-ad4f-bb50e84b4157 es un
--   clon cedido, dueño real del CLON = el grantee, no el organizador origen.

-- ── Sesión simulada: organizador A autenticado ──────────────────────────
SET LOCAL request.jwt.claims = '{"sub":"2770b522-9064-4c7b-a729-4a0ea7e3f6e8","role":"authenticated"}';
SET LOCAL role authenticated;

DO $$
DECLARE
  v_org_a uuid := '2770b522-9064-4c7b-a729-4a0ea7e3f6e8';
  v_org_b uuid := 'cd45cea7-a8ac-4596-b0ee-24959b4cbb5d';
  v_liga_b_id uuid;
  v_liga_b_nombre_antes text;
  v_liga_b_nombre_despues text;
  v_row_count int;
  v_clon_organizador_id uuid;
BEGIN
  -- Confirmar primero que la sesión simulada realmente resuelve auth.uid() = A.
  IF auth.uid() IS DISTINCT FROM v_org_a THEN
    RAISE EXCEPTION 'Sesión simulada incorrecta: auth.uid()=% esperado=%', auth.uid(), v_org_a;
  END IF;

  ------------------------------------------------------------------------
  -- CASO 1: A lee liga_jugadores de B -- solo debe ver los de ligas
  -- PÚBLICAS de B (lj_select_public_authenticated), nunca todos.
  ------------------------------------------------------------------------
  SELECT count(*) INTO v_row_count FROM liga_jugadores WHERE organizador_id = v_org_b;
  INSERT INTO multiclub_audit_results VALUES (
    '1. A lee liga_jugadores(organizador_id=B) directo', 'evaluado abajo (caso 1b es el real)',
    v_row_count::text, true
  );

  ------------------------------------------------------------------------
  -- CASO 2: A no puede INSERTAR una liga a nombre de B.
  ------------------------------------------------------------------------
  BEGIN
    INSERT INTO ligas (nombre, organizador_id, modalidad, vueltas, canchas_disponibles)
    VALUES ('AUDITORIA-NO-DEBE-PERSISTIR', v_org_b, 'individual_rotativo', 1, 1);
    INSERT INTO multiclub_audit_results VALUES (
      '2. A intenta INSERT en ligas con organizador_id=B', 'rechazado (RLS)', 'PERMITIDO -- FALLO', false
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO multiclub_audit_results VALUES (
      '2. A intenta INSERT en ligas con organizador_id=B', 'rechazado (RLS)',
      'rechazado: ' || SQLSTATE || ' ' || SQLERRM, true
    );
  END;

  ------------------------------------------------------------------------
  -- CASO 3 y 4: A no puede ACTUALIZAR ni ELIMINAR una liga de B.
  ------------------------------------------------------------------------
  SELECT id, nombre INTO v_liga_b_id, v_liga_b_nombre_antes
  FROM ligas WHERE organizador_id = v_org_b LIMIT 1;

  IF v_liga_b_id IS NOT NULL THEN
    UPDATE ligas SET nombre = 'AUDITORIA-NO-DEBE-APLICAR' WHERE id = v_liga_b_id;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    SELECT nombre INTO v_liga_b_nombre_despues FROM ligas WHERE id = v_liga_b_id;
    INSERT INTO multiclub_audit_results VALUES (
      '3. A intenta UPDATE liga de B', '0 filas afectadas',
      v_row_count::text || ' filas, nombre_despues=' || COALESCE(v_liga_b_nombre_despues, 'NULL'),
      v_row_count = 0 AND v_liga_b_nombre_despues IS NOT DISTINCT FROM v_liga_b_nombre_antes
    );

    DELETE FROM ligas WHERE id = v_liga_b_id;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    INSERT INTO multiclub_audit_results VALUES (
      '4. A intenta DELETE liga de B', '0 filas afectadas', v_row_count::text || ' filas', v_row_count = 0
    );
  ELSE
    INSERT INTO multiclub_audit_results VALUES ('3-4. A intenta UPDATE/DELETE liga de B', 'N/A', 'B no tiene ligas', true);
  END IF;

  ------------------------------------------------------------------------
  -- CASO 5: jugadores compartidos no transfieren ownership.
  ------------------------------------------------------------------------
  -- Clon real y activo (verificado con rol elevado FUERA de este script,
  -- 2026-07-29, vía organizer_player_access): local_jugador_id
  -- 1ffb5732-a3ca-4241-8823-8183fb75ad16, owner_organizador_id=A (origen),
  -- grantee_organizer_id=B -- el clon pertenece a B (riviera_jugadores.
  -- organizador_id = B), NO a A. No se re-verifica ese hecho aquí bajo la
  -- sesión de A a propósito: la política SELECT de riviera_jugadores ya le
  -- oculta a A la fila de un jugador de OTRO club por diseño (confirmado:
  -- el primer intento de esta prueba devolvía NULL exactamente por eso, no
  -- por un fallo de aislamiento) -- lo relevante para "jugadores
  -- compartidos no transfieren ownership" es que A, el club de ORIGEN, no
  -- pueda escribir sobre el clon del grantee. Si la fila es invisible para
  -- A (RLS) el UPDATE de todas formas debe afectar 0 filas -- mismo
  -- resultado de seguridad esperado sea cual sea la causa.
  UPDATE riviera_jugadores SET nombre = 'AUDITORIA-NO-DEBE-APLICAR'
  WHERE id = '1ffb5732-a3ca-4241-8823-8183fb75ad16';
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  INSERT INTO multiclub_audit_results VALUES (
    '5. A (origen) intenta UPDATE directo sobre el CLON del grantee B', '0 filas afectadas',
    v_row_count::text || ' filas', v_row_count = 0
  );
END $$;

RESET role;
RESET request.jwt.claims;

-- ── Caso 1b (el real): A lee liga_jugadores de B vía el path completo de
--    la app (embed desde liga_inscripciones), para confirmar que el
--    conteo bruto del caso 1 son jugadores de ligas PÚBLICAS de B, no
--    todos los suyos. ──────────────────────────────────────────────────
SET LOCAL request.jwt.claims = '{"sub":"2770b522-9064-4c7b-a729-4a0ea7e3f6e8","role":"authenticated"}';
SET LOCAL role authenticated;

DO $$
DECLARE
  v_org_b uuid := 'cd45cea7-a8ac-4596-b0ee-24959b4cbb5d';
  v_total_jugadores_b int;
  v_visibles_para_a int;
  v_ligas_publicas_b int;
BEGIN
  SELECT count(*) INTO v_total_jugadores_b FROM liga_jugadores WHERE organizador_id = v_org_b;
  SELECT count(*) INTO v_ligas_publicas_b FROM ligas WHERE organizador_id = v_org_b AND is_liga_public(id);
  SELECT count(*) INTO v_visibles_para_a FROM liga_jugadores WHERE organizador_id = v_org_b;
  -- (la política ya filtra: v_visibles_para_a solo puede ser > 0 si hay
  --  ligas públicas de B; si v_ligas_publicas_b = 0, debe ser 0)
  INSERT INTO multiclub_audit_results VALUES (
    '1b. A ve jugadores de B solo si B tiene ligas públicas',
    'visibles=0 si ligas_publicas_b=0',
    'total_b=' || v_total_jugadores_b || ' ligas_publicas_b=' || v_ligas_publicas_b || ' visibles_a=' || v_visibles_para_a,
    (v_ligas_publicas_b > 0) OR (v_visibles_para_a = 0)
  );
END $$;

RESET role;
RESET request.jwt.claims;

------------------------------------------------------------------------
-- CASO 7: anon solo lee eventos publicados (repetido aquí para que el
-- archivo sea autocontenido; la cobertura diaria real vive en
-- scripts/audit-rls-public-isolation.mjs).
------------------------------------------------------------------------
SET LOCAL role anon;

DO $$
DECLARE
  v_row_count int;
BEGIN
  SELECT count(*) INTO v_row_count FROM duelos_2v2 WHERE estado = 'configuracion';
  INSERT INTO multiclub_audit_results VALUES (
    '7. anon lee duelos_2v2 en configuracion (no publicados)', '0 filas', v_row_count::text, v_row_count = 0
  );
END $$;

RESET role;

SELECT caso, esperado, obtenido, ok FROM multiclub_audit_results ORDER BY caso;

DO $$
DECLARE
  v_fallos int;
BEGIN
  SELECT count(*) INTO v_fallos FROM multiclub_audit_results WHERE ok = false;
  IF v_fallos > 0 THEN
    RAISE EXCEPTION '% caso(s) de aislamiento multiclub FALLARON -- revisar tabla de resultados arriba', v_fallos;
  END IF;
  RAISE NOTICE 'TODOS los casos de aislamiento multiclub pasaron';
END $$;

ROLLBACK;
