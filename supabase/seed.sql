-- =============================================================================
-- Supabase local seeds (db reset).
-- Idempotent fixtures only — never production secrets / passwords.
--
-- NOTA (repo actual): `supabase/migrations/` NO reconstruye el esquema completo
-- (ver migrations/README.md). Un `db reset` limpio falla sin dump de esquema.
-- Con esquema base presente, este seed deja PCS = config oficial de producción.
-- Aplicación manual: ./scripts/seed-pcs-local.sh
-- =============================================================================

\ir ./seeds/pcs-organizador.sql
