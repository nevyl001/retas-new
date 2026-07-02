-- =============================================================================
-- RLS multi-club — PR 1: lectura pública anon acotada
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (staging primero).
-- Prerrequisitos: rls-enable-public-schema.sql, admin-master-controls.sql,
--   duelos-2v2.sql, rating-sistema.sql
--
-- Objetivo: reemplazar políticas anon USING (true) en datos operativos por
-- helpers de visibilidad pública, sin aislar players por club ni tocar ranking.
-- =============================================================================

-- ── Columnas opcionales (compatibilidad; no rompen datos existentes) ──
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.tournaments.is_public IS
  'Si false, el torneo no es legible por anon salvo fila en tournament_public_config.';

ALTER TABLE public.ligas
  ADD COLUMN IF NOT EXISTS es_publica boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.ligas.es_publica IS
  'Si false, la liga no es legible por anon (enlace público desactivado).';

DO $$
BEGIN
  IF to_regclass('public.torneo_express') IS NOT NULL THEN
    EXECUTE $sql$
      ALTER TABLE public.torneo_express
        ADD COLUMN IF NOT EXISTS es_publico boolean NOT NULL DEFAULT true
    $sql$;
    EXECUTE $sql$
      COMMENT ON COLUMN public.torneo_express.es_publico IS
        'Si false, el torneo express no es legible por anon.'
    $sql$;
  END IF;

  IF to_regclass('public.duelos_2v2') IS NOT NULL THEN
    EXECUTE $sql$
      ALTER TABLE public.duelos_2v2
        ADD COLUMN IF NOT EXISTS es_publico boolean NOT NULL DEFAULT true
    $sql$;
    EXECUTE $sql$
      COMMENT ON COLUMN public.duelos_2v2.es_publico IS
        'Si false, el duelo no es legible por anon.'
    $sql$;
  END IF;
END $$;

-- ── Helpers públicos (SECURITY DEFINER evita recursión RLS) ──

CREATE OR REPLACE FUNCTION public.is_tournament_publicly_readable(p_tournament_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_tournament_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.tournaments t
      WHERE t.id = p_tournament_id
        AND (
          EXISTS (
            SELECT 1
            FROM public.tournament_public_config tpc
            WHERE tpc.tournament_id = t.id
          )
          OR COALESCE(t.is_public, true) = true
        )
    );
$$;

COMMENT ON FUNCTION public.is_tournament_publicly_readable(uuid) IS
  'Torneo legible por anon: is_public o fila en tournament_public_config (americano/equipos/RR público).';

CREATE OR REPLACE FUNCTION public.is_torneo_express_public(p_torneo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_torneo_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.torneo_express te
      WHERE te.id = p_torneo_id
        AND COALESCE(te.es_publico, true) = true
        AND (
          te.estado IN ('en_curso', 'finalizado')
          OR EXISTS (
            SELECT 1
            FROM public.torneo_express_grupos g
            WHERE g.torneo_id = te.id
            LIMIT 1
          )
        )
    );
$$;

COMMENT ON FUNCTION public.is_torneo_express_public(uuid) IS
  'TE legible por anon: es_publico y (en curso/finalizado o con grupos creados).';

CREATE OR REPLACE FUNCTION public.is_liga_public(p_liga_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_liga_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.ligas l
      WHERE l.id = p_liga_id
        AND COALESCE(l.es_publica, true) = true
    );
$$;

COMMENT ON FUNCTION public.is_liga_public(uuid) IS
  'Liga legible por anon si es_publica (default true).';

CREATE OR REPLACE FUNCTION public.is_duelo_public(p_duelo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_duelo_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.duelos_2v2 d
      WHERE d.id = p_duelo_id
        AND COALESCE(d.es_publico, true) = true
        AND d.estado IN ('en_juego', 'finalizado')
    );
$$;

COMMENT ON FUNCTION public.is_duelo_public(uuid) IS
  'Duelo legible por anon: es_publico y en juego o finalizado (marcador público).';

