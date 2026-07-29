-- =============================================================================
-- FIX SEC-001 -- elimina políticas RLS heredadas "permitir todo" en Liga,
-- Torneo Express, Duelo 2v2, tournament_public_config y
-- career_event_host_manual_overrides, y las reemplaza por el mismo patrón de
-- aislamiento ya usado y verificado en matches/tournaments/users/players
-- (hotfix-drop-legacy-permissive-policies.sql, 2026-07-26).
--
-- Alcance de este fix:
--   1) DROP de las 22 políticas con qual/check = true (o equivalente de
--      bypass: "... OR true", "auth.role()='authenticated'" sin scoping).
--   2) Donde el anon-scoping también estaba roto (torneo_express_* y
--      duelos_2v2 tenían el propio "*_select_anon" en true, no solo el
--      "lectura_publica_*" duplicado), se recrea con la condición real
--      (is_torneo_express_public / is_duelo_public).
--   3) Se agrega una política SELECT explícita para `authenticated` en cada
--      tabla, espejo de la condición de `anon`, para que un usuario logueado
--      que NO es dueño (ej. otro organizador viendo una liga pública ajena)
--      no se quede sin ninguna política de lectura tras el DROP -- mismo
--      hueco que ya documentó y corrigió el hotfix del 2026-07-26 para
--      tournaments/matches.
--   4) career_event_host_manual_overrides: sin alternativa pública
--      equivalente (0 consumidores directos en src/, verificado) -- se deja
--      solo accesible a is_master_admin(). Existe además el RPC
--      riviera_career_event_host_manual_override() para consumo scoped.
--   5) tournament_public_config: además de las 2 políticas de lectura rotas,
--      "Allow authenticated upsert" permitía a CUALQUIER usuario autenticado
--      (no solo el dueño del torneo) hacer INSERT/UPDATE/DELETE sobre la
--      config pública de CUALQUIER torneo. Se elimina sin reemplazo -- las
--      políticas tpc_insert_auth/tpc_update_auth/tpc_delete_auth (scoped a
--      is_tournament_owner) ya cubren el caso de uso real.
--   6) liga_jugadores tiene columnas PII (email, telefono). RLS controla
--      filas, no columnas -- por eso además de arreglar el acceso por fila,
--      se revoca a nivel de columna el SELECT de email/telefono para `anon`
--      (que nunca tiene un caso de uso legítimo para verlas). Para
--      `authenticated` no se revoca a nivel de columna porque el propio
--      organizador dueño SÍ necesita ver el email/teléfono de sus jugadores
--      (uso real de la app); en su lugar, el código de
--      src/services/ligaService.ts (getLigaById) se corrige en un commit
--      separado para no solicitar esas columnas en el embed público. Un
--      usuario autenticado que arme una llamada REST cruda pidiendo
--      email/telefono de jugadores de una liga pública ajena seguiría
--      pudiendo obtenerlos -- riesgo residual menor (requiere sesión válida
--      y esfuerzo deliberado, documentado en el informe de auditoría como
--      pendiente para una vista/RPC dedicada).
--
-- Idempotente: todos los DROP POLICY usan IF EXISTS. Los CREATE POLICY usan
-- DROP POLICY IF EXISTS inmediatamente antes -- relanzar el archivo completo
-- no falla ni duplica.
--
-- Rollback: rollback-rls-open-policies-liga-torneo-express-20260729.sql
-- Verificación: verify-rls-open-policies-liga-torneo-express-20260729.sql
-- =============================================================================

BEGIN;

-- ── career_event_host_manual_overrides ──────────────────────────────────────
DROP POLICY IF EXISTS career_event_host_manual_overrides_select ON public.career_event_host_manual_overrides;
DROP POLICY IF EXISTS cehmo_select_master_admin ON public.career_event_host_manual_overrides;
CREATE POLICY cehmo_select_master_admin
  ON public.career_event_host_manual_overrides
  FOR SELECT
  TO authenticated
  USING (public.is_master_admin());

-- ── duelos_2v2 ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS duelos_2v2_select_anon ON public.duelos_2v2;
CREATE POLICY duelos_2v2_select_anon
  ON public.duelos_2v2
  FOR SELECT
  TO anon
  USING (public.is_duelo_public(id));

DROP POLICY IF EXISTS duelos_2v2_select_auth ON public.duelos_2v2;
CREATE POLICY duelos_2v2_select_auth
  ON public.duelos_2v2
  FOR SELECT
  TO authenticated
  USING ((organizador_id = auth.uid()) OR public.is_duelo_public(id));

-- ── liga_equipos ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS leq_select_anon ON public.liga_equipos;
CREATE POLICY leq_select_anon
  ON public.liga_equipos
  FOR SELECT
  TO anon
  USING (EXISTS (SELECT 1 FROM public.ligas l WHERE l.id = liga_equipos.liga_id AND public.is_liga_public(l.id)));

