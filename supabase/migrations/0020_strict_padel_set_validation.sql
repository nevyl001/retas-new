-- ══════════════════════════════════════════════════════════════════════════════
-- Integridad de marcadores de set (Torneo Express) — 2026-08-07
--
-- Problema confirmado en vivo: el dominio y el backend solo exigían "entero no
-- negativo", así que un 60-40 se guardaba como resultado legal. Ocurrió de
-- verdad: un capturador automatizado tecleó el dígito antes del "0" por defecto
-- del input y persistió 60-40 / 70-50 en semifinales y tercer lugar de las 4
-- categorías de un evento, contaminando games, DIF, seeds del bracket, rating y
-- puntos oficiales. El input visual limita a dos dígitos, pero eso no es una
-- validación de dominio: cualquier cliente (o llamada directa al RPC/REST)
-- podía escribir basura.
--
-- Regla aplicada (marcador legal de un set de pádel): 6-0 a 6-4, 7-5, 7-6 y sus
-- inversos. Se rechaza 6-5, 6-6, 7-4, 8-6, 60-40, negativos, empates y
-- cualquier valor fuera de rango.
--
-- Excepción posicional: el TERCER set admite además súper muerte súbita a 10
-- con ventaja de 2 (10-0 a 10-8, 11-9, 12-10, 13-11…). La exigencia de que por
-- encima del 10 la diferencia sea exactamente 2 es lo que impide que un 60-40
-- se cuele por esa vía. Los sets 1 y 2 siguen siendo estrictamente normales.
--
-- Estrategia de defensa en profundidad, sin romper compatibilidad:
--   1) Dominio (TS): getSetsValidationMessage()/buildPersistPayload() rechazan
--      el marcador antes de llamar al RPC — es la ruta que usan las dos
--      escrituras (savePartidoResultado y saveEliminatoriaResultado).
--   2) RPC de grupos: valida el payload y devuelve 'invalid_score', que el
--      cliente ya traduce a un mensaje de usuario.
--   3) Trigger de tabla: última línea de defensa para grupos Y eliminatoria,
--      cubre cualquier ruta (RPC de eliminatoria, REST directo, código futuro).
--      Se eligió trigger en vez de CHECK a propósito: un CHECK se evalúa contra
--      las filas existentes y fallaría al desplegarse si algún registro
--      histórico no cumpliera la regla. El trigger solo valida el valor que se
--      está escribiendo, y únicamente cuando sets_resultado cambia, así que los
--      datos históricos quedan intactos.
--
-- No se valida puntos_local/puntos_visitante cuando no viene sets_resultado:
-- en partidos multi-set esas columnas guardan el conteo de sets ganados (2-1),
-- no games, así que no son comparables contra la regla de un set.
--
-- Idempotente: CREATE OR REPLACE FUNCTION + DROP/CREATE TRIGGER son repetibles.
-- Rollback: rollback-strict-padel-set-validation-20260807.sql
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Regla base: ¿es un marcador legal de un set? ─────────────────────────────
CREATE OR REPLACE FUNCTION public._is_legal_padel_set(
  p_local integer,
  p_visitante integer
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    p_local IS NOT NULL
    AND p_visitante IS NOT NULL
    AND p_local >= 0
    AND p_visitante >= 0
    AND (
      (GREATEST(p_local, p_visitante) = 6 AND LEAST(p_local, p_visitante) BETWEEN 0 AND 4)
      OR (GREATEST(p_local, p_visitante) = 7 AND LEAST(p_local, p_visitante) IN (5, 6))
    );
$$;

-- ── Súper muerte súbita (solo tercer set): a 10 con ventaja de 2 ────────────
CREATE OR REPLACE FUNCTION public._is_legal_padel_super_tie_break(
  p_local integer,
  p_visitante integer
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    p_local IS NOT NULL
    AND p_visitante IS NOT NULL
    AND p_local >= 0
    AND p_visitante >= 0
    AND (
      (GREATEST(p_local, p_visitante) = 10 AND LEAST(p_local, p_visitante) BETWEEN 0 AND 8)
      OR (
        GREATEST(p_local, p_visitante) > 10
        AND LEAST(p_local, p_visitante) = GREATEST(p_local, p_visitante) - 2
      )
    );
$$;

-- ── Valida el JSON completo: [{"local":6,"visitante":4}, ...] ────────────────
-- NULL o array vacío => true (no hay detalle de sets que validar; el estado
-- "sin resultado" es legítimo, p. ej. un cruce recién generado).
CREATE OR REPLACE FUNCTION public._are_legal_padel_sets(p_sets jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_set jsonb;
  v_index int := 0;
BEGIN
  IF p_sets IS NULL OR jsonb_typeof(p_sets) = 'null' THEN
    RETURN true;
  END IF;
  IF jsonb_typeof(p_sets) <> 'array' THEN
    RETURN false;
  END IF;
  IF jsonb_array_length(p_sets) = 0 THEN
    RETURN true;
  END IF;
  IF jsonb_array_length(p_sets) > 3 THEN
    RETURN false;
  END IF;

  FOR v_set IN SELECT * FROM jsonb_array_elements(p_sets)
  LOOP
    IF jsonb_typeof(v_set) <> 'object' THEN
      RETURN false;
    END IF;
    IF jsonb_typeof(v_set->'local') <> 'number'
       OR jsonb_typeof(v_set->'visitante') <> 'number' THEN
      RETURN false;
    END IF;
    -- Descarta decimales (6.5-4) antes de comparar rangos.
    IF (v_set->>'local')::numeric <> trunc((v_set->>'local')::numeric)
       OR (v_set->>'visitante')::numeric <> trunc((v_set->>'visitante')::numeric) THEN
      RETURN false;
    END IF;
    -- El tercer set (índice 2) admite además súper muerte súbita.
    IF NOT (
      public._is_legal_padel_set(
        (v_set->>'local')::integer,
        (v_set->>'visitante')::integer
      )
      OR (
        v_index = 2
        AND public._is_legal_padel_super_tie_break(
          (v_set->>'local')::integer,
          (v_set->>'visitante')::integer
        )
      )
    ) THEN
      RETURN false;
    END IF;

    v_index := v_index + 1;
  END LOOP;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public._is_legal_padel_set(integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._is_legal_padel_super_tie_break(integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._are_legal_padel_sets(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._is_legal_padel_set(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public._is_legal_padel_super_tie_break(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public._are_legal_padel_sets(jsonb) TO authenticated;

-- ── Trigger compartido: grupos y eliminatoria ───────────────────────────────
CREATE OR REPLACE FUNCTION public._enforce_legal_padel_sets()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Solo cuando sets_resultado se escribe o cambia: no re-valida histórico.
  IF TG_OP = 'UPDATE'
     AND NEW.sets_resultado IS NOT DISTINCT FROM OLD.sets_resultado THEN
    RETURN NEW;
  END IF;

  IF NOT public._are_legal_padel_sets(NEW.sets_resultado) THEN
    RAISE EXCEPTION
      'Marcador de set inválido: se permiten 6-0 a 6-4, 7-5 y 7-6; el tercer set admite además súper muerte súbita a 10 con 2 de diferencia (recibido: %)',
      NEW.sets_resultado
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._enforce_legal_padel_sets() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_legal_padel_sets ON public.torneo_express_partidos;
CREATE TRIGGER trg_legal_padel_sets
  BEFORE INSERT OR UPDATE OF sets_resultado ON public.torneo_express_partidos
  FOR EACH ROW EXECUTE FUNCTION public._enforce_legal_padel_sets();

DROP TRIGGER IF EXISTS trg_legal_padel_sets ON public.torneo_express_eliminatoria_partidos;
CREATE TRIGGER trg_legal_padel_sets
  BEFORE INSERT OR UPDATE OF sets_resultado ON public.torneo_express_eliminatoria_partidos
  FOR EACH ROW EXECUTE FUNCTION public._enforce_legal_padel_sets();

-- ── RPC de grupos: mismo rechazo, pero como 'invalid_score' ─────────────────
-- Cuerpo idéntico a 0003_apply_torneo_express_grupo_resultado.sql, con la
-- validación de marcador añadida junto a las que ya existían.
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
  v_tiene_sets boolean;
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

  v_tiene_sets := p_sets_resultado IS NOT NULL
    AND jsonb_typeof(p_sets_resultado) = 'array'
    AND jsonb_array_length(p_sets_resultado) > 0;

  IF v_tiene_sets THEN
    IF NOT public._are_legal_padel_sets(p_sets_resultado) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_score');
    END IF;
  ELSIF NOT public._is_legal_padel_set(p_puntos_local, p_puntos_visitante) THEN
    -- Sin detalle de sets, puntos_* son los games de un set único.
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

-- ── Verificación en la misma transacción implícita ──────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public._is_legal_padel_set(integer,integer)') IS NULL THEN
    RAISE EXCEPTION 'Fix incompleto: _is_legal_padel_set no existe';
  END IF;
  IF to_regprocedure('public._is_legal_padel_super_tie_break(integer,integer)') IS NULL THEN
    RAISE EXCEPTION 'Fix incompleto: _is_legal_padel_super_tie_break no existe';
  END IF;
  IF to_regprocedure('public._are_legal_padel_sets(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Fix incompleto: _are_legal_padel_sets no existe';
  END IF;

  -- Casos legales
  IF NOT (public._is_legal_padel_set(6, 0) AND public._is_legal_padel_set(6, 4)
          AND public._is_legal_padel_set(7, 5) AND public._is_legal_padel_set(7, 6)
          AND public._is_legal_padel_set(0, 6) AND public._is_legal_padel_set(5, 7)) THEN
    RAISE EXCEPTION 'Fix incompleto: un marcador legal fue rechazado';
  END IF;

  -- Casos ilegales
  IF public._is_legal_padel_set(6, 5) OR public._is_legal_padel_set(6, 6)
     OR public._is_legal_padel_set(7, 4) OR public._is_legal_padel_set(8, 6)
     OR public._is_legal_padel_set(10, 8) OR public._is_legal_padel_set(60, 40)
     OR public._is_legal_padel_set(70, 50) OR public._is_legal_padel_set(0, 0)
     OR public._is_legal_padel_set(-6, 4) THEN
    RAISE EXCEPTION 'Fix incompleto: un marcador ilegal fue aceptado';
  END IF;

  -- Súper muerte súbita: legales e ilegales
  IF NOT (public._is_legal_padel_super_tie_break(10, 8)
          AND public._is_legal_padel_super_tie_break(10, 0)
          AND public._is_legal_padel_super_tie_break(11, 9)
          AND public._is_legal_padel_super_tie_break(13, 11)
          AND public._is_legal_padel_super_tie_break(9, 11)) THEN
    RAISE EXCEPTION 'Fix incompleto: una súper muerte súbita legal fue rechazada';
  END IF;
  IF public._is_legal_padel_super_tie_break(10, 9)
     OR public._is_legal_padel_super_tie_break(11, 8)
     OR public._is_legal_padel_super_tie_break(12, 9)
     OR public._is_legal_padel_super_tie_break(9, 7)
     OR public._is_legal_padel_super_tie_break(10, 10)
     OR public._is_legal_padel_super_tie_break(60, 40) THEN
    RAISE EXCEPTION 'Fix incompleto: una súper muerte súbita imposible fue aceptada';
  END IF;

  IF public._are_legal_padel_sets('[{"local":60,"visitante":40}]'::jsonb) THEN
    RAISE EXCEPTION 'Fix incompleto: _are_legal_padel_sets aceptó 60-40';
  END IF;
  IF NOT public._are_legal_padel_sets('[{"local":6,"visitante":4},{"local":3,"visitante":6},{"local":7,"visitante":5}]'::jsonb) THEN
    RAISE EXCEPTION 'Fix incompleto: _are_legal_padel_sets rechazó un BO3 legal';
  END IF;

  -- Regla posicional: 10-8 vale como tercer set, no como primero.
  IF NOT public._are_legal_padel_sets('[{"local":6,"visitante":4},{"local":3,"visitante":6},{"local":10,"visitante":8}]'::jsonb) THEN
    RAISE EXCEPTION 'Fix incompleto: rechazó súper muerte súbita en el tercer set';
  END IF;
  IF public._are_legal_padel_sets('[{"local":10,"visitante":8}]'::jsonb) THEN
    RAISE EXCEPTION 'Fix incompleto: aceptó súper muerte súbita como primer set';
  END IF;
  IF public._are_legal_padel_sets('[{"local":6,"visitante":4},{"local":10,"visitante":8},{"local":6,"visitante":3}]'::jsonb) THEN
    RAISE EXCEPTION 'Fix incompleto: aceptó súper muerte súbita como segundo set';
  END IF;
  IF public._are_legal_padel_sets('[{"local":6,"visitante":4},{"local":3,"visitante":6},{"local":60,"visitante":40}]'::jsonb) THEN
    RAISE EXCEPTION 'Fix incompleto: aceptó 60-40 como tercer set';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_legal_padel_sets'
      AND tgrelid = 'public.torneo_express_partidos'::regclass
  ) THEN
    RAISE EXCEPTION 'Fix incompleto: falta trigger en torneo_express_partidos';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_legal_padel_sets'
      AND tgrelid = 'public.torneo_express_eliminatoria_partidos'::regclass
  ) THEN
    RAISE EXCEPTION 'Fix incompleto: falta trigger en torneo_express_eliminatoria_partidos';
  END IF;
END $$;
