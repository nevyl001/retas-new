-- Borra el marcador de un partido de grupos (no el grupo entero).
-- Mismo orden de locks que apply_torneo_express_grupo_resultado:
--   1. torneo_express
--   2. torneo_express_grupos
--   3. torneo_express_partidos
-- Revierte rating te-grupo:<id> si existe _revert_rating_for_partido_ref.

CREATE OR REPLACE FUNCTION public.reset_torneo_express_grupo_partido(
  p_partido_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_partido record;
  v_torneo record;
  v_lock_torneo uuid;
  v_lock_grupo uuid;
  v_ref text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  IF p_partido_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT g.torneo_id, p.grupo_id
    INTO v_lock_torneo, v_lock_grupo
  FROM public.torneo_express_partidos p
  JOIN public.torneo_express_grupos g ON g.id = p.grupo_id
  WHERE p.id = p_partido_id;

  IF v_lock_torneo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT id, organizador_id, fase_torneo, estado
    INTO v_torneo
  FROM public.torneo_express
  WHERE id = v_lock_torneo
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_torneo.organizador_id IS NULL
     OR v_torneo.organizador_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Sin permiso sobre este torneo';
  END IF;

  IF v_torneo.fase_torneo = 'cerrado' OR v_torneo.estado = 'finalizado' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'torneo_cerrado');
  END IF;

  IF v_torneo.fase_torneo IS DISTINCT FROM 'grupos' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'group_not_editable');
  END IF;

  PERFORM 1
  FROM public.torneo_express_grupos
  WHERE id = v_lock_grupo
  FOR UPDATE;

  SELECT id, grupo_id, estado, puntos_local, puntos_visitante,
         ganador_id, sets_resultado
    INTO v_partido
  FROM public.torneo_express_partidos
  WHERE id = p_partido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_partido.estado IS NOT DISTINCT FROM 'pendiente'
     AND v_partido.puntos_local IS NULL
     AND v_partido.puntos_visitante IS NULL
     AND v_partido.ganador_id IS NULL
     AND v_partido.sets_resultado IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'unchanged',
      'partido_id', p_partido_id
    );
  END IF;

  v_ref := 'te-grupo:' || p_partido_id::text;
  BEGIN
    PERFORM public._revert_rating_for_partido_ref(v_ref);
  EXCEPTION
    WHEN undefined_function THEN
      NULL;
  END;

  UPDATE public.torneo_express_partidos
  SET puntos_local = NULL,
      puntos_visitante = NULL,
      sets_resultado = NULL,
      ganador_id = NULL,
      estado = 'pendiente'
  WHERE id = p_partido_id;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'torneo_express_grupos'
      AND column_name = 'version'
  ) THEN
    UPDATE public.torneo_express_grupos
    SET version = version + 1
    WHERE id = v_lock_grupo;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'updated',
    'partido_id', p_partido_id,
    'grupo_id', v_lock_grupo,
    'torneo_id', v_lock_torneo
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.reset_torneo_express_grupo_partido(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_torneo_express_grupo_partido(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.reset_torneo_express_grupo_partido(uuid) IS
  'Borra el marcador de un partido de grupos y revierte su rating. Solo en fase de grupos.';
