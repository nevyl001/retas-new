-- Admin maestro: modos por cuenta, ranking oficial, permisos y RLS.
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
  reta_equipos boolean NOT NULL DEFAULT false,
  round_robin boolean NOT NULL DEFAULT true,
  americano boolean NOT NULL DEFAULT false,
  mini_torneo boolean NOT NULL DEFAULT false,
  liga boolean NOT NULL DEFAULT false,
  duelo_2v2 boolean NOT NULL DEFAULT true,
  permite_ajuste_puntos_manuales boolean NOT NULL DEFAULT true,
  visible_ranking_oficial boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organizador_game_modes
  ADD COLUMN IF NOT EXISTS permite_ajuste_puntos_manuales boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS visible_ranking_oficial boolean NOT NULL DEFAULT false;

ALTER TABLE public.organizador_game_modes
  ALTER COLUMN reta_equipos SET DEFAULT false,
  ALTER COLUMN round_robin SET DEFAULT true,
  ALTER COLUMN americano SET DEFAULT false,
  ALTER COLUMN mini_torneo SET DEFAULT false,
  ALTER COLUMN liga SET DEFAULT false,
  ALTER COLUMN duelo_2v2 SET DEFAULT true;

COMMENT ON COLUMN public.organizador_game_modes.permite_ajuste_puntos_manuales IS
  'Si false, el organizador no puede usar ajuste manual de puntos; solo cuenta el historial de partidos.';

COMMENT ON COLUMN public.organizador_game_modes.visible_ranking_oficial IS
  'Si true, los jugadores de esta cuenta pueden aparecer en www.rivieraopen.com (ranking y perfiles).';

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

-- Cuentas existentes sin fila: conservar acceso completo (grandfather)
INSERT INTO public.organizador_game_modes (
  organizador_id,
  reta_equipos,
  round_robin,
  americano,
  mini_torneo,
  liga,
  duelo_2v2,
  visible_ranking_oficial
)
SELECT
  u.id,
  true,
  true,
  true,
  true,
  true,
  true,
  true
FROM public.users u
WHERE NOT EXISTS (
  SELECT 1
  FROM public.organizador_game_modes ogm
  WHERE ogm.organizador_id = u.id
);

-- Al crear perfil en public.users, aplicar defaults de la tabla
CREATE OR REPLACE FUNCTION public.handle_new_organizador_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.organizador_game_modes (organizador_id)
  VALUES (NEW.id)
  ON CONFLICT (organizador_id) DO NOTHING;

  INSERT INTO public.riviera_official_ranking_emitters (
    organizador_id,
    is_active,
    notes
  )
  VALUES (NEW.id, true, 'Auto: registro organizador')
  ON CONFLICT (organizador_id) DO UPDATE
  SET is_active = true, updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_users_create_organizador_defaults ON public.users;
CREATE TRIGGER on_users_create_organizador_defaults
  AFTER INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_organizador_user();

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

-- ── Helper público: ¿ranking oficial publicado? ──
CREATE OR REPLACE FUNCTION public.is_organizador_ranking_publico(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT ogm.visible_ranking_oficial
      FROM public.organizador_game_modes ogm
      WHERE ogm.organizador_id = p_org_id
    ),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_organizador_ranking_publico(uuid) TO anon, authenticated;

-- Ranking público anon: solo jugadores de cuentas con ranking oficial activo
DROP POLICY IF EXISTS rj_select_anon ON public.riviera_jugadores;
CREATE POLICY rj_select_anon ON public.riviera_jugadores
  FOR SELECT TO anon
  USING (
    estado = 'activo'
    AND COALESCE(visible_publico, true) = true
    AND COALESCE(suma_ranking, true) = true
    AND public.is_organizador_ranking_publico(organizador_id)
  );

-- ── Admin maestro: cambiar nombre de organizador ──
CREATE OR REPLACE FUNCTION public.admin_update_organizador_name(
  p_user_id uuid,
  p_new_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_name text := trim(p_new_name);
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Solo Admin Principal puede cambiar el nombre';
  END IF;

  IF p_user_id IS NULL OR v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'Nombre inválido';
  END IF;

  IF char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'El nombre es demasiado largo';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;

  UPDATE public.users
  SET
    name = v_name,
    updated_at = now()
  WHERE id = p_user_id;

  UPDATE auth.users
  SET
    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('name', v_name),
    updated_at = now()
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', p_user_id,
    'name', v_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_organizador_name(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
