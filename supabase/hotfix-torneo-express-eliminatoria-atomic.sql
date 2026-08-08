-- ══════════════════════════════════════════════════════════════════════════════
-- HOTFIX DE CONFIABILIDAD — guardado de bracket no atómico (Torneo Express)
--
-- Problema (auditado en src/services/torneoExpressService.ts, saveEliminatoriaResultado):
--   El guardado del resultado + propagación de ganador aguas abajo + creación
--   de la siguiente ronda + creación del partido por 3.er lugar eran hasta 6
--   escrituras separadas (UPDATE/INSERT), cada una su propio autocommit, sin
--   transacción ni lock. Si fallaba a mitad de la cadena, quedaba el bracket
--   a medias (ej. resultado guardado pero propagación parcial, o ronda
--   completa sin la siguiente ronda generada). Dos guardados que completan
--   la misma ronda casi simultáneamente podían insertar la siguiente ronda
--   por duplicado.
--
-- Fix: una sola RPC que aplica TODAS las escrituras ya calculadas en
-- TypeScript (computeWinnerChangePropagation, buildSiguienteRondaPartidos,
-- buildTercerLugarPartido — NINGUNA de estas funciones se modificó) dentro
-- de una sola transacción con lock de todo el bracket del torneo. La RPC no
-- recalcula NADA de lógica de bracket — solo aplica los parches recibidos,
-- con validación de autorización y de forma (no de "corrección" del bracket
-- en sí, eso sigue siendo responsabilidad exclusiva de TypeScript).
--
-- Validaciones server-side (no confía en el payload del cliente):
--   1. auth.uid() requerido.
--   2. ownership: torneo_express.organizador_id = auth.uid().
--   3. torneo no cerrado (fase_torneo<>'cerrado' AND estado<>'finalizado').
--   4. cada id de UPDATE debe pertenecer a p_torneo_id (verificado contra la
--      fila real, no contra lo que diga el payload).
--   5. ids duplicados en el mismo payload de UPDATE → rechazado.
--   6/10. solo columnas de una lista blanca; torneo_id/id/organizador_id
--      nunca son columnas SET-eables (torneo_id se fuerza server-side en
--      los INSERT, nunca se toma del payload).
--   8. ronda/cruce_index deben ser válidos (ronda>0 o =90 tercer lugar,
--      cruce_index>=0); estado solo 'pendiente'|'jugado'.
--   9. pareja_local_id/pareja_visitante_id/ganador_id, si se mandan, deben
--      ser NULL o una pareja que ya participa en ese torneo (derivado de
--      filas existentes, no del payload); ganador_id además debe coincidir
--      con una de las dos parejas del propio partido tras aplicar el patch.
--   11. INSERT duplicado de (ronda, cruce_index) para el mismo torneo se
--      SALTA sin error (carrera legítima entre dos guardados, no ataque) —
--      así "dos intentos de generar la misma siguiente ronda" nunca duplica.
--   12. SELECT ... FOR UPDATE sobre todas las filas del torneo (bracket
--      completo) al inicio — serializa cualquier escritura concurrente.
--   13. cualquier RAISE EXCEPTION revierte toda la función (transacción de
--      Postgres) — no hay escritura parcial posible.
--
-- Lo que esta RPC deliberadamente NO valida (documentado, no un descuido):
-- no reimplementa las reglas de qué pareja "debería" estar en qué cruce
-- según el bracket — eso requeriría reescribir computeWinnerChangePropagation
-- en SQL, que es exactamente lo que se decidió NO hacer. Solo valida que las
-- parejas referenciadas ya pertenezcan al torneo (no a otro torneo ajeno) y
-- que ganador_id sea coherente con el propio partido.
--
-- Idempotente: CREATE OR REPLACE FUNCTION y REVOKE/GRANT son repetibles sin error.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.apply_torneo_express_eliminatoria_writes(
  p_torneo_id uuid,
  p_updates jsonb DEFAULT '[]'::jsonb,
  p_inserts jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organizador uuid;
  v_torneo record;
  v_update jsonb;
  v_insert jsonb;
  v_id uuid;
  v_keys text[];
  v_allowed_update_keys text[] := ARRAY[
    'id','pareja_local_id','pareja_visitante_id','puntos_local',
    'puntos_visitante','ganador_id','estado','sets_resultado'
  ];
  -- torneo_id llega del FE (builders) pero el valor escrito es siempre p_torneo_id.
  -- sets_resultado/cancha/programado_en: tolerados si el payload los trae.
  v_allowed_insert_keys text[] := ARRAY[
    'torneo_id','ronda','orden','cruce_index','pareja_local_id','pareja_visitante_id',
    'puntos_local','puntos_visitante','ganador_id','estado','es_bye','sets_resultado',
    'cancha','programado_en'
  ];
  v_seen_ids uuid[] := ARRAY[]::uuid[];
  v_valid_parejas uuid[];
  v_applied_updates int := 0;
  v_applied_inserts int := 0;
  v_inserted_ids uuid[] := ARRAY[]::uuid[];
  v_skipped_duplicate_inserts int := 0;
  v_new_id uuid;
  v_ronda int;
  v_cruce int;
  v_estado text;
  v_pareja_local uuid;
  v_pareja_visitante uuid;
  v_ganador uuid;
  v_row record;
BEGIN
  -- (1) usuario autenticado
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  IF p_torneo_id IS NULL THEN
    RAISE EXCEPTION 'torneo_id requerido';
  END IF;

  -- (12) lock del bracket completo — serializa cualquier escritura
  -- concurrente sobre este torneo antes de leer/validar nada más.
  PERFORM 1
  FROM public.torneo_express_eliminatoria_partidos
  WHERE torneo_id = p_torneo_id
  FOR UPDATE;

  SELECT * INTO v_torneo
  FROM public.torneo_express
  WHERE id = p_torneo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Torneo no encontrado';
  END IF;

  -- (2) ownership — SECURITY DEFINER bypasea RLS, se valida a mano.
  v_organizador := v_torneo.organizador_id;
  IF v_organizador IS NULL OR v_organizador IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Sin permiso sobre este torneo';
  END IF;

  -- (3) torneo no cerrado
  IF v_torneo.fase_torneo = 'cerrado' OR v_torneo.estado = 'finalizado' THEN
    RAISE EXCEPTION 'Este torneo ya fue cerrado. Para modificar resultados primero debe reabrirse.';
  END IF;

  -- Parejas conocidas de este torneo (de partidos ya existentes) — base
  -- para validar (9) sin reimplementar reglas de bracket.
  SELECT array_agg(DISTINCT x) INTO v_valid_parejas
  FROM (
    SELECT pareja_local_id AS x
    FROM public.torneo_express_eliminatoria_partidos
    WHERE torneo_id = p_torneo_id AND pareja_local_id IS NOT NULL
    UNION
    SELECT pareja_visitante_id
    FROM public.torneo_express_eliminatoria_partidos
    WHERE torneo_id = p_torneo_id AND pareja_visitante_id IS NOT NULL
    UNION
    SELECT ganador_id
    FROM public.torneo_express_eliminatoria_partidos
    WHERE torneo_id = p_torneo_id AND ganador_id IS NOT NULL
  ) s;

  -- ── UPDATES ──
  FOR v_update IN SELECT * FROM jsonb_array_elements(coalesce(p_updates, '[]'::jsonb))
  LOOP
    -- (6/10) solo columnas autorizadas
    SELECT array_agg(k) INTO v_keys FROM jsonb_object_keys(v_update) AS k;
    IF EXISTS (
      SELECT 1 FROM unnest(coalesce(v_keys, ARRAY[]::text[])) k
      WHERE NOT (k = ANY(v_allowed_update_keys))
    ) THEN
      RAISE EXCEPTION 'Columna no autorizada en UPDATE';
    END IF;

    IF NOT (v_update ? 'id') OR v_update->>'id' IS NULL THEN
      RAISE EXCEPTION 'UPDATE sin id';
    END IF;
    v_id := (v_update->>'id')::uuid;

    -- (5) ningún id repetido en el payload
    IF v_id = ANY(v_seen_ids) THEN
      RAISE EXCEPTION 'id repetido en el payload de UPDATE: %', v_id;
    END IF;
    v_seen_ids := array_append(v_seen_ids, v_id);

    -- (4) el id pertenece a este torneo (contra la fila real, ya bajo lock)
    SELECT * INTO v_row
    FROM public.torneo_express_eliminatoria_partidos
    WHERE id = v_id AND torneo_id = p_torneo_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Partido % no pertenece a este torneo', v_id;
    END IF;

    IF v_update ? 'estado' AND NOT (v_update->>'estado' IN ('pendiente', 'jugado')) THEN
      RAISE EXCEPTION 'estado inválido en UPDATE: %', v_update->>'estado';
    END IF;

    -- (9) parejas referenciadas deben pertenecer al torneo
    IF v_update ? 'pareja_local_id' AND v_update->>'pareja_local_id' IS NOT NULL THEN
      IF NOT ((v_update->>'pareja_local_id')::uuid = ANY(coalesce(v_valid_parejas, ARRAY[]::uuid[]))) THEN
        RAISE EXCEPTION 'pareja_local_id no pertenece a este torneo';
      END IF;
    END IF;
    IF v_update ? 'pareja_visitante_id' AND v_update->>'pareja_visitante_id' IS NOT NULL THEN
      IF NOT ((v_update->>'pareja_visitante_id')::uuid = ANY(coalesce(v_valid_parejas, ARRAY[]::uuid[]))) THEN
        RAISE EXCEPTION 'pareja_visitante_id no pertenece a este torneo';
      END IF;
    END IF;

    -- (9) ganador_id, si se manda, debe corresponder a una de las 2 parejas
    -- del propio partido (considerando el patch de esta misma llamada).
    IF v_update ? 'ganador_id' AND v_update->>'ganador_id' IS NOT NULL THEN
      v_ganador := (v_update->>'ganador_id')::uuid;
      v_pareja_local := CASE
        WHEN v_update ? 'pareja_local_id' THEN NULLIF(v_update->>'pareja_local_id', '')::uuid
        ELSE v_row.pareja_local_id
      END;
      v_pareja_visitante := CASE
        WHEN v_update ? 'pareja_visitante_id' THEN NULLIF(v_update->>'pareja_visitante_id', '')::uuid
        ELSE v_row.pareja_visitante_id
      END;
      IF v_ganador IS DISTINCT FROM v_pareja_local AND v_ganador IS DISTINCT FROM v_pareja_visitante THEN
        RAISE EXCEPTION 'ganador_id no corresponde a ninguna pareja del partido %', v_id;
      END IF;
    END IF;

    UPDATE public.torneo_express_eliminatoria_partidos SET
      pareja_local_id = CASE WHEN v_update ? 'pareja_local_id' THEN NULLIF(v_update->>'pareja_local_id', '')::uuid ELSE pareja_local_id END,
      pareja_visitante_id = CASE WHEN v_update ? 'pareja_visitante_id' THEN NULLIF(v_update->>'pareja_visitante_id', '')::uuid ELSE pareja_visitante_id END,
      puntos_local = CASE WHEN v_update ? 'puntos_local' THEN NULLIF(v_update->>'puntos_local', '')::int ELSE puntos_local END,
      puntos_visitante = CASE WHEN v_update ? 'puntos_visitante' THEN NULLIF(v_update->>'puntos_visitante', '')::int ELSE puntos_visitante END,
      ganador_id = CASE WHEN v_update ? 'ganador_id' THEN NULLIF(v_update->>'ganador_id', '')::uuid ELSE ganador_id END,
      estado = CASE WHEN v_update ? 'estado' THEN (v_update->>'estado') ELSE estado END,
      sets_resultado = CASE WHEN v_update ? 'sets_resultado' THEN (v_update->'sets_resultado') ELSE sets_resultado END
    WHERE id = v_id;

    v_applied_updates := v_applied_updates + 1;
  END LOOP;

  -- ── INSERTS ──
  FOR v_insert IN SELECT * FROM jsonb_array_elements(coalesce(p_inserts, '[]'::jsonb))
  LOOP
    SELECT array_agg(k) INTO v_keys FROM jsonb_object_keys(v_insert) AS k;
    IF EXISTS (
      SELECT 1 FROM unnest(coalesce(v_keys, ARRAY[]::text[])) k
      WHERE NOT (k = ANY(v_allowed_insert_keys))
    ) THEN
      RAISE EXCEPTION 'Columna no autorizada en INSERT';
    END IF;

    IF NOT (v_insert ? 'ronda') OR NOT (v_insert ? 'cruce_index') THEN
      RAISE EXCEPTION 'INSERT requiere ronda y cruce_index';
    END IF;
    v_ronda := (v_insert->>'ronda')::int;
    v_cruce := (v_insert->>'cruce_index')::int;

    -- (8) ronda/cruce_index válidos (90 = ronda especial de 3.er lugar)
    IF v_ronda IS NULL OR (v_ronda <= 0 AND v_ronda <> 90) THEN
      RAISE EXCEPTION 'ronda inválida en INSERT: %', v_ronda;
    END IF;
    IF v_cruce IS NULL OR v_cruce < 0 THEN
      RAISE EXCEPTION 'cruce_index inválido en INSERT: %', v_cruce;
    END IF;

    v_estado := COALESCE(v_insert->>'estado', 'pendiente');
    IF NOT (v_estado IN ('pendiente', 'jugado')) THEN
      RAISE EXCEPTION 'estado inválido en INSERT: %', v_estado;
    END IF;

    v_pareja_local := NULLIF(v_insert->>'pareja_local_id', '')::uuid;
    v_pareja_visitante := NULLIF(v_insert->>'pareja_visitante_id', '')::uuid;

    -- (9) parejas referenciadas deben pertenecer al torneo
    IF v_pareja_local IS NOT NULL AND NOT (v_pareja_local = ANY(coalesce(v_valid_parejas, ARRAY[]::uuid[]))) THEN
      RAISE EXCEPTION 'pareja_local_id de INSERT no pertenece a este torneo';
    END IF;
    IF v_pareja_visitante IS NOT NULL AND NOT (v_pareja_visitante = ANY(coalesce(v_valid_parejas, ARRAY[]::uuid[]))) THEN
      RAISE EXCEPTION 'pareja_visitante_id de INSERT no pertenece a este torneo';
    END IF;

    -- (11) no duplicar (ronda, cruce_index) — ya bajo el lock de (12), esto
    -- es lo que hace que "dos intentos de generar la misma siguiente ronda"
    -- nunca produzca dos filas: se salta en silencio, no es un error.
    IF EXISTS (
      SELECT 1 FROM public.torneo_express_eliminatoria_partidos
      WHERE torneo_id = p_torneo_id AND ronda = v_ronda AND cruce_index = v_cruce
    ) THEN
      v_skipped_duplicate_inserts := v_skipped_duplicate_inserts + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.torneo_express_eliminatoria_partidos (
      torneo_id, ronda, orden, cruce_index, pareja_local_id, pareja_visitante_id,
      puntos_local, puntos_visitante, ganador_id, estado, es_bye, sets_resultado
    ) VALUES (
      p_torneo_id, -- (7/10) torneo_id SIEMPRE del parámetro, nunca del payload
      v_ronda,
      COALESCE((v_insert->>'orden')::int, 1),
      v_cruce,
      v_pareja_local,
      v_pareja_visitante,
      NULLIF(v_insert->>'puntos_local', '')::int,
      NULLIF(v_insert->>'puntos_visitante', '')::int,
      NULLIF(v_insert->>'ganador_id', '')::uuid,
      v_estado,
      COALESCE((v_insert->>'es_bye')::boolean, false),
      CASE WHEN v_insert ? 'sets_resultado' THEN (v_insert->'sets_resultado') ELSE NULL END
    )
    RETURNING id INTO v_new_id;

    v_inserted_ids := array_append(v_inserted_ids, v_new_id);
    v_applied_inserts := v_applied_inserts + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'updated_count', v_applied_updates,
    'inserted_count', v_applied_inserts,
    'inserted_ids', to_jsonb(v_inserted_ids),
    'skipped_duplicate_inserts', v_skipped_duplicate_inserts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_torneo_express_eliminatoria_writes(uuid, jsonb, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_torneo_express_eliminatoria_writes(uuid, jsonb, jsonb)
  TO authenticated;
