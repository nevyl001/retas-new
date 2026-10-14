-- ══════════════════════════════════════════════════════════════════════════════
-- SCRIPT 2: RECUPERACIÓN IDEMPOTENTE ACOTADA DE PARTICIPACIONES
--
-- Recupera de forma segura e idempotente las 8 participaciones del Americano
-- Dinámico en Padelito Warehouse, bajo las siguientes garantías estrictas:
--
-- 1. Precondiciones exhaustivas: valida existencia de los 8 IDs reales, resolución
--    de club anfitrión, evento esperado y campaña activa aplicable antes de mutar.
-- 2. Respeto absoluto a rechazos manuales: si una revisión está 'rechazada',
--    se conserva intacta con su motivo original y jamás se fuerza su aprobación.
-- 3. Participación comprobada: solo acredita juego real demostrado (sets, games,
--    partidos, resultado o subtipo de cierre). Inscripciones simples sin juego no pasan.
-- 4. Aislamiento por subtransacciones: cada participación se procesa de forma
--    independiente (BEGIN...EXCEPTION). Un fallo individual no aborta a los demás.
-- 5. Manejo de timezone y expires_at: asegura default en rewards_lots.timezone
--    y puebla el vencimiento con canje_hasta de la campaña sin violar restricciones.
-- 6. Auditoría de intentos: no recorta ni trunca el contador de reintentos.
-- 7. Idempotencia: ejecuciones repetidas detectan lotes existentes y no duplican puntos.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 0. AJUSTE PREVENTIVO DE ESQUEMA EN REWARDS_LOTS (TIMEZONE & EXPIRES_AT) ───

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

  -- Asegurar timezone de la campaña o default America/Mexico_City si la columna existe
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

-- ── 1. TABLA TEMPORAL PARA RESULTADOS DE RECUPERACIÓN ────────────────────────

CREATE TEMP TABLE IF NOT EXISTS _rewards_recovery_results (
  participacion_id uuid PRIMARY KEY,
  jugador_nombre text,
  riviera_id text,
  estado_final text,
  puntos_emitidos integer DEFAULT 0,
  lote_id uuid,
  vencimiento_lote timestamptz,
  detalle text
);

TRUNCATE TABLE _rewards_recovery_results;

-- ── 2. BLOQUE PRINCIPAL DE RECUPERACIÓN IDEMPOTENTE ─────────────────────────

DO $$
DECLARE
  v_target_ids uuid[] := ARRAY[
    '26fbdcd5-b728-4179-90a4-c3a9b4837a5a'::uuid, -- César G
    '783c7d94-7a94-4638-9517-df3fde35681f'::uuid, -- Isbi
    'a2069224-75e5-4ba0-9d11-29b2953d9bd3'::uuid, -- Ivan Cazares
    'f9ef66cc-032f-450d-867b-1e00e86f5c87'::uuid, -- Jesús Fernando
    '1297cfb0-88dc-4ae0-80c7-1e732a9e2d43'::uuid, -- Lalo B
    '62acb7b9-d0f6-4644-84e7-e9e1ba5652c4'::uuid, -- Paco
    '9f9a24f4-5e1c-433b-917a-42d544858547'::uuid, -- Ricardo P
    '9c7c2f6d-20af-4d35-b3d1-7439d21cd588'::uuid  -- Said C
  ];
  v_target_id uuid;
  v_found_count integer;
  v_missing_ids uuid[];
  v_unresolved_host integer;
  v_unresolved_event integer;
  v_unresolved_campaign integer;
  
  -- Variables por participación
  v_jp public.jugador_participaciones%ROWTYPE;
  v_rj public.riviera_jugadores%ROWTYPE;
  v_riviera_id text;
  v_existing_lot public.rewards_lots%ROWTYPE;
  v_existing_rev public.rewards_participation_reviews%ROWTYPE;
  v_existing_queue public.rewards_accrual_queue%ROWTYPE;
  v_lot_after public.rewards_lots%ROWTYPE;
  v_queue_after public.rewards_accrual_queue%ROWTYPE;
