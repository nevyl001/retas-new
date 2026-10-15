-- ══════════════════════════════════════════════════════════════════════════════
-- 0062 — Desacoplamiento de Concurrencia, Worker Idempotente y Protección Deportiva
--
-- PRINCIPIO ABSOLUTO:
--   Ningún fallo, bloqueo, timeout o interrupción de Riviera Rewards debe
--   comprometer el registro de participaciones, resultados, rankings o puntos
--   deportivos de Riviera Open.
--
-- CAMBIOS CLAVE:
--   1. El trigger AFTER INSERT en jugador_participaciones y rewards_enqueue_candidate
--      solo encolan la candidatura como 'pendiente'.
--   2. Se ELIMINA la invocación síncrona de rewards_accrue_one dentro del trigger deportivo.
--   3. En rewards_accrue_one, se reemplaza FOR UPDATE por FOR NO KEY UPDATE sobre
--      rewards_campaigns para serializar trabajadores sin colisionar con los
--      cerrojos FOR KEY SHARE de las claves foráneas de las participaciones deportivas.
--   4. Se implementa el consumidor rewards_process_queue() desacoplado con
--      FOR UPDATE SKIP LOCKED, recuperación de workers interrumpidos y backoff.
--   5. Se implementa la reconciliación rewards_reconcile_missing_candidates()
--      para detectar e incorporar participaciones elegibles no encoladas.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Esquema de cola y estados ──────────────────────────────────────────────

ALTER TABLE public.rewards_accrual_queue
  ADD COLUMN IF NOT EXISTS worker_id text,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz;

ALTER TABLE public.rewards_accrual_queue
  DROP CONSTRAINT IF EXISTS rewards_queue_estado_chk;

ALTER TABLE public.rewards_accrual_queue
  ADD CONSTRAINT rewards_queue_estado_chk
  CHECK (estado IN ('pendiente', 'procesando', 'acreditada', 'omitida', 'error'));

ALTER TABLE public.rewards_enqueue_failures
  ADD COLUMN IF NOT EXISTS sqlstate text,
  ADD COLUMN IF NOT EXISTS context text;

-- ── 2. Acreditación de un ítem con FOR NO KEY UPDATE ──────────────────────────

