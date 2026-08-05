-- ══════════════════════════════════════════════════════════════════════════════
-- FC-01 (Fase C1) — Americano Dinámico: la generación de una ronda nunca
-- llega al servidor
--
-- Confirmado EN VIVO (no solo por lectura de código): un torneo Americano se
-- puede jugar completo — ronda generada, marcadores confirmados, "Ronda
-- finalizada" sin ningún error — y `tournament_public_config.americano_live
-- -> 'rounds'` queda vacío (`[]`) en el servidor todo el tiempo. Verificado:
-- 0 llamadas a `apply_americano_live_match_score`, 0 filas en
-- `jugador_participaciones`, `tournaments.is_finished = false` mientras la
-- vista pública mostraba "FINALIZADA".
--
-- Causa raíz: la migración 0004 (BLK-02) documentó la intención de que
-- `startTournament()`/`nextRound()` siguieran empujando la ESTRUCTURA de la
-- ronda (qué pareja juega contra cuál, en qué cancha) vía el upsert de blob
-- completo existente entonces, dejando el nuevo RPC atómico solo para
-- marcadores puntuales. Pero en la implementación real
-- (AmericanoDinamicoScreen.tsx), el efecto que hacía ese upsert de blob
-- completo quedó condicionado a `phase === "registration"` — deja de
-- ejecutarse en cuanto el torneo pasa a "playing". Ni `startTournament()` ni
-- `nextRound()` (useAmericanoDinamico.tsx) llaman a ninguna función de
-- persistencia — ambas solo hacen `setRounds(...)` en memoria de React. El
-- único código que sí llama a Supabase durante "playing" es el guardado de
-- metadata (ranking/fase/roster, sin `rounds` a propósito) y el guardado
-- atómico de UN marcador (que solo hace UPDATE sobre un partido que debe
-- existir ya en `rounds` -- si no lo encuentra, devuelve `match_not_found`
-- sin crear nada). Es una regresión real, no una decisión de producto: el
-- propio comentario de 0004 describe un comportamiento que el TypeScript
-- nunca implementó.
--
-- Fix: nuevo RPC que agrega la ESTRUCTURA de una ronda nueva al `rounds` del
-- servidor, con el mismo patrón ya usado por apply_americano_live_match_score
-- (lock de fila + idempotencia + reconciliación en conflicto) — no se toca
-- el guardado de marcadores existente, ni se vuelve al upsert de blob
-- completo (eso reabriría la condición de carrera original de BLK-02: dos
-- dispositivos pisándose marcadores entre sí).
--
-- Idempotencia: por `idempotencyKey` explícito (estable: el cliente lo
-- genera de forma determinística como `${tournamentId}:round:${roundNumber}`,
-- NO un UUID aleatorio -- un reintento de red de la MISMA operación produce
-- la MISMA key). Si la ronda con esa key ya existe en el servidor, se
-- devuelve tal cual (sin duplicar) para que el cliente reconcilie su copia
-- local con la autoritativa del servidor -- mismo patrón que
-- reconcileMatchScore ya usa para marcadores en conflicto.
--
-- Válida además que p_round_number sea exactamente rounds.length + 1
-- (rechaza rondas fuera de orden de un cliente desincronizado) y crea la
-- fila de tournament_public_config si aún no existe (no depende del timing
-- del guardado debounced de "registration").
--
-- Idempotente (la migración en sí): CREATE OR REPLACE FUNCTION + REVOKE/GRANT
-- son repetibles sin error.
-- Rollback: DROP FUNCTION public.apply_americano_new_round(uuid, integer, text, jsonb, jsonb, text, integer, jsonb);
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.apply_americano_new_round(
  p_tournament_id uuid,
  p_round_number integer,
  p_idempotency_key text,
  p_round_data jsonb,
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
  v_rounds jsonb;
  v_i int;
  v_existing_round jsonb;
  v_round_with_key jsonb;
  v_new_rounds jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  IF p_round_number IS NULL OR p_round_number < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_round_number');
  END IF;

  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_idempotency_key');
  END IF;

  IF p_round_data IS NULL OR jsonb_typeof(p_round_data -> 'matches') <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_round_data');
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

  IF NOT FOUND THEN
    -- Aún no existe fila (carrera con el guardado debounced de "registration")
    -- -- la creamos aquí mismo en vez de depender de ese timing.
    INSERT INTO public.tournament_public_config (tournament_id, format, americano_live)
    VALUES (
      p_tournament_id,
      'americano_dinamico',
      jsonb_build_object('version', 1, 'rounds', '[]'::jsonb, 'ranking', '[]'::jsonb)
    )
    ON CONFLICT (tournament_id) DO NOTHING;

    SELECT americano_live INTO v_snapshot
    FROM public.tournament_public_config
    WHERE tournament_id = p_tournament_id
    FOR UPDATE;

    IF NOT FOUND OR v_snapshot IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_found');
    END IF;
  END IF;

  v_rounds := coalesce(v_snapshot -> 'rounds', '[]'::jsonb);

  -- Idempotencia por key: si ya existe una ronda con esta key, se devuelve
  -- tal cual (la autoritativa del servidor), sin duplicar ni pisar nada.
  FOR v_i IN 0 .. jsonb_array_length(v_rounds) - 1 LOOP
    IF (v_rounds -> v_i ->> 'idempotencyKey') = p_idempotency_key THEN
      v_existing_round := v_rounds -> v_i;
      EXIT;
    END IF;
  END LOOP;

  IF v_existing_round IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'exists',
      'round', v_existing_round,
      'snapshot', v_snapshot
    );
  END IF;

  -- Debe ser exactamente la siguiente ronda esperada -- rechaza huecos o
  -- rondas fuera de orden de un cliente desincronizado.
  IF p_round_number <> jsonb_array_length(v_rounds) + 1 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'out_of_order',
      'expected_round_number', jsonb_array_length(v_rounds) + 1,
      'rounds', v_rounds
    );
  END IF;

  v_round_with_key := p_round_data || jsonb_build_object('idempotencyKey', p_idempotency_key);
  v_new_rounds := v_rounds || jsonb_build_array(v_round_with_key);

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
    'status', 'created',
    'round', v_round_with_key,
    'snapshot', v_snapshot
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_americano_new_round(uuid, integer, text, jsonb, jsonb, text, integer, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_americano_new_round(uuid, integer, text, jsonb, jsonb, text, integer, jsonb)
  TO authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.apply_americano_new_round(uuid,integer,text,jsonb,jsonb,text,integer,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Fix incompleto: apply_americano_new_round no existe tras el CREATE';
  END IF;
END $$;
