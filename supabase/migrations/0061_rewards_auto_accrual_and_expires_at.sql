-- ══════════════════════════════════════════════════════════════════════════════
-- 0061 — Riviera Rewards: Acreditación automática y corrección de expires_at
--
-- PROBLEMAS RESUELTOS:
--  1) rewards_lots falla con "null value in column 'expires_at' violates not-null constraint".
--     El vencimiento real de los lotes de puntos corresponde a la fecha de cierre
--     de la ventana de canje de la campaña (c.canje_hasta). Se corrige la columna,
--     el trigger BEFORE INSERT y la función rewards_accrue_one para poblar expires_at
--     con c.canje_hasta sin eliminar NOT NULL ni inventar fechas.
--  2) Acreditación automática: Se elimina el requisito de aprobación manual
--     para participaciones reales comprobadas. Al registrarse la participación de
--     un evento (americano, reta, duelo), si existe campaña activa, se aprueba y
--     acredita de inmediato.
--  3) Aislamiento por club anfitrión: El organizador elegible es el club anfitrión
--     del evento (metadata->'organizador_id' o riviera_participacion_expected_host_org),
--     no la afiliación original del jugador (rj.organizador_id).
--  4) Participación comprobada: No se otorgan puntos a inscripciones simples
--     sin juego real (exige puntos > 0, sets > 0, partidos > 0, o resultado activo).
--  5) Función de recuperación idempotente: rewards_recover_participaciones()
--     reprocesa lotes con error, aprueba pendientes y recupera participaciones
--     omitidas sin duplicar puntos ni alterar saldos deportivos.
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Columna expires_at y trigger en public.rewards_lots ───────────────────

ALTER TABLE public.rewards_lots
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Backfill de lotes históricos existentes con canje_hasta de su campaña
UPDATE public.rewards_lots l
SET expires_at = c.canje_hasta
FROM public.rewards_campaigns c
WHERE l.campaign_id = c.id
  AND l.expires_at IS NULL;

-- Backfill de lotes asociados a la cola si no tenían campaña directa
UPDATE public.rewards_lots l
SET expires_at = c.canje_hasta
FROM public.rewards_accrual_queue q
JOIN public.rewards_campaigns c ON c.id = q.campaign_id
WHERE l.queue_id = q.id
  AND l.expires_at IS NULL;

-- Asegurar restricción NOT NULL
ALTER TABLE public.rewards_lots
  ALTER COLUMN expires_at SET NOT NULL;

-- Asegurar DEFAULT en columna timezone si existe en rewards_lots
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rewards_lots' AND column_name = 'timezone'
  ) THEN
    ALTER TABLE public.rewards_lots ALTER COLUMN timezone SET DEFAULT 'America/Mexico_City';
    UPDATE public.rewards_lots l
    SET timezone = COALESCE(c.timezone, 'America/Mexico_City')
    FROM public.rewards_campaigns c
    WHERE l.campaign_id = c.id AND l.timezone IS NULL;
  END IF;
END $$;


-- Permitir 'automatic' como origen de validación en revisiones de participación
ALTER TABLE public.rewards_participation_reviews
  DROP CONSTRAINT IF EXISTS rewards_reviews_source_chk;

ALTER TABLE public.rewards_participation_reviews
  ADD CONSTRAINT rewards_reviews_source_chk
  CHECK (validation_source IS NULL OR validation_source IN ('admin', 'payment', 'automatic'));

-- ── 1.2 Registro durable de fallos de encolamiento ────────────────────────────

CREATE TABLE IF NOT EXISTS public.rewards_enqueue_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participacion_id uuid NOT NULL,
  error text NOT NULL,
  attempts integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT rewards_enqueue_failures_part_uidx UNIQUE (participacion_id)
);

ALTER TABLE public.rewards_enqueue_failures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rewards_enqueue_failures_admin ON public.rewards_enqueue_failures;
CREATE POLICY rewards_enqueue_failures_admin ON public.rewards_enqueue_failures
  FOR ALL TO authenticated
  USING (public.is_master_admin());

-- Trigger BEFORE INSERT para garantizar que expires_at nunca llegue nulo
CREATE OR REPLACE FUNCTION public.rewards_lots_set_expires_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    SELECT c.canje_hasta INTO NEW.expires_at
    FROM public.rewards_campaigns c
    WHERE c.id = NEW.campaign_id;
  END IF;
  IF NEW.expires_at IS NULL THEN
    RAISE EXCEPTION 'No se puede emitir lote sin fecha de vencimiento válida (canje_hasta no encontrado en campaña %)', NEW.campaign_id;
  END IF;

  -- Asegurar timezone de la campaña o default America/Mexico_City
  BEGIN
    IF NEW.timezone IS NULL THEN
      SELECT COALESCE(c.timezone, 'America/Mexico_City') INTO NEW.timezone
      FROM public.rewards_campaigns c
      WHERE c.id = NEW.campaign_id;
      IF NEW.timezone IS NULL THEN
        NEW.timezone := 'America/Mexico_City';
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;

END;
$$;

DROP TRIGGER IF EXISTS trg_rewards_lots_expires_at ON public.rewards_lots;
CREATE TRIGGER trg_rewards_lots_expires_at
  BEFORE INSERT ON public.rewards_lots
  FOR EACH ROW
  EXECUTE FUNCTION public.rewards_lots_set_expires_at();

-- ── 2. Actualización de rewards_accrue_one con expires_at explícito ───────────