DROP POLICY IF EXISTS leq_select_public_authenticated ON public.liga_equipos;
CREATE POLICY leq_select_public_authenticated
  ON public.liga_equipos
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ligas l WHERE l.id = liga_equipos.liga_id AND public.is_liga_public(l.id)));

-- ── liga_inscripciones ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS liga_inscripciones_select ON public.liga_inscripciones;
DROP POLICY IF EXISTS li_select_public_authenticated ON public.liga_inscripciones;
CREATE POLICY li_select_public_authenticated
  ON public.liga_inscripciones
  FOR SELECT
  TO authenticated
  USING (public.is_liga_public(liga_id));

-- ── liga_jornadas ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS liga_jornadas_select ON public.liga_jornadas;
DROP POLICY IF EXISTS ljorn_select_public_authenticated ON public.liga_jornadas;
CREATE POLICY ljorn_select_public_authenticated
  ON public.liga_jornadas
  FOR SELECT
  TO authenticated
  USING (public.is_liga_public(liga_id));

-- ── liga_jornada_parejas ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS liga_jornada_parejas_select ON public.liga_jornada_parejas;
DROP POLICY IF EXISTS ljp_select_public_authenticated ON public.liga_jornada_parejas;
CREATE POLICY ljp_select_public_authenticated
  ON public.liga_jornada_parejas
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.liga_jornadas lj
    WHERE lj.id = liga_jornada_parejas.jornada_id AND public.is_liga_public(lj.liga_id)
  ));

-- ── liga_jugadores (PII: email, telefono) ───────────────────────────────────
DROP POLICY IF EXISTS liga_jugadores_select ON public.liga_jugadores;
DROP POLICY IF EXISTS lj_select_public_authenticated ON public.liga_jugadores;
CREATE POLICY lj_select_public_authenticated
  ON public.liga_jugadores
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.liga_inscripciones li
      WHERE li.jugador_id = liga_jugadores.id AND public.is_liga_public(li.liga_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.liga_jornada_parejas ljp
      JOIN public.liga_jornadas lj ON lj.id = ljp.jornada_id
      WHERE public.is_liga_public(lj.liga_id)
        AND (ljp.jugador1_id = liga_jugadores.id OR ljp.jugador2_id = liga_jugadores.id)
    )
  );

-- Columna PII: anon nunca tiene caso de uso legítimo para email/telefono de
-- jugadores de liga. El GRANT SELECT de anon era a nivel de TABLA completa
-- (no por columna) -- REVOKE SELECT (col) sobre un grant de tabla completa
-- es un no-op en Postgres (el grant de tabla sigue autorizando esas
-- columnas). Por eso: se revoca el SELECT de tabla completa y se re-otorga
-- solo sobre las columnas sin PII.
REVOKE SELECT ON public.liga_jugadores FROM anon;
GRANT SELECT (id, nombre, organizador_id, genero, nivel, estado, created_at)
  ON public.liga_jugadores TO anon;

-- ── liga_partidos ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS liga_partidos_select ON public.liga_partidos;
DROP POLICY IF EXISTS lp_select_public_authenticated ON public.liga_partidos;
CREATE POLICY lp_select_public_authenticated
  ON public.liga_partidos
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.liga_jornadas lj
    WHERE lj.id = liga_partidos.jornada_id AND public.is_liga_public(lj.liga_id)
  ));

-- ── ligas ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS ligas_select ON public.ligas;
DROP POLICY IF EXISTS ligas_select_public_authenticated ON public.ligas;
CREATE POLICY ligas_select_public_authenticated
  ON public.ligas
  FOR SELECT
  TO authenticated
  USING (public.is_liga_public(id));

-- ── torneo_express ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS lectura_publica_torneo_express ON public.torneo_express;
DROP POLICY IF EXISTS te_select_anon ON public.torneo_express;
CREATE POLICY te_select_anon
  ON public.torneo_express
  FOR SELECT
  TO anon
  USING (public.is_torneo_express_public(id));

DROP POLICY IF EXISTS te_select_public_authenticated ON public.torneo_express;
CREATE POLICY te_select_public_authenticated
  ON public.torneo_express
  FOR SELECT
  TO authenticated
  USING (public.is_torneo_express_public(id));

-- ── torneo_express_grupos ────────────────────────────────────────────────────
DROP POLICY IF EXISTS lectura_publica_te_grupos ON public.torneo_express_grupos;
DROP POLICY IF EXISTS te_grupos_select_anon ON public.torneo_express_grupos;
CREATE POLICY te_grupos_select_anon
  ON public.torneo_express_grupos
  FOR SELECT
  TO anon
  USING (public.is_torneo_express_public(torneo_id));

DROP POLICY IF EXISTS te_grupos_select_public_authenticated ON public.torneo_express_grupos;
CREATE POLICY te_grupos_select_public_authenticated
  ON public.torneo_express_grupos
  FOR SELECT
  TO authenticated
  USING (public.is_torneo_express_public(torneo_id));

