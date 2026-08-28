-- Security Advisor (Supabase): endurecer objetos legítimos sin romper ranking público.
--
-- 1) jugador_delete_backup_* — tablas huérfanas de deletes; NO son vistas públicas.
--    Habilitar RLS sin políticas + revocar acceso anon/authenticated.
-- 2) riviera_jugadores_sitio_oficial — vista pública INTENCIONAL; security_invoker
--    para que anon use las políticas RLS ya existentes (visible_publico + ranking).
-- 3) _career_* / _historical_* — vistas internas de auditoría; invoker + sin anon.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname LIKE 'jugador_delete_backup\_%' ESCAPE '\'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tbl);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', r.tbl);
    RAISE NOTICE 'RLS enabled on backup table %', r.tbl;
  END LOOP;
END $$;

-- ── Vista pública del ranking (sigue visible para anon + authenticated) ──
DO $$
BEGIN
  IF to_regclass('public.riviera_jugadores_sitio_oficial') IS NULL THEN
    RAISE NOTICE 'Skip: riviera_jugadores_sitio_oficial no existe';
    RETURN;
  END IF;

  EXECUTE 'ALTER VIEW public.riviera_jugadores_sitio_oficial SET (security_invoker = true)';

  REVOKE ALL ON public.riviera_jugadores_sitio_oficial FROM PUBLIC;
  GRANT SELECT ON public.riviera_jugadores_sitio_oficial TO anon, authenticated;
END $$;

COMMENT ON VIEW public.riviera_jugadores_sitio_oficial IS
  'Ranking público sitio oficial. security_invoker=true: anon respeta RLS (visible_publico + ranking activo).';

-- ── Vistas internas de auditoría (no públicas) ──
DO $$
BEGIN
  IF to_regclass('public._career_participacion_host_audit') IS NOT NULL THEN
    EXECUTE 'ALTER VIEW public._career_participacion_host_audit SET (security_invoker = true)';
    REVOKE ALL ON public._career_participacion_host_audit FROM PUBLIC, anon;
    GRANT SELECT ON public._career_participacion_host_audit TO authenticated;
  END IF;

  IF to_regclass('public._historical_orphan_parent_participaciones') IS NOT NULL THEN
    EXECUTE 'ALTER VIEW public._historical_orphan_parent_participaciones SET (security_invoker = true)';
    REVOKE ALL ON public._historical_orphan_parent_participaciones FROM PUBLIC, anon;
    GRANT SELECT ON public._historical_orphan_parent_participaciones TO authenticated;
  END IF;
END $$;