CREATE OR REPLACE FUNCTION public.rewards_accrue_one(p_queue_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_q public.rewards_accrual_queue%ROWTYPE;
  v_c public.rewards_campaigns%ROWTYPE;
  v_lot uuid;
  v_closed timestamptz;
BEGIN
  -- 1) Bloquear exclusivamente la fila de la cola
  SELECT * INTO v_q
  FROM public.rewards_accrual_queue
  WHERE id = p_queue_id
  FOR UPDATE;

  IF NOT FOUND OR v_q.estado IN ('acreditada', 'omitida') THEN
    RETURN;
  END IF;

  -- 2) Leer closed_at de la review
  SELECT r.closed_at INTO v_closed
  FROM public.rewards_participation_reviews r
  WHERE r.id = v_q.review_id;

  -- 3) Si fue rechazada manualmente, omitir
  IF EXISTS (
    SELECT 1 FROM public.rewards_participation_reviews r
    WHERE r.id = v_q.review_id AND r.estado = 'rechazada'
  ) THEN
    UPDATE public.rewards_accrual_queue
    SET estado = 'omitida',
        last_error = 'Revisión rechazada manualmente',
        processed_at = now(),
        locked_at = NULL,
        worker_id = NULL
    WHERE id = v_q.id;
    RETURN;
  END IF;

  -- 4) Bloqueo de serialización de campaña: FOR NO KEY UPDATE
  -- REGLA: Permite serializar múltiples workers de Rewards sin bloquear ni
  -- ser bloqueado por los cerrojos FOR KEY SHARE del trigger deportivo.
  SELECT * INTO v_c
  FROM public.rewards_campaigns
  WHERE id = v_q.campaign_id
  FOR NO KEY UPDATE;

  IF NOT FOUND OR v_c.estado <> 'activa' THEN
    RAISE EXCEPTION 'Campaña no activa (id=%, estado=%)', v_q.campaign_id, COALESCE(v_c.estado, 'no_encontrada');
  END IF;

  -- 5) Verificar si usó beneficio de canje
  IF EXISTS (
    SELECT 1 FROM public.rewards_benefit_uses b
    WHERE b.participacion_id = v_q.participacion_id
  ) THEN
    UPDATE public.rewards_accrual_queue
    SET estado = 'omitida',
        last_error = 'Reta gratuita de Rewards',
        processed_at = now(),
        locked_at = NULL,
        worker_id = NULL
    WHERE id = v_q.id;
    RETURN;
  END IF;

  -- 6) Creación idempotente del lote de puntos
  SELECT id INTO v_lot
  FROM public.rewards_lots
  WHERE idempotency_key = v_q.idempotency_key;

  IF v_lot IS NULL THEN
    INSERT INTO public.rewards_lots (
      organizador_id, campaign_id, jugador_id, participacion_id, queue_id,
      tipo_evento, evento_id, idempotency_key, puntos_originales, puntos_restantes,
      earned_at, expires_at
    )
    VALUES (
      v_q.organizador_id, v_c.id, v_q.jugador_id, v_q.participacion_id, v_q.id,
      v_q.tipo_evento, v_q.evento_id, v_q.idempotency_key, v_c.puntos_por_participacion,
      v_c.puntos_por_participacion, COALESCE(v_closed, now()), v_c.canje_hasta
    )
    RETURNING id INTO v_lot;

    -- Movimiento en ledger
    INSERT INTO public.rewards_ledger (
      organizador_id, jugador_id, campaign_id, lot_id, tipo, puntos, idempotency_key, actor_id
    )
    VALUES (
      v_q.organizador_id, v_q.jugador_id, v_c.id, v_lot, 'acreditacion',
      v_c.puntos_por_participacion, 'acreditacion:' || v_q.idempotency_key, auth.uid()
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    -- Compensar obligaciones previas si existen
    PERFORM public.rewards_compensate_lot(v_lot);

    -- Si la ventana ya había cerrado, caducar remanente
    IF v_c.canje_hasta <= now() THEN
      INSERT INTO public.rewards_ledger (
        organizador_id, jugador_id, campaign_id, lot_id, tipo, puntos, idempotency_key, motivo
      )
      SELECT v_q.organizador_id, v_q.jugador_id, v_c.id, l.id,
             'cierre', -l.puntos_restantes, 'cierre:' || l.id::text,
             'La ventana de canje ya había cerrado'
      FROM public.rewards_lots l
      WHERE l.id = v_lot
        AND l.puntos_restantes > 0
      ON CONFLICT (idempotency_key) DO NOTHING;

      UPDATE public.rewards_lots
      SET puntos_restantes = 0
      WHERE id = v_lot
        AND puntos_restantes > 0;
    END IF;
  END IF;

  -- 7) Transición definitiva de cola
  UPDATE public.rewards_accrual_queue
  SET estado = 'acreditada',
      last_error = NULL,
      processed_at = now(),
      locked_at = NULL,
      worker_id = NULL,
      attempts = attempts + 1
  WHERE id = v_q.id;
END;
$$;

-- ── 3. Encolado rápido sin acreditación síncrona ──────────────────────────────

