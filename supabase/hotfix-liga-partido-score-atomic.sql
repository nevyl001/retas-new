-- ══════════════════════════════════════════════════════════════════════════════
-- HOTFIX DE CONFIABILIDAD — race condition silenciosa en updateScore de Liga
--
-- Problema (confirmado en src/services/ligaService.ts:1084-1113):
--   El guardado de marcador hacía SELECT (leer estado) y luego UPDATE por
--   separado, sin lock ni condición de estado en el UPDATE. Dos guardados
--   concurrentes sobre el mismo partido (dos pestañas, dos co-admins, doble
--   clic con red lenta) podían leer ambos estado='upcoming', pasar el
--   chequeo, y el segundo UPDATE sobreescribía al primero sin ningún error
--   ni advertencia — pérdida silenciosa de resultado.
--
-- Fix: RPC atómica con SELECT ... FOR UPDATE (lock de fila, serializa
-- llamadas concurrentes sobre el mismo partido) + validación de ownership
-- server-side (esta función es SECURITY DEFINER, por lo tanto NO pasa por
-- RLS — el chequeo de dueño de la liga se hace explícito adentro, con
-- comparación NULL-safe vía IS DISTINCT FROM). Si el partido ya está
-- completed con un score distinto y no se pide force, devuelve conflicto
-- explícito con el score real actual en vez de sobreescribir. Reenviar
-- exactamente el mismo score es idempotente (no re-dispara la cascada).
--
-- No toca updateScoreParejasFijas (función distinta, fuera de alcance).
--
-- Idempotente: CREATE OR REPLACE FUNCTION y REVOKE/GRANT son repetibles sin error.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_liga_partido_score(
  p_partido_id uuid,
  p_score1 integer,
  p_score2 integer,
  p_force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partido record;
  v_organizador uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  IF p_score1 IS NULL OR p_score2 IS NULL OR p_score1 < 0 OR p_score2 < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_score');
  END IF;

  SELECT id, jornada_id, ronda, estado, score_pareja1, score_pareja2
    INTO v_partido
    FROM public.liga_partidos
    WHERE id = p_partido_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT l.organizador_id INTO v_organizador
  FROM public.liga_jornadas j
  JOIN public.ligas l ON l.id = j.liga_id
  WHERE j.id = v_partido.jornada_id;

  IF v_organizador IS NULL OR v_organizador IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Sin permiso sobre este partido';
  END IF;

  -- Idempotente: mismo marcador ya guardado → éxito sin re-disparar cascada.
  IF v_partido.estado = 'completed'
     AND v_partido.score_pareja1 = p_score1
     AND v_partido.score_pareja2 = p_score2
  THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'unchanged',
      'partido_id', p_partido_id,
      'jornada_id', v_partido.jornada_id,
      'ronda', v_partido.ronda
    );
  END IF;

  IF v_partido.estado = 'completed' AND NOT p_force THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'conflict',
      'score_pareja1', v_partido.score_pareja1,
      'score_pareja2', v_partido.score_pareja2
    );
  END IF;

  UPDATE public.liga_partidos
  SET score_pareja1 = p_score1,
      score_pareja2 = p_score2,
      estado = 'completed'
  WHERE id = p_partido_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'updated',
    'partido_id', p_partido_id,
    'jornada_id', v_partido.jornada_id,
    'ronda', v_partido.ronda
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_liga_partido_score(uuid, integer, integer, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_liga_partido_score(uuid, integer, integer, boolean)
  TO authenticated;
