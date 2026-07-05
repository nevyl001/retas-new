-- =============================================================================
-- Fase 1 — Aislamiento multicuenta del pool global de players + acotar anon
-- =============================================================================
-- Confirmado en producción (2026-07-05):
--   - players.user_id EXISTE (uuid, nullable)
--   - 0 filas huérfanas (tournament_id = zero-uuid AND user_id IS NULL)
--   - tournament_id es NOT NULL -> la rama "IS NULL" de can_access_player
--     nunca se activa en datos reales, se conserva solo por compatibilidad.
--   - players_select_auth estaba en USING (true): cualquier cuenta
--     autenticada leía players de cualquier otra cuenta.
--   - players_select_anon TAMBIÉN estaba en USING (true). Auditoría de
--     código confirma que solo el bracket público de Torneo Express
--     (fetchPairsByIdsPublic, vía supabasePublicRead) necesita leer players
--     como anon, y solo para jugadores de parejas de un torneo/torneo-express
--     públicamente visible. Retas, liga, duelo 2v2 y americano NO dependen
--     de esto (usan RPC/jugador_participaciones o no tocan players).
-- No cambia nombres de tabla, no cambia ranking global, no crea
-- global_players, no refactoriza frontend.
-- Idempotente: seguro de re-ejecutar.
-- =============================================================================

-- ── Helpers ──

-- can_access_player: ya NO trata el zero-uuid como libre para cualquiera.
CREATE OR REPLACE FUNCTION public.can_access_player(player_tournament_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    player_tournament_id IS NULL
    OR public.is_tournament_owner(player_tournament_id);
$$;

-- Acceso al pool global: solo el dueño de esas filas.
CREATE OR REPLACE FUNCTION public.can_access_global_pool_player(
  player_tournament_id uuid,
  player_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    player_tournament_id = '00000000-0000-0000-0000-000000000000'::uuid
    AND player_user_id = auth.uid();
$$;

-- Lectura anónima acotada: mismo criterio que ya usa pairs_select_anon
-- (torneo público, o pareja dentro de un torneo express público).
-- Requiere is_tournament_publicly_readable / is_torneo_express_public,
-- ya creados por rls-multiclub-pr1-public-read-helpers.sql.
CREATE OR REPLACE FUNCTION public.is_player_publicly_readable(p_player_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pairs p
    WHERE (p.player1_id = p_player_id OR p.player2_id = p_player_id)
      AND (
        public.is_tournament_publicly_readable(p.tournament_id)
        OR EXISTS (
          SELECT 1
          FROM public.torneo_express_grupo_parejas tgp
          JOIN public.torneo_express_grupos g ON g.id = tgp.grupo_id
          WHERE tgp.pareja_id = p.id
            AND public.is_torneo_express_public(g.torneo_id)
        )
      )
  );
$$;

-- ── SELECT (anon) ── acotada, ya no USING(true)
DROP POLICY IF EXISTS players_select_anon ON public.players;
CREATE POLICY players_select_anon ON public.players
  FOR SELECT TO anon
  USING (public.is_player_publicly_readable(id));

-- ── SELECT (authenticated) ── cierre del hueco principal de esta fase
DROP POLICY IF EXISTS players_select_auth ON public.players;
CREATE POLICY players_select_auth ON public.players
  FOR SELECT TO authenticated
  USING (
    public.can_access_player(tournament_id)
    OR public.can_access_global_pool_player(tournament_id, user_id)
  );

-- Admin maestro conserva visibilidad total (ya podía borrar vía
-- players_delete_master_admin; sin esto perdería la lectura que hoy
-- obtenía implícitamente del USING(true) anterior).
DROP POLICY IF EXISTS players_select_master_admin ON public.players;
CREATE POLICY players_select_master_admin ON public.players
  FOR SELECT TO authenticated
  USING (public.is_master_admin());

-- ── INSERT ──
DROP POLICY IF EXISTS players_insert_auth ON public.players;
CREATE POLICY players_insert_auth ON public.players
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_access_player(tournament_id)
    OR public.can_access_global_pool_player(tournament_id, user_id)
  );

-- ── UPDATE ──
DROP POLICY IF EXISTS players_update_auth ON public.players;
CREATE POLICY players_update_auth ON public.players
  FOR UPDATE TO authenticated
  USING (
    public.can_access_player(tournament_id)
    OR public.can_access_global_pool_player(tournament_id, user_id)
  )
  WITH CHECK (
    public.can_access_player(tournament_id)
    OR public.can_access_global_pool_player(tournament_id, user_id)
  );

-- ── DELETE ──
DROP POLICY IF EXISTS players_delete_auth ON public.players;
CREATE POLICY players_delete_auth ON public.players
  FOR DELETE TO authenticated
  USING (
    public.can_access_player(tournament_id)
    OR public.can_access_global_pool_player(tournament_id, user_id)
  );

-- players_delete_master_admin ya existe (admin-master-controls.sql), no se toca.

NOTIFY pgrst, 'reload schema';
