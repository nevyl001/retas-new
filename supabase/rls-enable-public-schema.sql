-- =============================================================================
-- RLS — Esquema public (Riviera Open / padel-app)
-- =============================================================================
-- ALERTA Supabase: rls_disabled_in_public
--
-- Ejecutar en Supabase → SQL Editor (proyecto padel-app).
-- Recomendado: copia de staging o backup antes de aplicar en producción.
--
-- QUÉ HACE:
--   1. Lista tablas sin RLS (diagnóstico)
--   2. Activa RLS en tablas operativas
--   3. Políticas: dueño autenticado + lectura anónima donde la app pública lo necesita
--
-- DESPUÉS: Security Advisor → re-ejecutar checks. Probar login, reta, TE público,
-- ranking y liga pública.
-- =============================================================================

-- ── 1. Diagnóstico: tablas public sin RLS ──
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname NOT LIKE 'pg_%'
ORDER BY c.relrowsecurity ASC, c.relname;

-- ── 2. Helpers (idempotentes) ──
CREATE OR REPLACE FUNCTION public.auth_uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$ SELECT auth.uid() $$;

CREATE OR REPLACE FUNCTION public.is_tournament_owner(tournament_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tournaments t
    WHERE t.id = tournament_uuid
      AND t.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_torneo_express_owner(te_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.torneo_express te
    WHERE te.id = te_id
      AND te.organizador_id = auth.uid()
  );
$$;

-- torneo_express_partidos enlaza por grupo_id → torneo_express_grupos.torneo_id
CREATE OR REPLACE FUNCTION public.is_torneo_express_grupo_owner(grupo_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.torneo_express_grupos g
    WHERE g.id = grupo_uuid
      AND public.is_torneo_express_owner(g.torneo_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_liga_owner(liga_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.ligas l
    WHERE l.id = liga_uuid
      AND l.organizador_id = auth.uid()
  );
$$;

-- Pool global de jugadores (sin columna user_id en players; usa tournament_id)
CREATE OR REPLACE FUNCTION public.can_access_player(player_tournament_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    player_tournament_id IS NULL
    OR player_tournament_id = '00000000-0000-0000-0000-000000000000'::uuid
    OR public.is_tournament_owner(player_tournament_id);
$$;

-- Macro mental: cada bloque hace ENABLE ROW LEVEL SECURITY + políticas.
-- Sin política de escritura para anon ⇒ INSERT/UPDATE/DELETE bloqueados (lo crítico).

-- ── 3. users ──
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select_own ON public.users;
DROP POLICY IF EXISTS users_insert_own ON public.users;
DROP POLICY IF EXISTS users_update_own ON public.users;

CREATE POLICY users_select_own ON public.users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY users_insert_own ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY users_update_own ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ── 4. admin_users ──
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_users_select_own ON public.admin_users;
CREATE POLICY admin_users_select_own ON public.admin_users
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ── 5. tournaments ──
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tournaments_select_auth ON public.tournaments;
DROP POLICY IF EXISTS tournaments_select_anon ON public.tournaments;
DROP POLICY IF EXISTS tournaments_insert_auth ON public.tournaments;
DROP POLICY IF EXISTS tournaments_update_auth ON public.tournaments;
DROP POLICY IF EXISTS tournaments_delete_auth ON public.tournaments;

CREATE POLICY tournaments_select_auth ON public.tournaments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Vista pública /public/{uuid} (anon con la clave del bundle)
CREATE POLICY tournaments_select_anon ON public.tournaments
  FOR SELECT TO anon
  USING (true);

CREATE POLICY tournaments_insert_auth ON public.tournaments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY tournaments_update_auth ON public.tournaments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY tournaments_delete_auth ON public.tournaments
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ── 6. players (esquema prod: tournament_id, sin user_id) ──
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS players_select_auth ON public.players;
DROP POLICY IF EXISTS players_select_anon ON public.players;
DROP POLICY IF EXISTS players_insert_auth ON public.players;
DROP POLICY IF EXISTS players_update_auth ON public.players;
DROP POLICY IF EXISTS players_delete_auth ON public.players;
DROP POLICY IF EXISTS players_mutate_auth ON public.players;

-- Lectura amplia para pool global / deduplicación por nombre (app legacy)
CREATE POLICY players_select_auth ON public.players
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY players_select_anon ON public.players
  FOR SELECT TO anon
  USING (true);

CREATE POLICY players_insert_auth ON public.players
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_player(tournament_id));

CREATE POLICY players_update_auth ON public.players
  FOR UPDATE TO authenticated
  USING (public.can_access_player(tournament_id))
  WITH CHECK (public.can_access_player(tournament_id));

CREATE POLICY players_delete_auth ON public.players
  FOR DELETE TO authenticated
  USING (public.can_access_player(tournament_id));

-- ── 7. pairs ──
ALTER TABLE public.pairs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pairs_select_auth ON public.pairs;
DROP POLICY IF EXISTS pairs_select_anon ON public.pairs;
DROP POLICY IF EXISTS pairs_insert_auth ON public.pairs;
DROP POLICY IF EXISTS pairs_update_auth ON public.pairs;
DROP POLICY IF EXISTS pairs_delete_auth ON public.pairs;

CREATE POLICY pairs_select_auth ON public.pairs
  FOR SELECT TO authenticated
  USING (public.is_tournament_owner(tournament_id));

CREATE POLICY pairs_select_anon ON public.pairs
  FOR SELECT TO anon
  USING (true);

CREATE POLICY pairs_insert_auth ON public.pairs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_tournament_owner(tournament_id));

CREATE POLICY pairs_update_auth ON public.pairs
  FOR UPDATE TO authenticated
  USING (public.is_tournament_owner(tournament_id))
  WITH CHECK (public.is_tournament_owner(tournament_id));

CREATE POLICY pairs_delete_auth ON public.pairs
  FOR DELETE TO authenticated
  USING (public.is_tournament_owner(tournament_id));

-- ── 8. matches ──
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS matches_select_auth ON public.matches;
DROP POLICY IF EXISTS matches_select_anon ON public.matches;
DROP POLICY IF EXISTS matches_insert_auth ON public.matches;
DROP POLICY IF EXISTS matches_update_auth ON public.matches;
DROP POLICY IF EXISTS matches_delete_auth ON public.matches;

CREATE POLICY matches_select_auth ON public.matches
  FOR SELECT TO authenticated
  USING (public.is_tournament_owner(tournament_id));

CREATE POLICY matches_select_anon ON public.matches
  FOR SELECT TO anon
  USING (true);

CREATE POLICY matches_insert_auth ON public.matches
  FOR INSERT TO authenticated
  WITH CHECK (public.is_tournament_owner(tournament_id));

CREATE POLICY matches_update_auth ON public.matches
  FOR UPDATE TO authenticated
  USING (public.is_tournament_owner(tournament_id))
  WITH CHECK (public.is_tournament_owner(tournament_id));

CREATE POLICY matches_delete_auth ON public.matches
  FOR DELETE TO authenticated
  USING (public.is_tournament_owner(tournament_id));

-- ── 9. games ──
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS games_select_auth ON public.games;
DROP POLICY IF EXISTS games_select_anon ON public.games;
DROP POLICY IF EXISTS games_insert_auth ON public.games;
DROP POLICY IF EXISTS games_update_auth ON public.games;
DROP POLICY IF EXISTS games_delete_auth ON public.games;

CREATE POLICY games_select_auth ON public.games
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.matches m
      WHERE m.id = games.match_id
        AND public.is_tournament_owner(m.tournament_id)
    )
  );

