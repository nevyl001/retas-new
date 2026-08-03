-- ══════════════════════════════════════════════════════════════════════════════
-- BLK-06 — Concurrencia en fase de grupos de Torneo Express
--
-- Problema (confirmado, src/services/torneoExpressService.ts:985-1048,
-- savePartidoResultado): SELECT (partido, grupo, "torneo no cerrado") +
-- UPDATE directo por separado, sin lock de fila, sin verificación de
-- conflicto. Dos guardados concurrentes del mismo partido de grupo (doble
-- clic, dos co-admins) podían sobrescribirse en silencio. La fase
-- eliminatoria ya recibió este tratamiento en
-- supabase/hotfix-torneo-express-eliminatoria-atomic.sql
-- (apply_torneo_express_eliminatoria_writes) — este fix aplica el mismo
-- principio (lock + ownership + conflicto explícito) a la fase de grupos,
-- SIN reimplementar esa complejidad de propagación de bracket (que no aplica
-- aquí: cada partido de grupo es independiente, no dispara generación de
-- otra ronda).
--
-- Nota de diseño (confirmado leyendo src/lib/torneoExpress/standings.ts /
-- clasificadosPairs.ts): standings/clasificados se RECALCULAN en cada
-- lectura a partir de las filas reales de torneo_express_partidos — no hay
-- estado derivado almacenado que pueda quedar parcial. Proteger la escritura
-- de este único partido, de forma atómica, es suficiente para que cualquier
-- lectura posterior (standings, clasificados, generación de eliminatoria)
-- vea siempre un estado consistente.
--
-- El ganador se resuelve DENTRO de la función a partir de la fila ya
-- bloqueada (pareja_local_id/pareja_visitante_id), no de un ganador_id que
-- el cliente hubiera resuelto de una lectura anterior — evita TOCTOU si las
-- parejas del partido cambiaran entre la lectura del cliente y el guardado.
--
-- Idempotente: CREATE OR REPLACE FUNCTION + REVOKE/GRANT son repetibles sin error.
-- Rollback: DROP FUNCTION public.apply_torneo_express_grupo_resultado(uuid, integer, integer, text, jsonb, boolean);
-- ══════════════════════════════════════════════════════════════════════════════

-- Prerrequisito idempotente: torneo_express_partidos.sets_resultado (por si
-- supabase/torneo-express-partidos-sets-resultado.sql no se hubiera aplicado).
ALTER TABLE public.torneo_express_partidos
  ADD COLUMN IF NOT EXISTS sets_resultado jsonb;

CREATE OR REPLACE FUNCTION public.apply_torneo_express_grupo_resultado(
  p_partido_id uuid,
  p_puntos_local integer,
  p_puntos_visitante integer,
  p_ganador_side text,
  p_sets_resultado jsonb,
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
  v_grupo record;
  v_torneo record;
  v_ganador_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  IF p_ganador_side IS NULL OR p_ganador_side NOT IN ('local', 'visitante') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_score');
  END IF;

  IF p_puntos_local IS NULL OR p_puntos_visitante IS NULL
     OR p_puntos_local < 0 OR p_puntos_visitante < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_score');
  END IF;

  SELECT id, grupo_id, pareja_local_id, pareja_visitante_id, estado,
         puntos_local, puntos_visitante, ganador_id, sets_resultado
    INTO v_partido
    FROM public.torneo_express_partidos
    WHERE id = p_partido_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT id, torneo_id INTO v_grupo
  FROM public.torneo_express_grupos
  WHERE id = v_partido.grupo_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT id, organizador_id, fase_torneo, estado INTO v_torneo
  FROM public.torneo_express
  WHERE id = v_grupo.torneo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_torneo.organizador_id IS NULL OR v_torneo.organizador_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Sin permiso sobre este torneo';
  END IF;

  IF v_torneo.fase_torneo = 'cerrado' OR v_torneo.estado = 'finalizado' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'torneo_cerrado');
  END IF;

  v_ganador_id := CASE p_ganador_side
    WHEN 'local' THEN v_partido.pareja_local_id
    ELSE v_partido.pareja_visitante_id
  END;

  IF v_ganador_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_score');
  END IF;

  -- Idempotente: mismo resultado (puntos, ganador y detalle de sets) ya guardado.
  IF v_partido.estado = 'jugado'
     AND v_partido.puntos_local = p_puntos_local
     AND v_partido.puntos_visitante = p_puntos_visitante
     AND v_partido.ganador_id = v_ganador_id
     AND v_partido.sets_resultado IS NOT DISTINCT FROM p_sets_resultado
  THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'unchanged',
      'partido_id', p_partido_id,
      'grupo_id', v_partido.grupo_id,
      'torneo_id', v_grupo.torneo_id
    );
  END IF;

  IF v_partido.estado = 'jugado' AND NOT p_force THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'conflict',
      'puntos_local', v_partido.puntos_local,
      'puntos_visitante', v_partido.puntos_visitante,
      'sets_resultado', v_partido.sets_resultado
    );
  END IF;

  UPDATE public.torneo_express_partidos
  SET puntos_local = p_puntos_local,
      puntos_visitante = p_puntos_visitante,
      ganador_id = v_ganador_id,
      estado = 'jugado',
      sets_resultado = p_sets_resultado
  WHERE id = p_partido_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'updated',
    'partido_id', p_partido_id,
    'grupo_id', v_partido.grupo_id,
    'torneo_id', v_grupo.torneo_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_torneo_express_grupo_resultado(uuid, integer, integer, text, jsonb, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_torneo_express_grupo_resultado(uuid, integer, integer, text, jsonb, boolean)
  TO authenticated;

-- ── Guard adicional (BLK-06): no generar la fase eliminatoria dos veces ──
-- confirmarFaseEliminatoria() hoy hace DELETE+INSERT de
-- torneo_express_eliminatoria_partidos sin ningún guard de estado — dos
-- llamadas concurrentes (doble clic) podían ambas pasar y la segunda
-- borraría/recrearía el bracket que la primera acababa de generar (o incluso
-- resultados ya capturados en la eliminatoria). Este guard es un UPDATE
-- condicional atómico: solo transiciona fase_torneo 'grupos' -> 'eliminatoria'
-- si sigue en 'grupos' en el momento exacto del UPDATE (Postgres evalúa el
-- WHERE bajo el lock de fila implícito del propio UPDATE), devolviendo 0
-- filas si otra llamada ya ganó la carrera.
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

-- ── Verificación en la misma transacción implícita del CREATE anterior ───
DO $$
BEGIN
  IF to_regprocedure('public.apply_torneo_express_grupo_resultado(uuid,integer,integer,text,jsonb,boolean)') IS NULL THEN
    RAISE EXCEPTION 'Fix incompleto: apply_torneo_express_grupo_resultado no existe tras el CREATE';
  END IF;
  IF to_regprocedure('public.confirmar_torneo_express_fase_eliminatoria_transicion(uuid,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Fix incompleto: confirmar_torneo_express_fase_eliminatoria_transicion no existe tras el CREATE';
  END IF;
END $$;
