-- Riviera Rewards, fase 1.
-- Campañas mensuales: los puntos pertenecen a la campaña que los generó
-- y solo se canjean en la ventana de esa campaña.
-- No hay vigencia individual por participación.
-- No se aplica en producción hasta autorización explícita.
-- No escribe ranking, rating, participaciones deportivas ni resultados.

-- ── Tablas ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rewards_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizador_id uuid NOT NULL,
  nombre text NOT NULL,
  descripcion text,
  timezone text NOT NULL DEFAULT 'America/Mexico_City',
  acumula_desde timestamptz NOT NULL,
  acumula_hasta timestamptz NOT NULL,
  canje_desde timestamptz NOT NULL,
  canje_hasta timestamptz NOT NULL,
  puntos_por_participacion integer NOT NULL,
  modalidades text[] NOT NULL,
  origen_campaign_id uuid,
  estado text NOT NULL DEFAULT 'borrador',
  visible_jugadores boolean NOT NULL DEFAULT false,
  condiciones text,
  validation_mode text NOT NULL DEFAULT 'admin',
  reserva_dias integer NOT NULL DEFAULT 7,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rewards_campaigns_puntos_chk CHECK (puntos_por_participacion > 0),
  CONSTRAINT rewards_campaigns_reserva_chk CHECK (reserva_dias > 0),
  CONSTRAINT rewards_campaigns_estado_chk CHECK (
    estado IN ('borrador', 'programada', 'activa', 'pausada', 'finalizada')
  ),
  CONSTRAINT rewards_campaigns_validation_chk CHECK (validation_mode IN ('admin', 'payment')),
  CONSTRAINT rewards_campaigns_acumula_chk CHECK (acumula_desde < acumula_hasta),
  CONSTRAINT rewards_campaigns_canje_chk CHECK (canje_desde < canje_hasta),
  CONSTRAINT rewards_campaigns_origen_fk FOREIGN KEY (origen_campaign_id)
    REFERENCES public.rewards_campaigns (id)
);

CREATE TABLE IF NOT EXISTS public.rewards_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.rewards_campaigns (id),
  organizador_id uuid NOT NULL,
  nombre text NOT NULL,
  descripcion text,
  imagen_url text,
  costo_puntos integer NOT NULL,
  tipo text NOT NULL,
  cantidad integer,
  inventario integer,
  inventario_restante integer,
  limite_por_jugador integer,
  disponible_desde timestamptz,
  disponible_hasta timestamptz,
  condiciones text,
  estado text NOT NULL DEFAULT 'borrador',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rewards_rewards_costo_chk CHECK (costo_puntos > 0),
  CONSTRAINT rewards_rewards_tipo_chk CHECK (
    tipo IN (
      'reta_gratis',
      'descuento_fijo',
      'descuento_porcentaje',
      'clase_grupal',
      'producto',
      'paquete',
      'personalizado'
    )
  ),
  CONSTRAINT rewards_rewards_estado_chk CHECK (
    estado IN ('borrador', 'activo', 'pausado', 'retirado')
  ),
  CONSTRAINT rewards_rewards_inventario_chk CHECK (
    inventario IS NULL OR inventario >= 0
  )
);

CREATE TABLE IF NOT EXISTS public.rewards_participation_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizador_id uuid NOT NULL,
  participacion_id uuid NOT NULL,
  jugador_id uuid NOT NULL,
  tipo_evento text NOT NULL,
  evento_id uuid NOT NULL,
  modalidad text NOT NULL,
  closed_at timestamptz NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente',
  campaign_id uuid REFERENCES public.rewards_campaigns (id),
  validation_source text,
  motivo text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rewards_reviews_estado_chk CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
  CONSTRAINT rewards_reviews_source_chk CHECK (
    validation_source IS NULL OR validation_source IN ('admin', 'payment')
  ),
  CONSTRAINT rewards_reviews_participacion_uidx UNIQUE (participacion_id)
);

CREATE TABLE IF NOT EXISTS public.rewards_accrual_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizador_id uuid NOT NULL,
  review_id uuid NOT NULL REFERENCES public.rewards_participation_reviews (id),
  campaign_id uuid NOT NULL REFERENCES public.rewards_campaigns (id),
  participacion_id uuid NOT NULL,
  jugador_id uuid NOT NULL,
  tipo_evento text NOT NULL,
  evento_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  validation_source text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT rewards_queue_estado_chk CHECK (
    estado IN ('pendiente', 'acreditada', 'omitida', 'error')
  ),
  CONSTRAINT rewards_queue_key_uidx UNIQUE (idempotency_key),
  CONSTRAINT rewards_queue_review_uidx UNIQUE (review_id)
);

CREATE TABLE IF NOT EXISTS public.rewards_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizador_id uuid NOT NULL,
  campaign_id uuid NOT NULL REFERENCES public.rewards_campaigns (id),
  jugador_id uuid NOT NULL,
  participacion_id uuid NOT NULL,
  queue_id uuid REFERENCES public.rewards_accrual_queue (id),
  tipo_evento text NOT NULL,
  evento_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  puntos_originales integer NOT NULL,
  puntos_restantes integer NOT NULL,
  earned_at timestamptz NOT NULL,
  anulado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rewards_lots_restantes_chk CHECK (
    puntos_restantes >= 0 AND puntos_restantes <= puntos_originales
  ),
  CONSTRAINT rewards_lots_key_uidx UNIQUE (idempotency_key),
  CONSTRAINT rewards_lots_participacion_uidx UNIQUE (campaign_id, participacion_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS rewards_lots_club_event_uidx
  ON public.rewards_lots (organizador_id, jugador_id, tipo_evento, evento_id);

CREATE TABLE IF NOT EXISTS public.rewards_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizador_id uuid NOT NULL,
  jugador_id uuid NOT NULL,
  campaign_id uuid,
  lot_id uuid REFERENCES public.rewards_lots (id),
  redemption_id uuid,
  tipo text NOT NULL,
  puntos integer NOT NULL,
  idempotency_key text NOT NULL,
  motivo text,
  actor_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rewards_ledger_tipo_chk CHECK (
    tipo IN (
      'acreditacion',
      'cierre',
      'reserva',
      'canje',
      'liberacion',
      'reversion',
      'ajuste',
      'compensacion'
    )
  ),
  CONSTRAINT rewards_ledger_key_uidx UNIQUE (idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.rewards_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizador_id uuid NOT NULL,
  campaign_id uuid NOT NULL REFERENCES public.rewards_campaigns (id),
  reward_id uuid NOT NULL REFERENCES public.rewards_rewards (id),
  jugador_id uuid NOT NULL,
  estado text NOT NULL DEFAULT 'solicitado',
  costo_puntos integer NOT NULL,
  snapshot jsonb NOT NULL,
  reserva_hasta timestamptz,
  motivo text,
  requested_by uuid,
  confirmed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rewards_redemptions_estado_chk CHECK (
    estado IN ('solicitado', 'reservado', 'entregado', 'cancelado', 'vencido')
  )
);

ALTER TABLE public.rewards_ledger
  DROP CONSTRAINT IF EXISTS rewards_ledger_redemption_fk;

ALTER TABLE public.rewards_ledger
  ADD CONSTRAINT rewards_ledger_redemption_fk
  FOREIGN KEY (redemption_id) REFERENCES public.rewards_redemptions (id);

CREATE TABLE IF NOT EXISTS public.rewards_lot_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  redemption_id uuid NOT NULL REFERENCES public.rewards_redemptions (id),
  lot_id uuid NOT NULL REFERENCES public.rewards_lots (id),
  puntos integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rewards_holds_puntos_chk CHECK (puntos > 0),
  CONSTRAINT rewards_holds_uidx UNIQUE (redemption_id, lot_id)
);

