-- Debe abortar a mitad. El llamador comprueba que no queden tablas.
BEGIN;
\i /tmp/0100_migration.sql
DO $$ BEGIN RAISE EXCEPTION 'falla_controlada'; END $$;
COMMIT;
