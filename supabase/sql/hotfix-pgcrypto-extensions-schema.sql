-- ══════════════════════════════════════════════════════════════════════════════
-- HOTFIX: gen_random_bytes / digest no visibles con search_path = public
--
-- Error UI al "Lanzar por WhatsApp":
--   function gen_random_bytes(integer) does not exist
--
-- Causa: en Supabase pgcrypto vive en schema `extensions`. Las RPC
-- SECURITY DEFINER fijan search_path = public, así que no ven gen_random_bytes.
--
-- Ejecutar en SQL Editor (staging). Luego reintentar el botón.
-- Idempotente. No toca datos.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Slug al crear/lanzar convocatoria (upsert_open_game_registration → esto)
CREATE OR REPLACE FUNCTION public._tor_open_reg_slug()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public, extensions
AS $$
  SELECT 'ra-' || encode(extensions.gen_random_bytes(5), 'hex');
$$;

-- Join / cancel usan gen_random_bytes + digest; ampliar search_path basta
-- si las funciones ya existen (sin redefinir el cuerpo).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'join_tournament_open_registration'
  ) THEN
    EXECUTE $q$
      ALTER FUNCTION public.join_tournament_open_registration(text, text)
      SET search_path = public, extensions
    $q$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'cancel_tournament_open_registration'
  ) THEN
    EXECUTE $q$
      ALTER FUNCTION public.cancel_tournament_open_registration(text, text)
      SET search_path = public, extensions
    $q$;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
