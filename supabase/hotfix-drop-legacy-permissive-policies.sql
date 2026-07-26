-- ══════════════════════════════════════════════════════════════════════════════
-- HOTFIX DE SEGURIDAD — políticas RLS heredadas "permitir todo" (qual/check = true)
--
-- Vulnerabilidad (confirmada explotable con la anon key pública, auditoría 2026-07-26):
--   En Postgres, varias políticas PERMISSIVE para el mismo comando se combinan con OR.
--   matches, tournaments y users tenían, junto a sus políticas correctas de ownership
--   (matches_*_auth / tournaments_*_auth / users_*_own, que exigen auth.uid()), una
--   política más vieja con qual = true (o with_check = true) para el rol `public`
--   (que incluye a `anon`). Esa política "true" ganaba el OR y anulaba por completo
--   la restricción de las políticas correctas — cualquier usuario anónimo podía
--   SELECT/INSERT/UPDATE/DELETE sin restricción sobre las tres tablas.
--
-- Alcance de este fix: SOLO elimina las políticas con qual/check = true. No toca
-- ninguna política que ya validaba `auth.uid()`, `is_tournament_owner()`,
-- `is_master_admin()`, etc. — esas siguen intactas y son las que cubren el uso
-- legítimo (organizador dueño, admin, lectura pública ya controlada por
-- is_tournament_publicly_readable()).
--
-- Nota: en `matches` existe además un segundo grupo, "Users can * matches from
-- their tournaments", que SÍ está correctamente acotado (tournament_id IN
-- (SELECT id FROM tournaments WHERE user_id = auth.uid())) — no se toca.
--
-- CORRECCIÓN (revisión posterior al commit 5baa427d): las políticas legacy
-- eliminadas abajo eran para el rol `public`, que en Postgres incluye tanto
-- a `anon` COMO a `authenticated`. tournaments_select_anon / matches_select_anon
-- solo cubren al rol `anon` — un usuario logueado (organizador viendo el
-- torneo público de OTRO club, por ejemplo) se quedaba sin ninguna política
-- de SELECT que lo cubriera tras el DROP, aunque is_tournament_publicly_
-- readable() diera true. Se agregan dos políticas SELECT explícitas para
-- `authenticated` (solo lectura, mismo helper is_tournament_publicly_
-- readable() ya usado en el resto del proyecto) para cerrar ese hueco sin
-- reabrir INSERT/UPDATE/DELETE.
--
-- Idempotente: DROP POLICY IF EXISTS no falla si el hotfix ya fue aplicado.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── matches ──
DROP POLICY IF EXISTS "Enable delete access for all users" ON public.matches;
DROP POLICY IF EXISTS "Enable insert access for all users" ON public.matches;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.matches;
DROP POLICY IF EXISTS "Enable update access for all users" ON public.matches;

-- ── tournaments ──
DROP POLICY IF EXISTS tournaments_delete_policy ON public.tournaments;
DROP POLICY IF EXISTS tournaments_insert_policy ON public.tournaments;
DROP POLICY IF EXISTS tournaments_select_policy ON public.tournaments;
DROP POLICY IF EXISTS tournaments_update_policy ON public.tournaments;

-- ── users ──
-- (users_update_policy NO se toca: su qual es (auth.uid())::text = (id)::text,
--  una comparación real, no un bypass — no forma parte de esta vulnerabilidad.)
DROP POLICY IF EXISTS users_select_policy ON public.users;
DROP POLICY IF EXISTS users_insert_policy ON public.users;

-- ── lectura pública para authenticated (solo SELECT, sin escritura) ──
DROP POLICY IF EXISTS tournaments_select_public_authenticated ON public.tournaments;
CREATE POLICY tournaments_select_public_authenticated
  ON public.tournaments
  FOR SELECT
  TO authenticated
  USING (public.is_tournament_publicly_readable(id));

DROP POLICY IF EXISTS matches_select_public_authenticated ON public.matches;
CREATE POLICY matches_select_public_authenticated
  ON public.matches
  FOR SELECT
  TO authenticated
  USING (public.is_tournament_publicly_readable(tournament_id));
