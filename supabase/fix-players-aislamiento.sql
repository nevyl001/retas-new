-- =============================================================================
-- Aislar public.players por organizador — cierre RLS (producción limpia)
-- =============================================================================
-- Backfill de user_id ya aplicado manualmente (0 huérfanas).
-- Este script solo: políticas RLS + elimina can_access_player() obsoleta.
-- Ejecutar de una sola pasada en Supabase → SQL Editor (postgres).
-- =============================================================================

-- ── 1. Políticas RLS de players ──────────────────────────────────────────────
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS players_select_auth ON public.players;
DROP POLICY IF EXISTS players_select_anon ON public.players;
DROP POLICY IF EXISTS players_insert_auth ON public.players;
DROP POLICY IF EXISTS players_update_auth ON public.players;
DROP POLICY IF EXISTS players_delete_auth ON public.players;
DROP POLICY IF EXISTS "Allow all operations on players" ON public.players;
DROP POLICY IF EXISTS "organizador actualiza contacto players" ON public.players;
DROP POLICY IF EXISTS players_mutate_auth ON public.players;

CREATE POLICY players_select_auth ON public.players
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Sin cambios: vistas públicas /public/{uuid}
CREATE POLICY players_select_anon ON public.players
  FOR SELECT TO anon
  USING (true);

CREATE POLICY players_insert_auth ON public.players
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY players_update_auth ON public.players
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY players_delete_auth ON public.players
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ── 2. can_access_player — ya no se usa tras este fix ─────────────────────────
-- Solo aparecía en rls-enable-public-schema.sql (políticas viejas de players).
DROP FUNCTION IF EXISTS public.can_access_player(uuid);

-- ── 3. Verificación final (única consulta visible en Supabase SQL Editor) ─────
SELECT
  policyname,
  roles::text,
  cmd,
  qual AS using_expression,
  with_check AS with_check_expression,
  CASE
    WHEN roles::text LIKE '%authenticated%'
      AND qual = 'true'
    THEN '⚠ REVISAR — authenticated con USING true'
    ELSE 'ok'
  END AS estado
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'players'
ORDER BY policyname, cmd;