CREATE TABLE IF NOT EXISTS public.rewards_benefit_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizador_id uuid NOT NULL,
  redemption_id uuid NOT NULL REFERENCES public.rewards_redemptions (id),
  jugador_id uuid NOT NULL,
  tipo_beneficio text NOT NULL,
  evento_id uuid,
  tipo_evento text,
  participacion_id uuid,
  estado text NOT NULL DEFAULT 'pendiente_asignacion',
  assigned_by uuid,
  assigned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rewards_benefit_estado_chk CHECK (
    estado IN ('pendiente_asignacion', 'asignada')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS rewards_benefit_participacion_uidx
  ON public.rewards_benefit_uses (participacion_id)
  WHERE participacion_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS rewards_queue_pending_idx
  ON public.rewards_accrual_queue (organizador_id, estado, created_at);

CREATE TABLE IF NOT EXISTS public.rewards_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizador_id uuid NOT NULL,
  jugador_id uuid NOT NULL,
  campaign_id uuid NOT NULL REFERENCES public.rewards_campaigns (id),
  lot_id uuid NOT NULL REFERENCES public.rewards_lots (id),
  participacion_id uuid,
  puntos_originales integer NOT NULL,
  puntos_pendientes integer NOT NULL,
  motivo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rewards_obligations_puntos_chk CHECK (
    puntos_originales > 0
    AND puntos_pendientes >= 0
    AND puntos_pendientes <= puntos_originales
  ),
  CONSTRAINT rewards_obligations_lot_uidx UNIQUE (lot_id)
);

CREATE TABLE IF NOT EXISTS public.rewards_player_links (
  jugador_id uuid PRIMARY KEY,
  organizador_id uuid NOT NULL,
  auth_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rewards_player_links_auth_uidx UNIQUE (organizador_id, auth_user_id)
);

CREATE INDEX IF NOT EXISTS rewards_lots_campaign_idx
  ON public.rewards_lots (campaign_id, jugador_id, earned_at);