CREATE OR REPLACE FUNCTION public.rewards_accrue_one(p_queue_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_q public.rewards_accrual_queue%ROWTYPE;
  v_c public.rewards_campaigns%ROWTYPE;
  v_closed timestamptz;
  v_lot uuid;
BEGIN
  SELECT * INTO v_q
  FROM public.rewards_accrual_queue
  WHERE id = p_queue_id
  FOR UPDATE;
  IF NOT FOUND OR v_q.estado IN ('acreditada', 'omitida') THEN
    RETURN;
  END IF;

  SELECT r.closed_at INTO v_closed
  FROM public.rewards_participation_reviews r
  WHERE r.id = v_q.review_id;

  IF EXISTS (
    SELECT 1 FROM public.rewards_participation_reviews r
    WHERE r.id = v_q.review_id AND r.estado = 'rechazada'
  ) THEN
    UPDATE public.rewards_accrual_queue
    SET estado = 'omitida', last_error = 'Revisión rechazada manualmente', processed_at = now()
    WHERE id = v_q.id;
    RETURN;
  END IF;

  SELECT * INTO v_c FROM public.rewards_campaigns WHERE id = v_q.campaign_id FOR UPDATE;
  IF NOT FOUND OR v_c.estado <> 'activa' THEN
    RAISE EXCEPTION 'Campaña no activa';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.rewards_benefit_uses b
    WHERE b.participacion_id = v_q.participacion_id
  ) THEN
    UPDATE public.rewards_accrual_queue
    SET estado = 'omitida', last_error = 'Reta gratuita de Rewards', processed_at = now()
    WHERE id = v_q.id;
    RETURN;
  END IF;

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

    INSERT INTO public.rewards_ledger (
      organizador_id, jugador_id, campaign_id, lot_id, tipo, puntos, idempotency_key, actor_id
    )
    VALUES (
      v_q.organizador_id, v_q.jugador_id, v_c.id, v_lot, 'acreditacion',
      v_c.puntos_por_participacion, 'acreditacion:' || v_q.idempotency_key, auth.uid()
    );

    PERFORM public.rewards_compensate_lot(v_lot);

    IF v_c.canje_hasta <= now() THEN
      INSERT INTO public.rewards_ledger (
        organizador_id, jugador_id, campaign_id, lot_id, tipo, puntos, idempotency_key, motivo
      )
      SELECT v_q.organizador_id, v_q.jugador_id, v_c.id, l.id,
             'cierre', -l.puntos_restantes, 'cierre:' || l.id::text,
             'La ventana de canje ya había cerrado'
      FROM public.rewards_lots l
      WHERE l.id = v_lot
        AND l.puntos_restantes > 0;

      UPDATE public.rewards_lots
      SET puntos_restantes = 0
      WHERE id = v_lot
        AND puntos_restantes > 0;
    END IF;
  END IF;

  UPDATE public.rewards_accrual_queue
  SET estado = 'acreditada', last_error = NULL, processed_at = now(), attempts = attempts + 1
  WHERE id = v_q.id;
END;
$$;

-- ── 2.1 Consistencia al invalidar o corregir participación ───────────────────

CREATE OR REPLACE FUNCTION public.rewards_invalidate_participation(
  p_organizador_id uuid,
  p_participacion_id uuid,
  p_motivo text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.rewards_assert_club_admin(p_organizador_id);
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 3 THEN
    RAISE EXCEPTION 'La invalidación necesita un motivo';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.rewards_participation_reviews
    WHERE participacion_id = p_participacion_id
      AND organizador_id = p_organizador_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.rewards_lots
    WHERE participacion_id = p_participacion_id
      AND organizador_id = p_organizador_id
  ) THEN
    RAISE EXCEPTION 'Participación no encontrada en este club';
  END IF;

  UPDATE public.rewards_accrual_queue
  SET estado = 'omitida', last_error = trim(p_motivo), processed_at = now()
  WHERE participacion_id = p_participacion_id
    AND organizador_id = p_organizador_id
    AND estado IN ('pendiente', 'error');

  -- Actualizar estado a 'rechazada' tanto si estaba pendiente como aprobada
  UPDATE public.rewards_participation_reviews
  SET estado = 'rechazada', motivo = trim(p_motivo), decided_at = now(), decided_by = auth.uid()
  WHERE participacion_id = p_participacion_id
    AND organizador_id = p_organizador_id;

  PERFORM public.rewards_settle_invalid_lot(p_participacion_id, trim(p_motivo));
END;
$$;

-- ── 3. Acreditación automática al encolar candidatos ───────────────────────────

