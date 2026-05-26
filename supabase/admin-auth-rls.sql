-- =============================================================================
-- Admin Auth + RLS (paso 0) — ejecutar en Supabase SQL Editor ANTES del deploy
-- =============================================================================
-- Esquema admin_users: id, user_id, email, created_at
-- Admin de referencia:
--   user_id: 6ec602f4-0464-4666-8a8a-649e6929653f
--   email:   christiancastellanosmx@gmail.com
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Tabla admin_users (solo si aún no existe con el esquema correcto)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_users_user_id_key UNIQUE (user_id),
  CONSTRAINT admin_users_email_key UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_admin_users_user_id ON public.admin_users(user_id);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 2) Función helper (SECURITY DEFINER) para políticas en otras tablas
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_app_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;

-- -----------------------------------------------------------------------------
-- 3) Quitar políticas inseguras / obsoletas en admin_users
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow admin access" ON public.admin_users;
DROP POLICY IF EXISTS "Admin users can view admin_users" ON public.admin_users;

-- Cada admin autenticado solo lee su propia fila (verificación en el cliente)
DROP POLICY IF EXISTS "admin_users_select_own" ON public.admin_users;
CREATE POLICY "admin_users_select_own"
  ON public.admin_users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Sin INSERT/UPDATE/DELETE desde el cliente: altas de admin solo vía SQL/dashboard

-- -----------------------------------------------------------------------------
-- 4) Fila admin (idempotente)
-- -----------------------------------------------------------------------------
INSERT INTO public.admin_users (user_id, email)
VALUES (
  '6ec602f4-0464-4666-8a8a-649e6929653f'::uuid,
  'christiancastellanosmx@gmail.com'
)
ON CONFLICT (user_id) DO UPDATE
  SET email = EXCLUDED.email;

-- -----------------------------------------------------------------------------
-- 5) Lectura global para panel admin (SELECT — se combina con OR a políticas existentes)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "app_admin_select_all_users" ON public.users;
CREATE POLICY "app_admin_select_all_users"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (public.is_app_admin());

DROP POLICY IF EXISTS "app_admin_select_all_tournaments" ON public.tournaments;
CREATE POLICY "app_admin_select_all_tournaments"
  ON public.tournaments
  FOR SELECT
  TO authenticated
  USING (public.is_app_admin());

DROP POLICY IF EXISTS "app_admin_select_all_players" ON public.players;
CREATE POLICY "app_admin_select_all_players"
  ON public.players
  FOR SELECT
  TO authenticated
  USING (public.is_app_admin());

DROP POLICY IF EXISTS "app_admin_select_all_pairs" ON public.pairs;
CREATE POLICY "app_admin_select_all_pairs"
  ON public.pairs
  FOR SELECT
  TO authenticated
  USING (public.is_app_admin());

DROP POLICY IF EXISTS "app_admin_select_all_matches" ON public.matches;
CREATE POLICY "app_admin_select_all_matches"
  ON public.matches
  FOR SELECT
  TO authenticated
  USING (public.is_app_admin());

DROP POLICY IF EXISTS "app_admin_select_all_games" ON public.games;
CREATE POLICY "app_admin_select_all_games"
  ON public.games
  FOR SELECT
  TO authenticated
  USING (public.is_app_admin());

-- -----------------------------------------------------------------------------
-- 6) DELETE para UserManagement (opcional pero recomendado con el panel actual)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "app_admin_delete_all_users" ON public.users;
CREATE POLICY "app_admin_delete_all_users"
  ON public.users
  FOR DELETE
  TO authenticated
  USING (public.is_app_admin());

DROP POLICY IF EXISTS "app_admin_delete_all_tournaments" ON public.tournaments;
CREATE POLICY "app_admin_delete_all_tournaments"
  ON public.tournaments
  FOR DELETE
  TO authenticated
  USING (public.is_app_admin());

DROP POLICY IF EXISTS "app_admin_delete_all_players" ON public.players;
CREATE POLICY "app_admin_delete_all_players"
  ON public.players
  FOR DELETE
  TO authenticated
  USING (public.is_app_admin());

DROP POLICY IF EXISTS "app_admin_delete_all_pairs" ON public.pairs;
CREATE POLICY "app_admin_delete_all_pairs"
  ON public.pairs
  FOR DELETE
  TO authenticated
  USING (public.is_app_admin());

DROP POLICY IF EXISTS "app_admin_delete_all_matches" ON public.matches;
CREATE POLICY "app_admin_delete_all_matches"
  ON public.matches
  FOR DELETE
  TO authenticated
  USING (public.is_app_admin());

DROP POLICY IF EXISTS "app_admin_delete_all_games" ON public.games;
CREATE POLICY "app_admin_delete_all_games"
  ON public.games
  FOR DELETE
  TO authenticated
  USING (public.is_app_admin());

-- -----------------------------------------------------------------------------
-- 7) Verificación rápida
-- -----------------------------------------------------------------------------
SELECT 'admin_users' AS tabla, COUNT(*) AS filas FROM public.admin_users;

SELECT schemaname, tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'admin_users', 'users', 'tournaments', 'players', 'pairs', 'matches', 'games'
  )
  AND (
    policyname LIKE 'app_admin%'
    OR policyname = 'admin_users_select_own'
  )
ORDER BY tablename, policyname;