-- ── torneo_express_grupo_parejas ─────────────────────────────────────────────
DROP POLICY IF EXISTS lectura_publica_te_grupo_parejas ON public.torneo_express_grupo_parejas;
DROP POLICY IF EXISTS te_gp_select_anon ON public.torneo_express_grupo_parejas;
CREATE POLICY te_gp_select_anon
  ON public.torneo_express_grupo_parejas
  FOR SELECT
  TO anon
  USING (EXISTS (
    SELECT 1 FROM public.torneo_express_grupos g
    WHERE g.id = torneo_express_grupo_parejas.grupo_id AND public.is_torneo_express_public(g.torneo_id)
  ));

DROP POLICY IF EXISTS te_gp_select_public_authenticated ON public.torneo_express_grupo_parejas;
CREATE POLICY te_gp_select_public_authenticated
  ON public.torneo_express_grupo_parejas
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.torneo_express_grupos g
    WHERE g.id = torneo_express_grupo_parejas.grupo_id AND public.is_torneo_express_public(g.torneo_id)
  ));

-- ── torneo_express_partidos ──────────────────────────────────────────────────
DROP POLICY IF EXISTS lectura_publica_te_partidos ON public.torneo_express_partidos;
DROP POLICY IF EXISTS te_partidos_select_anon ON public.torneo_express_partidos;
CREATE POLICY te_partidos_select_anon
  ON public.torneo_express_partidos
  FOR SELECT
  TO anon
  USING (EXISTS (
    SELECT 1 FROM public.torneo_express_grupos g
    WHERE g.id = torneo_express_partidos.grupo_id AND public.is_torneo_express_public(g.torneo_id)
  ));

DROP POLICY IF EXISTS te_partidos_select_public_authenticated ON public.torneo_express_partidos;
CREATE POLICY te_partidos_select_public_authenticated
  ON public.torneo_express_partidos
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.torneo_express_grupos g
    WHERE g.id = torneo_express_partidos.grupo_id AND public.is_torneo_express_public(g.torneo_id)
  ));

-- ── torneo_express_eliminatoria_partidos ─────────────────────────────────────
DROP POLICY IF EXISTS lectura_publica_eliminatoria ON public.torneo_express_eliminatoria_partidos;
DROP POLICY IF EXISTS te_elim_select_anon ON public.torneo_express_eliminatoria_partidos;
CREATE POLICY te_elim_select_anon
  ON public.torneo_express_eliminatoria_partidos
  FOR SELECT
  TO anon
  USING (public.is_torneo_express_public(torneo_id));

DROP POLICY IF EXISTS te_elim_select_public_authenticated ON public.torneo_express_eliminatoria_partidos;
CREATE POLICY te_elim_select_public_authenticated
  ON public.torneo_express_eliminatoria_partidos
  FOR SELECT
  TO authenticated
  USING (public.is_torneo_express_public(torneo_id));

-- ── tournament_public_config ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow public read" ON public.tournament_public_config;
DROP POLICY IF EXISTS "Allow authenticated upsert" ON public.tournament_public_config;
DROP POLICY IF EXISTS tpc_select_public_authenticated ON public.tournament_public_config;
CREATE POLICY tpc_select_public_authenticated
  ON public.tournament_public_config
  FOR SELECT
  TO authenticated
  USING (public.is_tournament_publicly_readable(tournament_id));
-- tpc_insert_auth / tpc_update_auth / tpc_delete_auth (is_tournament_owner) y
-- tpc_select_anon / tpc_select_auth / tpc_select_master_admin ya existían
-- correctamente y NO se tocan.

-- ── Verificación final dentro de la misma transacción ─────────────────────
DO $$
DECLARE
  v_still_open int;
BEGIN
  SELECT count(*) INTO v_still_open
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename <> 'galeria_eventos'
    AND (
      btrim(coalesce(qual, '')) = 'true'
      OR btrim(coalesce(with_check, '')) = 'true'
      OR qual ILIKE '%OR true%'
      OR with_check ILIKE '%OR true%'
      OR (qual ILIKE '%auth.role()%authenticated%' AND cmd IN ('INSERT','UPDATE','DELETE','ALL'))
    );
  IF v_still_open <> 0 THEN
    RAISE EXCEPTION 'Fix incompleto: % política(s) siguen con bypass abierto', v_still_open;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_column_grants
    WHERE table_schema='public' AND table_name='liga_jugadores'
      AND grantee='anon' AND column_name IN ('email','telefono')
      AND privilege_type = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'Fix incompleto: anon todavía tiene SELECT sobre email/telefono de liga_jugadores';
  END IF;
END $$;

-- Revisar el resultado con calma antes de aceptar. Cuando estés conforme:
--   COMMIT;
-- Si algo se ve mal:
--   ROLLBACK;
