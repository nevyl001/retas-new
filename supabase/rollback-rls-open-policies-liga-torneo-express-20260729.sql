-- =============================================================================
-- ROLLBACK -- restaura EXACTAMENTE las políticas y grants previos a
-- fix-rls-open-policies-liga-torneo-express-20260729.sql (reabre el hueco de
-- seguridad SEC-001). NO EJECUTAR salvo que el fix ya se haya aplicado y se
-- decida revertir por una razón operativa concreta y documentada.
-- =============================================================================

BEGIN;

-- ── career_event_host_manual_overrides ──────────────────────────────────────
DROP POLICY IF EXISTS cehmo_select_master_admin ON public.career_event_host_manual_overrides;
CREATE POLICY career_event_host_manual_overrides_select
  ON public.career_event_host_manual_overrides
  FOR SELECT TO authenticated USING (true);

-- ── duelos_2v2 ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS duelos_2v2_select_anon ON public.duelos_2v2;
CREATE POLICY duelos_2v2_select_anon ON public.duelos_2v2 FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS duelos_2v2_select_auth ON public.duelos_2v2;
CREATE POLICY duelos_2v2_select_auth ON public.duelos_2v2 FOR SELECT TO authenticated
  USING ((organizador_id = auth.uid()) OR true);

-- ── liga_equipos ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS leq_select_anon ON public.liga_equipos;
CREATE POLICY leq_select_anon ON public.liga_equipos FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS leq_select_public_authenticated ON public.liga_equipos;

-- ── liga_inscripciones ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS li_select_public_authenticated ON public.liga_inscripciones;
CREATE POLICY liga_inscripciones_select ON public.liga_inscripciones FOR SELECT TO public USING (true);

-- ── liga_jornadas ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS ljorn_select_public_authenticated ON public.liga_jornadas;
CREATE POLICY liga_jornadas_select ON public.liga_jornadas FOR SELECT TO public USING (true);

-- ── liga_jornada_parejas ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS ljp_select_public_authenticated ON public.liga_jornada_parejas;
CREATE POLICY liga_jornada_parejas_select ON public.liga_jornada_parejas FOR SELECT TO public USING (true);

-- ── liga_jugadores ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS lj_select_public_authenticated ON public.liga_jugadores;
CREATE POLICY liga_jugadores_select ON public.liga_jugadores FOR SELECT TO public USING (true);
-- Restaura el grant de tabla completa que tenía anon antes del fix (backup:
-- SELECT sobre las 9 columnas, incluidas email y telefono).
GRANT SELECT ON public.liga_jugadores TO anon;

-- ── liga_partidos ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS lp_select_public_authenticated ON public.liga_partidos;
CREATE POLICY liga_partidos_select ON public.liga_partidos FOR SELECT TO public USING (true);

-- ── ligas ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS ligas_select_public_authenticated ON public.ligas;
CREATE POLICY ligas_select ON public.ligas FOR SELECT TO public USING (true);

-- ── torneo_express ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS te_select_anon ON public.torneo_express;
CREATE POLICY te_select_anon ON public.torneo_express FOR SELECT TO anon USING (true);
CREATE POLICY lectura_publica_torneo_express ON public.torneo_express FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS te_select_public_authenticated ON public.torneo_express;

-- ── torneo_express_grupos ────────────────────────────────────────────────────
DROP POLICY IF EXISTS te_grupos_select_anon ON public.torneo_express_grupos;
CREATE POLICY te_grupos_select_anon ON public.torneo_express_grupos FOR SELECT TO anon USING (true);
CREATE POLICY lectura_publica_te_grupos ON public.torneo_express_grupos FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS te_grupos_select_public_authenticated ON public.torneo_express_grupos;

-- ── torneo_express_grupo_parejas ─────────────────────────────────────────────
DROP POLICY IF EXISTS te_gp_select_anon ON public.torneo_express_grupo_parejas;
CREATE POLICY te_gp_select_anon ON public.torneo_express_grupo_parejas FOR SELECT TO anon USING (true);
CREATE POLICY lectura_publica_te_grupo_parejas ON public.torneo_express_grupo_parejas FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS te_gp_select_public_authenticated ON public.torneo_express_grupo_parejas;

-- ── torneo_express_partidos ──────────────────────────────────────────────────
DROP POLICY IF EXISTS te_partidos_select_anon ON public.torneo_express_partidos;
CREATE POLICY te_partidos_select_anon ON public.torneo_express_partidos FOR SELECT TO anon USING (true);
CREATE POLICY lectura_publica_te_partidos ON public.torneo_express_partidos FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS te_partidos_select_public_authenticated ON public.torneo_express_partidos;

-- ── torneo_express_eliminatoria_partidos ─────────────────────────────────────
DROP POLICY IF EXISTS te_elim_select_anon ON public.torneo_express_eliminatoria_partidos;
CREATE POLICY te_elim_select_anon ON public.torneo_express_eliminatoria_partidos FOR SELECT TO anon USING (true);
CREATE POLICY lectura_publica_eliminatoria ON public.torneo_express_eliminatoria_partidos FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS te_elim_select_public_authenticated ON public.torneo_express_eliminatoria_partidos;

-- ── tournament_public_config ─────────────────────────────────────────────────
DROP POLICY IF EXISTS tpc_select_public_authenticated ON public.tournament_public_config;
CREATE POLICY "Allow public read" ON public.tournament_public_config FOR SELECT TO public USING (true);
CREATE POLICY "Allow authenticated upsert" ON public.tournament_public_config FOR ALL TO public
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

COMMIT;
