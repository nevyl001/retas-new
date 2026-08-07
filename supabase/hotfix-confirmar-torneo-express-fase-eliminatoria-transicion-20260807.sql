-- ══════════════════════════════════════════════════════════════════════════════
-- PRODUCCIÓN — RPC faltante para confirmar bracket eliminatorio
-- Descubierto 2026-08-07 durante simulación PCS:
--   POST .../rpc/confirmar_torneo_express_fase_eliminatoria_transicion → 404 PGRST202
-- El frontend desplegado ya lo llama; sin esta función el modal "Confirmar bracket"
-- no puede pasar de fase de grupos a eliminatoria.
--
-- Fuente: supabase/migrations/0003_apply_torneo_express_grupo_resultado.sql
-- Idempotente. Pegar completo en SQL Editor de producción.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.confirmar_torneo_express_fase_eliminatoria_transicion(
  p_torneo_id uuid,
  p_fase_eliminacion text,
  p_bracket_slots jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organizador uuid;
  v_rows int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  SELECT organizador_id INTO v_organizador
  FROM public.torneo_express
  WHERE id = p_torneo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_organizador IS NULL OR v_organizador IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Sin permiso sobre este torneo';
  END IF;

  UPDATE public.torneo_express
  SET fase_torneo = 'eliminatoria',
      fase_eliminacion = p_fase_eliminacion,
      bracket_slots = p_bracket_slots,
      fase_grupos_finalizada_at = now(),
      estado = 'en_curso'
  WHERE id = p_torneo_id
    AND fase_torneo = 'grupos';

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ya_en_eliminatoria');
  END IF;

  RETURN jsonb_build_object('ok', true, 'torneo_id', p_torneo_id);
END;
$$;

REVOKE ALL ON FUNCTION public.confirmar_torneo_express_fase_eliminatoria_transicion(uuid, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirmar_torneo_express_fase_eliminatoria_transicion(uuid, text, jsonb)
  TO authenticated;

-- Verificación
SELECT
  to_regprocedure(
    'public.confirmar_torneo_express_fase_eliminatoria_transicion(uuid,text,jsonb)'
  ) IS NOT NULL AS rpc_ok;  -- debe ser true