CREATE POLICY games_select_anon ON public.games
  FOR SELECT TO anon
  USING (true);

CREATE POLICY games_insert_auth ON public.games
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.matches m
      WHERE m.id = games.match_id
        AND public.is_tournament_owner(m.tournament_id)
    )
  );

CREATE POLICY games_update_auth ON public.games
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.matches m
      WHERE m.id = games.match_id
        AND public.is_tournament_owner(m.tournament_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.matches m
      WHERE m.id = games.match_id
        AND public.is_tournament_owner(m.tournament_id)
    )
  );

CREATE POLICY games_delete_auth ON public.games
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.matches m
      WHERE m.id = games.match_id
        AND public.is_tournament_owner(m.tournament_id)
    )
  );

-- ── 10. torneo_express (+ hijas) ──
ALTER TABLE public.torneo_express ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.torneo_express_grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.torneo_express_grupo_parejas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.torneo_express_partidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.torneo_express_eliminatoria_partidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS te_select_auth ON public.torneo_express;
DROP POLICY IF EXISTS te_select_anon ON public.torneo_express;
DROP POLICY IF EXISTS te_mutate_auth ON public.torneo_express;

CREATE POLICY te_select_auth ON public.torneo_express
  FOR SELECT TO authenticated
  USING (organizador_id = auth.uid());

CREATE POLICY te_select_anon ON public.torneo_express
  FOR SELECT TO anon
  USING (true);

