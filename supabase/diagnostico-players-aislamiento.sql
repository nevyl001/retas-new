-- =============================================================================
-- FASE 1 — Diagnóstico de aislamiento en public.players (SOLO LECTURA)
-- =============================================================================
-- Compatible con Supabase SQL Editor (ejecuta TODO el archivo de una vez con Run).
-- No modifica datos ni políticas. Idempotente.
--
-- Cómo usar:
--   1. Selecciona TODO el contenido (Cmd+A) → Run
--   2. Supabase solo muestra la ÚLTIMA consulta → verás UNA tabla con todo el diagnóstico
--   3. Comparte esa tabla antes de pasar a Fase 2
--   (Tras la 1ª ejecución puedes repetir solo: SELECT * FROM public.diag_players_aislamiento_completo();)
-- =============================================================================

-- ── Función de resumen (reemplazable; no deja tablas temporales) ─────────────
CREATE OR REPLACE FUNCTION public.diag_players_aislamiento_resumen()
RETURNS TABLE (
  diagnostico text,
  valor bigint,
  nota text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_user_id boolean;
  has_tournament_id boolean;
  cnt bigint;
BEGIN
  IF to_regclass('public.players') IS NULL THEN
    RETURN QUERY SELECT 'ERROR'::text, NULL::bigint, 'tabla public.players no existe'::text;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'user_id'
  ) INTO has_user_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'tournament_id'
  ) INTO has_tournament_id;

  EXECUTE 'SELECT count(*) FROM public.players' INTO cnt;
  RETURN QUERY SELECT '1_total_players'::text, cnt, NULL::text;

  IF has_user_id THEN
    EXECUTE 'SELECT count(*) FROM public.players WHERE user_id IS NULL' INTO cnt;
    RETURN QUERY SELECT '2_user_id_null'::text, cnt, NULL::text;
    RETURN QUERY SELECT '2_user_id_columna_existe'::text, 1::bigint, NULL::text;
  ELSE
    RETURN QUERY SELECT '2_user_id_null'::text, NULL::bigint, 'columna user_id NO existe'::text;
    RETURN QUERY SELECT '2_user_id_columna_existe'::text, 0::bigint, NULL::text;
  END IF;

  IF has_tournament_id THEN
    EXECUTE 'SELECT count(*) FROM public.players WHERE tournament_id IS NULL' INTO cnt;
    RETURN QUERY SELECT '2_tournament_id_null'::text, cnt, NULL::text;

    EXECUTE $q$
      SELECT count(*) FROM public.players
      WHERE tournament_id = '00000000-0000-0000-0000-000000000000'::uuid
    $q$ INTO cnt;
    RETURN QUERY SELECT '4_pool_global_tournament_id_cero'::text, cnt, NULL::text;

    IF has_user_id THEN
      EXECUTE $q$
        SELECT count(*) FROM public.players
        WHERE tournament_id = '00000000-0000-0000-0000-000000000000'::uuid
          AND user_id IS NULL
      $q$ INTO cnt;
      RETURN QUERY SELECT '4_pool_global_sin_user_id'::text, cnt, NULL::text;

      EXECUTE $q$
        SELECT count(*) FROM public.players
        WHERE user_id IS NULL AND tournament_id IS NULL
      $q$ INTO cnt;
      RETURN QUERY SELECT '2_ambos_null'::text, cnt, NULL::text;

      EXECUTE $q$
        SELECT count(*) FROM public.players p
        JOIN public.tournaments t ON t.id = p.tournament_id
        WHERE p.user_id IS NULL
      $q$ INTO cnt;
      RETURN QUERY SELECT 'extra_backfill_potencial'::text, cnt, NULL::text;
    ELSE
      RETURN QUERY SELECT '4_pool_global_sin_user_id'::text, NULL::bigint, 'requiere columna user_id'::text;
      RETURN QUERY SELECT '2_ambos_null'::text, NULL::bigint, 'requiere columna user_id'::text;
      RETURN QUERY SELECT 'extra_backfill_potencial'::text, NULL::bigint, 'requiere columna user_id'::text;
    END IF;

    EXECUTE $q$
      SELECT count(*) FROM public.players p
      WHERE p.tournament_id IS NOT NULL
        AND p.tournament_id <> '00000000-0000-0000-0000-000000000000'::uuid
        AND NOT EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = p.tournament_id)
    $q$ INTO cnt;
    RETURN QUERY SELECT '3_huerfanas_tournament_id'::text, cnt, NULL::text;
  ELSE
    RETURN QUERY SELECT '2_tournament_id_null'::text, NULL::bigint, 'columna tournament_id NO existe'::text;
    RETURN QUERY SELECT '4_pool_global_tournament_id_cero'::text, NULL::bigint, 'columna tournament_id NO existe'::text;
    RETURN QUERY SELECT '4_pool_global_sin_user_id'::text, NULL::bigint, 'columna tournament_id NO existe'::text;
    RETURN QUERY SELECT '2_ambos_null'::text, NULL::bigint, 'columna tournament_id NO existe'::text;
    RETURN QUERY SELECT '3_huerfanas_tournament_id'::text, NULL::bigint, 'columna tournament_id NO existe'::text;
    RETURN QUERY SELECT 'extra_backfill_potencial'::text, NULL::bigint, 'columna tournament_id NO existe'::text;
  END IF;

  IF to_regclass('public.riviera_jugadores') IS NOT NULL THEN
    EXECUTE $q$
      SELECT count(*) FROM public.riviera_jugadores WHERE legacy_player_id IS NOT NULL
    $q$ INTO cnt;
    RETURN QUERY SELECT 'extra_riviera_con_legacy_player_id'::text, cnt, NULL::text;

    EXECUTE $q$
      SELECT count(*) FROM public.players p
      WHERE NOT EXISTS (
        SELECT 1 FROM public.riviera_jugadores r WHERE r.legacy_player_id = p.id
      )
    $q$ INTO cnt;
    RETURN QUERY SELECT 'extra_players_sin_enlace_riviera'::text, cnt, NULL::text;
  ELSE
    RETURN QUERY SELECT 'extra_riviera_con_legacy_player_id'::text, NULL::bigint, 'tabla riviera_jugadores no existe'::text;
    RETURN QUERY SELECT 'extra_players_sin_enlace_riviera'::text, NULL::bigint, 'tabla riviera_jugadores no existe'::text;
  END IF;

  RETURN QUERY SELECT
    '7_can_access_player_existe'::text,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'can_access_player'
    ) THEN 1::bigint ELSE 0::bigint END,
    NULL::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.diag_players_aislamiento_user_dist()
