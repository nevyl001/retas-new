-- ══════════════════════════════════════════════════════════════════════════════
-- PATCH: Convocatoria Riviera — servicio global
-- (pgcrypto + exclusiones + close al iniciar + join si juego empezó)
--
-- Ejecutar en SQL Editor (staging) DESPUÉS de:
--   convocatoria-riviera-generalize.sql
--   convocatoria-riviera-rpcs.sql
-- O en su lugar re-ejecutar convocatoria-riviera-rpcs.sql completo (incluye esto).
--
-- NO ejecutar desde el agente. Idempotente.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public._tor_open_reg_slug()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public, extensions
AS $$
  SELECT 'ra-' || encode(extensions.gen_random_bytes(5), 'hex');
$$;

CREATE OR REPLACE FUNCTION public._assert_convocatoria_mode_allowed(p_mode text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v text := lower(trim(coalesce(p_mode, '')));
BEGIN
  IF v IN ('liga', 'torneo', 'torneo_express', 'evento_multicategoria', 'mini-torneo') THEN
    RAISE EXCEPTION 'modo excluido de convocatoria';
  END IF;
  IF v NOT IN ('reta', 'americano', 'duelo_2v2') THEN
    RAISE EXCEPTION 'mode_type inválido';
  END IF;
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public._assert_convocatoria_mode_allowed(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._assert_convocatoria_mode_allowed(text) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.close_open_game_registration(
  p_mode_type text,
  p_entity_id uuid
)
RETURNS public.tournament_open_registration
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_mode text;
  v_org uuid;
  v_row public.tournament_open_registration;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Autenticación requerida'; END IF;
  v_mode := public._assert_convocatoria_mode_allowed(p_mode_type);
  IF p_entity_id IS NULL THEN RAISE EXCEPTION 'entity_id requerido'; END IF;

  v_org := public._open_reg_organizer_id(v_mode, p_entity_id);
  IF v_org IS NULL OR v_org <> v_uid THEN
    RAISE EXCEPTION 'Evento no encontrado o sin permiso';
  END IF;

  UPDATE public.tournament_open_registration
  SET status = 'closed',
      enabled = true,
      updated_at = now()
  WHERE mode_type = v_mode AND entity_id = p_entity_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_open_game_registration(text, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.close_open_game_registration(text, uuid) FROM anon;

-- Asegurar search_path / extensions en join/cancel (pgcrypto)
DO $$
BEGIN
  IF to_regprocedure('public.join_tournament_open_registration(text,text)') IS NOT NULL THEN
    EXECUTE $q$
      ALTER FUNCTION public.join_tournament_open_registration(text, text)
      SET search_path = public, extensions
    $q$;
  END IF;
  IF to_regprocedure('public.cancel_tournament_open_registration(text,text)') IS NOT NULL THEN
    EXECUTE $q$
      ALTER FUNCTION public.cancel_tournament_open_registration(text, text)
      SET search_path = public, extensions
    $q$;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