CREATE OR REPLACE FUNCTION public.rewards_enqueue_candidate(p_participacion_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_part public.jugador_participaciones%ROWTYPE;
  v_partidos integer;
  v_elegible boolean;
  v_mod text;
  v_org uuid;
  v_closed timestamptz;
  v_campaign public.rewards_campaigns%ROWTYPE;
  v_review_id uuid;
  v_queue_id uuid;
  v_key text;
BEGIN
  -- 1) Leer participación deportiva
  SELECT * INTO v_part
  FROM public.jugador_participaciones
  WHERE id = p_participacion_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- 2) Partidos disputados
  BEGIN
    v_partidos := COALESCE(
      (v_part.metadata->>'partidos')::integer,
      (v_part.metadata->>'partidos_jugados')::integer,
      (COALESCE((v_part.metadata->>'partidos_ganados')::integer, 0) +
       COALESCE((v_part.metadata->>'partidos_perdidos')::integer, 0) +
       COALESCE((v_part.metadata->>'partidos_empatados')::integer, 0)),
      0
    );
  EXCEPTION WHEN OTHERS THEN
    v_partidos := 0;
  END;

  -- 3) Elegibilidad deportiva (evidencia de juego comprobado)
  v_elegible := (
    COALESCE(v_part.metadata->>'subtipo' IN (
      'americano_cierre', 'reta_cierre', 'reta_resultado',
      'duelo_2v2_cierre', 'torneo_express_cierre', 'liga_jornada_cierre'
    ), false)
    OR COALESCE(v_partidos > 0, false)
    OR COALESCE(v_part.sets_favor, 0) > 0
    OR COALESCE(v_part.sets_contra, 0) > 0
    OR COALESCE(v_part.puntos_obtenidos, 0) > 0
    OR COALESCE(v_part.resultado IN ('victoria', 'derrota', 'empate'), false)
    OR (COALESCE(v_part.resultado = 'participación', false) AND (
      COALESCE((v_part.metadata->>'posicion')::int, 0) > 0
      OR COALESCE((v_part.metadata->>'posicion_final')::int, 0) > 0
      OR COALESCE((v_part.metadata->>'puntos_en_contra')::int, 0) > 0
      OR COALESCE((v_part.metadata->>'puntos_a_favor')::int, 0) > 0
    ))
    OR (v_part.metadata->'partidos_detalle' IS NOT NULL AND jsonb_array_length(v_part.metadata->'partidos_detalle') > 0)
  );

  IF v_elegible IS NOT TRUE THEN
    RETURN;
  END IF;

  -- 4) Modalidad Rewards
  v_mod := public.rewards_modalidad(v_part.tipo_evento::text, v_part.evento_id);
  IF v_mod IS NULL THEN
    RETURN;
  END IF;

  -- 5) Club anfitrión del evento
  BEGIN
    v_org := NULLIF(trim(v_part.metadata->>'organizador_id'), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_org := NULL;
  END;

  IF v_org IS NULL THEN
    v_org := public.riviera_participacion_expected_host_org(v_part.tipo_evento::text, v_part.evento_id::text);
  END IF;

  IF v_org IS NULL THEN
    SELECT rj.organizador_id INTO v_org
    FROM public.riviera_jugadores rj
    WHERE rj.id = v_part.jugador_id;
  END IF;

  IF v_org IS NULL THEN
    RETURN;
  END IF;

  -- 6) Momento de cierre deportivo
  v_closed := COALESCE(v_part.created_at, v_part.fecha::timestamptz, now());

  -- 7) Campaña activa
  SELECT * INTO v_campaign
  FROM public.rewards_campaigns c
  WHERE c.organizador_id = v_org
    AND c.estado = 'activa'
    AND v_mod = ANY (c.modalidades)
    AND v_closed >= c.acumula_desde
    AND v_closed < c.acumula_hasta
  ORDER BY c.created_at DESC
  LIMIT 1;

  -- 8) Si usó beneficio de canje
  IF EXISTS (
    SELECT 1 FROM public.rewards_benefit_uses b
    WHERE b.participacion_id = v_part.id
  ) THEN
    INSERT INTO public.rewards_participation_reviews (
      organizador_id, participacion_id, jugador_id, tipo_evento, evento_id,
      modalidad, closed_at, estado, campaign_id, validation_source, motivo, decided_at
    )
    VALUES (
      v_org, v_part.id, v_part.jugador_id, v_part.tipo_evento::text, v_part.evento_id,
      v_mod, v_closed, 'aprobada', v_campaign.id, 'automatic', 'Reta gratuita de Rewards', now()
    )
    ON CONFLICT (participacion_id) DO UPDATE
    SET organizador_id = EXCLUDED.organizador_id,
        estado = 'aprobada',
        motivo = 'Reta gratuita de Rewards',
        decided_at = now();

    v_key := v_org::text || ':' || v_part.jugador_id::text || ':' || v_part.tipo_evento::text || ':' || v_part.evento_id::text;

    INSERT INTO public.rewards_accrual_queue (
      organizador_id, review_id, campaign_id, participacion_id, jugador_id,
      tipo_evento, evento_id, idempotency_key, estado, validation_source, last_error, processed_at
    )
    SELECT v_org, r.id, v_campaign.id, v_part.id, v_part.jugador_id,
           v_part.tipo_evento::text, v_part.evento_id, v_key, 'omitida', 'automatic', 'Reta gratuita de Rewards', now()
    FROM public.rewards_participation_reviews r
    WHERE r.participacion_id = v_part.id
    ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN;
  END IF;

  -- 9) Sin campaña activa: registrar como pendiente
  IF v_campaign.id IS NULL THEN
    INSERT INTO public.rewards_participation_reviews (
      organizador_id, participacion_id, jugador_id, tipo_evento, evento_id,
      modalidad, closed_at, estado
    )
    VALUES (
      v_org, v_part.id, v_part.jugador_id, v_part.tipo_evento::text, v_part.evento_id,
      v_mod, v_closed, 'pendiente'
    )
    ON CONFLICT (participacion_id) DO UPDATE
    SET organizador_id = EXCLUDED.organizador_id,
        closed_at = EXCLUDED.closed_at
    WHERE rewards_participation_reviews.estado = 'pendiente';
    RETURN;
  END IF;

  -- 10) Campaña activa: crear review 'aprobada'
  INSERT INTO public.rewards_participation_reviews (
    organizador_id, participacion_id, jugador_id, tipo_evento, evento_id,
    modalidad, closed_at, estado, campaign_id, validation_source, decided_at
  )
  VALUES (
    v_org, v_part.id, v_part.jugador_id, v_part.tipo_evento::text, v_part.evento_id,
    v_mod, v_closed, 'aprobada', v_campaign.id, 'automatic', now()
  )
  ON CONFLICT (participacion_id) DO UPDATE
  SET organizador_id = EXCLUDED.organizador_id,
      estado = 'aprobada',
      campaign_id = EXCLUDED.campaign_id,
      validation_source = 'automatic',
      decided_at = COALESCE(rewards_participation_reviews.decided_at, now())
  WHERE rewards_participation_reviews.estado <> 'rechazada'
  RETURNING id INTO v_review_id;

  IF v_review_id IS NULL THEN
    RETURN;
  END IF;

  -- 11) Encolar candidatura como 'pendiente'
  v_key := v_org::text || ':' || v_part.jugador_id::text || ':' || v_part.tipo_evento::text || ':' || v_part.evento_id::text;

  INSERT INTO public.rewards_accrual_queue (
    organizador_id, review_id, campaign_id, participacion_id, jugador_id,
    tipo_evento, evento_id, idempotency_key, estado, validation_source
  )
  VALUES (
    v_org, v_review_id, v_campaign.id, v_part.id, v_part.jugador_id,
    v_part.tipo_evento::text, v_part.evento_id, v_key, 'pendiente', 'automatic'
  )
  ON CONFLICT (idempotency_key) DO UPDATE
  SET campaign_id = EXCLUDED.campaign_id,
      review_id = EXCLUDED.review_id
  WHERE rewards_accrual_queue.estado NOT IN ('acreditada', 'omitida');

  -- DESACOPLAMIENTO DEFINITIVO:
  -- Ya NO se invoca rewards_accrue_one() síncronamente.
  -- La transacción deportiva termina de forma inmediata y segura.
