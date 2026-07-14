-- FIX propuesto (NO ejecutar hasta confirmar con diagnose-delete-sin-permiso-corto).
--
-- Causa: register_riviera_jugador_import_blocklist hace
--   RAISE EXCEPTION 'Sin permiso';  -- ← ÚNICO raise CORTO exacto en el repo
-- cuando auth.uid() <> p_organizador_id.
--
-- En delete que propaga a clones, se registra blocklist del club ANFITRIÓN
-- (otro uuid) mientras la sesión es el ORIGEN → null/distinct → corto.
-- Misma trampa si _insert_..._internal hace PERFORM register(...).
--
-- Este script deja _insert..._internal con INSERT directo (como
-- propagate-delete-granted-locals.sql). No toca delete_riviera_jugador
-- ni quita la validación de register para llamadas directas desde la app.

CREATE OR REPLACE FUNCTION public._insert_jugador_import_blocklist_internal(
  p_organizador_id uuid,
  p_nombre text,
  p_legacy_player_id uuid DEFAULT NULL,
  p_legacy_liga_jugador_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key text;
BEGIN
  IF p_organizador_id IS NULL
     OR to_regclass('public.riviera_jugador_import_blocklist') IS NULL THEN
    RETURN;
  END IF;

  IF to_regprocedure('public._riviera_jugador_nombre_key(text)') IS NOT NULL THEN
    v_key := public._riviera_jugador_nombre_key(p_nombre);
  ELSE
    v_key := lower(trim(COALESCE(p_nombre, '')));
  END IF;
  IF v_key IS NULL OR v_key = '' THEN
    RETURN;
  END IF;

  INSERT INTO public.riviera_jugador_import_blocklist (
    organizador_id, nombre, nombre_key, legacy_player_id, legacy_liga_jugador_id
  )
  VALUES (
    p_organizador_id, trim(p_nombre), v_key, p_legacy_player_id, p_legacy_liga_jugador_id
  )
  ON CONFLICT (organizador_id, nombre_key) DO UPDATE
  SET nombre = EXCLUDED.nombre,
      legacy_player_id = coalesce(
        EXCLUDED.legacy_player_id,
        riviera_jugador_import_blocklist.legacy_player_id
      ),
      legacy_liga_jugador_id = coalesce(
        EXCLUDED.legacy_liga_jugador_id,
        riviera_jugador_import_blocklist.legacy_liga_jugador_id
      ),
      deleted_at = now();
EXCEPTION
  WHEN undefined_table THEN
    NULL;
  WHEN undefined_column THEN
    NULL;
END;
$$;

REVOKE ALL ON FUNCTION public._insert_jugador_import_blocklist_internal(uuid, text, uuid, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public._insert_jugador_import_blocklist_internal(uuid, text, uuid, uuid)
  FROM anon, authenticated;

-- Si delete_riviera_jugador (versión simple) llama register_* directo:
-- el gate es OK solo cuando p_organizador_id = auth.uid().
-- Parche adicional: redirigir esa llamada al insert interno (mismo efecto).

CREATE OR REPLACE FUNCTION public.delete_riviera_jugador_blocklist_patch_note()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    'Si pg_get_functiondef(delete) muestra PERFORM register_riviera_jugador_import_blocklist, '
    'sustituye ese PERFORM por _insert_jugador_import_blocklist_internal(...) '
    '(mismos 4 args). Mantiene auth gate en register para uso directo desde app.';
$$;