CREATE OR REPLACE FUNCTION public.rewards_enqueue_candidate(p_participacion_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_part public.jugador_participaciones%ROWTYPE;
  v_org uuid;
  v_mod text;
  v_closed timestamptz;
  v_campaign public.rewards_campaigns%ROWTYPE;
  v_review_id uuid;
  v_key text;
  v_queue_id uuid;
  v_partidos int := 0;
  v_elegible boolean := false;
BEGIN
  SELECT * INTO v_part
  FROM public.jugador_participaciones
  WHERE id = p_participacion_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- 1) Descartar ajustes manuales o inscripciones puras sin juego comprobado / no show
  IF COALESCE(v_part.metadata->>'subtipo', '') IN ('ajuste_manual', 'inscripcion')
     OR COALESCE(v_part.metadata->>'no_show', 'false') = 'true'
     OR COALESCE(v_part.metadata->>'walkover', 'false') = 'true' THEN
    RETURN;
  END IF;

  -- Si la revisión ya fue rechazada manualmente, no reactivarla ni encolar
  IF EXISTS (
    SELECT 1 FROM public.rewards_participation_reviews
    WHERE participacion_id = v_part.id AND estado = 'rechazada'
  ) THEN
    RETURN;
  END IF;

  -- 2) Extraer partidos jugados si existen en metadata
  BEGIN
    v_partidos := COALESCE(
      (v_part.metadata->>'partidos')::int,
      (v_part.metadata->>'partidos_jugados')::int,
      (v_part.metadata->>'partidos_perdidos')::int + (v_part.metadata->>'partidos_ganados')::int,
      0
    );
  EXCEPTION WHEN OTHERS THEN
    v_partidos := 0;
  END;

  -- 3) Comprobar participación real comprobada:
  -- La evidencia de juego real no exige ganar ni sumar puntos deportivos.
  -- Una derrota, 0 puntos deportivos y 0 games ganados es 100% elegible si jugó el evento.
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

  -- 4) Modalidad soportada por Rewards
  v_mod := public.rewards_modalidad(v_part.tipo_evento::text, v_part.evento_id);
  IF v_mod IS NULL THEN
    RETURN;
  END IF;

  -- 5) Club anfitrión del evento (prioridad al organizador donde se jugó)
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

  -- 7) Buscar campaña activa para este club, modalidad y ventana de acumulación
  SELECT * INTO v_campaign
  FROM public.rewards_campaigns c
  WHERE c.organizador_id = v_org
    AND c.estado = 'activa'
    AND v_mod = ANY (c.modalidades)
    AND v_closed >= c.acumula_desde
    AND v_closed < c.acumula_hasta
  ORDER BY c.created_at DESC
  LIMIT 1;

  -- 8) Verificar si la participación usó un beneficio de canje (ej. reta gratuita)
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

  -- 9) Si no hay campaña activa configurada, queda registrada como pendiente
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

  -- 10) Campaña activa encontrada: Acreditación automática sin aprobación manual
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
    -- Si no devolvió ID (por ejemplo porque estaba rechazada), no encolar
    RETURN;
  END IF;

  v_key := v_org::text || ':' || v_part.jugador_id::text || ':' || v_part.tipo_evento::text || ':' || v_part.evento_id::text;

  INSERT INTO public.rewards_accrual_queue (
    organizador_id, review_id, campaign_id, participacion_id, jugador_id,
    tipo_evento, evento_id, idempotency_key, validation_source
  )
  VALUES (
    v_org, v_review_id, v_campaign.id, v_part.id, v_part.jugador_id,
    v_part.tipo_evento::text, v_part.evento_id, v_key, 'automatic'
  )
  ON CONFLICT (idempotency_key) DO UPDATE
  SET campaign_id = EXCLUDED.campaign_id,
      review_id = EXCLUDED.review_id
  WHERE rewards_accrual_queue.estado NOT IN ('acreditada', 'omitida')
  RETURNING id INTO v_queue_id;

  IF v_queue_id IS NULL THEN
    SELECT id INTO v_queue_id
    FROM public.rewards_accrual_queue
    WHERE idempotency_key = v_key;
  END IF;

  -- 11) Ejecutar acreditación inmediata del lote
  IF v_queue_id IS NOT NULL THEN
    BEGIN
      PERFORM public.rewards_accrue_one(v_queue_id);
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.rewards_accrual_queue
      SET estado = 'error',
          attempts = attempts + 1,
          last_error = SQLERRM
      WHERE id = v_queue_id
        AND estado NOT IN ('acreditada', 'omitida');
    END;
  END IF;
END;
$$;

-- ── 3.1 Trigger con registro durable de fallos de encolamiento ──────────────