END;
$$;

-- ── 4. Trigger deportivo protegido con diagnóstico estructurado ───────────────

CREATE OR REPLACE FUNCTION public.rewards_on_participacion_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_err_msg text;
  v_err_state text;
  v_err_ctx text;
BEGIN
  BEGIN
    PERFORM public.rewards_enqueue_candidate(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_err_msg = MESSAGE_TEXT,
      v_err_state = RETURNED_SQLSTATE,
      v_err_ctx = PG_EXCEPTION_CONTEXT;

    BEGIN
      INSERT INTO public.rewards_enqueue_failures (
        participacion_id, error, sqlstate, context, created_at, attempts
      )
      VALUES (
        NEW.id, v_err_msg, v_err_state, v_err_ctx, now(), 1
      )
      ON CONFLICT (participacion_id) DO UPDATE
      SET error = EXCLUDED.error,
          sqlstate = EXCLUDED.sqlstate,
          context = EXCLUDED.context,
          created_at = now(),
          attempts = public.rewards_enqueue_failures.attempts + 1,
          resolved_at = NULL;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'rewards_on_participacion_insert: fallo al registrar encolamiento para participacion %: % (%)',
        NEW.id, v_err_msg, v_err_state;
    END;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rewards_participacion_candidate ON public.jugador_participaciones;
CREATE TRIGGER rewards_participacion_candidate
  AFTER INSERT ON public.jugador_participaciones
  FOR EACH ROW
  EXECUTE FUNCTION public.rewards_on_participacion_insert();

-- ── 5. Worker automático con FOR UPDATE SKIP LOCKED ───────────────────────────

CREATE OR REPLACE FUNCTION public.rewards_process_queue(
  p_limit integer DEFAULT 50,
  p_worker_id text DEFAULT 'worker-default'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rec record;
  v_processed integer := 0;
  v_succeeded integer := 0;
  v_failed integer := 0;
  v_err_msg text;
  v_err_state text;
BEGIN
  -- Reclamar filas elegibles concurrentemente sin bloquear otros workers
  FOR v_rec IN
    SELECT q.id, q.attempts
    FROM public.rewards_accrual_queue q
    WHERE q.estado = 'pendiente'
       OR (
         q.estado = 'error'
         AND q.attempts < 10
         AND COALESCE(q.processed_at, q.created_at) < now() - (LEAST(q.attempts, 8) * interval '5 seconds')
       )
       OR (
         q.estado = 'procesando'
         AND q.locked_at < now() - interval '2 minutes'
       )
    ORDER BY q.created_at ASC
    LIMIT GREATEST(COALESCE(p_limit, 50), 1)
    FOR UPDATE SKIP LOCKED
  LOOP
    v_processed := v_processed + 1;

    UPDATE public.rewards_accrual_queue
    SET estado = 'procesando',
        worker_id = p_worker_id,
        locked_at = now()
    WHERE id = v_rec.id;

    BEGIN
      PERFORM public.rewards_accrue_one(v_rec.id);
      v_succeeded := v_succeeded + 1;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS
        v_err_msg = MESSAGE_TEXT,
        v_err_state = RETURNED_SQLSTATE;

      v_failed := v_failed + 1;

      UPDATE public.rewards_accrual_queue
      SET estado = 'error',
          attempts = attempts + 1,
          last_error = CASE
            WHEN attempts + 1 >= 10 THEN '[MAX_INTENTOS_AGOTADOS] (' || v_err_state || ') ' || v_err_msg
            ELSE '(' || v_err_state || ') ' || v_err_msg
          END,
          processed_at = now(),
          locked_at = NULL,
          worker_id = NULL
      WHERE id = v_rec.id;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'succeeded', v_succeeded,
    'failed', v_failed,
    'worker_id', p_worker_id
  );
END;
$$;

-- Alias retrocompatible para llamadas existentes que esperan integer
CREATE OR REPLACE FUNCTION public.rewards_retry_accruals(p_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_res jsonb;
BEGIN
  v_res := public.rewards_process_queue(p_limit, 'retry-accruals-compat');
  RETURN COALESCE((v_res->>'processed')::integer, 0);
END;
$$;

-- ── 6. Reconciliación automática e independiente de candidaturas ───────────────

CREATE OR REPLACE FUNCTION public.rewards_reconcile_missing_candidates(
  p_organizador_id uuid DEFAULT NULL,
  p_evento_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rec record;
  v_reconciled integer := 0;
  v_errors integer := 0;
BEGIN
  FOR v_rec IN
    SELECT jp.id
    FROM public.jugador_participaciones jp
    JOIN public.rewards_campaigns c ON c.organizador_id = COALESCE(
      NULLIF(trim(jp.metadata->>'organizador_id'), '')::uuid,
      public.riviera_participacion_expected_host_org(jp.tipo_evento::text, jp.evento_id::text)
    )
    WHERE (p_organizador_id IS NULL OR c.organizador_id = p_organizador_id)
      AND (p_evento_id IS NULL OR jp.evento_id = p_evento_id)
      AND c.estado = 'activa'
      AND COALESCE(jp.created_at, jp.fecha::timestamptz, now()) >= c.acumula_desde
      AND COALESCE(jp.created_at, jp.fecha::timestamptz, now()) < c.acumula_hasta
      AND jp.tipo_evento::text IN ('reta', 'americano', 'duelo_2v2')
      -- Evidencia de juego comprobado (igual a la regla del trigger)
      AND (
        COALESCE(jp.metadata->>'subtipo' IN (
          'americano_cierre', 'reta_cierre', 'reta_resultado',
          'duelo_2v2_cierre', 'torneo_express_cierre', 'liga_jornada_cierre'
        ), false)
        OR COALESCE(jp.sets_favor, 0) > 0
        OR COALESCE(jp.sets_contra, 0) > 0
        OR COALESCE(jp.puntos_obtenidos, 0) > 0
        OR COALESCE(jp.resultado IN ('victoria', 'derrota', 'empate'), false)
        OR (jp.metadata->'partidos_detalle' IS NOT NULL AND jsonb_array_length(jp.metadata->'partidos_detalle') > 0)
      )
      -- Participaciones que NO estén ya en cola o con review rechazada
      AND NOT EXISTS (
        SELECT 1 FROM public.rewards_accrual_queue q
        WHERE q.participacion_id = jp.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.rewards_participation_reviews r
        WHERE r.participacion_id = jp.id
          AND r.estado = 'rechazada'
      )
  LOOP
    BEGIN
      PERFORM public.rewards_enqueue_candidate(v_rec.id);
      v_reconciled := v_reconciled + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'reconciled', v_reconciled,
    'errors', v_errors
  );
END;
$$;

-- ── 7. Permisos y seguridad ───────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.rewards_accrue_one(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rewards_accrue_one(uuid) TO service_role, postgres;

REVOKE ALL ON FUNCTION public.rewards_process_queue(integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rewards_process_queue(integer, text) TO service_role, postgres;

REVOKE ALL ON FUNCTION public.rewards_reconcile_missing_candidates(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rewards_reconcile_missing_candidates(uuid, uuid) TO service_role, postgres;

REVOKE ALL ON FUNCTION public.rewards_retry_accruals(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rewards_retry_accruals(integer) TO service_role, postgres;

-- ── 8. Programación opcional con pg_cron (si está habilitado) ───────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('rewards-process-queue')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rewards-process-queue');

      PERFORM cron.schedule(
        'rewards-process-queue',
        '* * * * *',
        'SELECT public.rewards_process_queue(100, ''pg_cron'');'
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'No se pudo registrar cron job automático (permiso o esquema): %', SQLERRM;
    END;
  END IF;
END;
$$;