CREATE POLICY te_mutate_auth ON public.torneo_express
  FOR ALL TO authenticated
  USING (organizador_id = auth.uid())
  WITH CHECK (organizador_id = auth.uid());

-- grupos
DROP POLICY IF EXISTS te_grupos_select_auth ON public.torneo_express_grupos;
DROP POLICY IF EXISTS te_grupos_select_anon ON public.torneo_express_grupos;
DROP POLICY IF EXISTS te_grupos_mutate_auth ON public.torneo_express_grupos;

CREATE POLICY te_grupos_select_auth ON public.torneo_express_grupos
  FOR SELECT TO authenticated
  USING (public.is_torneo_express_owner(torneo_id));

CREATE POLICY te_grupos_select_anon ON public.torneo_express_grupos
  FOR SELECT TO anon
  USING (true);

CREATE POLICY te_grupos_mutate_auth ON public.torneo_express_grupos
  FOR ALL TO authenticated
  USING (public.is_torneo_express_owner(torneo_id))
  WITH CHECK (public.is_torneo_express_owner(torneo_id));

-- grupo_parejas
DROP POLICY IF EXISTS te_gp_select_auth ON public.torneo_express_grupo_parejas;
DROP POLICY IF EXISTS te_gp_select_anon ON public.torneo_express_grupo_parejas;
DROP POLICY IF EXISTS te_gp_mutate_auth ON public.torneo_express_grupo_parejas;

CREATE POLICY te_gp_select_auth ON public.torneo_express_grupo_parejas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.torneo_express_grupos g
      WHERE g.id = torneo_express_grupo_parejas.grupo_id
        AND public.is_torneo_express_owner(g.torneo_id)
    )
  );

CREATE POLICY te_gp_select_anon ON public.torneo_express_grupo_parejas
  FOR SELECT TO anon
  USING (true);

CREATE POLICY te_gp_mutate_auth ON public.torneo_express_grupo_parejas
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.torneo_express_grupos g
      WHERE g.id = torneo_express_grupo_parejas.grupo_id
        AND public.is_torneo_express_owner(g.torneo_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.torneo_express_grupos g
      WHERE g.id = torneo_express_grupo_parejas.grupo_id
        AND public.is_torneo_express_owner(g.torneo_id)
    )
  );

-- partidos (esquema prod: grupo_id, sin torneo_id directo)
DROP POLICY IF EXISTS te_partidos_select_auth ON public.torneo_express_partidos;
DROP POLICY IF EXISTS te_partidos_select_anon ON public.torneo_express_partidos;
DROP POLICY IF EXISTS te_partidos_mutate_auth ON public.torneo_express_partidos;

CREATE POLICY te_partidos_select_auth ON public.torneo_express_partidos
  FOR SELECT TO authenticated
  USING (public.is_torneo_express_grupo_owner(grupo_id));

CREATE POLICY te_partidos_select_anon ON public.torneo_express_partidos
  FOR SELECT TO anon
  USING (true);

CREATE POLICY te_partidos_mutate_auth ON public.torneo_express_partidos
  FOR ALL TO authenticated
  USING (public.is_torneo_express_grupo_owner(grupo_id))
  WITH CHECK (public.is_torneo_express_grupo_owner(grupo_id));

-- eliminatoria
DROP POLICY IF EXISTS te_elim_select_auth ON public.torneo_express_eliminatoria_partidos;
DROP POLICY IF EXISTS te_elim_select_anon ON public.torneo_express_eliminatoria_partidos;
DROP POLICY IF EXISTS te_elim_mutate_auth ON public.torneo_express_eliminatoria_partidos;

CREATE POLICY te_elim_select_auth ON public.torneo_express_eliminatoria_partidos
  FOR SELECT TO authenticated
  USING (public.is_torneo_express_owner(torneo_id));

CREATE POLICY te_elim_select_anon ON public.torneo_express_eliminatoria_partidos
  FOR SELECT TO anon
  USING (true);

CREATE POLICY te_elim_mutate_auth ON public.torneo_express_eliminatoria_partidos
  FOR ALL TO authenticated
  USING (public.is_torneo_express_owner(torneo_id))
  WITH CHECK (public.is_torneo_express_owner(torneo_id));

-- ── 11. riviera_jugadores + participaciones + stats ──
ALTER TABLE public.riviera_jugadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jugador_participaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jugador_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rj_select_auth ON public.riviera_jugadores;
DROP POLICY IF EXISTS rj_select_anon ON public.riviera_jugadores;
DROP POLICY IF EXISTS rj_mutate_auth ON public.riviera_jugadores;