-- ── Autorización ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rewards_assert_club_admin(p_organizador_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sin sesión';
  END IF;
  IF public.is_master_admin() THEN
    RETURN;
  END IF;
  IF p_organizador_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Sin permiso sobre este club';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.rewards_modalidad(
  p_tipo_evento text,
  p_evento_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_format text;
BEGIN
  IF p_tipo_evento = 'americano' THEN
    RETURN 'americano';
  END IF;
  IF p_tipo_evento = 'duelo_2v2' THEN
    RETURN 'duelo_2v2';
  END IF;
  IF p_tipo_evento = 'reta' THEN
    SELECT t.format INTO v_format
    FROM public.tournaments t
    WHERE t.id = p_evento_id;
    IF v_format = 'teams' THEN
      RETURN 'reta_equipos';
    END IF;
    IF v_format = 'round_robin' THEN
      RETURN 'round_robin';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

-- ── Candidatos, sin acreditar ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rewards_enqueue_candidate(p_participacion_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_part public.jugador_participaciones%ROWTYPE;
  v_org uuid;
  v_mod text;
BEGIN
  SELECT * INTO v_part
  FROM public.jugador_participaciones
  WHERE id = p_participacion_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_mod := public.rewards_modalidad(v_part.tipo_evento::text, v_part.evento_id);
  IF v_mod IS NULL THEN
    RETURN;
  END IF;

  SELECT rj.organizador_id INTO v_org
  FROM public.riviera_jugadores rj
  WHERE rj.id = v_part.jugador_id;
  IF v_org IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.rewards_participation_reviews (
    organizador_id,
    participacion_id,
    jugador_id,
    tipo_evento,
    evento_id,
    modalidad,
    closed_at
  )
  VALUES (
    v_org,
    v_part.id,
    v_part.jugador_id,
    v_part.tipo_evento::text,
    v_part.evento_id,
    v_mod,
    COALESCE(v_part.created_at, v_part.fecha::timestamptz)
  )
  ON CONFLICT (participacion_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.rewards_on_participacion_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.rewards_enqueue_candidate(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'rewards candidate enqueue failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rewards_participacion_candidate ON public.jugador_participaciones;
CREATE TRIGGER rewards_participacion_candidate
  AFTER INSERT ON public.jugador_participaciones
  FOR EACH ROW
  EXECUTE FUNCTION public.rewards_on_participacion_insert();

-- ── Campañas y premios ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rewards_save_campaign(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := NULLIF(p_payload->>'id', '')::uuid;
  v_org uuid := (p_payload->>'organizador_id')::uuid;
  v_estado text := COALESCE(p_payload->>'estado', 'borrador');
  v_desde timestamptz := (p_payload->>'acumula_desde')::timestamptz;
  v_hasta timestamptz := (p_payload->>'acumula_hasta')::timestamptz;
  v_mods text[] := ARRAY(SELECT jsonb_array_elements_text(p_payload->'modalidades'));
  v_existing public.rewards_campaigns%ROWTYPE;
  v_conflict uuid;
BEGIN
  PERFORM public.rewards_assert_club_admin(v_org);
  IF v_desde >= v_hasta THEN
    RAISE EXCEPTION 'La ventana de acumulación es inválida';
  END IF;
  IF (p_payload->>'canje_desde')::timestamptz >= (p_payload->>'canje_hasta')::timestamptz THEN
    RAISE EXCEPTION 'La ventana de canje es inválida';
  END IF;
  IF COALESCE(array_length(v_mods, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Elige al menos una modalidad de reta';
  END IF;

  IF v_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.rewards_campaigns WHERE id = v_id;
    IF NOT FOUND OR v_existing.organizador_id IS DISTINCT FROM v_org THEN
      RAISE EXCEPTION 'Campaña no encontrada en este club';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.rewards_lots l WHERE l.campaign_id = v_id
    ) OR EXISTS (
      SELECT 1 FROM public.rewards_redemptions r WHERE r.campaign_id = v_id
    ) THEN
      IF v_existing.acumula_desde IS DISTINCT FROM v_desde
         OR v_existing.acumula_hasta IS DISTINCT FROM v_hasta
         OR v_existing.canje_desde IS DISTINCT FROM (p_payload->>'canje_desde')::timestamptz
         OR v_existing.canje_hasta IS DISTINCT FROM (p_payload->>'canje_hasta')::timestamptz
         OR v_existing.puntos_por_participacion IS DISTINCT FROM (p_payload->>'puntos_por_participacion')::integer
      THEN
        RAISE EXCEPTION 'Esta campaña ya tiene puntos o canjes; no se reescriben sus reglas';
      END IF;
    END IF;
  END IF;

  IF v_estado IN ('programada', 'activa', 'pausada') THEN
    SELECT c.id INTO v_conflict
    FROM public.rewards_campaigns c
    WHERE c.organizador_id = v_org
      AND c.id IS DISTINCT FROM v_id
      AND c.estado IN ('programada', 'activa', 'pausada')
      AND c.acumula_desde < v_hasta
      AND v_desde < c.acumula_hasta
      AND c.modalidades && v_mods
    LIMIT 1;
    IF v_conflict IS NOT NULL THEN
      RAISE EXCEPTION 'Ya hay una campaña de este club que cubre esas modalidades en las mismas fechas';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_timezone_names
    WHERE name = COALESCE(NULLIF(p_payload->>'timezone', ''), 'America/Mexico_City')
  ) THEN
    RAISE EXCEPTION 'Zona horaria inválida';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.rewards_campaigns (
      organizador_id, nombre, descripcion, timezone,
      acumula_desde, acumula_hasta, canje_desde, canje_hasta,
      puntos_por_participacion, modalidades, estado,
      visible_jugadores, condiciones, validation_mode, reserva_dias, created_by
    )
    VALUES (
      v_org,
      p_payload->>'nombre',
      NULLIF(p_payload->>'descripcion', ''),
      COALESCE(NULLIF(p_payload->>'timezone', ''), 'America/Mexico_City'),
      v_desde,
      v_hasta,
      (p_payload->>'canje_desde')::timestamptz,
      (p_payload->>'canje_hasta')::timestamptz,
      (p_payload->>'puntos_por_participacion')::integer,
      v_mods,
      v_estado,
      COALESCE((p_payload->>'visible_jugadores')::boolean, false),
      NULLIF(p_payload->>'condiciones', ''),
      COALESCE(NULLIF(p_payload->>'validation_mode', ''), 'admin'),
      COALESCE((p_payload->>'reserva_dias')::integer, 7),
      auth.uid()
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.rewards_campaigns
    SET nombre = p_payload->>'nombre',
        descripcion = NULLIF(p_payload->>'descripcion', ''),
        timezone = COALESCE(NULLIF(p_payload->>'timezone', ''), timezone),
        acumula_desde = v_desde,
        acumula_hasta = v_hasta,
        canje_desde = (p_payload->>'canje_desde')::timestamptz,
        canje_hasta = (p_payload->>'canje_hasta')::timestamptz,
        puntos_por_participacion = (p_payload->>'puntos_por_participacion')::integer,
        modalidades = v_mods,
        estado = v_estado,
        visible_jugadores = COALESCE((p_payload->>'visible_jugadores')::boolean, false),
        condiciones = NULLIF(p_payload->>'condiciones', ''),
        validation_mode = COALESCE(NULLIF(p_payload->>'validation_mode', ''), 'admin'),
        reserva_dias = COALESCE((p_payload->>'reserva_dias')::integer, 7),
        updated_at = now()
    WHERE id = v_id;
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rewards_save_reward(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := NULLIF(p_payload->>'id', '')::uuid;
  v_campaign public.rewards_campaigns%ROWTYPE;
  v_org uuid;
BEGIN
  SELECT * INTO v_campaign
  FROM public.rewards_campaigns
  WHERE id = (p_payload->>'campaign_id')::uuid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaña no encontrada';
  END IF;
  v_org := v_campaign.organizador_id;
  PERFORM public.rewards_assert_club_admin(v_org);

  IF v_id IS NULL THEN
    INSERT INTO public.rewards_rewards (
      campaign_id, organizador_id, nombre, descripcion, imagen_url,
      costo_puntos, tipo, cantidad, inventario, inventario_restante,
      limite_por_jugador, disponible_desde, disponible_hasta, condiciones, estado
    )
    VALUES (
      v_campaign.id,
      v_org,
      p_payload->>'nombre',
      NULLIF(p_payload->>'descripcion', ''),
      NULLIF(p_payload->>'imagen_url', ''),
      (p_payload->>'costo_puntos')::integer,
      p_payload->>'tipo',
      NULLIF(p_payload->>'cantidad', '')::integer,
      NULLIF(p_payload->>'inventario', '')::integer,
      NULLIF(p_payload->>'inventario', '')::integer,
      NULLIF(p_payload->>'limite_por_jugador', '')::integer,
      NULLIF(p_payload->>'disponible_desde', '')::timestamptz,
      NULLIF(p_payload->>'disponible_hasta', '')::timestamptz,
      NULLIF(p_payload->>'condiciones', ''),
      COALESCE(NULLIF(p_payload->>'estado', ''), 'borrador')
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.rewards_rewards
    SET nombre = p_payload->>'nombre',
        descripcion = NULLIF(p_payload->>'descripcion', ''),
        imagen_url = NULLIF(p_payload->>'imagen_url', ''),
        costo_puntos = (p_payload->>'costo_puntos')::integer,
        tipo = p_payload->>'tipo',
        cantidad = NULLIF(p_payload->>'cantidad', '')::integer,
        inventario_restante = CASE
          WHEN NULLIF(p_payload->>'inventario', '') IS NULL THEN NULL
          WHEN inventario IS NULL THEN NULLIF(p_payload->>'inventario', '')::integer
          ELSE GREATEST(
            0,
            COALESCE(inventario_restante, 0)
              + (NULLIF(p_payload->>'inventario', '')::integer - inventario)
          )
        END,
        inventario = NULLIF(p_payload->>'inventario', '')::integer,
        limite_por_jugador = NULLIF(p_payload->>'limite_por_jugador', '')::integer,
        disponible_desde = NULLIF(p_payload->>'disponible_desde', '')::timestamptz,
        disponible_hasta = NULLIF(p_payload->>'disponible_hasta', '')::timestamptz,
        condiciones = NULLIF(p_payload->>'condiciones', ''),
        estado = COALESCE(NULLIF(p_payload->>'estado', ''), estado),
        updated_at = now()
    WHERE id = v_id
      AND organizador_id = v_org;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Premio no encontrado en este club';
    END IF;
  END IF;
  RETURN v_id;
END;
$$;

-- ── Cola ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rewards_review_participations(
  p_organizador_id uuid,
  p_participacion_ids uuid[],
  p_decision text,
  p_campaign_id uuid,
  p_motivo text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign public.rewards_campaigns%ROWTYPE;
  v_id uuid;
  v_review public.rewards_participation_reviews%ROWTYPE;
  v_count integer := 0;
  v_key text;
  v_queue uuid;
BEGIN
  PERFORM public.rewards_assert_club_admin(p_organizador_id);
  IF p_decision NOT IN ('aprobada', 'rechazada') THEN
    RAISE EXCEPTION 'Decisión inválida';
  END IF;

  IF p_decision = 'aprobada' THEN
    SELECT * INTO v_campaign FROM public.rewards_campaigns WHERE id = p_campaign_id;
    IF NOT FOUND OR v_campaign.organizador_id IS DISTINCT FROM p_organizador_id THEN
      RAISE EXCEPTION 'Campaña no encontrada en este club';
    END IF;
    IF v_campaign.estado <> 'activa' THEN
      RAISE EXCEPTION 'La campaña no está activa';
    END IF;
    IF v_campaign.validation_mode = 'payment' THEN
      RAISE EXCEPTION 'payment_validation_not_available';
    END IF;
  END IF;

  FOREACH v_id IN ARRAY COALESCE(p_participacion_ids, ARRAY[]::uuid[])
  LOOP
    SELECT * INTO v_review
    FROM public.rewards_participation_reviews
    WHERE participacion_id = v_id
      AND organizador_id = p_organizador_id
    FOR UPDATE;
    IF NOT FOUND OR v_review.estado <> 'pendiente' THEN
      CONTINUE;
    END IF;

    IF p_decision = 'rechazada' THEN
      UPDATE public.rewards_participation_reviews
      SET estado = 'rechazada',
          motivo = p_motivo,
          decided_by = auth.uid(),
          decided_at = now()
      WHERE id = v_review.id;
      v_count := v_count + 1;
      CONTINUE;
    END IF;

    IF NOT (v_review.modalidad = ANY (v_campaign.modalidades)) THEN
      CONTINUE;
    END IF;
    IF v_review.closed_at < v_campaign.acumula_desde
       OR v_review.closed_at >= v_campaign.acumula_hasta THEN
      CONTINUE;
    END IF;

    UPDATE public.rewards_participation_reviews
    SET estado = 'aprobada',
        campaign_id = v_campaign.id,
        validation_source = 'admin',
        motivo = p_motivo,
        decided_by = auth.uid(),
        decided_at = now()
    WHERE id = v_review.id;

    v_key := v_review.organizador_id::text || ':' || v_review.jugador_id::text
      || ':' || v_review.tipo_evento || ':' || v_review.evento_id::text;

    INSERT INTO public.rewards_accrual_queue (
      organizador_id, review_id, campaign_id, participacion_id, jugador_id,
      tipo_evento, evento_id, idempotency_key, validation_source
    )
    VALUES (
      v_review.organizador_id, v_review.id, v_campaign.id, v_review.participacion_id,
      v_review.jugador_id, v_review.tipo_evento, v_review.evento_id, v_key, 'admin'
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    SELECT q.id INTO v_queue
    FROM public.rewards_accrual_queue q
    WHERE q.idempotency_key = v_key;

    IF v_queue IS NOT NULL THEN
      BEGIN
        PERFORM public.rewards_accrue_one(v_queue);
      EXCEPTION WHEN OTHERS THEN
        UPDATE public.rewards_accrual_queue
        SET estado = 'error',
            attempts = attempts + 1,
            last_error = SQLERRM
        WHERE id = v_queue
          AND estado NOT IN ('acreditada', 'omitida');
      END;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.rewards_accrue_one(p_queue_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      earned_at
    )
    VALUES (
      v_q.organizador_id, v_c.id, v_q.jugador_id, v_q.participacion_id, v_q.id,
      v_q.tipo_evento, v_q.evento_id, v_q.idempotency_key, v_c.puntos_por_participacion,
      v_c.puntos_por_participacion, v_closed
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

CREATE OR REPLACE FUNCTION public.rewards_compensate_lot(p_lot_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lot public.rewards_lots%ROWTYPE;
  v_obl public.rewards_obligations%ROWTYPE;
  v_left integer;
  v_take integer;
  v_done integer := 0;
BEGIN
  SELECT * INTO v_lot FROM public.rewards_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND OR v_lot.anulado OR v_lot.puntos_restantes <= 0 THEN
    RETURN 0;
  END IF;
  v_left := v_lot.puntos_restantes;
  FOR v_obl IN
    SELECT *
    FROM public.rewards_obligations
    WHERE organizador_id = v_lot.organizador_id
      AND jugador_id = v_lot.jugador_id
      AND puntos_pendientes > 0
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    EXIT WHEN v_left = 0;
    v_take := LEAST(v_obl.puntos_pendientes, v_left);
    UPDATE public.rewards_obligations
    SET puntos_pendientes = puntos_pendientes - v_take
    WHERE id = v_obl.id;
    v_left := v_left - v_take;
    v_done := v_done + v_take;
  END LOOP;
  IF v_done = 0 THEN
    RETURN 0;
  END IF;
  UPDATE public.rewards_lots
  SET puntos_restantes = puntos_restantes - v_done
  WHERE id = v_lot.id;
  INSERT INTO public.rewards_ledger (
    organizador_id, jugador_id, campaign_id, lot_id, tipo, puntos, idempotency_key, motivo
  )
  VALUES (
    v_lot.organizador_id, v_lot.jugador_id, v_lot.campaign_id, v_lot.id,
    'compensacion', -v_done, 'compensacion:' || v_lot.id::text,
    'Compensación de obligación por puntos ya utilizados'
  );
  RETURN v_done;
END;
$$;

CREATE OR REPLACE FUNCTION public.rewards_settle_invalid_lot(
  p_participacion_id uuid,
  p_motivo text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lot public.rewards_lots%ROWTYPE;
  v_canje integer;
BEGIN
  SELECT * INTO v_lot
  FROM public.rewards_lots
  WHERE participacion_id = p_participacion_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_lot.puntos_restantes > 0 THEN
    INSERT INTO public.rewards_ledger (
      organizador_id, jugador_id, campaign_id, lot_id, tipo, puntos, idempotency_key, motivo, actor_id
    )
    VALUES (
      v_lot.organizador_id, v_lot.jugador_id, v_lot.campaign_id, v_lot.id,
      'reversion', -v_lot.puntos_restantes,
      'reversion-invalida:' || v_lot.id::text,
      p_motivo, auth.uid()
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
    UPDATE public.rewards_lots
    SET puntos_restantes = 0, anulado = true
    WHERE id = v_lot.id;
  ELSE
    UPDATE public.rewards_lots SET anulado = true WHERE id = v_lot.id;
  END IF;

  SELECT COALESCE(SUM(-puntos), 0) INTO v_canje
  FROM public.rewards_ledger
  WHERE lot_id = v_lot.id
    AND tipo = 'canje';

  IF v_canje > 0 THEN
    INSERT INTO public.rewards_obligations (
      organizador_id, jugador_id, campaign_id, lot_id, participacion_id,
      puntos_originales, puntos_pendientes, motivo
    )
    VALUES (
      v_lot.organizador_id, v_lot.jugador_id, v_lot.campaign_id, v_lot.id,
      v_lot.participacion_id, v_canje, v_canje, p_motivo
    )
    ON CONFLICT (lot_id) DO UPDATE
    SET puntos_originales = GREATEST(public.rewards_obligations.puntos_originales, EXCLUDED.puntos_originales),
        puntos_pendientes = GREATEST(public.rewards_obligations.puntos_pendientes, EXCLUDED.puntos_pendientes),
        motivo = EXCLUDED.motivo;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.rewards_process_accrual_queue(
  p_organizador_id uuid,
  p_limit integer DEFAULT 50
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_done integer := 0;
BEGIN
  PERFORM public.rewards_assert_club_admin(p_organizador_id);
  FOR v_id IN
    SELECT q.id
    FROM public.rewards_accrual_queue q
    WHERE q.organizador_id = p_organizador_id
      AND (
        q.estado = 'pendiente'
        OR (q.estado = 'error' AND q.attempts < 20)
      )
    ORDER BY q.created_at
    LIMIT GREATEST(COALESCE(p_limit, 50), 1)
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      PERFORM public.rewards_accrue_one(v_id);
      v_done := v_done + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.rewards_accrual_queue
      SET estado = 'error',
          attempts = attempts + 1,
          last_error = SQLERRM
      WHERE id = v_id;
    END;
  END LOOP;
  RETURN v_done;
END;
$$;

CREATE OR REPLACE FUNCTION public.rewards_sync_candidates(p_organizador_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
    WHERE rj.organizador_id = p_organizador_id
      AND jp.created_at >= v_desde
      AND jp.tipo_evento::text IN ('reta', 'americano', 'duelo_2v2')
      AND NOT EXISTS (
        SELECT 1 FROM public.rewards_participation_reviews r
        WHERE r.participacion_id = jp.id
      )
  LOOP
    PERFORM public.rewards_enqueue_candidate(v_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- ── Cierre mensual y canje ──────────────────────────────────────────────────
-- Al cerrar la ventana: los puntos sueltos dejan de estar disponibles.
-- Una reserva hecha dentro de la ventana no se cancela sola.
-- Si esa reserva se cancela ya con la ventana cerrada, los puntos no vuelven.

CREATE OR REPLACE FUNCTION public.rewards_close_campaigns(p_organizador_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lot public.rewards_lots%ROWTYPE;
  v_count integer := 0;
  v_red public.rewards_redemptions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    IF session_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
      RAISE EXCEPTION 'Sin sesión';
    END IF;
  ELSE
    PERFORM public.rewards_assert_club_admin(p_organizador_id);
  END IF;

  FOR v_lot IN
    SELECT l.*
    FROM public.rewards_lots l
    JOIN public.rewards_campaigns c ON c.id = l.campaign_id
    WHERE l.organizador_id = p_organizador_id
      AND c.canje_hasta <= now()
      AND l.puntos_restantes > 0
      AND NOT l.anulado
    FOR UPDATE OF l SKIP LOCKED
  LOOP
    INSERT INTO public.rewards_ledger (
      organizador_id, jugador_id, campaign_id, lot_id, tipo, puntos, idempotency_key, motivo
    )
    VALUES (
      v_lot.organizador_id, v_lot.jugador_id, v_lot.campaign_id, v_lot.id,
      'cierre', -v_lot.puntos_restantes,
      'cierre:' || v_lot.id::text,
      'Cierre de la ventana de canje'
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    UPDATE public.rewards_lots
    SET puntos_restantes = 0
    WHERE id = v_lot.id;
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.rewards_redemptions r
  SET estado = 'vencido', updated_at = now()
  FROM public.rewards_campaigns c
  WHERE r.campaign_id = c.id
    AND r.organizador_id = p_organizador_id
    AND r.estado = 'solicitado'
    AND c.canje_hasta <= now();

  FOR v_red IN
    SELECT *
    FROM public.rewards_redemptions
    WHERE organizador_id = p_organizador_id
      AND estado = 'reservado'
      AND reserva_hasta IS NOT NULL
      AND reserva_hasta <= now()
    FOR UPDATE
  LOOP
    PERFORM public.rewards_release_hold(v_red.id, 'vencido');
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.rewards_release_hold(
  p_redemption_id uuid,
  p_estado text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hold public.rewards_lot_holds%ROWTYPE;
  v_lot public.rewards_lots%ROWTYPE;
  v_canje_hasta timestamptz;
  v_abierta boolean;
BEGIN
  FOR v_hold IN
    SELECT * FROM public.rewards_lot_holds WHERE redemption_id = p_redemption_id FOR UPDATE
  LOOP
    SELECT * INTO v_lot FROM public.rewards_lots WHERE id = v_hold.lot_id FOR UPDATE;
    SELECT c.canje_hasta INTO v_canje_hasta
    FROM public.rewards_campaigns c
    WHERE c.id = v_lot.campaign_id;
    v_abierta := v_canje_hasta > now() AND NOT v_lot.anulado;

    IF v_abierta THEN
      UPDATE public.rewards_lots
      SET puntos_restantes = puntos_restantes + v_hold.puntos
      WHERE id = v_lot.id;
    END IF;

    INSERT INTO public.rewards_ledger (
      organizador_id, jugador_id, campaign_id, lot_id, redemption_id,
      tipo, puntos, idempotency_key, motivo
    )
    SELECT v_lot.organizador_id, v_lot.jugador_id, v_lot.campaign_id, v_lot.id, p_redemption_id,
           CASE
             WHEN v_lot.anulado THEN 'reversion'
             WHEN v_abierta THEN 'liberacion'
             ELSE 'cierre'
           END,
           CASE
             WHEN v_lot.anulado THEN -v_hold.puntos
             WHEN v_abierta THEN v_hold.puntos
             ELSE -v_hold.puntos
           END,
           CASE
             WHEN v_lot.anulado THEN 'reversion-hold:'
             WHEN v_abierta THEN 'liberacion:'
             ELSE 'cierre-hold:'
           END
             || p_redemption_id::text || ':' || v_lot.id::text,
           CASE
             WHEN v_abierta THEN NULL
             ELSE 'La ventana de canje ya cerró; la reserva no regresa al saldo'
           END
    ON CONFLICT (idempotency_key) DO NOTHING;
  END LOOP;

  DELETE FROM public.rewards_lot_holds WHERE redemption_id = p_redemption_id;

  UPDATE public.rewards_redemptions
  SET estado = p_estado, updated_at = now()
  WHERE id = p_redemption_id
    AND estado = 'reservado';
END;
$$;

CREATE OR REPLACE FUNCTION public.rewards_assert_can_request(
  p_organizador_id uuid,
  p_jugador_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sin sesión';
  END IF;
  IF public.is_master_admin() OR p_organizador_id = auth.uid() THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.rewards_player_links l
    WHERE l.organizador_id = p_organizador_id
      AND l.jugador_id = p_jugador_id
      AND l.auth_user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'Sin permiso para solicitar este canje';
END;
$$;

CREATE OR REPLACE FUNCTION public.rewards_request_redemption(
  p_organizador_id uuid,
  p_reward_id uuid,
  p_jugador_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reward public.rewards_rewards%ROWTYPE;
  v_campaign public.rewards_campaigns%ROWTYPE;
  v_id uuid;
  v_used integer;
BEGIN
  PERFORM public.rewards_assert_can_request(p_organizador_id, p_jugador_id);
  SELECT * INTO v_reward
  FROM public.rewards_rewards
  WHERE id = p_reward_id AND organizador_id = p_organizador_id
  FOR UPDATE;
  IF NOT FOUND OR v_reward.estado <> 'activo' THEN
    RAISE EXCEPTION 'Premio no disponible';
  END IF;
  SELECT * INTO v_campaign FROM public.rewards_campaigns WHERE id = v_reward.campaign_id;
  IF v_campaign.estado <> 'activa' OR now() < v_campaign.canje_desde OR now() >= v_campaign.canje_hasta THEN
    RAISE EXCEPTION 'La ventana de canje está cerrada';
  END IF;
  IF v_reward.limite_por_jugador IS NOT NULL THEN
    SELECT COUNT(*) INTO v_used
    FROM public.rewards_redemptions
    WHERE reward_id = v_reward.id
      AND jugador_id = p_jugador_id
      AND estado IN ('solicitado', 'reservado', 'entregado');
    IF v_used >= v_reward.limite_por_jugador THEN
      RAISE EXCEPTION 'Este jugador ya alcanzó el límite del premio';
    END IF;
  END IF;

  INSERT INTO public.rewards_redemptions (
    organizador_id, campaign_id, reward_id, jugador_id, costo_puntos, snapshot, requested_by
  )
  VALUES (
    p_organizador_id,
    v_campaign.id,
    v_reward.id,
    p_jugador_id,
    v_reward.costo_puntos,
    jsonb_build_object(
      'nombre', v_reward.nombre,
      'descripcion', v_reward.descripcion,
      'tipo', v_reward.tipo,
      'costo_puntos', v_reward.costo_puntos,
      'cantidad', v_reward.cantidad,
      'condiciones', v_reward.condiciones
    ),
    auth.uid()
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rewards_reserve_redemption(p_redemption_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_red public.rewards_redemptions%ROWTYPE;
  v_reward public.rewards_rewards%ROWTYPE;
  v_campaign public.rewards_campaigns%ROWTYPE;
  v_lot public.rewards_lots%ROWTYPE;
  v_left integer;
  v_take integer;
BEGIN
  SELECT * INTO v_red FROM public.rewards_redemptions WHERE id = p_redemption_id FOR UPDATE;
  IF NOT FOUND OR v_red.estado <> 'solicitado' THEN
    RAISE EXCEPTION 'El canje no está pendiente de reserva';
  END IF;
  PERFORM public.rewards_assert_club_admin(v_red.organizador_id);
  PERFORM public.rewards_close_campaigns(v_red.organizador_id);

  SELECT * INTO v_red FROM public.rewards_redemptions WHERE id = p_redemption_id FOR UPDATE;
  SELECT * INTO v_reward FROM public.rewards_rewards WHERE id = v_red.reward_id FOR UPDATE;
  SELECT * INTO v_campaign FROM public.rewards_campaigns WHERE id = v_red.campaign_id;

  IF now() < v_campaign.canje_desde OR now() >= v_campaign.canje_hasta THEN
    RAISE EXCEPTION 'La ventana de canje está cerrada';
  END IF;
  IF v_reward.inventario_restante IS NOT NULL AND v_reward.inventario_restante <= 0 THEN
    RAISE EXCEPTION 'Sin inventario';
  END IF;

  v_left := v_red.costo_puntos;
  FOR v_lot IN
    SELECT *
    FROM public.rewards_lots
    WHERE organizador_id = v_red.organizador_id
      AND jugador_id = v_red.jugador_id
      AND campaign_id = v_red.campaign_id
      AND puntos_restantes > 0
      AND NOT anulado
    ORDER BY earned_at, id
    FOR UPDATE
  LOOP
    EXIT WHEN v_left = 0;
    v_take := LEAST(v_lot.puntos_restantes, v_left);
    UPDATE public.rewards_lots
    SET puntos_restantes = puntos_restantes - v_take
    WHERE id = v_lot.id;
    INSERT INTO public.rewards_lot_holds (redemption_id, lot_id, puntos)
    VALUES (v_red.id, v_lot.id, v_take);
    INSERT INTO public.rewards_ledger (
      organizador_id, jugador_id, campaign_id, lot_id, redemption_id,
      tipo, puntos, idempotency_key, actor_id
    )
    VALUES (
      v_red.organizador_id, v_red.jugador_id, v_red.campaign_id, v_lot.id, v_red.id,
      'reserva', -v_take, 'reserva:' || v_red.id::text || ':' || v_lot.id::text, auth.uid()
    );
    v_left := v_left - v_take;
  END LOOP;

  IF v_left > 0 THEN
    RAISE EXCEPTION 'Saldo insuficiente';
  END IF;

  IF v_reward.inventario_restante IS NOT NULL THEN
    UPDATE public.rewards_rewards
    SET inventario_restante = inventario_restante - 1, updated_at = now()
    WHERE id = v_reward.id;
  END IF;

  UPDATE public.rewards_redemptions
  SET estado = 'reservado',
      reserva_hasta = LEAST(
        COALESCE(v_reward.disponible_hasta, now() + make_interval(days => v_campaign.reserva_dias)),
        now() + make_interval(days => v_campaign.reserva_dias)
      ),
      updated_at = now()
  WHERE id = v_red.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rewards_cancel_redemption(p_redemption_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_red public.rewards_redemptions%ROWTYPE;
BEGIN
  SELECT * INTO v_red FROM public.rewards_redemptions WHERE id = p_redemption_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Canje no encontrado';
  END IF;
  PERFORM public.rewards_assert_club_admin(v_red.organizador_id);
  IF v_red.estado = 'solicitado' THEN
    UPDATE public.rewards_redemptions
    SET estado = 'cancelado', updated_at = now()
    WHERE id = v_red.id;
    RETURN;
  END IF;
  IF v_red.estado <> 'reservado' THEN
    RAISE EXCEPTION 'Este canje ya no se puede cancelar';
  END IF;
  PERFORM public.rewards_release_hold(v_red.id, 'cancelado');
  UPDATE public.rewards_rewards
  SET inventario_restante = inventario_restante + 1, updated_at = now()
  WHERE id = v_red.reward_id
    AND inventario IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.rewards_confirm_redemption(p_redemption_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_red public.rewards_redemptions%ROWTYPE;
  v_hold public.rewards_lot_holds%ROWTYPE;
BEGIN
  SELECT * INTO v_red FROM public.rewards_redemptions WHERE id = p_redemption_id FOR UPDATE;
  IF NOT FOUND OR v_red.estado <> 'reservado' THEN
    RAISE EXCEPTION 'El canje no está reservado';
  END IF;
  PERFORM public.rewards_assert_club_admin(v_red.organizador_id);
  IF v_red.reserva_hasta IS NOT NULL AND v_red.reserva_hasta <= now() THEN
    RAISE EXCEPTION 'La reserva ya venció';
  END IF;

  FOR v_hold IN
    SELECT * FROM public.rewards_lot_holds WHERE redemption_id = v_red.id FOR UPDATE
  LOOP
    INSERT INTO public.rewards_ledger (
      organizador_id, jugador_id, campaign_id, lot_id, redemption_id,
      tipo, puntos, idempotency_key, actor_id
    )
    VALUES (
      v_red.organizador_id, v_red.jugador_id, v_red.campaign_id, v_hold.lot_id, v_red.id,
      'canje', -v_hold.puntos,
      'canje:' || v_red.id::text || ':' || v_hold.lot_id::text,
      auth.uid()
    );
  END LOOP;

  DELETE FROM public.rewards_lot_holds WHERE redemption_id = v_red.id;

  UPDATE public.rewards_redemptions
  SET estado = 'entregado', confirmed_by = auth.uid(), updated_at = now()
  WHERE id = v_red.id;

  INSERT INTO public.rewards_obligations (
    organizador_id, jugador_id, campaign_id, lot_id, participacion_id,
    puntos_originales, puntos_pendientes, motivo
  )
  SELECT v_red.organizador_id, v_red.jugador_id, l.campaign_id, l.id, l.participacion_id,
         SUM(-h.puntos), SUM(-h.puntos), 'Puntos ya entregados de un lote anulado'
  FROM public.rewards_lots l
  JOIN (
    SELECT lot_id, puntos FROM public.rewards_ledger
    WHERE redemption_id = v_red.id AND tipo = 'canje'
  ) h ON h.lot_id = l.id
  WHERE l.anulado
  GROUP BY l.campaign_id, l.id, l.participacion_id
  ON CONFLICT (lot_id) DO UPDATE
  SET puntos_originales = public.rewards_obligations.puntos_originales + EXCLUDED.puntos_originales,
      puntos_pendientes = public.rewards_obligations.puntos_pendientes + EXCLUDED.puntos_pendientes;

  IF (v_red.snapshot->>'tipo') IN ('reta_gratis', 'paquete') THEN
    INSERT INTO public.rewards_benefit_uses (
      organizador_id, redemption_id, jugador_id, tipo_beneficio
    )
    VALUES (
      v_red.organizador_id,
      v_red.id,
      v_red.jugador_id,
      COALESCE(v_red.snapshot->>'tipo', 'reta_gratis')
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.rewards_assign_benefit_use(
  p_benefit_id uuid,
  p_evento_id uuid,
  p_tipo_evento text,
  p_participacion_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_benefit public.rewards_benefit_uses%ROWTYPE;
BEGIN
  SELECT * INTO v_benefit FROM public.rewards_benefit_uses WHERE id = p_benefit_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Beneficio no encontrado';
  END IF;
  PERFORM public.rewards_assert_club_admin(v_benefit.organizador_id);
  IF p_participacion_id IS NULL OR p_evento_id IS NULL THEN
    RAISE EXCEPTION 'Indica la reta y la participación';
  END IF;

  UPDATE public.rewards_benefit_uses
  SET evento_id = p_evento_id,
      tipo_evento = p_tipo_evento,
      participacion_id = p_participacion_id,
      estado = 'asignada',
      assigned_by = auth.uid(),
      assigned_at = now()
  WHERE id = v_benefit.id;

  UPDATE public.rewards_accrual_queue
  SET estado = 'omitida',
      last_error = 'Reta gratuita de Rewards',
      processed_at = now()
  WHERE participacion_id = p_participacion_id
    AND estado IN ('pendiente', 'error');

  UPDATE public.rewards_participation_reviews
  SET estado = 'rechazada',
      motivo = 'Reta gratuita de Rewards',
      decided_at = now(),
      decided_by = auth.uid()
  WHERE participacion_id = p_participacion_id
    AND estado = 'pendiente';

  PERFORM public.rewards_settle_invalid_lot(
    p_participacion_id,
    'Reta gratuita de Rewards'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rewards_invalidate_participation(
  p_organizador_id uuid,
  p_participacion_id uuid,
  p_motivo text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  UPDATE public.rewards_participation_reviews
  SET estado = 'rechazada', motivo = trim(p_motivo), decided_at = now(), decided_by = auth.uid()
  WHERE participacion_id = p_participacion_id
    AND organizador_id = p_organizador_id
    AND estado = 'pendiente';

  PERFORM public.rewards_settle_invalid_lot(p_participacion_id, trim(p_motivo));
END;
$$;

CREATE OR REPLACE FUNCTION public.rewards_retry_accruals(p_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_done integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Sin permiso para reintentar la cola global';
  END IF;
  IF auth.uid() IS NULL
     AND session_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
    RAISE EXCEPTION 'Sin permiso para reintentar la cola global';
  END IF;

  FOR v_id IN
    SELECT DISTINCT l.organizador_id
    FROM public.rewards_lots l
    JOIN public.rewards_campaigns c ON c.id = l.campaign_id
    WHERE c.canje_hasta <= now()
      AND l.puntos_restantes > 0
      AND NOT l.anulado
  LOOP
    PERFORM public.rewards_close_campaigns(v_id);
  END LOOP;

  FOR v_id IN
    SELECT q.id
    FROM public.rewards_accrual_queue q
    WHERE q.estado = 'pendiente'
       OR (q.estado = 'error' AND q.attempts < 20)
    ORDER BY q.created_at
    LIMIT GREATEST(COALESCE(p_limit, 100), 1)
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      PERFORM public.rewards_accrue_one(v_id);
      v_done := v_done + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.rewards_accrual_queue
      SET estado = 'error', attempts = attempts + 1, last_error = SQLERRM
      WHERE id = v_id;
    END;
  END LOOP;
  RETURN v_done;
END;
$$;

CREATE OR REPLACE FUNCTION public.rewards_adjust(
  p_organizador_id uuid,
  p_jugador_id uuid,
  p_campaign_id uuid,
  p_puntos integer,
  p_motivo text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_key text;
  v_event uuid;
  v_part uuid;
  v_campaign public.rewards_campaigns%ROWTYPE;
BEGIN
  PERFORM public.rewards_assert_club_admin(p_organizador_id);
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 3 THEN
    RAISE EXCEPTION 'El ajuste necesita un motivo';
  END IF;
  IF p_puntos = 0 THEN
    RAISE EXCEPTION 'El ajuste no puede ser cero';
  END IF;
  SELECT * INTO v_campaign
  FROM public.rewards_campaigns
  WHERE id = p_campaign_id AND organizador_id = p_organizador_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaña no encontrada en este club';
  END IF;

  IF p_puntos > 0 THEN
    v_key := 'ajuste:' || gen_random_uuid()::text;
    v_event := gen_random_uuid();
    v_part := gen_random_uuid();
    INSERT INTO public.rewards_lots (
      organizador_id, campaign_id, jugador_id, participacion_id, tipo_evento, evento_id,
      idempotency_key, puntos_originales, puntos_restantes, earned_at
    )
    VALUES (
      p_organizador_id, p_campaign_id, p_jugador_id, v_part, 'ajuste', v_event,
      v_key,
      p_puntos, p_puntos, now()
    )
    RETURNING id INTO v_id;
  ELSE
    RAISE EXCEPTION 'El descuento administrativo se hace por reversión de un lote, no con saldo negativo';
  END IF;

  INSERT INTO public.rewards_ledger (
    organizador_id, jugador_id, campaign_id, lot_id, tipo, puntos, idempotency_key, motivo, actor_id
  )
  VALUES (
    p_organizador_id, p_jugador_id, p_campaign_id, v_id, 'ajuste', p_puntos,
    'ajuste:' || v_id::text, trim(p_motivo), auth.uid()
  );
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rewards_duplicate_campaign(
  p_source_id uuid,
  p_payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_src public.rewards_campaigns%ROWTYPE;
  v_reward public.rewards_rewards%ROWTYPE;
  v_new uuid;
BEGIN
  SELECT * INTO v_src FROM public.rewards_campaigns WHERE id = p_source_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaña no encontrada';
  END IF;
  PERFORM public.rewards_assert_club_admin(v_src.organizador_id);

  v_new := public.rewards_save_campaign(jsonb_build_object(
    'organizador_id', v_src.organizador_id,
    'nombre', COALESCE(NULLIF(p_payload->>'nombre', ''), v_src.nombre || ' (copia)'),
    'descripcion', COALESCE(p_payload->>'descripcion', v_src.descripcion),
    'timezone', COALESCE(NULLIF(p_payload->>'timezone', ''), v_src.timezone),
    'acumula_desde', p_payload->>'acumula_desde',
    'acumula_hasta', p_payload->>'acumula_hasta',
    'canje_desde', p_payload->>'canje_desde',
    'canje_hasta', p_payload->>'canje_hasta',
    'puntos_por_participacion', COALESCE(
      (p_payload->>'puntos_por_participacion')::integer,
      v_src.puntos_por_participacion
    ),
    'modalidades', to_jsonb(v_src.modalidades),
    'estado', COALESCE(NULLIF(p_payload->>'estado', ''), 'borrador'),
    'visible_jugadores', COALESCE((p_payload->>'visible_jugadores')::boolean, v_src.visible_jugadores),
    'condiciones', COALESCE(p_payload->>'condiciones', v_src.condiciones),
    'validation_mode', v_src.validation_mode,
    'reserva_dias', COALESCE((p_payload->>'reserva_dias')::integer, v_src.reserva_dias)
  ));

  UPDATE public.rewards_campaigns
  SET origen_campaign_id = v_src.id
  WHERE id = v_new;

  FOR v_reward IN
    SELECT * FROM public.rewards_rewards WHERE campaign_id = v_src.id
  LOOP
    INSERT INTO public.rewards_rewards (
      campaign_id, organizador_id, nombre, descripcion, imagen_url,
      costo_puntos, tipo, cantidad, inventario, inventario_restante,
      limite_por_jugador, disponible_desde, disponible_hasta, condiciones, estado
    )
    VALUES (
      v_new, v_src.organizador_id, v_reward.nombre, v_reward.descripcion, v_reward.imagen_url,
      v_reward.costo_puntos, v_reward.tipo, v_reward.cantidad,
      v_reward.inventario, v_reward.inventario,
      v_reward.limite_por_jugador, NULL, NULL, v_reward.condiciones, 'borrador'
    );
  END LOOP;

  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.rewards_balance(
  p_organizador_id uuid,
  p_jugador_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sin sesión';
  END IF;
  IF NOT (public.is_master_admin() OR p_organizador_id = auth.uid()) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.rewards_player_links l
      WHERE l.organizador_id = p_organizador_id
        AND l.jugador_id = p_jugador_id
        AND l.auth_user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Sin permiso sobre este club';
    END IF;
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(s) ORDER BY s.acumula_desde)
    FROM (
      SELECT
        c.id AS campaign_id,
        c.nombre,
        c.acumula_desde,
        c.acumula_hasta,
        c.canje_desde,
        c.canje_hasta,
        CASE
          WHEN now() >= c.canje_hasta THEN 'cerrada'
          WHEN now() >= c.canje_desde THEN 'canje'
          ELSE 'acumulacion'
        END AS fase,
        COALESCE(SUM(l.puntos_restantes) FILTER (
          WHERE NOT l.anulado AND now() < c.canje_desde
        ), 0)::integer AS acumulando,
        COALESCE(SUM(l.puntos_restantes) FILTER (
          WHERE NOT l.anulado AND now() >= c.canje_desde AND now() < c.canje_hasta
        ), 0)::integer AS disponible,
        COALESCE((
          SELECT SUM(h.puntos)
          FROM public.rewards_lot_holds h
          JOIN public.rewards_redemptions r ON r.id = h.redemption_id
          WHERE r.campaign_id = c.id
            AND r.jugador_id = p_jugador_id
            AND r.estado = 'reservado'
        ), 0)::integer AS reservado,
        COALESCE((
          SELECT SUM(-g.puntos)
          FROM public.rewards_ledger g
          WHERE g.campaign_id = c.id
            AND g.jugador_id = p_jugador_id
            AND g.tipo = 'canje'
        ), 0)::integer AS utilizado,
        COALESCE((
          SELECT SUM(-g.puntos)
          FROM public.rewards_ledger g
          WHERE g.campaign_id = c.id
            AND g.jugador_id = p_jugador_id
            AND g.tipo = 'cierre'
        ), 0)::integer AS cerrado
      FROM public.rewards_campaigns c
      LEFT JOIN public.rewards_lots l
        ON l.campaign_id = c.id
       AND l.jugador_id = p_jugador_id
       AND l.organizador_id = p_organizador_id
      WHERE c.organizador_id = p_organizador_id
      GROUP BY c.id
    ) s
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.rewards_link_player(
  p_organizador_id uuid,
  p_jugador_id uuid,
  p_email text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth uuid;
BEGIN
  PERFORM public.rewards_assert_club_admin(p_organizador_id);
  IF NOT EXISTS (
    SELECT 1 FROM public.riviera_jugadores j
    WHERE j.id = p_jugador_id AND j.organizador_id = p_organizador_id
  ) THEN
    RAISE EXCEPTION 'El jugador no pertenece a este club';
  END IF;
  SELECT u.id INTO v_auth
  FROM auth.users u
  WHERE lower(u.email) = lower(trim(p_email))
  LIMIT 1;
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'No hay una cuenta con ese correo';
  END IF;
  INSERT INTO public.rewards_player_links (jugador_id, organizador_id, auth_user_id)
  VALUES (p_jugador_id, p_organizador_id, v_auth)
  ON CONFLICT (jugador_id) DO UPDATE
  SET auth_user_id = EXCLUDED.auth_user_id,
      organizador_id = EXCLUDED.organizador_id;
  RETURN v_auth;
END;
$$;

CREATE OR REPLACE FUNCTION public.rewards_unlink_player(
  p_organizador_id uuid,
  p_jugador_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.rewards_assert_club_admin(p_organizador_id);
  DELETE FROM public.rewards_player_links
  WHERE organizador_id = p_organizador_id AND jugador_id = p_jugador_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rewards_player_snapshot(p_jugador_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sin sesión';
  END IF;
  SELECT l.organizador_id INTO v_org
  FROM public.rewards_player_links l
  WHERE l.jugador_id = p_jugador_id AND l.auth_user_id = auth.uid();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Esta cuenta no está vinculada a este jugador';
  END IF;

  RETURN jsonb_build_object(
    'organizador_id', v_org,
    'saldos', public.rewards_balance(v_org, p_jugador_id),
    'premios', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', w.id,
        'nombre', w.nombre,
        'descripcion', w.descripcion,
        'costo_puntos', w.costo_puntos,
        'tipo', w.tipo,
        'condiciones', w.condiciones,
        'inventario_restante', w.inventario_restante,
        'limite_por_jugador', w.limite_por_jugador,
        'campaign_id', c.id,
        'campana', c.nombre,
        'canje_hasta', c.canje_hasta
      ) ORDER BY w.costo_puntos)
      FROM public.rewards_rewards w
      JOIN public.rewards_campaigns c ON c.id = w.campaign_id
      WHERE w.organizador_id = v_org
        AND w.estado = 'activo'
        AND c.estado = 'activa'
        AND c.visible_jugadores
        AND now() >= c.canje_desde
        AND now() < c.canje_hasta
    ), '[]'::jsonb),
    'canjes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'estado', r.estado,
        'costo_puntos', r.costo_puntos,
        'nombre', r.snapshot->>'nombre',
        'created_at', r.created_at,
        'reserva_hasta', r.reserva_hasta
      ) ORDER BY r.created_at DESC)
      FROM public.rewards_redemptions r
      WHERE r.organizador_id = v_org AND r.jugador_id = p_jugador_id
    ), '[]'::jsonb)
  );
END;
$$;

-- ── Permisos ────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'rewards_assert_club_admin(uuid)',
    'rewards_modalidad(text, uuid)',
    'rewards_enqueue_candidate(uuid)',
    'rewards_on_participacion_insert()',
    'rewards_save_campaign(jsonb)',
    'rewards_save_reward(jsonb)',
    'rewards_duplicate_campaign(uuid, jsonb)',
    'rewards_review_participations(uuid, uuid[], text, uuid, text)',
    'rewards_accrue_one(uuid)',
    'rewards_process_accrual_queue(uuid, integer)',
    'rewards_sync_candidates(uuid)',
    'rewards_close_campaigns(uuid)',
    'rewards_release_hold(uuid, text)',
    'rewards_assert_can_request(uuid, uuid)',
    'rewards_link_player(uuid, uuid, text)',
    'rewards_unlink_player(uuid, uuid)',
    'rewards_player_snapshot(uuid)',
    'rewards_request_redemption(uuid, uuid, uuid)',
    'rewards_reserve_redemption(uuid)',
    'rewards_cancel_redemption(uuid)',
    'rewards_confirm_redemption(uuid)',
    'rewards_assign_benefit_use(uuid, uuid, text, uuid)',
    'rewards_invalidate_participation(uuid, uuid, text)',
    'rewards_adjust(uuid, uuid, uuid, integer, text)',
    'rewards_balance(uuid, uuid)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', v_sig);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.rewards_compensate_lot(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rewards_settle_invalid_lot(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rewards_retry_accruals(integer) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.rewards_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards_participation_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards_accrual_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards_lot_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards_benefit_uses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards_player_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rewards_campaigns_select ON public.rewards_campaigns;
CREATE POLICY rewards_campaigns_select ON public.rewards_campaigns
  FOR SELECT TO authenticated
  USING (organizador_id = auth.uid() OR public.is_master_admin());

DROP POLICY IF EXISTS rewards_rewards_select ON public.rewards_rewards;
CREATE POLICY rewards_rewards_select ON public.rewards_rewards
  FOR SELECT TO authenticated
  USING (organizador_id = auth.uid() OR public.is_master_admin());

DROP POLICY IF EXISTS rewards_reviews_select ON public.rewards_participation_reviews;
CREATE POLICY rewards_reviews_select ON public.rewards_participation_reviews
  FOR SELECT TO authenticated
  USING (organizador_id = auth.uid() OR public.is_master_admin());

DROP POLICY IF EXISTS rewards_queue_select ON public.rewards_accrual_queue;
CREATE POLICY rewards_queue_select ON public.rewards_accrual_queue
  FOR SELECT TO authenticated
  USING (organizador_id = auth.uid() OR public.is_master_admin());

DROP POLICY IF EXISTS rewards_lots_select ON public.rewards_lots;
CREATE POLICY rewards_lots_select ON public.rewards_lots
  FOR SELECT TO authenticated
  USING (organizador_id = auth.uid() OR public.is_master_admin());

DROP POLICY IF EXISTS rewards_ledger_select ON public.rewards_ledger;
CREATE POLICY rewards_ledger_select ON public.rewards_ledger
  FOR SELECT TO authenticated
  USING (organizador_id = auth.uid() OR public.is_master_admin());

DROP POLICY IF EXISTS rewards_redemptions_select ON public.rewards_redemptions;
CREATE POLICY rewards_redemptions_select ON public.rewards_redemptions
  FOR SELECT TO authenticated
  USING (organizador_id = auth.uid() OR public.is_master_admin());

DROP POLICY IF EXISTS rewards_holds_select ON public.rewards_lot_holds;
CREATE POLICY rewards_holds_select ON public.rewards_lot_holds
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rewards_redemptions r
      WHERE r.id = redemption_id
        AND (r.organizador_id = auth.uid() OR public.is_master_admin())
    )
  );

DROP POLICY IF EXISTS rewards_obligations_select ON public.rewards_obligations;
CREATE POLICY rewards_obligations_select ON public.rewards_obligations
  FOR SELECT TO authenticated
  USING (organizador_id = auth.uid() OR public.is_master_admin());

DROP POLICY IF EXISTS rewards_links_select ON public.rewards_player_links;
CREATE POLICY rewards_links_select ON public.rewards_player_links
  FOR SELECT TO authenticated
  USING (
    organizador_id = auth.uid()
    OR auth_user_id = auth.uid()
    OR public.is_master_admin()
  );

DROP POLICY IF EXISTS rewards_benefits_select ON public.rewards_benefit_uses;
CREATE POLICY rewards_benefits_select ON public.rewards_benefit_uses
  FOR SELECT TO authenticated
  USING (organizador_id = auth.uid() OR public.is_master_admin());

REVOKE ALL ON TABLE
  public.rewards_campaigns,
  public.rewards_rewards,
  public.rewards_participation_reviews,
  public.rewards_accrual_queue,
  public.rewards_lots,
  public.rewards_ledger,
  public.rewards_redemptions,
  public.rewards_lot_holds,
  public.rewards_benefit_uses,
  public.rewards_obligations,
  public.rewards_player_links
FROM PUBLIC, anon;

GRANT SELECT ON TABLE
  public.rewards_campaigns,
  public.rewards_rewards,
  public.rewards_participation_reviews,
  public.rewards_accrual_queue,
  public.rewards_lots,
  public.rewards_ledger,
  public.rewards_redemptions,
  public.rewards_lot_holds,
  public.rewards_benefit_uses,
  public.rewards_obligations,
  public.rewards_player_links
TO authenticated;

-- Reintento sin navegador. Si pg_cron no está cargado, la función queda
-- lista y esta migración no falla.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'rewards-retry-accruals'
    ) THEN
      PERFORM cron.unschedule('rewards-retry-accruals');
    END IF;
    PERFORM cron.schedule(
      'rewards-retry-accruals',
      '* * * * *',
      'SELECT public.rewards_retry_accruals(100)'
    );
  ELSE
    RAISE NOTICE 'pg_cron no está instalado; rewards_retry_accruals queda disponible para el planificador';
  END IF;
EXCEPTION WHEN undefined_table OR undefined_function OR invalid_schema_name THEN
  RAISE NOTICE 'pg_cron no disponible en esta base';
END;
$$;