GRANT EXECUTE ON FUNCTION public.is_tournament_publicly_readable(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_torneo_express_public(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_liga_public(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_duelo_public(uuid) TO anon, authenticated;

-- ── tournament_public_config ──
DO $$
BEGIN
  IF to_regclass('public.tournament_public_config') IS NULL THEN
    RAISE NOTICE 'tournament_public_config no existe; omitiendo políticas.';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.tournament_public_config ENABLE ROW LEVEL SECURITY';

  EXECUTE 'GRANT SELECT ON public.tournament_public_config TO anon';
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_public_config TO authenticated';

  EXECUTE 'DROP POLICY IF EXISTS tpc_select_anon ON public.tournament_public_config';
  EXECUTE 'DROP POLICY IF EXISTS tpc_select_auth ON public.tournament_public_config';
  EXECUTE 'DROP POLICY IF EXISTS tpc_insert_auth ON public.tournament_public_config';
  EXECUTE 'DROP POLICY IF EXISTS tpc_update_auth ON public.tournament_public_config';
  EXECUTE 'DROP POLICY IF EXISTS tpc_delete_auth ON public.tournament_public_config';
  EXECUTE 'DROP POLICY IF EXISTS tpc_select_master_admin ON public.tournament_public_config';
  EXECUTE 'DROP POLICY IF EXISTS tpc_mutate_master_admin ON public.tournament_public_config';

  EXECUTE $p$
    CREATE POLICY tpc_select_anon ON public.tournament_public_config
      FOR SELECT TO anon
      USING (public.is_tournament_publicly_readable(tournament_id))
  $p$;

  EXECUTE $p$
    CREATE POLICY tpc_select_auth ON public.tournament_public_config
      FOR SELECT TO authenticated
      USING (public.is_tournament_owner(tournament_id))
  $p$;

  EXECUTE $p$
    CREATE POLICY tpc_insert_auth ON public.tournament_public_config
      FOR INSERT TO authenticated
      WITH CHECK (public.is_tournament_owner(tournament_id))
  $p$;

  EXECUTE $p$
    CREATE POLICY tpc_update_auth ON public.tournament_public_config
      FOR UPDATE TO authenticated
      USING (public.is_tournament_owner(tournament_id))
      WITH CHECK (public.is_tournament_owner(tournament_id))
  $p$;

  EXECUTE $p$
    CREATE POLICY tpc_delete_auth ON public.tournament_public_config
      FOR DELETE TO authenticated
      USING (public.is_tournament_owner(tournament_id))
  $p$;

  EXECUTE $p$
    CREATE POLICY tpc_select_master_admin ON public.tournament_public_config
      FOR SELECT TO authenticated
      USING (public.is_master_admin())
  $p$;

  EXECUTE $p$
    CREATE POLICY tpc_mutate_master_admin ON public.tournament_public_config
      FOR ALL TO authenticated
      USING (public.is_master_admin())
      WITH CHECK (public.is_master_admin())
  $p$;
END $$;

-- ── tournaments ──
DROP POLICY IF EXISTS tournaments_select_anon ON public.tournaments;
CREATE POLICY tournaments_select_anon ON public.tournaments
  FOR SELECT TO anon
  USING (public.is_tournament_publicly_readable(id));

-- ── players (identidad global auth; anon solo torneos públicos, sin pool global) ──
DROP POLICY IF EXISTS players_select_anon ON public.players;
CREATE POLICY players_select_anon ON public.players
  FOR SELECT TO anon
  USING (
    tournament_id IS NOT NULL
    AND tournament_id <> '00000000-0000-0000-0000-000000000000'::uuid
    AND public.is_tournament_publicly_readable(tournament_id)
  );

-- ── pairs (torneo público o pareja en TE público) ──
DROP POLICY IF EXISTS pairs_select_anon ON public.pairs;
CREATE POLICY pairs_select_anon ON public.pairs
  FOR SELECT TO anon
  USING (
    public.is_tournament_publicly_readable(tournament_id)
    OR EXISTS (
      SELECT 1
      FROM public.torneo_express_grupo_parejas tgp
      INNER JOIN public.torneo_express_grupos g ON g.id = tgp.grupo_id
      WHERE tgp.pareja_id = pairs.id
        AND public.is_torneo_express_public(g.torneo_id)
    )
  );

-- ── matches ──
DROP POLICY IF EXISTS matches_select_anon ON public.matches;
CREATE POLICY matches_select_anon ON public.matches
  FOR SELECT TO anon
  USING (public.is_tournament_publicly_readable(tournament_id));

-- ── games ──
DROP POLICY IF EXISTS games_select_anon ON public.games;
CREATE POLICY games_select_anon ON public.games
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.matches m
      WHERE m.id = games.match_id
        AND public.is_tournament_publicly_readable(m.tournament_id)
    )
  );

-- ── torneo_express ──
DROP POLICY IF EXISTS te_select_anon ON public.torneo_express;
CREATE POLICY te_select_anon ON public.torneo_express
  FOR SELECT TO anon
  USING (public.is_torneo_express_public(id));

DROP POLICY IF EXISTS te_grupos_select_anon ON public.torneo_express_grupos;
CREATE POLICY te_grupos_select_anon ON public.torneo_express_grupos
  FOR SELECT TO anon
  USING (public.is_torneo_express_public(torneo_id));

DROP POLICY IF EXISTS te_gp_select_anon ON public.torneo_express_grupo_parejas;
CREATE POLICY te_gp_select_anon ON public.torneo_express_grupo_parejas
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.torneo_express_grupos g
      WHERE g.id = torneo_express_grupo_parejas.grupo_id
        AND public.is_torneo_express_public(g.torneo_id)
    )
  );