CREATE POLICY rj_select_auth ON public.riviera_jugadores
  FOR SELECT TO authenticated
  USING (organizador_id = auth.uid());

CREATE POLICY rj_select_anon ON public.riviera_jugadores
  FOR SELECT TO anon
  USING (
    estado = 'activo'
    AND COALESCE(visible_publico, true) = true
  );

CREATE POLICY rj_mutate_auth ON public.riviera_jugadores
  FOR ALL TO authenticated
  USING (organizador_id = auth.uid())
  WITH CHECK (organizador_id = auth.uid());

DROP POLICY IF EXISTS jp_select_auth ON public.jugador_participaciones;
DROP POLICY IF EXISTS jp_select_anon ON public.jugador_participaciones;
DROP POLICY IF EXISTS jp_mutate_auth ON public.jugador_participaciones;

CREATE POLICY jp_select_auth ON public.jugador_participaciones
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.riviera_jugadores rj
      WHERE rj.id = jugador_participaciones.jugador_id
        AND rj.organizador_id = auth.uid()
    )
  );

CREATE POLICY jp_select_anon ON public.jugador_participaciones
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.riviera_jugadores rj
      WHERE rj.id = jugador_participaciones.jugador_id
        AND rj.estado = 'activo'
        AND COALESCE(rj.visible_publico, true) = true
    )
  );

CREATE POLICY jp_mutate_auth ON public.jugador_participaciones
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.riviera_jugadores rj
      WHERE rj.id = jugador_participaciones.jugador_id
        AND rj.organizador_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.riviera_jugadores rj
      WHERE rj.id = jugador_participaciones.jugador_id
        AND rj.organizador_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS js_select_auth ON public.jugador_stats;
DROP POLICY IF EXISTS js_select_anon ON public.jugador_stats;
DROP POLICY IF EXISTS js_mutate_auth ON public.jugador_stats;

CREATE POLICY js_select_auth ON public.jugador_stats
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.riviera_jugadores rj
      WHERE rj.id = jugador_stats.jugador_id
        AND rj.organizador_id = auth.uid()
    )
  );

CREATE POLICY js_select_anon ON public.jugador_stats
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.riviera_jugadores rj
      WHERE rj.id = jugador_stats.jugador_id
        AND rj.estado = 'activo'
        AND COALESCE(rj.visible_publico, true) = true
    )
  );

CREATE POLICY js_mutate_auth ON public.jugador_stats
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.riviera_jugadores rj
      WHERE rj.id = jugador_stats.jugador_id
        AND rj.organizador_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.riviera_jugadores rj
      WHERE rj.id = jugador_stats.jugador_id
        AND rj.organizador_id = auth.uid()
    )
  );

-- ── 12. ligas (+ hijas) ──
ALTER TABLE public.ligas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liga_jugadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liga_inscripciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liga_jornadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liga_jornada_parejas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liga_partidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ligas_select_auth ON public.ligas;
DROP POLICY IF EXISTS ligas_select_anon ON public.ligas;
DROP POLICY IF EXISTS ligas_mutate_auth ON public.ligas;

CREATE POLICY ligas_select_auth ON public.ligas
  FOR SELECT TO authenticated
  USING (organizador_id = auth.uid());

CREATE POLICY ligas_select_anon ON public.ligas
  FOR SELECT TO anon
  USING (true);

CREATE POLICY ligas_mutate_auth ON public.ligas
  FOR ALL TO authenticated
  USING (organizador_id = auth.uid())
  WITH CHECK (organizador_id = auth.uid());

DROP POLICY IF EXISTS lj_select_auth ON public.liga_jugadores;
DROP POLICY IF EXISTS lj_select_anon ON public.liga_jugadores;
DROP POLICY IF EXISTS lj_mutate_auth ON public.liga_jugadores;

CREATE POLICY lj_select_auth ON public.liga_jugadores
  FOR SELECT TO authenticated
  USING (organizador_id = auth.uid());

CREATE POLICY lj_select_anon ON public.liga_jugadores
  FOR SELECT TO anon
  USING (true);

CREATE POLICY lj_mutate_auth ON public.liga_jugadores
  FOR ALL TO authenticated
  USING (organizador_id = auth.uid())
  WITH CHECK (organizador_id = auth.uid());

DROP POLICY IF EXISTS li_select_auth ON public.liga_inscripciones;
DROP POLICY IF EXISTS li_select_anon ON public.liga_inscripciones;
DROP POLICY IF EXISTS li_mutate_auth ON public.liga_inscripciones;

CREATE POLICY li_select_auth ON public.liga_inscripciones
  FOR SELECT TO authenticated
  USING (public.is_liga_owner(liga_id));

