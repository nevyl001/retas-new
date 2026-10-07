-- Security Advisor: RLS Disabled in Public — todas las tablas jugador_delete_backup_*
-- que existan HOY y sigan sin RLS.
--
-- Contexto: la versión de producción de delete_riviera_jugador crea tablas
-- permanentes `public.jugador_delete_backup_*_<YYYYMMDD_HHMMSS>` con
-- CREATE TABLE ... AS, que nacen sin RLS. 0038 (barrido único) y 0042 (nombres
-- fijos del 2026-09-19) solo cubrieron las tablas que existían en su momento;
-- por eso reaparecen alertas tras cada borrado de jugador.
--
-- Alcance de ESTA migración (solo respaldo existente):
--   * No borra ni mueve tablas, no cambia datos.
--   * No toca delete_riviera_jugador ni ninguna otra función.
--   * No crea event triggers ni políticas.
--   * Por cada tabla: ENABLE ROW LEVEL SECURITY (si no lo estaba) y
--     REVOKE ALL a PUBLIC, anon y authenticated.
--   * service_role y el owner (postgres) conservan acceso para recuperación
--     manual (bypass de RLS; sus grants no se tocan).
--
-- Idempotente: se puede re-ejecutar; solo actúa donde falte RLS o sobren grants.
-- NO protege tablas que se creen DESPUÉS de aplicarla: eso requiere corregir la
-- función que las crea (pendiente de confirmar el cuerpo real en producción).
--
-- Rollback (manual, si hiciera falta, por tabla):
--   ALTER TABLE public.<tabla> DISABLE ROW LEVEL SECURITY;
--   GRANT ... según el estado previo (consultar relacl antes de aplicar).

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl, c.relrowsecurity AS had_rls
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname LIKE 'jugador\_delete\_backup\_%' ESCAPE '\'
    ORDER BY c.relname
  LOOP
    IF NOT r.had_rls THEN
      EXECUTE format(
        'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tbl
      );
      RAISE NOTICE 'RLS enabled on backup table %', r.tbl;
    END IF;

    EXECUTE format(
      'REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', r.tbl
    );
  END LOOP;
END $$;
