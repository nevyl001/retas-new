-- Admin maestro: modos de juego por cuenta + control de ranking por jugador.
-- Ejecutar en Supabase SQL Editor después de rls-enable-public-schema.sql

-- ── Helper: ¿sesión actual es admin maestro? ──
CREATE OR REPLACE FUNCTION public.is_master_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_master_admin() TO authenticated;

-- ── Modos habilitados por organizador (cuenta/club) ──
CREATE TABLE IF NOT EXISTS public.organizador_game_modes (
  organizador_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  reta_equipos boolean NOT NULL DEFAULT true,
  round_robin boolean NOT NULL DEFAULT true,
  americano boolean NOT NULL DEFAULT true,
  mini_torneo boolean NOT NULL DEFAULT true,
  liga boolean NOT NULL DEFAULT true,
  duelo_2v2 boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organizador_game_modes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ogm_select_own ON public.organizador_game_modes;
DROP POLICY IF EXISTS ogm_select_admin ON public.organizador_game_modes;
DROP POLICY IF EXISTS ogm_mutate_admin ON public.organizador_game_modes;

CREATE POLICY ogm_select_own ON public.organizador_game_modes
  FOR SELECT TO authenticated
  USING (organizador_id = auth.uid());

CREATE POLICY ogm_select_admin ON public.organizador_game_modes
  FOR SELECT TO authenticated
  USING (public.is_master_admin());

CREATE POLICY ogm_mutate_admin ON public.organizador_game_modes
  FOR ALL TO authenticated
  USING (public.is_master_admin())
  WITH CHECK (public.is_master_admin());

-- ── Jugador: ¿suma al ranking Riviera? ──
ALTER TABLE public.riviera_jugadores
  ADD COLUMN IF NOT EXISTS suma_ranking boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.riviera_jugadores.suma_ranking IS
  'Si false, no aparece en ranking público ni acumula puntos nuevos.';

-- ── Admin maestro: leer todos los usuarios ──
DROP POLICY IF EXISTS users_select_master_admin ON public.users;
CREATE POLICY users_select_master_admin ON public.users
  FOR SELECT TO authenticated
  USING (public.is_master_admin());

-- ── Admin maestro: gestionar datos de cualquier cuenta ──
DROP POLICY IF EXISTS tournaments_select_master_admin ON public.tournaments;
CREATE POLICY tournaments_select_master_admin ON public.tournaments
  FOR SELECT TO authenticated
  USING (public.is_master_admin());

DROP POLICY IF EXISTS tournaments_delete_master_admin ON public.tournaments;
CREATE POLICY tournaments_delete_master_admin ON public.tournaments
  FOR DELETE TO authenticated
  USING (public.is_master_admin());

DROP POLICY IF EXISTS players_delete_master_admin ON public.players;
CREATE POLICY players_delete_master_admin ON public.players
  FOR DELETE TO authenticated
  USING (public.is_master_admin());

DROP POLICY IF EXISTS pairs_delete_master_admin ON public.pairs;
CREATE POLICY pairs_delete_master_admin ON public.pairs
  FOR DELETE TO authenticated
  USING (public.is_master_admin());

DROP POLICY IF EXISTS matches_delete_master_admin ON public.matches;
CREATE POLICY matches_delete_master_admin ON public.matches
  FOR DELETE TO authenticated
  USING (public.is_master_admin());

DROP POLICY IF EXISTS games_delete_master_admin ON public.games;
CREATE POLICY games_delete_master_admin ON public.games
  FOR DELETE TO authenticated
  USING (public.is_master_admin());

DROP POLICY IF EXISTS users_delete_master_admin ON public.users;
CREATE POLICY users_delete_master_admin ON public.users
  FOR DELETE TO authenticated
  USING (public.is_master_admin());

DROP POLICY IF EXISTS rj_select_master_admin ON public.riviera_jugadores;
CREATE POLICY rj_select_master_admin ON public.riviera_jugadores
  FOR SELECT TO authenticated
  USING (public.is_master_admin());

DROP POLICY IF EXISTS rj_mutate_master_admin ON public.riviera_jugadores;
CREATE POLICY rj_mutate_master_admin ON public.riviera_jugadores
  FOR ALL TO authenticated
  USING (public.is_master_admin())
  WITH CHECK (public.is_master_admin());

DROP POLICY IF EXISTS jp_mutate_master_admin ON public.jugador_participaciones;
CREATE POLICY jp_mutate_master_admin ON public.jugador_participaciones
  FOR ALL TO authenticated
  USING (public.is_master_admin())
  WITH CHECK (public.is_master_admin());

DROP POLICY IF EXISTS js_mutate_master_admin ON public.jugador_stats;
CREATE POLICY js_mutate_master_admin ON public.jugador_stats
  FOR ALL TO authenticated
  USING (public.is_master_admin())
  WITH CHECK (public.is_master_admin());

-- Ranking público anon: solo jugadores que suman ranking
DROP POLICY IF EXISTS rj_select_anon ON public.riviera_jugadores;
CREATE POLICY rj_select_anon ON public.riviera_jugadores
  FOR SELECT TO anon
  USING (
    estado = 'activo'
    AND COALESCE(visible_publico, true) = true
    AND COALESCE(suma_ranking, true) = true
  );
