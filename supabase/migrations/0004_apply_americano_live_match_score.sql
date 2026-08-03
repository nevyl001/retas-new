-- ══════════════════════════════════════════════════════════════════════════════
-- BLK-02 — Concurrencia en Americano en vivo (captura de resultado por partido)
--
-- Problema (confirmado, src/lib/americanoDinamicoSync.ts +
-- src/components/AmericanoDinamico/AmericanoDinamicoScreen.tsx:241-256): el
-- estado completo (`rounds`, `ranking`, fase) se sobreescribe como UN SOLO
-- blob JSON (`tournament_public_config.americano_live`) vía `upsert`
-- incondicional, elegido por `pickNewerAmericanoSnapshot` comparando
-- `savedAt` generado en el CLIENTE. Dos dispositivos capturando resultados de
-- PARTIDOS DISTINTOS casi simultáneamente podían perder uno de los dos
-- resultados sin ningún aviso — el segundo `upsert` en llegar reemplazaba
-- entero al primero.
--
-- Arquitectura elegida (evaluadas ambas opciones del mandato):
--   A) Normalizar partidos a una tabla con una fila por partido — más
--      correcto a largo plazo, pero reescribe el modelo de datos de
--      Americano en vivo (consumido también por la vista pública y
--      Realtime), lo cual excede el alcance de un fix de Fase 0 (roza
--      "refactor general").
--   B) RPC transaccional que recibe el cambio de UN partido (por su `id`,
--      único dentro del snapshot) y lo aplica server-side dentro del JSON
--      actual, bajo lock de fila — ELEGIDA. La unidad de concurrencia es el
--      partido, no el blob completo: dos capturas de partidos DISTINTOS
--      nunca chocan (cada una localiza y parchea solo su propio `matches[].id`
--      dentro del `rounds` vigente en el servidor en ese instante). Si dos
--      capturas apuntan al MISMO partido, se aplica el mismo patrón que ya
--      usan Liga/Torneo Express: conflicto explícito si el partido ya tenía
--      otro resultado guardado y no se pide `force`.
--
-- LIMITACIÓN DOCUMENTADA (no oculta): el campo `ranking` (posiciones/stats)
-- se recibe tal cual lo computa el cliente que llama (no se reimplementa ese
-- cálculo, que depende de matrices de pareja/rival acumuladas a través de
-- TODAS las rondas — fuera de alcance). Si el dispositivo A guarda un
-- partido mientras B tenía una vista de `rounds` un paso desactualizada, el
-- `ranking` que B envía en su PRÓXIMO guardado podría reflejar
-- momentáneamente un estado no del todo fresco hasta que B vuelva a
-- sincronizar (mecanismo de polling/Realtime ya existente, sin cambios). Esto
-- NUNCA pierde un resultado de partido ya guardado — es, en el peor caso, un
-- posible desfase transitorio y cosmético en la tabla de posiciones, no en
-- los resultados en sí.
--
-- No se toca la generación de una nueva ronda (acción estructural, deliberada
-- y de baja frecuencia/concurrencia real — normalmente la ejecuta una sola
-- persona en la mesa de control) — sigue usando el upsert de blob completo
-- existente, sin cambios.
--
-- Idempotente: CREATE OR REPLACE FUNCTION + REVOKE/GRANT son repetibles sin error.
-- Rollback: DROP FUNCTION public.apply_americano_live_match_score(uuid, text, integer, integer, jsonb, text, integer, jsonb, boolean);
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.apply_americano_live_match_score(
  p_tournament_id uuid,
  p_match_id text,
  p_score_a integer,
  p_score_b integer,
  p_ranking jsonb,
  p_phase text,
  p_total_rounds integer,
  p_roster jsonb,
  p_force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organizador uuid;
  v_snapshot jsonb;
  v_rounds jsonb;
  v_i int;
  v_j int;
  v_round_idx int;
  v_match_idx int;
  v_found boolean := false;
  v_existing_a jsonb;
  v_existing_b jsonb;
  v_new_rounds jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  IF p_match_id IS NULL OR length(trim(p_match_id)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_match');
  END IF;

  IF p_score_a IS NULL OR p_score_b IS NULL OR p_score_a < 0 OR p_score_b < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_score');
  END IF;

  SELECT user_id INTO v_organizador
  FROM public.tournaments
  WHERE id = p_tournament_id;

  IF v_organizador IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_organizador IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Sin permiso sobre este torneo';
  END IF;

  SELECT americano_live INTO v_snapshot
  FROM public.tournament_public_config
  WHERE tournament_id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND OR v_snapshot IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  v_rounds := coalesce(v_snapshot -> 'rounds', '[]'::jsonb);

  -- NOTA: no se reutilizan v_round_idx/v_match_idx como variables de control
  -- del FOR -- PL/pgSQL crea una variable entera implícita propia del loop
  -- que ignora/sombrea cualquier variable ya declarada con el mismo nombre
  -- (documentado en la referencia de PL/pgSQL), dejando v_round_idx/
  -- v_match_idx en NULL fuera del loop si se reutilizan así. Se usan v_i/v_j
  -- como contadores del loop y se asignan explícitamente a v_round_idx/
  -- v_match_idx solo al encontrar el partido (confirmado con prueba real
  -- contra Postgres en Fase A: sin este fix, jsonb_set fallaba con
  -- "path element at position 1 is null").
  <<search>>
  FOR v_i IN 0 .. jsonb_array_length(v_rounds) - 1 LOOP
    FOR v_j IN 0 .. jsonb_array_length(v_rounds -> v_i -> 'matches') - 1 LOOP
      IF (v_rounds -> v_i -> 'matches' -> v_j ->> 'id') = p_match_id THEN
        v_found := true;
        v_round_idx := v_i;
        v_match_idx := v_j;
        EXIT search;
      END IF;
    END LOOP;
  END LOOP search;

  IF NOT v_found THEN
    RETURN jsonb_build_object('ok', false, 'error', 'match_not_found');
  END IF;

  v_existing_a := v_rounds -> v_round_idx -> 'matches' -> v_match_idx -> 'scoreA';
  v_existing_b := v_rounds -> v_round_idx -> 'matches' -> v_match_idx -> 'scoreB';

  -- Idempotente: mismo resultado ya guardado para este partido.
  IF v_existing_a IS NOT NULL AND v_existing_b IS NOT NULL
     AND (v_existing_a)::text::int = p_score_a
     AND (v_existing_b)::text::int = p_score_b
  THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'unchanged',
      'match_id', p_match_id,
      'snapshot', v_snapshot
    );
  END IF;

  -- Conflicto explícito: el MISMO partido ya tiene otro resultado guardado
  -- (por otro dispositivo) y no se pidió forzar la sobrescritura.
  IF v_existing_a IS NOT NULL AND v_existing_b IS NOT NULL AND NOT p_force THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'conflict',
      'match_id', p_match_id,
      'score_a', (v_existing_a)::text::int,
      'score_b', (v_existing_b)::text::int
    );
  END IF;

  v_new_rounds := jsonb_set(
    jsonb_set(
      v_rounds,
      ARRAY[v_round_idx::text, 'matches', v_match_idx::text, 'scoreA'],
      to_jsonb(p_score_a)
    ),
    ARRAY[v_round_idx::text, 'matches', v_match_idx::text, 'scoreB'],
    to_jsonb(p_score_b)
  );

  v_snapshot := jsonb_set(v_snapshot, ARRAY['rounds'], v_new_rounds);

  IF p_ranking IS NOT NULL THEN
    v_snapshot := jsonb_set(v_snapshot, ARRAY['ranking'], p_ranking);
  END IF;
  IF p_phase IS NOT NULL THEN
    v_snapshot := jsonb_set(v_snapshot, ARRAY['tournamentPhase'], to_jsonb(p_phase));
  END IF;
  IF p_total_rounds IS NOT NULL THEN
    v_snapshot := jsonb_set(v_snapshot, ARRAY['totalRounds'], to_jsonb(p_total_rounds));
  END IF;
  IF p_roster IS NOT NULL THEN
    v_snapshot := jsonb_set(v_snapshot, ARRAY['roster'], p_roster);
  END IF;
  -- Timestamp del SERVIDOR, nunca confiado al reloj del cliente.
  v_snapshot := jsonb_set(
    v_snapshot,
    ARRAY['savedAt'],
    to_jsonb(to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  );

  UPDATE public.tournament_public_config
  SET americano_live = v_snapshot
  WHERE tournament_id = p_tournament_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'updated',
    'match_id', p_match_id,
    'snapshot', v_snapshot
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_americano_live_match_score(uuid, text, integer, integer, jsonb, text, integer, jsonb, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_americano_live_match_score(uuid, text, integer, integer, jsonb, text, integer, jsonb, boolean)
  TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- Complemento necesario: apply_americano_live_metadata
--
-- Una vez que `rounds` pasa a ser propiedad exclusiva de
-- apply_americano_live_match_score() durante "playing"/"finished", el efecto
-- debounced que persiste ranking/fase/roster (src/components/AmericanoDinamico/
-- AmericanoDinamicoScreen.tsx) NO puede seguir usando el upsert de blob
-- completo (upsertAmericanoLivePublic) para esas fases — eso volvería a
-- sobreescribir `rounds` enteros y reabriría el mismo problema. Esta función
-- actualiza SOLO ranking/tournamentPhase/totalRounds/roster vía jsonb_set,
-- sin tocar `rounds` en absoluto.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.apply_americano_live_metadata(
  p_tournament_id uuid,
  p_ranking jsonb,
  p_phase text,
  p_total_rounds integer,
  p_roster jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organizador uuid;
  v_snapshot jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  SELECT user_id INTO v_organizador
  FROM public.tournaments
  WHERE id = p_tournament_id;

  IF v_organizador IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_organizador IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Sin permiso sobre este torneo';
  END IF;

  SELECT americano_live INTO v_snapshot
  FROM public.tournament_public_config
  WHERE tournament_id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND OR v_snapshot IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF p_ranking IS NOT NULL THEN
    v_snapshot := jsonb_set(v_snapshot, ARRAY['ranking'], p_ranking);
  END IF;
  IF p_phase IS NOT NULL THEN
    v_snapshot := jsonb_set(v_snapshot, ARRAY['tournamentPhase'], to_jsonb(p_phase));
  END IF;
  IF p_total_rounds IS NOT NULL THEN
    v_snapshot := jsonb_set(v_snapshot, ARRAY['totalRounds'], to_jsonb(p_total_rounds));
  END IF;
  IF p_roster IS NOT NULL THEN
    v_snapshot := jsonb_set(v_snapshot, ARRAY['roster'], p_roster);
  END IF;
  v_snapshot := jsonb_set(
    v_snapshot,
    ARRAY['savedAt'],
    to_jsonb(to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  );

  UPDATE public.tournament_public_config
  SET americano_live = v_snapshot
  WHERE tournament_id = p_tournament_id;

  RETURN jsonb_build_object('ok', true, 'snapshot', v_snapshot);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_americano_live_metadata(uuid, jsonb, text, integer, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_americano_live_metadata(uuid, jsonb, text, integer, jsonb)
  TO authenticated;

-- ── Verificación en la misma transacción implícita del CREATE anterior ───
DO $$
BEGIN
  IF to_regprocedure('public.apply_americano_live_match_score(uuid,text,integer,integer,jsonb,text,integer,jsonb,boolean)') IS NULL THEN
    RAISE EXCEPTION 'Fix incompleto: apply_americano_live_match_score no existe tras el CREATE';
  END IF;
  IF to_regprocedure('public.apply_americano_live_metadata(uuid,jsonb,text,integer,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Fix incompleto: apply_americano_live_metadata no existe tras el CREATE';
  END IF;
END $$;