BEGIN
  -- A. Precondición 1: Existencia de las 8 participaciones exactas
  SELECT COUNT(DISTINCT id) INTO v_found_count
  FROM public.jugador_participaciones
  WHERE id = ANY(v_target_ids);

  IF v_found_count < 8 THEN
    SELECT array_agg(t.id) INTO v_missing_ids
    FROM unnest(v_target_ids) AS t(id)
    WHERE NOT EXISTS (SELECT 1 FROM public.jugador_participaciones jp WHERE jp.id = t.id);

    RAISE EXCEPTION 'Precondición 1 fallida: Faltan % participaciones en jugador_participaciones. IDs ausentes: %',
      (8 - v_found_count), v_missing_ids;
  END IF;

  -- B. Precondición 2: Cada participación debe tener evento_id resuelto
  SELECT COUNT(*) INTO v_unresolved_event
  FROM public.jugador_participaciones jp
  WHERE jp.id = ANY(v_target_ids)
    AND jp.evento_id IS NULL;

  IF v_unresolved_event > 0 THEN
    RAISE EXCEPTION 'Precondición 2 fallida: % participaciones no tienen evento_id resuelto', v_unresolved_event;
  END IF;

  -- C. Precondición 3: Cada participación debe tener club anfitrión determinable
  SELECT COUNT(*) INTO v_unresolved_host
  FROM public.jugador_participaciones jp
  WHERE jp.id = ANY(v_target_ids)
    AND COALESCE(
      NULLIF(trim(jp.metadata->>'organizador_id'), '')::uuid,
      public.riviera_participacion_expected_host_org(jp.tipo_evento::text, jp.evento_id::text)
    ) IS NULL;

  IF v_unresolved_host > 0 THEN
    RAISE EXCEPTION 'Precondición 3 fallida: % participaciones no tienen club anfitrión determinable', v_unresolved_host;
  END IF;

  -- D. Precondición 4: Cada participación debe tener campaña activa aplicable
  SELECT COUNT(*) INTO v_unresolved_campaign
  FROM public.jugador_participaciones jp
  LEFT JOIN LATERAL (
    SELECT rc.id
    FROM public.rewards_campaigns rc
    WHERE rc.organizador_id = COALESCE(
      NULLIF(trim(jp.metadata->>'organizador_id'), '')::uuid,
      public.riviera_participacion_expected_host_org(jp.tipo_evento::text, jp.evento_id::text)
    )
      AND rc.estado = 'activa'
      AND (rc.modalidades IS NULL OR 'americano' = ANY(rc.modalidades))
      AND COALESCE(jp.created_at, jp.fecha::timestamptz, now()) >= rc.acumula_desde
      AND COALESCE(jp.created_at, jp.fecha::timestamptz, now()) < rc.acumula_hasta
    LIMIT 1
  ) c ON true
  WHERE jp.id = ANY(v_target_ids)
    AND c.id IS NULL;

  IF v_unresolved_campaign > 0 THEN
    RAISE EXCEPTION 'Precondición 4 fallida: % participaciones no cuentan con campaña activa aplicable por fechas/modalidad', v_unresolved_campaign;
  END IF;

  -- ── 2. PROCESAMIENTO AISLADO POR PARTICIPACIÓN ──────────────────────────────

  FOREACH v_target_id IN ARRAY v_target_ids
  LOOP
    BEGIN
      -- Cargar datos de la participación y jugador
      SELECT * INTO v_jp FROM public.jugador_participaciones WHERE id = v_target_id;
      SELECT * INTO v_rj FROM public.riviera_jugadores WHERE id = v_jp.jugador_id;
      
      -- Identidad oficial Riviera con join seguro a riviera_official_player_identity
      SELECT COALESCE(
        (SELECT opi.riviera_id FROM public.riviera_official_player_identity opi WHERE opi.canonical_riviera_jugador_id = v_rj.id LIMIT 1),
        (
          SELECT opi.riviera_id
          FROM public.riviera_official_player_profile_link opl
          JOIN public.riviera_official_player_identity opi ON opi.official_player_key = opl.official_player_key
          WHERE opl.riviera_jugador_id = v_rj.id
          LIMIT 1
        ),
        'SIN-ID'
      ) INTO v_riviera_id;

      -- A. Verificar si ya cuenta con lote emitido (idempotencia)
      SELECT * INTO v_existing_lot
      FROM public.rewards_lots
      WHERE participacion_id = v_target_id;

      IF v_existing_lot.id IS NOT NULL THEN
        INSERT INTO _rewards_recovery_results (
          participacion_id, jugador_nombre, riviera_id, estado_final,
          puntos_emitidos, lote_id, vencimiento_lote, detalle
        ) VALUES (
          v_target_id, v_rj.nombre, v_riviera_id, 'Ya acreditada previamente',
          v_existing_lot.puntos_originales, v_existing_lot.id, v_existing_lot.expires_at,
          'Lote existente conservado sin modificaciones'
        );
        CONTINUE;
      END IF;

      -- B. Verificar si la revisión fue rechazada manualmente: CONSERVAR RECHAZO
      SELECT * INTO v_existing_rev
      FROM public.rewards_participation_reviews
      WHERE participacion_id = v_target_id;

      IF v_existing_rev.id IS NOT NULL AND v_existing_rev.estado = 'rechazada' THEN
        INSERT INTO _rewards_recovery_results (
          participacion_id, jugador_nombre, riviera_id, estado_final,
          puntos_emitidos, lote_id, vencimiento_lote, detalle
        ) VALUES (
          v_target_id, v_rj.nombre, v_riviera_id, 'Excluida (rechazada)',
          0, NULL, NULL,
          'Rechazo manual respetado: ' || COALESCE(v_existing_rev.motivo, 'sin motivo registrado')
        );
        CONTINUE;
      END IF;

      -- C. Reintentar cola si estaba en error o encolar candidato
      SELECT * INTO v_existing_queue
      FROM public.rewards_accrual_queue
      WHERE participacion_id = v_target_id;

      IF v_existing_queue.id IS NOT NULL AND v_existing_queue.estado = 'error' THEN
        BEGIN
          PERFORM public.rewards_accrue_one(v_existing_queue.id);
        EXCEPTION WHEN OTHERS THEN
          UPDATE public.rewards_accrual_queue
          SET last_error = SQLERRM,
              attempts = attempts + 1
          WHERE id = v_existing_queue.id;
        END;
      ELSE
        PERFORM public.rewards_enqueue_candidate(v_target_id);
      END IF;

      -- D. Evaluar resultado final del registro
      SELECT * INTO v_lot_after
      FROM public.rewards_lots
      WHERE participacion_id = v_target_id;

      SELECT * INTO v_queue_after
      FROM public.rewards_accrual_queue
      WHERE participacion_id = v_target_id;

      IF v_lot_after.id IS NOT NULL THEN
        INSERT INTO _rewards_recovery_results (
          participacion_id, jugador_nombre, riviera_id, estado_final,
          puntos_emitidos, lote_id, vencimiento_lote, detalle
        ) VALUES (
          v_target_id, v_rj.nombre, v_riviera_id, 'Acreditada durante esta recuperación',
          v_lot_after.puntos_originales, v_lot_after.id, v_lot_after.expires_at,
          'Acreditación automática completada exitosamente'
        );
      ELSIF v_queue_after.estado = 'error' THEN
        INSERT INTO _rewards_recovery_results (
          participacion_id, jugador_nombre, riviera_id, estado_final,
          puntos_emitidos, lote_id, vencimiento_lote, detalle
        ) VALUES (
          v_target_id, v_rj.nombre, v_riviera_id, 'Fallida (error en cola)',
          0, NULL, NULL,
          'Error en procesamiento: ' || COALESCE(v_queue_after.last_error, 'desconocido')
        );
      ELSIF v_queue_after.estado = 'omitida' THEN
        INSERT INTO _rewards_recovery_results (
          participacion_id, jugador_nombre, riviera_id, estado_final,
          puntos_emitidos, lote_id, vencimiento_lote, detalle
        ) VALUES (
          v_target_id, v_rj.nombre, v_riviera_id, 'Excluida (omitida)',
          0, NULL, NULL,
          'Participación omitida: ' || COALESCE(v_queue_after.last_error, 'sin beneficio aplicable')
        );
      ELSE
        INSERT INTO _rewards_recovery_results (
          participacion_id, jugador_nombre, riviera_id, estado_final,
          puntos_emitidos, lote_id, vencimiento_lote, detalle
        ) VALUES (
          v_target_id, v_rj.nombre, v_riviera_id, 'Pendiente',
          0, NULL, NULL,
          'No alcanzó condiciones de emisión automática'
        );
      END IF;

    EXCEPTION WHEN OTHERS THEN
      -- Aislamiento de error: el fallo en un registro no cancela los anteriores
      INSERT INTO _rewards_recovery_results (
        participacion_id, jugador_nombre, riviera_id, estado_final,
        puntos_emitidos, lote_id, vencimiento_lote, detalle
      ) VALUES (
        v_target_id, 'Error de proceso', 'N/A', 'Fallida (excepción)',
        0, NULL, NULL,
        'Excepción no controlada: ' || SQLERRM
      );
    END;
  END LOOP;
END;
$$;

-- ── 3. REPORTE FINAL DE RECUPERACIÓN (RESULTADO DETALLADO POR JUGADOR) ───────

SELECT
  participacion_id,
  jugador_nombre,
  riviera_id,
  estado_final,
  puntos_emitidos,
  vencimiento_lote,
  detalle
FROM _rewards_recovery_results
ORDER BY jugador_nombre ASC;