CREATE POLICY li_select_anon ON public.liga_inscripciones
  FOR SELECT TO anon
  USING (true);

CREATE POLICY li_mutate_auth ON public.liga_inscripciones
  FOR ALL TO authenticated
  USING (public.is_liga_owner(liga_id))
  WITH CHECK (public.is_liga_owner(liga_id));

DROP POLICY IF EXISTS ljorn_select_auth ON public.liga_jornadas;
DROP POLICY IF EXISTS ljorn_select_anon ON public.liga_jornadas;
DROP POLICY IF EXISTS ljorn_mutate_auth ON public.liga_jornadas;

CREATE POLICY ljorn_select_auth ON public.liga_jornadas
  FOR SELECT TO authenticated
  USING (public.is_liga_owner(liga_id));

CREATE POLICY ljorn_select_anon ON public.liga_jornadas
  FOR SELECT TO anon
  USING (true);

CREATE POLICY ljorn_mutate_auth ON public.liga_jornadas
  FOR ALL TO authenticated
  USING (public.is_liga_owner(liga_id))
  WITH CHECK (public.is_liga_owner(liga_id));

DROP POLICY IF EXISTS ljp_select_auth ON public.liga_jornada_parejas;
DROP POLICY IF EXISTS ljp_select_anon ON public.liga_jornada_parejas;
DROP POLICY IF EXISTS ljp_mutate_auth ON public.liga_jornada_parejas;

CREATE POLICY ljp_select_auth ON public.liga_jornada_parejas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.liga_jornadas j
      WHERE j.id = liga_jornada_parejas.jornada_id
        AND public.is_liga_owner(j.liga_id)
    )
  );

CREATE POLICY ljp_select_anon ON public.liga_jornada_parejas
  FOR SELECT TO anon
  USING (true);

CREATE POLICY ljp_mutate_auth ON public.liga_jornada_parejas
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.liga_jornadas j
      WHERE j.id = liga_jornada_parejas.jornada_id
        AND public.is_liga_owner(j.liga_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.liga_jornadas j
      WHERE j.id = liga_jornada_parejas.jornada_id
        AND public.is_liga_owner(j.liga_id)
    )
  );

DROP POLICY IF EXISTS lp_select_auth ON public.liga_partidos;
DROP POLICY IF EXISTS lp_select_anon ON public.liga_partidos;
DROP POLICY IF EXISTS lp_mutate_auth ON public.liga_partidos;

CREATE POLICY lp_select_auth ON public.liga_partidos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.liga_jornadas j
      WHERE j.id = liga_partidos.jornada_id
        AND public.is_liga_owner(j.liga_id)
    )
  );

CREATE POLICY lp_select_anon ON public.liga_partidos
  FOR SELECT TO anon
  USING (true);

CREATE POLICY lp_mutate_auth ON public.liga_partidos
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.liga_jornadas j
      WHERE j.id = liga_partidos.jornada_id
        AND public.is_liga_owner(j.liga_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.liga_jornadas j
      WHERE j.id = liga_partidos.jornada_id
        AND public.is_liga_owner(j.liga_id)
    )
  );

-- ── 13. notificaciones (solo organizador; Edge Functions usan service_role) ──
DO $$
BEGIN
  IF to_regclass('public.notificaciones_log') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.notificaciones_log ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS notif_log_select_auth ON public.notificaciones_log';
    EXECUTE $p$
      CREATE POLICY notif_log_select_auth ON public.notificaciones_log
        FOR SELECT TO authenticated
        USING (
          torneo_express_id IS NOT NULL
          AND public.is_torneo_express_owner(torneo_express_id)
        )
    $p$;
  END IF;

  IF to_regclass('public.notificaciones_eventos_queue') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.notificaciones_eventos_queue ENABLE ROW LEVEL SECURITY';
    -- Sin políticas para anon/authenticated: solo service_role (bypass RLS)
  END IF;
END $$;

-- ── 14. tournament_public_config (ya suele tener RLS; no sobrescribir si existe) ──
DO $$
BEGIN
  IF to_regclass('public.tournament_public_config') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.tournament_public_config ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- Si faltan políticas en tournament_public_config, créalas manualmente:
--   anon: SELECT
--   authenticated: INSERT/UPDATE donde tournaments.user_id = auth.uid()

-- ── 15. Verificación final ──
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'users', 'tournaments', 'players', 'pairs', 'matches', 'games',
    'torneo_express', 'riviera_jugadores', 'jugador_stats', 'ligas'
  )
ORDER BY c.relname;