DROP POLICY IF EXISTS te_partidos_select_anon ON public.torneo_express_partidos;
CREATE POLICY te_partidos_select_anon ON public.torneo_express_partidos
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.torneo_express_grupos g
      WHERE g.id = torneo_express_partidos.grupo_id
        AND public.is_torneo_express_public(g.torneo_id)
    )
  );

DROP POLICY IF EXISTS te_elim_select_anon ON public.torneo_express_eliminatoria_partidos;
CREATE POLICY te_elim_select_anon ON public.torneo_express_eliminatoria_partidos
  FOR SELECT TO anon
  USING (public.is_torneo_express_public(torneo_id));

-- ── ligas ──
DROP POLICY IF EXISTS ligas_select_anon ON public.ligas;
CREATE POLICY ligas_select_anon ON public.ligas
  FOR SELECT TO anon
  USING (public.is_liga_public(id));

DROP POLICY IF EXISTS lj_select_anon ON public.liga_jugadores;
CREATE POLICY lj_select_anon ON public.liga_jugadores
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.liga_inscripciones li
      WHERE li.jugador_id = liga_jugadores.id
        AND public.is_liga_public(li.liga_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.liga_jornada_parejas ljp
      INNER JOIN public.liga_jornadas lj ON lj.id = ljp.jornada_id
      WHERE public.is_liga_public(lj.liga_id)
        AND (
          ljp.jugador1_id = liga_jugadores.id
          OR ljp.jugador2_id = liga_jugadores.id
        )
    )
  );

DROP POLICY IF EXISTS li_select_anon ON public.liga_inscripciones;
CREATE POLICY li_select_anon ON public.liga_inscripciones
  FOR SELECT TO anon
  USING (public.is_liga_public(liga_id));

DROP POLICY IF EXISTS ljorn_select_anon ON public.liga_jornadas;
CREATE POLICY ljorn_select_anon ON public.liga_jornadas
  FOR SELECT TO anon
  USING (public.is_liga_public(liga_id));

DROP POLICY IF EXISTS ljp_select_anon ON public.liga_jornada_parejas;
CREATE POLICY ljp_select_anon ON public.liga_jornada_parejas
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.liga_jornadas lj
      WHERE lj.id = liga_jornada_parejas.jornada_id
        AND public.is_liga_public(lj.liga_id)
    )
  );

DROP POLICY IF EXISTS lp_select_anon ON public.liga_partidos;
CREATE POLICY lp_select_anon ON public.liga_partidos
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.liga_jornadas lj
      WHERE lj.id = liga_partidos.jornada_id
        AND public.is_liga_public(lj.liga_id)
    )
  );

-- ── duelos_2v2 ──
DO $$
BEGIN
  IF to_regclass('public.duelos_2v2') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS duelos_2v2_select_anon ON public.duelos_2v2';
  EXECUTE 'DROP POLICY IF EXISTS duelos_2v2_select_auth ON public.duelos_2v2';

  EXECUTE $p$
    CREATE POLICY duelos_2v2_select_anon ON public.duelos_2v2
      FOR SELECT TO anon
      USING (public.is_duelo_public(id))
  $p$;

  EXECUTE $p$
    CREATE POLICY duelos_2v2_select_auth ON public.duelos_2v2
      FOR SELECT TO authenticated
      USING (organizador_id = auth.uid())
  $p$;
END $$;

-- ── rating_historial (ranking público: solo jugadores visible_publico o duelo público) ──
DROP POLICY IF EXISTS rating_historial_select_public ON public.rating_historial;
DROP POLICY IF EXISTS rating_historial_select_anon ON public.rating_historial;
DROP POLICY IF EXISTS rating_historial_select_auth ON public.rating_historial;
DROP POLICY IF EXISTS rating_historial_select_master_admin ON public.rating_historial;

CREATE POLICY rating_historial_select_anon ON public.rating_historial
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.riviera_jugadores rj
      WHERE rj.id = rating_historial.jugador_id
        AND rj.estado = 'activo'
        AND rj.visible_publico IS TRUE
    )
    OR (
      rating_historial.partido_ref IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.duelos_2v2 d
        WHERE ('duelo2v2:' || d.id::text) = rating_historial.partido_ref
          AND public.is_duelo_public(d.id)
      )
    )
  );

CREATE POLICY rating_historial_select_auth ON public.rating_historial
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.riviera_jugadores rj
      WHERE rj.id = rating_historial.jugador_id
        AND (
          rj.organizador_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.organizer_player_access opa
            WHERE opa.is_active = true
              AND opa.grantee_organizer_id = auth.uid()
              AND (
                opa.jugador_id = rj.id
                OR opa.local_jugador_id = rj.id
              )
          )
        )
    )
  );

CREATE POLICY rating_historial_select_master_admin ON public.rating_historial
  FOR SELECT TO authenticated
  USING (public.is_master_admin());

NOTIFY pgrst, 'reload schema';
