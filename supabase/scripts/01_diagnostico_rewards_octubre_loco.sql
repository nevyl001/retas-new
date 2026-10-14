-- ══════════════════════════════════════════════════════════════════════════════
-- SCRIPT 1: DIAGNÓSTICO DETALLADO DE ELEGIBILIDAD Y ESTADO (SOLO LECTURA)
--
-- Consulta el estado exacto de las 8 participaciones del Americano Dinámico en
-- Padelito Warehouse frente al esquema real de Riviera Rewards (0058 / 0061).
--
-- No realiza escrituras, modificaciones ni cambios de estado.
-- ══════════════════════════════════════════════════════════════════════════════

WITH target_participaciones AS (
  SELECT unnest(ARRAY[
    '1297cfb0-88dc-4ae0-80c7-1e732a9e2d43'::uuid,
    'f9ef66cc-032f-450d-867b-1e00e86f5c87'::uuid,
    '9f9a24f4-5e1c-433b-917a-42d544858547'::uuid,
    '26fbdcd5-b728-4179-90a4-c3a9b4837a5a'::uuid,
    'a2069224-75e5-4ba0-9d11-29b2953d9bd3'::uuid,
    '783c7d94-7a94-4638-9517-df3fde35681f'::uuid,
    '62acb7b9-d0f6-4644-84e7-e9e1ba5652c4'::uuid,
    '9c7c2f6d-20af-4d35-b3d1-7439d21cd588'::uuid
  ]) AS participacion_id

),
part_info AS (
  SELECT
    tp.participacion_id,
    jp.jugador_id,
    COALESCE(rj.nombre, 'Jugador no encontrado') AS jugador_nombre,
    COALESCE(
      (SELECT opi.riviera_id FROM public.riviera_official_player_identity opi WHERE opi.canonical_riviera_jugador_id = rj.id LIMIT 1),
      (
        SELECT opi.riviera_id
        FROM public.riviera_official_player_profile_link opl
        JOIN public.riviera_official_player_identity opi ON opi.official_player_key = opl.official_player_key
        WHERE opl.riviera_jugador_id = rj.id
        LIMIT 1
      ),
      'SIN-ID'
    ) AS riviera_id_oficial,

    jp.evento_id,
    jp.evento_nombre,
    jp.tipo_evento,
    jp.puntos_obtenidos AS puntos_deportivos,
    jp.sets_favor,
    jp.sets_contra,
    jp.resultado,
    (
      COALESCE(jp.metadata->>'subtipo' IN (
        'americano_cierre', 'reta_cierre', 'reta_resultado', 'duelo_2v2_cierre'
      ), false)
      OR COALESCE(jp.sets_favor, 0) > 0
      OR COALESCE(jp.sets_contra, 0) > 0
      OR COALESCE(jp.puntos_obtenidos, 0) > 0
      OR COALESCE(jp.resultado IN ('victoria', 'derrota', 'empate'), false)
      OR COALESCE((jp.metadata->>'partidos')::int > 0, false)
      OR (jp.metadata->'partidos_detalle' IS NOT NULL AND jsonb_array_length(jp.metadata->'partidos_detalle') > 0)
    ) AS juego_comprobado,
    COALESCE(
      NULLIF(trim(jp.metadata->>'organizador_id'), '')::uuid,
      public.riviera_participacion_expected_host_org(jp.tipo_evento::text, jp.evento_id::text)
    ) AS club_anfitrion_id,
    c.id AS campana_id,
    c.nombre AS campana_titulo,
    c.estado AS campana_estado,

    c.puntos_por_participacion,
    c.canje_hasta AS campana_canje_hasta
  FROM target_participaciones tp
  LEFT JOIN public.jugador_participaciones jp ON jp.id = tp.participacion_id
  LEFT JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
  LEFT JOIN LATERAL (
    SELECT rc.*
    FROM public.rewards_campaigns rc
    WHERE rc.organizador_id = COALESCE(
      NULLIF(trim(jp.metadata->>'organizador_id'), '')::uuid,
      public.riviera_participacion_expected_host_org(jp.tipo_evento::text, jp.evento_id::text)
    )
      AND rc.estado = 'activa'
      AND (rc.modalidades IS NULL OR 'americano' = ANY(rc.modalidades))
      AND COALESCE(jp.created_at, jp.fecha::timestamptz, now()) >= rc.acumula_desde
      AND COALESCE(jp.created_at, jp.fecha::timestamptz, now()) < rc.acumula_hasta
    ORDER BY rc.created_at DESC
    LIMIT 1
  ) c ON true
)
SELECT
  p.participacion_id,
  p.jugador_nombre,
  p.riviera_id_oficial,
  p.evento_nombre,
  p.tipo_evento,
  p.puntos_deportivos,
  p.juego_comprobado,
  p.club_anfitrion_id,
  p.campana_titulo,
  p.campana_estado,
  p.campana_canje_hasta,
  r.estado AS review_estado,
  r.motivo AS review_motivo,
  r.validation_source AS review_origen,
  q.id AS queue_id,
  q.estado AS queue_estado,
  q.attempts AS queue_intentos,
  q.last_error AS queue_error,
  l.id AS lot_id,
  l.puntos_originales AS lote_puntos_originales,
  l.puntos_restantes AS lote_puntos_restantes,
  l.expires_at AS lote_expires_at,
  l.anulado AS lote_anulado,
  (SELECT SUM(ld.puntos) FROM public.rewards_ledger ld WHERE ld.lot_id = l.id AND ld.tipo = 'acreditacion') AS ledger_acreditado,
  (SELECT SUM(ld.puntos) FROM public.rewards_ledger ld WHERE ld.lot_id = l.id AND ld.tipo = 'canje') AS ledger_canjes,
  (SELECT SUM(ld.puntos) FROM public.rewards_ledger ld WHERE ld.lot_id = l.id AND ld.tipo = 'cierre') AS ledger_vencimientos,
  (SELECT SUM(ld.puntos) FROM public.rewards_ledger ld WHERE ld.lot_id = l.id) AS ledger_saldo_neto
FROM part_info p
LEFT JOIN public.rewards_participation_reviews r ON r.participacion_id = p.participacion_id
LEFT JOIN public.rewards_accrual_queue q ON q.participacion_id = p.participacion_id
LEFT JOIN public.rewards_lots l ON l.participacion_id = p.participacion_id
ORDER BY p.jugador_nombre ASC;
