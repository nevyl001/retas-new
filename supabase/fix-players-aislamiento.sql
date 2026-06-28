-- =============================================================================
-- FASE 2 — Aislar public.players por organizador (fix de seguridad)
-- =============================================================================
-- Contexto confirmado en producción (padel-app):
--   • 83 filas totales
--   • 77 con user_id (2770b522… → 54, cd45cea7… → 23)
--   • 6 con user_id NULL — tournament_id = 00000000-… (pool global, NO hay match en tournaments)
--   • Backfill real: riviera_jugadores.legacy_player_id → organizador_id
--     (ver supabase/fix-players-backfill-huerfanas.sql)
--   • players_select_auth hoy: USING (true) ← problema
--
-- CÓMO EJECUTAR:
--   1. Run completo → revisa el PREVIEW del backfill (paso 1)
--   2. Si el preview se ve bien, descomenta el UPDATE del paso 1 y Run de nuevo
--      (o ejecuta solo ese UPDATE + los SELECT finales)
--   3. Revisa verificación final: políticas + conteo por user_id (debe sumar 83)
-- =============================================================================

-- ── PASO 1a: PREVIEW backfill vía tournaments (suele ser vacío si tournament_id = 000…) ─
-- Revisar antes de descomentar el UPDATE de abajo
SELECT
  'PREVIEW backfill' AS etapa,
  p.id AS player_id,
  p.name,
  p.email,
  p.tournament_id,
  t.id AS tournament_existe,
  t.user_id AS user_id_a_asignar,
  t.name AS tournament_name
FROM public.players p
LEFT JOIN public.tournaments t ON t.id = p.tournament_id
WHERE p.user_id IS NULL
ORDER BY p.created_at NULLS LAST;

-- ── PASO 1b: APLICAR backfill (DESCOMENTAR tras revisar preview) ─────────────
/*
UPDATE public.players p
SET user_id = t.user_id
FROM public.tournaments t
WHERE p.user_id IS NULL
  AND p.tournament_id IS NOT NULL
  AND t.id = p.tournament_id
  AND t.user_id IS NOT NULL;
*/

-- ── PASO 2: Filas que siguen sin user_id (no se borran ni se inventan) ───────
SELECT
  'sin_user_id_despues_backfill' AS verificacion,
  count(*)::bigint AS filas
FROM public.players
WHERE user_id IS NULL;

SELECT
  p.id,
  p.name,
  p.email,
  p.tournament_id,
  p.created_at,
  CASE
    WHEN p.tournament_id IS NULL THEN 'sin tournament_id'
    WHEN NOT EXISTS (
      SELECT 1 FROM public.tournaments t WHERE t.id = p.tournament_id
    ) THEN 'tournament_id sin match en tournaments'
    WHEN EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = p.tournament_id AND t.user_id IS NULL
    ) THEN 'tournament sin user_id'
    ELSE 'otro — revisar manualmente'
  END AS motivo
FROM public.players p
WHERE p.user_id IS NULL
ORDER BY p.created_at NULLS LAST;

-- ── PASO 3: can_access_player — quitar acceso por tournament_id NULL ─────────
-- Uso en repo: solo players_insert/update/delete en rls-enable-public-schema.sql
-- (este fix reemplaza esas políticas por user_id = auth.uid(); la función queda
--  alineada para no reabrir el hueco si alguien re-ejecuta el script RLS viejo)
CREATE OR REPLACE FUNCTION public.can_access_player(player_tournament_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_tournament_owner(player_tournament_id);
$$;

-- ── PASO 4: Políticas RLS de players ─────────────────────────────────────────
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS players_select_auth ON public.players;
DROP POLICY IF EXISTS players_select_anon ON public.players;
DROP POLICY IF EXISTS players_insert_auth ON public.players;
DROP POLICY IF EXISTS players_update_auth ON public.players;
DROP POLICY IF EXISTS players_delete_auth ON public.players;
-- Políticas legacy que a veces existen en prod además de las estándar
DROP POLICY IF EXISTS "Allow all operations on players" ON public.players;
DROP POLICY IF EXISTS "organizador actualiza contacto players" ON public.players;
DROP POLICY IF EXISTS players_mutate_auth ON public.players;

CREATE POLICY players_select_auth ON public.players
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Sin cambios respecto a hoy (vistas públicas /public/{uuid})
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

-- ── PASO 5: Verificación final (UNA sola tabla — Supabase solo muestra la última) ─
SELECT seccion, item, valor, detalle
FROM (
  SELECT 'RLS'::text AS seccion, p.policyname::text AS item, p.cmd::text AS valor,
    ('USING: ' || COALESCE(p.qual::text, '—') || ' | CHECK: ' || COALESCE(p.with_check::text, '—'))::text AS detalle
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.tablename = 'players'

  UNION ALL

  SELECT 'CONTEO'::text, COALESCE(pl.user_id::text, '(NULL)')::text,
    count(*)::text, NULL::text
  FROM public.players pl
  GROUP BY pl.user_id

  UNION ALL

  SELECT 'RESUMEN'::text, 'total_players'::text, count(*)::text, NULL::text
  FROM public.players

  UNION ALL

  SELECT 'RESUMEN'::text, 'sin_user_id'::text, count(*)::text,
    CASE WHEN count(*) = 0 THEN 'ok — backfill completo'
         ELSE 'pendiente — usa fix-players-backfill-huerfanas.sql'
    END
  FROM public.players
  WHERE user_id IS NULL

  UNION ALL

  SELECT 'FUNCION'::text, 'can_access_player'::text, 'definicion'::text,
    pg_get_functiondef(fp.oid)::text
  FROM pg_proc fp
  JOIN pg_namespace fn ON fn.oid = fp.pronamespace
  WHERE fn.nspname = 'public' AND fp.proname = 'can_access_player'
  LIMIT 1
) v
ORDER BY
  CASE seccion WHEN 'RESUMEN' THEN 1 WHEN 'CONTEO' THEN 2 WHEN 'RLS' THEN 3 ELSE 4 END,
  item;