CREATE OR REPLACE FUNCTION public.rewards_on_participacion_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  BEGIN
    PERFORM public.rewards_enqueue_candidate(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.rewards_enqueue_failures (participacion_id, error, created_at)
      VALUES (NEW.id, SQLERRM, now())
      ON CONFLICT (participacion_id) DO UPDATE
      SET error = EXCLUDED.error,
          created_at = now(),
          attempts = public.rewards_enqueue_failures.attempts + 1,
          resolved_at = NULL;
    EXCEPTION WHEN OTHERS THEN
      NULL;
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

-- ── 4. Actualización de rewards_sync_candidates con host club ─────────────────

CREATE OR REPLACE FUNCTION public.rewards_sync_candidates(p_organizador_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_count integer := 0;
  v_desde timestamptz;
BEGIN
  PERFORM public.rewards_assert_club_admin(p_organizador_id);
  SELECT MIN(c.acumula_desde) INTO v_desde
  FROM public.rewards_campaigns c
  WHERE c.organizador_id = p_organizador_id
    AND c.estado IN ('programada', 'activa', 'pausada');
  IF v_desde IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_id IN
    SELECT jp.id
    FROM public.jugador_participaciones jp
    LEFT JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
    WHERE COALESCE(
      NULLIF(trim(jp.metadata->>'organizador_id'), '')::uuid,
      public.riviera_participacion_expected_host_org(jp.tipo_evento::text, jp.evento_id::text),
      rj.organizador_id
    ) = p_organizador_id
      AND COALESCE(jp.created_at, jp.fecha::timestamptz) >= v_desde
      AND jp.tipo_evento::text IN ('reta', 'americano', 'duelo_2v2')
      AND NOT EXISTS (
        SELECT 1 FROM public.rewards_participation_reviews r
        WHERE r.participacion_id = jp.id
          AND r.estado = 'aprobada'
      )
  LOOP
    PERFORM public.rewards_enqueue_candidate(v_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- ── 4.1 Reintentos durables y reconciliación sin navegador en servidor ────────

CREATE OR REPLACE FUNCTION public.rewards_retry_accruals(p_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rec record;
  v_done integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Sin permiso para reintentar la cola global';
  END IF;
  IF auth.uid() IS NULL
     AND session_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
    RAISE EXCEPTION 'Sin permiso para reintentar la cola global';
  END IF;

  -- A. Cerrar campañas vencidas
  FOR v_rec IN
    SELECT DISTINCT l.organizador_id
    FROM public.rewards_lots l
    JOIN public.rewards_campaigns c ON c.id = l.campaign_id
    WHERE c.canje_hasta <= now()
      AND l.puntos_restantes > 0
      AND NOT l.anulado
  LOOP
    PERFORM public.rewards_close_campaigns(v_rec.organizador_id);
  END LOOP;

  -- B. Reintentar fallos tempranos durables (rewards_enqueue_failures)
  FOR v_rec IN
    SELECT ef.participacion_id
    FROM public.rewards_enqueue_failures ef
    WHERE ef.resolved_at IS NULL
      AND ef.attempts < 20
    ORDER BY ef.created_at ASC
    LIMIT 20
  LOOP
    BEGIN
      PERFORM public.rewards_enqueue_candidate(v_rec.participacion_id);
      UPDATE public.rewards_enqueue_failures
      SET resolved_at = now()
      WHERE participacion_id = v_rec.participacion_id;
      v_done := v_done + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.rewards_enqueue_failures
      SET error = SQLERRM, attempts = attempts + 1
      WHERE participacion_id = v_rec.participacion_id;
    END;
  END LOOP;

  -- C. Reconciliación automática de participaciones de campañas activas sin review ni lote
  FOR v_rec IN
    SELECT jp.id
    FROM public.jugador_participaciones jp
    JOIN public.rewards_campaigns c ON c.organizador_id = COALESCE(
      NULLIF(trim(jp.metadata->>'organizador_id'), '')::uuid,
      public.riviera_participacion_expected_host_org(jp.tipo_evento::text, jp.evento_id::text)
    )
    WHERE c.estado = 'activa'
      AND COALESCE(jp.created_at, jp.fecha::timestamptz, now()) >= c.acumula_desde
      AND COALESCE(jp.created_at, jp.fecha::timestamptz, now()) < c.acumula_hasta
      AND jp.tipo_evento::text IN ('reta', 'americano', 'duelo_2v2')
      AND NOT EXISTS (
        SELECT 1 FROM public.rewards_participation_reviews r
        WHERE r.participacion_id = jp.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.rewards_lots l
        WHERE l.participacion_id = jp.id
      )
    ORDER BY jp.created_at ASC
    LIMIT 20
  LOOP
    BEGIN
      PERFORM public.rewards_enqueue_candidate(v_rec.id);
      v_done := v_done + 1;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  -- D. Reintentar cola de acreditación en 'pendiente' o 'error'
  FOR v_rec IN
    SELECT q.id
    FROM public.rewards_accrual_queue q
    WHERE q.estado = 'pendiente'
       OR (q.estado = 'error' AND q.attempts < 20)
    ORDER BY q.created_at
    LIMIT GREATEST(COALESCE(p_limit, 100), 1)
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      PERFORM public.rewards_accrue_one(v_rec.id);
      v_done := v_done + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.rewards_accrual_queue
      SET estado = 'error', attempts = attempts + 1, last_error = SQLERRM
      WHERE id = v_rec.id;
    END;
  END LOOP;

  RETURN v_done;
END;
$$;

-- Asegurar programación en pg_cron si está disponible (sin fallar si cron.job no existe)
DO $$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE '
      DO $inner$
      DECLARE
        v_jobid bigint;
      BEGIN
        SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = ''rewards-retry-accruals'';
        IF v_jobid IS NOT NULL THEN
          PERFORM cron.unschedule(v_jobid);
        END IF;
        PERFORM cron.schedule(
          ''rewards-retry-accruals'',
          ''* * * * *'',
          ''SELECT public.rewards_retry_accruals(100)''
        );
      END $inner$;
    ';
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

-- ── 5. Función de recuperación idempotente y acotada ─────────────────────────

CREATE OR REPLACE FUNCTION public.rewards_recover_participaciones(
  p_organizador_id uuid DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL,
  p_evento_id uuid DEFAULT NULL,
  p_participacion_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rec record;
  v_recovered_queue int := 0;
  v_recovered_pending int := 0;
  v_recovered_missing int := 0;
  v_errors int := 0;
BEGIN
  -- Aislamiento de permisos: club admin solo puede su club; NULL solo master admin o service_role
  IF p_organizador_id IS NOT NULL THEN
    PERFORM public.rewards_assert_club_admin(p_organizador_id);
  ELSE
    IF auth.uid() IS NOT NULL AND NOT public.is_master_admin() THEN
      RAISE EXCEPTION 'Sin permiso para recuperación global de todos los clubes';
    END IF;
    IF auth.uid() IS NULL AND session_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
      RAISE EXCEPTION 'Sin permiso para recuperación global de todos los clubes';
    END IF;
  END IF;

  -- A. Reintentar las acreditaciones que quedaron en 'error' en rewards_accrual_queue
  FOR v_rec IN
    SELECT q.id, q.organizador_id
    FROM public.rewards_accrual_queue q
    WHERE (p_organizador_id IS NULL OR q.organizador_id = p_organizador_id)
      AND (p_campaign_id IS NULL OR q.campaign_id = p_campaign_id)
      AND (p_evento_id IS NULL OR q.evento_id = p_evento_id)
      AND (p_participacion_ids IS NULL OR q.participacion_id = ANY(p_participacion_ids))
      AND q.estado = 'error'
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      PERFORM public.rewards_accrue_one(v_rec.id);
      v_recovered_queue := v_recovered_queue + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  -- B. Procesar participaciones en rewards_participation_reviews que quedaron en 'pendiente'
  FOR v_rec IN
    SELECT r.participacion_id
    FROM public.rewards_participation_reviews r
    WHERE (p_organizador_id IS NULL OR r.organizador_id = p_organizador_id)
      AND (p_campaign_id IS NULL OR r.campaign_id = p_campaign_id)
      AND (p_evento_id IS NULL OR r.evento_id = p_evento_id)
      AND (p_participacion_ids IS NULL OR r.participacion_id = ANY(p_participacion_ids))
      AND r.estado = 'pendiente'
  LOOP
    BEGIN
      PERFORM public.rewards_enqueue_candidate(v_rec.participacion_id);
      v_recovered_pending := v_recovered_pending + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  -- C. Encontrar participaciones reales en jugador_participaciones que no estaban en reviews
  -- o fueron asignadas al organizador incorrecto, restringidas estrictamente a campañas activas.
  FOR v_rec IN
    SELECT jp.id
    FROM public.jugador_participaciones jp
    JOIN public.rewards_campaigns c ON c.organizador_id = COALESCE(
      NULLIF(trim(jp.metadata->>'organizador_id'), '')::uuid,
      public.riviera_participacion_expected_host_org(jp.tipo_evento::text, jp.evento_id::text)
    )
    WHERE (p_organizador_id IS NULL OR c.organizador_id = p_organizador_id)
      AND (p_campaign_id IS NULL OR c.id = p_campaign_id)
      AND (p_evento_id IS NULL OR jp.evento_id = p_evento_id)
      AND (p_participacion_ids IS NULL OR jp.id = ANY(p_participacion_ids))
      AND c.estado = 'activa'
      AND COALESCE(jp.created_at, jp.fecha::timestamptz, now()) >= c.acumula_desde
      AND COALESCE(jp.created_at, jp.fecha::timestamptz, now()) < c.acumula_hasta
      AND jp.tipo_evento::text IN ('reta', 'americano', 'duelo_2v2')
      AND NOT EXISTS (
        SELECT 1 FROM public.rewards_participation_reviews r
        WHERE r.participacion_id = jp.id
          AND r.estado IN ('aprobada', 'rechazada')
      )
  LOOP
    BEGIN
      PERFORM public.rewards_enqueue_candidate(v_rec.id);
      v_recovered_missing := v_recovered_missing + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'recovered_queue_errors', v_recovered_queue,
    'recovered_pending_reviews', v_recovered_pending,
    'recovered_missing_participations', v_recovered_missing,
    'errors', v_errors
  );
END;
$$;

-- ── 6. Listado completo de jugadores del club para Rewards ───────────────────

CREATE OR REPLACE FUNCTION public.rewards_list_players(p_organizador_id uuid)
RETURNS TABLE (
  id uuid,
  nombre text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Aislamiento por club
  PERFORM public.rewards_assert_club_admin(p_organizador_id);

  RETURN QUERY
  SELECT DISTINCT rj.id, rj.nombre
  FROM public.riviera_jugadores rj
  WHERE rj.organizador_id = p_organizador_id
     OR EXISTS (
       SELECT 1 FROM public.rewards_participation_reviews r
       WHERE r.organizador_id = p_organizador_id
         AND r.jugador_id = rj.id
     )
     OR EXISTS (
       SELECT 1 FROM public.rewards_lots l
       WHERE l.organizador_id = p_organizador_id
         AND l.jugador_id = rj.id
     )
     OR EXISTS (
       SELECT 1 FROM public.jugador_participaciones jp
       WHERE (
         NULLIF(trim(jp.metadata->>'organizador_id'), '')::uuid = p_organizador_id
         OR public.riviera_participacion_expected_host_org(jp.tipo_evento::text, jp.evento_id::text) = p_organizador_id
       )
       AND jp.jugador_id = rj.id
     )
  ORDER BY rj.nombre ASC;
END;
$$;

-- ── 7. Listado administrativo paginado de jugadores con puntos ────────────────

CREATE OR REPLACE FUNCTION public.rewards_admin_players_list(
  p_organizador_id uuid,
  p_campaign_id uuid DEFAULT NULL,
  p_query text DEFAULT NULL,
  p_sort_by text DEFAULT 'acumulado',
  p_sort_dir text DEFAULT 'desc',
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_page int := GREATEST(COALESCE(p_page, 1), 1);
  v_limit int := GREATEST(COALESCE(p_page_size, 25), 1);
  v_offset int := (v_page - 1) * v_limit;
  v_query text := NULLIF(trim(p_query), '');
  v_total int := 0;
  v_players jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.rewards_assert_club_admin(p_organizador_id);

  WITH player_campaign_stats AS (
    SELECT 
      l.jugador_id,
      c.id AS campaign_id,
      c.nombre AS campaign_nombre,
      CASE 
        WHEN now() < c.acumula_hasta THEN 'acumulacion'
        WHEN now() >= c.canje_desde AND now() < c.canje_hasta THEN 'canje'
        ELSE 'cerrada'
      END AS campaign_fase,
      c.canje_desde,
      c.canje_hasta,
      SUM(l.puntos_originales)::int AS puntos_acumulados,
      SUM(l.puntos_restantes)::int AS puntos_restantes,
      COALESCE((
        SELECT SUM(r.costo_puntos)::int
        FROM public.rewards_redemptions r
        WHERE r.organizador_id = p_organizador_id
          AND r.jugador_id = l.jugador_id
          AND r.campaign_id = c.id
          AND r.estado = 'reservado'
      ), 0) AS puntos_reservados,
      COUNT(DISTINCT l.participacion_id)::int AS participaciones_count,
      MAX(l.earned_at) AS ultima_participacion
    FROM public.rewards_lots l
    JOIN public.rewards_campaigns c ON c.id = l.campaign_id
    WHERE l.organizador_id = p_organizador_id
      AND NOT l.anulado
      AND (p_campaign_id IS NULL OR c.id = p_campaign_id)
    GROUP BY l.jugador_id, c.id, c.nombre, c.acumula_hasta, c.canje_desde, c.canje_hasta
  ),
  aggregated_players AS (
    SELECT 
      pcs.jugador_id,
      rj.nombre AS jugador_nombre,
      COALESCE(
        NULLIF(trim(rj.categoria), ''),
        ''
      ) AS codigo_riviera,
      (ARRAY_AGG(pcs.campaign_id ORDER BY (pcs.campaign_fase IN ('canje', 'acumulacion')) DESC, pcs.puntos_acumulados DESC))[1] AS primary_campaign_id,
      (ARRAY_AGG(pcs.campaign_nombre ORDER BY (pcs.campaign_fase IN ('canje', 'acumulacion')) DESC, pcs.puntos_acumulados DESC))[1] AS primary_campaign_nombre,
      (ARRAY_AGG(pcs.campaign_fase ORDER BY (pcs.campaign_fase IN ('canje', 'acumulacion')) DESC, pcs.puntos_acumulados DESC))[1] AS primary_campaign_fase,
      (ARRAY_AGG(pcs.canje_desde ORDER BY (pcs.campaign_fase IN ('canje', 'acumulacion')) DESC, pcs.puntos_acumulados DESC))[1] AS primary_canje_desde,
      (ARRAY_AGG(pcs.canje_hasta ORDER BY (pcs.campaign_fase IN ('canje', 'acumulacion')) DESC, pcs.puntos_acumulados DESC))[1] AS primary_canje_hasta,
      SUM(pcs.puntos_acumulados)::int AS total_acumulado,
      SUM(GREATEST(pcs.puntos_restantes - pcs.puntos_reservados, 0))::int AS total_disponible,
      SUM(pcs.puntos_reservados)::int AS total_reservado,
      SUM(pcs.participaciones_count)::int AS total_participaciones,
      MAX(pcs.ultima_participacion) AS ultima_participacion,
      jsonb_agg(jsonb_build_object(
        'campaign_id', pcs.campaign_id,
        'campaign_nombre', pcs.campaign_nombre,
        'fase', pcs.campaign_fase,
        'puntos_acumulados', pcs.puntos_acumulados,
        'puntos_disponibles', GREATEST(pcs.puntos_restantes - pcs.puntos_reservados, 0),
        'puntos_reservados', pcs.puntos_reservados,
        'participaciones_count', pcs.participaciones_count,
        'ultima_participacion', pcs.ultima_participacion,
        'canje_desde', pcs.canje_desde,
        'canje_hasta', pcs.canje_hasta
      ) ORDER BY pcs.puntos_acumulados DESC) AS campanas_detalle
    FROM player_campaign_stats pcs
    JOIN public.riviera_jugadores rj ON rj.id = pcs.jugador_id
    WHERE (pcs.puntos_acumulados > 0 OR pcs.puntos_restantes > 0)
      AND (
        v_query IS NULL 
        OR rj.nombre ILIKE '%' || v_query || '%'
        OR COALESCE(rj.categoria, '') ILIKE '%' || v_query || '%'
      )
    GROUP BY pcs.jugador_id, rj.nombre, rj.categoria
  ),
  counted AS (
    SELECT COUNT(*)::int AS cnt FROM aggregated_players
  ),
  sorted_players AS (
    SELECT ap.*
    FROM aggregated_players ap
    ORDER BY
      CASE WHEN p_sort_by = 'acumulado' AND p_sort_dir = 'asc' THEN ap.total_acumulado END ASC,
      CASE WHEN p_sort_by = 'acumulado' AND (p_sort_dir = 'desc' OR p_sort_dir IS NULL) THEN ap.total_acumulado END DESC,
      CASE WHEN p_sort_by = 'disponible' AND p_sort_dir = 'asc' THEN ap.total_disponible END ASC,
      CASE WHEN p_sort_by = 'disponible' AND (p_sort_dir = 'desc' OR p_sort_dir IS NULL) THEN ap.total_disponible END DESC,
      CASE WHEN p_sort_by = 'nombre' AND p_sort_dir = 'desc' THEN ap.jugador_nombre END DESC,
      CASE WHEN p_sort_by = 'nombre' AND (p_sort_dir = 'asc' OR p_sort_dir IS NULL) THEN ap.jugador_nombre END ASC,
      CASE WHEN p_sort_by = 'reciente' AND p_sort_dir = 'asc' THEN ap.ultima_participacion END ASC,
      CASE WHEN p_sort_by = 'reciente' AND (p_sort_dir = 'desc' OR p_sort_dir IS NULL) THEN ap.ultima_participacion END DESC,
      ap.total_acumulado DESC,
      ap.jugador_nombre ASC
    LIMIT v_limit
    OFFSET v_offset
  )
  SELECT 
    COALESCE((SELECT cnt FROM counted), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'jugador_id', sp.jugador_id,
      'nombre', sp.jugador_nombre,
      'codigo_riviera', sp.codigo_riviera,
      'campaign_id', sp.primary_campaign_id,
      'campaign_nombre', sp.primary_campaign_nombre,
      'campaign_fase', sp.primary_campaign_fase,
      'canje_desde', sp.primary_canje_desde,
      'canje_hasta', sp.primary_canje_hasta,
      'puntos_acumulados', sp.total_acumulado,
      'puntos_disponibles', sp.total_disponible,
      'puntos_reservados', sp.total_reservado,
      'participaciones_acreditadas', sp.total_participaciones,
      'ultima_participacion', sp.ultima_participacion,
      'campanas', sp.campanas_detalle
    )), '[]'::jsonb)
  INTO v_total, v_players
  FROM sorted_players sp;

  RETURN jsonb_build_object(
    'total_count', v_total,
    'page', v_page,
    'page_size', v_limit,
    'total_pages', CEIL(v_total::numeric / GREATEST(v_limit, 1)::numeric)::int,
    'players', v_players
  );
END;
$$;

-- ── 8. Listado de incidencias y participaciones pendientes ─────────────────────

CREATE OR REPLACE FUNCTION public.rewards_admin_incidents_list(
  p_organizador_id uuid,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_page int := GREATEST(COALESCE(p_page, 1), 1);
  v_limit int := GREATEST(COALESCE(p_page_size, 50), 1);
  v_offset int := (v_page - 1) * v_limit;
  v_total int := 0;
  v_error_count int := 0;
  v_pending_count int := 0;
  v_incidents jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.rewards_assert_club_admin(p_organizador_id);

  WITH raw_incidents AS (
    SELECT 
      q.id AS incident_id,
      'acreditacion_error' AS tipo_incidencia,
      q.participacion_id,
      q.jugador_id,
      q.tipo_evento,
      q.evento_id,
      q.campaign_id,
      c.nombre AS campaign_nombre,
      c.puntos_por_participacion AS puntos_esperados,
      q.last_error AS error_mensaje,
      q.attempts,
      q.created_at
    FROM public.rewards_accrual_queue q
    LEFT JOIN public.rewards_campaigns c ON c.id = q.campaign_id
    WHERE q.organizador_id = p_organizador_id
      AND q.estado = 'error'

    UNION ALL

    SELECT 
      r.id AS incident_id,
      'revision_pendiente' AS tipo_incidencia,
      r.participacion_id,
      r.jugador_id,
      r.tipo_evento,
      r.evento_id,
      r.campaign_id,
      c.nombre AS campaign_nombre,
      COALESCE(c.puntos_por_participacion, 10) AS puntos_esperados,
      COALESCE(r.motivo, 'Participación en revisión / pendiente de acreditación automática') AS error_mensaje,
      1 AS attempts,
      r.created_at
    FROM public.rewards_participation_reviews r
    LEFT JOIN public.rewards_campaigns c ON c.id = r.campaign_id
    WHERE r.organizador_id = p_organizador_id
      AND r.estado = 'pendiente'
      AND NOT EXISTS (
        SELECT 1 FROM public.rewards_accrual_queue q
        WHERE q.participacion_id = r.participacion_id
          AND q.organizador_id = p_organizador_id
          AND q.estado = 'error'
      )

    UNION ALL

    SELECT 
      ef.id AS incident_id,
      'fallo_inicial' AS tipo_incidencia,
      ef.participacion_id,
      jp.jugador_id,
      jp.tipo_evento::text,
      jp.evento_id,
      NULL::uuid AS campaign_id,
      'Sin asignar' AS campaign_nombre,
      10 AS puntos_esperados,
      ef.error AS error_mensaje,
      ef.attempts,
      ef.created_at
    FROM public.rewards_enqueue_failures ef
    JOIN public.jugador_participaciones jp ON jp.id = ef.participacion_id
    WHERE ef.resolved_at IS NULL
      AND COALESCE(
        NULLIF(trim(jp.metadata->>'organizador_id'), '')::uuid,
        public.riviera_participacion_expected_host_org(jp.tipo_evento::text, jp.evento_id::text)
      ) = p_organizador_id
      AND NOT EXISTS (
        SELECT 1 FROM public.rewards_accrual_queue q WHERE q.participacion_id = ef.participacion_id
      )
  ),
  enriched AS (
    SELECT 
      ri.*,
      rj.nombre AS jugador_nombre,
      COALESCE(rj.categoria, '') AS codigo_riviera
    FROM raw_incidents ri
    LEFT JOIN public.riviera_jugadores rj ON rj.id = ri.jugador_id
  ),
  counts AS (
    SELECT 
      COUNT(*)::int AS total_cnt,
      COUNT(*) FILTER (WHERE tipo_incidencia IN ('acreditacion_error', 'fallo_inicial'))::int AS err_cnt,
      COUNT(*) FILTER (WHERE tipo_incidencia = 'revision_pendiente')::int AS pend_cnt
    FROM enriched
  ),
  paged AS (
    SELECT * FROM enriched
    ORDER BY created_at DESC
    LIMIT v_limit OFFSET v_offset
  )
  SELECT 
    COALESCE((SELECT total_cnt FROM counts), 0),
    COALESCE((SELECT err_cnt FROM counts), 0),
    COALESCE((SELECT pend_cnt FROM counts), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.incident_id,
      'tipo_incidencia', p.tipo_incidencia,
      'participacion_id', p.participacion_id,
      'jugador_id', p.jugador_id,
      'jugador_nombre', p.jugador_nombre,
      'codigo_riviera', p.codigo_riviera,
      'tipo_evento', p.tipo_evento,
      'evento_id', p.evento_id,
      'campaign_id', p.campaign_id,
      'campaign_nombre', p.campaign_nombre,
      'puntos_esperados', p.puntos_esperados,
      'error_mensaje', p.error_mensaje,
      'attempts', p.attempts,
      'created_at', p.created_at
    )), '[]'::jsonb)
  INTO v_total, v_error_count, v_pending_count, v_incidents
  FROM paged p;

  RETURN jsonb_build_object(
    'total_count', v_total,
    'error_count', v_error_count,
    'pending_count', v_pending_count,
    'page', v_page,
    'page_size', v_limit,
    'total_pages', CEIL(v_total::numeric / GREATEST(v_limit, 1)::numeric)::int,
    'incidents', v_incidents
  );
END;
$$;

-- ── 9. Resumen público de solo lectura para la ficha del jugador ─────────────

CREATE OR REPLACE FUNCTION public.rewards_player_public_summary(
  p_jugador_id uuid,
  p_organizador_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_res jsonb;
BEGIN
  WITH target_players AS (
    SELECT DISTINCT p_jugador_id AS id
    UNION
    SELECT DISTINCT l.jugador_id AS id
    FROM public.rewards_player_links l
    WHERE public.rewards_same_player(l.jugador_id, p_jugador_id)
  ),
  player_lots AS (
    SELECT 
      l.organizador_id,
      l.campaign_id,
      SUM(l.puntos_originales)::int AS acumulados,
      SUM(l.puntos_restantes)::int AS restantes,
      COUNT(DISTINCT l.participacion_id)::int AS part_count,
      MAX(l.earned_at) AS last_earned
    FROM public.rewards_lots l
    JOIN target_players tp ON tp.id = l.jugador_id
    WHERE NOT l.anulado
      AND (p_organizador_id IS NULL OR l.organizador_id = p_organizador_id)
    GROUP BY l.organizador_id, l.campaign_id
  ),
  active_camps AS (
    SELECT 
      c.id AS campaign_id,
      c.organizador_id,
      c.nombre AS campaign_nombre,
      c.acumula_desde,
      c.acumula_hasta,
      c.canje_desde,
      c.canje_hasta,
      c.visible_jugadores,
      CASE 
        WHEN now() < c.acumula_hasta THEN 'acumulacion'
        WHEN now() >= c.canje_desde AND now() < c.canje_hasta THEN 'canje'
        ELSE 'cerrada'
      END AS fase,
      COALESCE(pl.acumulados, 0) AS puntos_acumulados,
      COALESCE(pl.restantes, 0) AS puntos_restantes,
      COALESCE((
        SELECT SUM(r.costo_puntos)::int
        FROM public.rewards_redemptions r
        JOIN target_players tp ON tp.id = r.jugador_id
        WHERE r.organizador_id = c.organizador_id
          AND r.campaign_id = c.id
          AND r.estado = 'reservado'
      ), 0) AS puntos_reservados,
      COALESCE(pl.part_count, 0) AS participaciones_count,
      pl.last_earned
    FROM public.rewards_campaigns c
    LEFT JOIN player_lots pl ON pl.campaign_id = c.id AND pl.organizador_id = c.organizador_id
    WHERE (p_organizador_id IS NULL OR c.organizador_id = p_organizador_id)
      AND c.estado IN ('activa', 'programada', 'pausada')
      AND (c.visible_jugadores OR COALESCE(pl.acumulados, 0) > 0)
      AND (
        COALESCE(pl.acumulados, 0) > 0 
        OR c.organizador_id = p_organizador_id
      )
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'organizador_id', ac.organizador_id,
    'campaign_id', ac.campaign_id,
    'campaign_nombre', ac.campaign_nombre,
    'fase', ac.fase,
    'puntos_acumulados', ac.puntos_acumulados,
    'puntos_disponibles', GREATEST(ac.puntos_restantes - ac.puntos_reservados, 0),
    'puntos_reservados', ac.puntos_reservados,
    'participaciones_count', ac.participaciones_count,
    'acumula_desde', ac.acumula_desde,
    'acumula_hasta', ac.acumula_hasta,
    'canje_desde', ac.canje_desde,
    'canje_hasta', ac.canje_hasta,
    'is_canje_open', (now() >= ac.canje_desde AND now() < ac.canje_hasta)
  ) ORDER BY (ac.organizador_id = p_organizador_id) DESC, ac.puntos_acumulados DESC), '[]'::jsonb)
  INTO v_res
  FROM active_camps ac;

  RETURN v_res;
END;
$$;

-- ── 10. Permisos de funciones ────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.rewards_recover_participaciones(uuid, uuid, uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rewards_recover_participaciones(uuid, uuid, uuid, uuid[]) TO authenticated;

REVOKE ALL ON FUNCTION public.rewards_list_players(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rewards_list_players(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.rewards_admin_players_list(uuid, uuid, text, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rewards_admin_players_list(uuid, uuid, text, text, text, integer, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.rewards_admin_incidents_list(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rewards_admin_incidents_list(uuid, integer, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.rewards_player_public_summary(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rewards_player_public_summary(uuid, uuid) TO anon, authenticated;

COMMIT;
