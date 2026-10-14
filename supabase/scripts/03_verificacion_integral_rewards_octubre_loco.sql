-- ══════════════════════════════════════════════════════════════════════════════
-- SCRIPT 3: VERIFICACIÓN INTEGRAL DE CONSISTENCIA Y SALDOS DE REWARDS
--
-- Evalúa las 8 participaciones distinguiendo crédito original, canjes, vencimientos,
-- ajustes y saldo resultante, comprobando la coherencia del ledger y lotes.
-- ══════════════════════════════════════════════════════════════════════════════

WITH target_ids AS (
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
part_data AS (
  SELECT
    t.participacion_id,
    COALESCE(rj.nombre, 'No encontrado') AS jugador_nombre,
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
    ) AS riviera_id,

    c.id AS campana_id,
    c.canje_hasta AS campana_canje_hasta,
    q.estado AS cola_estado,
    l.id AS lote_id,
    l.puntos_originales,
    l.puntos_restantes,
    l.expires_at AS lote_expires_at,
    l.anulado AS lote_anulado,
    (SELECT COUNT(*) FROM public.rewards_lots rl WHERE rl.participacion_id = t.participacion_id) AS conteo_lotes,
    COALESCE((SELECT SUM(ld.puntos) FROM public.rewards_ledger ld WHERE ld.lot_id = l.id AND ld.tipo = 'acreditacion'), 0) AS ledger_acreditado,
    COALESCE((SELECT SUM(ld.puntos) FROM public.rewards_ledger ld WHERE ld.lot_id = l.id AND ld.tipo = 'canje'), 0) AS ledger_canjes,
    COALESCE((SELECT SUM(ld.puntos) FROM public.rewards_ledger ld WHERE ld.lot_id = l.id AND ld.tipo = 'cierre'), 0) AS ledger_vencimientos,
    COALESCE((SELECT SUM(ld.puntos) FROM public.rewards_ledger ld WHERE ld.lot_id = l.id AND ld.tipo NOT IN ('acreditacion', 'canje', 'cierre')), 0) AS ledger_ajustes,
    COALESCE((SELECT SUM(ld.puntos) FROM public.rewards_ledger ld WHERE ld.lot_id = l.id), 0) AS ledger_saldo_neto
  FROM target_ids t
  LEFT JOIN public.jugador_participaciones jp ON jp.id = t.participacion_id
  LEFT JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
  LEFT JOIN public.rewards_accrual_queue q ON q.participacion_id = t.participacion_id
  LEFT JOIN public.rewards_campaigns c ON c.id = q.campaign_id
  LEFT JOIN public.rewards_lots l ON l.participacion_id = t.participacion_id
)
SELECT
  p.participacion_id,
  p.jugador_nombre,
  p.riviera_id,
  p.cola_estado,
  p.puntos_originales AS pts_originales_lote,
  p.ledger_acreditado AS pts_originales_ledger,
  p.ledger_canjes AS pts_canjeados,
  p.ledger_vencimientos AS pts_vencidos,
  p.ledger_ajustes AS pts_ajustes,
  p.puntos_restantes AS saldo_lote,
  p.ledger_saldo_neto AS saldo_ledger,
  p.conteo_lotes,
  (p.puntos_originales = 10 AND p.ledger_acreditado = 10) AS check_credito_original_10,
  (p.lote_expires_at = p.campana_canje_hasta AND p.lote_expires_at IS NOT NULL) AS check_vencimiento_valido,
  (p.puntos_restantes = p.ledger_saldo_neto) AS check_coherencia_saldo,
  (p.conteo_lotes = 1) AS check_sin_duplicados,
  CASE
    WHEN (p.puntos_originales = 10 AND p.ledger_acreditado = 10)
     AND (p.lote_expires_at = p.campana_canje_hasta AND p.lote_expires_at IS NOT NULL)
     AND (p.puntos_restantes = p.ledger_saldo_neto)
     AND (p.conteo_lotes = 1) THEN 'CONSISTENTE'
    ELSE 'DISCREPANCIA'
  END AS veredicto
FROM part_data p
ORDER BY p.jugador_nombre ASC;

