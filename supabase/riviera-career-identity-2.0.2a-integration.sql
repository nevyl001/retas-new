-- ══════════════════════════════════════════════════════════════════════════════
-- SPRINT 2.0.2A — Integración Riviera ID Engine
-- Punto de entrada único para CREAR identidad: ensure_riviera_identity
--
-- Prerrequisito: riviera-career-identity-2.0.2-engine.sql
--
-- Cambios:
--   admin_create_official_player_identity_from_jugador → delega en ensure
--   (sin INSERT directo a riviera_official_player_identity / profile_link)
--
-- admin_link_official_player_profile NO cambia: enlaza perfiles a identidad
-- existente elegida manualmente por Admin Maestro (no crea carrera nueva).
--
-- Idempotente: sí | Reversible: bloque ROLLBACK al final
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF to_regprocedure('public.ensure_riviera_identity(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Prerrequisito: riviera-career-identity-2.0.2-engine.sql';
  END IF;
END $$;

-- ── admin_create → wrapper de ensure (compatibilidad ROMC admin + Riviera ID) ──

CREATE OR REPLACE FUNCTION public.admin_create_official_player_identity_from_jugador(
  p_riviera_jugador_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_nombre text;
  v_points integer;
  v_profile_link_id uuid;
  v_official_key uuid;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Solo Admin Principal puede crear identidad oficial';
  END IF;

  IF p_riviera_jugador_id IS NULL THEN
    RAISE EXCEPTION 'Jugador requerido';
  END IF;

  -- Punto de entrada único para crear/reutilizar Carrera Deportiva + Riviera ID
  v_result := public.ensure_riviera_identity(p_riviera_jugador_id);

  v_official_key := (v_result ->> 'official_player_key')::uuid;

  SELECT rj.nombre
  INTO v_nombre
  FROM public.riviera_jugadores rj
  WHERE rj.id = p_riviera_jugador_id;

  SELECT l.id
  INTO v_profile_link_id
  FROM public.riviera_official_player_profile_link l
  WHERE l.riviera_jugador_id = p_riviera_jugador_id
  LIMIT 1;

  SELECT coalesce(t.points_total, 0)
  INTO v_points
  FROM public.riviera_official_player_totals t
  WHERE t.official_player_key = v_official_key;

  RETURN jsonb_build_object(
    'official_player_key', v_official_key,
    'canonical_riviera_jugador_id', v_result -> 'registration_jugador_id',
    'canonical_nombre', v_nombre,
    'profile_link_id', v_profile_link_id,
    'points_total', coalesce(v_points, 0),
    'riviera_id', v_result -> 'riviera_id',
    'riviera_id_serial', v_result -> 'riviera_id_serial',
    'debut_organizer_id', v_result -> 'debut_organizer_id',
    'debut_at', v_result -> 'debut_at',
    'identity_created', v_result -> 'identity_created',
    'link_created', v_result -> 'link_created',
    'riviera_id_assigned', v_result -> 'riviera_id_assigned',
    'debut_assigned', v_result -> 'debut_assigned',
    'ensure', v_result
  );
END;
$$;

COMMENT ON FUNCTION public.admin_create_official_player_identity_from_jugador(uuid) IS
  'Sprint 2.0.2A — Wrapper admin que delega en ensure_riviera_identity. '
  'No inserta identidad directamente. Idempotente si el jugador ya tiene carrera.';

GRANT EXECUTE ON FUNCTION public.admin_create_official_player_identity_from_jugador(uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  RAISE NOTICE 'Sprint 2.0.2A OK — admin_create_official_player_identity_from_jugador delega en ensure_riviera_identity';
END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK Sprint 2.0.2A
-- Restaura admin_create ROMC-1 original (INSERT directo, sin Riviera ID).
-- Ejecutar solo si hay que revertir la integración manteniendo 2.0.2 engine.
-- ══════════════════════════════════════════════════════════════════════════════
--
-- (Pegar bloque admin_create_official_player_identity_from_jugador de
--  riviera-official-multi-club-romc1.sql líneas 191-266)
--
-- NOTIFY pgrst, 'reload schema';
--
-- ══════════════════════════════════════════════════════════════════════════════
