-- ══════════════════════════════════════════════════════════════════════════════
-- SCRIPT 2: RECUPERACIÓN IDEMPOTENTE ACOTADA DE PARTICIPACIONES
--
-- Recupera de forma segura e idempotente las 8 participaciones del Americano
-- Dinámico en Padelito Warehouse, bajo las siguientes garantías estrictas:
--
-- 1. Precondiciones exhaustivas: valida existencia de los 8 IDs, resolución
--    de club anfitrión, evento esperado y campaña activa aplicable antes de mutar.
-- 2. Respeto absoluto a rechazos manuales: si una revisión está 'rechazada',
--    se conserva intacta con su motivo original y jamás se fuerza su aprobación.
-- 3. Participación comprobada: solo acredita juego real demostrado (sets, games,
--    partidos, resultado o subtipo de cierre). Inscripciones simples sin juego no pasan.
-- 4. Aislamiento por subtransacciones: cada participación se procesa de forma
--    independiente (BEGIN...EXCEPTION). Un fallo individual no aborta a los demás.
-- 5. Auditoría de intentos: no recorta ni trunca el contador de reintentos.
-- 6. Idempotencia: ejecuciones repetidas detectan lotes existentes y no duplican puntos.
-- ══════════════════════════════════════════════════════════════════════════════

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


DO $$
DECLARE
  v_target_ids uuid[] := ARRAY[
    '1297cfb0-88dc-4ae0-80c7-1e732a9e2d43'::uuid,
    'f9ef66cc-032f-450d-867b-1e00e86f5c87'::uuid,
    '9f9a24f4-5e1c-433b-917a-42d544858547'::uuid,
    '26fbdcd5-b728-4179-90a4-c3a9b4837a5a'::uuid,
    'a2069224-75e5-4ba0-9d11-29b2953d9bd3'::uuid,
    '783c7d94-7a94-4638-9517-df3fde35681f'::uuid,
    '62acb7b9-d0f6-4644-84e7-e9e1ba5652c4'::uuid,
    '9c7c2f6d-20af-4d35-b5d1-7439d21cd588'::uuid
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
  v_campaign public.rewards_campaigns%ROWTYPE;
  v_host_club uuid;
  v_lot_after public.rewards_lots%ROWTYPE;
  v_queue_after public.rewards_accrual_queue%ROWTYPE;
BEGIN
  -- ── 1. VALIDACIÓN DE PRECONDICIONES EXHAUSTIVAS ─────────────────────────────

  -- A. Existencia de las 8 participaciones exactas
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

  -- B. Cada participación debe tener evento_id y club anfitrión resueltos
  SELECT COUNT(*) INTO v_unresolved_event
  FROM public.jugador_participaciones jp
  WHERE jp.id = ANY(v_target_ids)
    AND jp.evento_id IS NULL;

  IF v_unresolved_event > 0 THEN
    RAISE EXCEPTION 'Precondición 2 fallida: % participaciones no tienen evento_id resuelto', v_unresolved_event;
  END IF;

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

  -- C. Cada participación debe tener una campaña activa aplicable
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
      
      -- Identidad oficial Riviera
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


      -- Verificar si ya cuenta con lote emitido (idempotencia)
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

      -- Verificar si la revisión fue rechazada manualmente: CONSERVAR RECHAZO
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

      -- Verificar si está en cola con error previo
      SELECT * INTO v_existing_queue
      FROM public.rewards_accrual_queue
      WHERE participacion_id = v_target_id;

      IF v_existing_queue.id IS NOT NULL AND v_existing_queue.estado = 'error' THEN
        -- Reintentar la acreditación mediante rewards_accrue_one respetando intentos
        BEGIN
          PERFORM public.rewards_accrue_one(v_existing_queue.id);
        EXCEPTION WHEN OTHERS THEN
          UPDATE public.rewards_accrual_queue
          SET last_error = SQLERRM,
              attempts = attempts + 1
          WHERE id = v_existing_queue.id;
        END;
      ELSE
        -- Ejecutar el flujo estándar de elegibilidad y auto-acreditación
        PERFORM public.rewards_enqueue_candidate(v_target_id);
      END IF;

      -- Evaluar el resultado tras el procesamiento
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

-- ── 3. REPORTE FINAL DE RECUPERACIÓN ─────────────────────────────────────────

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

-- Dictamen global: Éxito total ÚNICAMENTE si hay 0 fallos
SELECT
  COUNT(*) AS total_participaciones,
  COUNT(*) FILTER (WHERE estado_final IN ('Ya acreditada previamente', 'Acreditada durante esta recuperación')) AS total_acreditadas,
  COUNT(*) FILTER (WHERE estado_final LIKE 'Fallida%') AS total_fallidas,
  COUNT(*) FILTER (WHERE estado_final LIKE 'Excluida%') AS total_excluidas,
  (COUNT(*) FILTER (WHERE estado_final LIKE 'Fallida%') = 0) AS exito_global_garantizado
FROM _rewards_recovery_results;
