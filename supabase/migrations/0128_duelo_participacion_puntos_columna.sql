-- =============================================================================
-- 0128_duelo_participacion_puntos_columna.sql
--
-- RIV-00000037. Un duelo 2v2 cerrado como derrota (2.º lugar) tiene
-- metadata.puntos_evento = 20 y metadata.puntos_desglose.duelo_2v2_perdedor = 20.
-- El ledger oficial guarda esos 20. La columna puntos_obtenidos quedó en 0.
--
-- La regla vigente del perdedor es 20 puntos. Esta reparación devuelve la
-- columna al valor que la propia fila y el ledger ya declaran.
--
-- No modifica el ledger, los totales oficiales, el resultado ni los ajustes.
-- Si la fila ya tiene 20, no hace nada. Si alguna condición no coincide,
-- no actualiza ninguna fila.
--
-- APLICACIÓN: ejecutar este archivo solo, a mano. No usar db push.
-- =============================================================================

BEGIN;

WITH candidate AS (
  SELECT jp.id
  FROM public.jugador_participaciones jp
  JOIN public.riviera_official_points_ledger l
    ON l.participacion_id = jp.id
  JOIN public.riviera_official_player_identity i
    ON i.official_player_key = l.official_player_key
  WHERE i.riviera_id = 'RIV-00000037'
    AND jp.id = 'c46767cf-74fd-4e03-9e39-5c5773319f20'
    AND jp.puntos_obtenidos = 0
    AND l.points = 20
    AND l.counts_for_official_ranking
    AND l.event_type = 'duelo_2v2'
    AND jp.tipo_evento::text = 'duelo_2v2'
    AND jp.resultado::text = 'derrota'
    AND jp.metadata->>'subtipo' = 'duelo_2v2_cierre'
    AND jp.metadata->>'puntos_evento' = '20'
    AND jp.metadata->'puntos_desglose'->>'duelo_2v2_perdedor' = '20'
    AND jp.metadata->>'placement' = 'subcampeon'
),
updated AS (
  UPDATE public.jugador_participaciones jp
  SET
    puntos_obtenidos = 20,
    metadata = COALESCE(jp.metadata, '{}'::jsonb) || jsonb_build_object(
      'puntos_columna_reparada_desde', 0,
      'puntos_columna_reparada_a', 20,
      'puntos_columna_reparada_motivo', 'duelo_2v2_perdedor_coincide_con_ledger',
      'puntos_columna_reparada_at', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )
  WHERE jp.id IN (SELECT id FROM candidate)
    AND jp.puntos_obtenidos = 0
  RETURNING jp.id
)
SELECT COUNT(*)::int AS filas_reparadas
FROM updated;

COMMIT;