RETURNS TABLE (
  user_id text,
  filas bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'user_id'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT COALESCE(p.user_id::text, '(NULL)'), count(*)::bigint
  FROM public.players p
  GROUP BY p.user_id
  ORDER BY count(*) DESC
  LIMIT 30;
END;
$$;

-- ── Informe unificado (una sola tabla de resultados) ──────────────────────────
CREATE OR REPLACE FUNCTION public.diag_players_aislamiento_completo()
RETURNS TABLE (
  seccion text,
  item text,
  valor text,
  detalle text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 'META'::text, 'tabla_players_existe'::text,
    CASE WHEN to_regclass('public.players') IS NOT NULL THEN 'si' ELSE 'no' END,
    NULL::text;

  RETURN QUERY
  SELECT 'META'::text, 'tabla_tournaments_existe'::text,
    CASE WHEN to_regclass('public.tournaments') IS NOT NULL THEN 'si' ELSE 'no' END,
    NULL::text;

  RETURN QUERY
  SELECT 'CONTEO'::text, r.diagnostico,
    COALESCE(r.valor::text, '—'),
    COALESCE(r.nota, '')
  FROM public.diag_players_aislamiento_resumen() r;

  RETURN QUERY
  SELECT 'COLUMNA'::text, c.column_name::text,
    c.data_type::text,
    ('nullable=' || c.is_nullable::text || ' | pos=' || c.ordinal_position::text)::text
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'players'
  ORDER BY c.ordinal_position;

  RETURN QUERY
  SELECT 'RLS'::text, p.policyname::text,
    p.cmd::text,
    ('USING: ' || COALESCE(p.qual::text, '(null)')
      || ' | CHECK: ' || COALESCE(p.with_check::text, '(null)'))::text
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename = 'players'
  ORDER BY p.policyname, p.cmd;

  RETURN QUERY
  SELECT 'RLS'::text, 'players_rls_habilitado'::text,
    CASE WHEN c.relrowsecurity THEN 'si' ELSE 'no' END,
    'forzado=' || CASE WHEN c.relforcerowsecurity THEN 'si' ELSE 'no' END
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'players';

  RETURN QUERY
  SELECT 'FUNCION'::text, 'can_access_player'::text,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_proc fp
      JOIN pg_namespace fn ON fn.oid = fp.pronamespace
      WHERE fn.nspname = 'public' AND fp.proname = 'can_access_player'
    ) THEN 'existe' ELSE 'no existe' END,
    COALESCE((
      SELECT pg_get_functiondef(fp.oid)
      FROM pg_proc fp
      JOIN pg_namespace fn ON fn.oid = fp.pronamespace
      WHERE fn.nspname = 'public' AND fp.proname = 'can_access_player'
      LIMIT 1
    ), '');

  RETURN QUERY
  SELECT 'USER_DIST'::text, d.user_id,
    d.filas::text,
    NULL::text
  FROM public.diag_players_aislamiento_user_dist() d;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'tournament_id'
  ) THEN
    RETURN QUERY EXECUTE $q$
      SELECT 'HUERFANA'::text, p.id::text, p.name::text,
        (COALESCE(p.email, '') || ' | tid=' || COALESCE(p.tournament_id::text, 'null'))::text
      FROM public.players p
      WHERE p.tournament_id IS NOT NULL
        AND p.tournament_id <> '00000000-0000-0000-0000-000000000000'::uuid
        AND NOT EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = p.tournament_id)
      ORDER BY p.created_at DESC NULLS LAST
      LIMIT 20
    $q$;
  END IF;
END;
$$;

-- =============================================================================
-- EJECUCIÓN — Supabase muestra SOLO esta consulta (informe completo en una tabla)
-- =============================================================================
SELECT seccion, item, valor, detalle
FROM public.diag_players_aislamiento_completo()
ORDER BY
  CASE seccion
    WHEN 'META' THEN 1
    WHEN 'CONTEO' THEN 2
    WHEN 'COLUMNA' THEN 3
    WHEN 'RLS' THEN 4
    WHEN 'FUNCION' THEN 5
    WHEN 'USER_DIST' THEN 6
    WHEN 'HUERFANA' THEN 7
    ELSE 99
  END,
  item;

-- Opcional: limpiar funciones auxiliares tras revisar
-- DROP FUNCTION IF EXISTS public.diag_players_aislamiento_completo();
-- DROP FUNCTION IF EXISTS public.diag_players_aislamiento_resumen();
-- DROP FUNCTION IF EXISTS public.diag_players_aislamiento_user_dist();
