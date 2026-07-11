-- ═══════════════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO READ-ONLY: matches en BD vs metadata.partidos_jugados
-- Jugador: Nevyl (RIV-00000011)
-- Eventos: HACK THE GAME, Hack
--
-- Ejecutar en Supabase SQL Editor (solo SELECT). Sin INSERT/UPDATE/DELETE.
-- Nota: jugador_participaciones NO tiene updated_at; usamos created_at.
-- ═══════════════════════════════════════════════════════════════════════════

-- IDs conocidos en prod (ajusta si difieren en tu entorno)
-- Nevyl @ Riviera Open: 810f9308-fe0a-4c63-b9aa-e44fca6fa243
-- Riviera Open org:     2770b522-9064-4c7b-a729-4a0ea7e3f6e8

-- ── 1) Participaciones de Nevyl en retas Hack ─────────────────────────────
WITH nevyl AS (
  SELECT id AS jugador_id
  FROM public.riviera_jugadores
  WHERE slug = 'nevyl'
    AND organizador_id = '2770b522-9064-4c7b-a729-4a0ea7e3f6e8'::uuid
  LIMIT 1
),
participaciones AS (
  SELECT
    jp.id AS participacion_id,
    jp.evento_id,
    jp.evento_nombre,
    jp.tipo_evento,
    jp.puntos_obtenidos,
    jp.fecha,
    jp.created_at,
    jp.metadata->>'partidos_jugados' AS meta_partidos_jugados,
    jp.metadata->>'partidos_ganados' AS meta_partidos_ganados,
    jp.metadata->>'partidos_perdidos' AS meta_partidos_perdidos,
    jsonb_array_length(
      COALESCE(jp.metadata->'partidos_detalle', '[]'::jsonb)
    ) AS meta_detalle_count,
    jp.metadata->'partidos_detalle' IS NOT NULL AS tiene_partidos_detalle
  FROM public.jugador_participaciones jp
  CROSS JOIN nevyl n
  WHERE jp.jugador_id = n.jugador_id
    AND jp.tipo_evento IN ('reta', 'duelo_2v2')
    AND (
      lower(trim(jp.evento_nombre)) LIKE '%hack the game%'
      OR lower(trim(jp.evento_nombre)) = 'hack'
      OR lower(trim(jp.evento_nombre)) LIKE 'hack %'
    )
)
SELECT
  p.participacion_id,
  p.evento_nombre,
  p.tipo_evento,
  p.puntos_obtenidos,
  p.fecha,
  p.meta_partidos_jugados,
  p.meta_partidos_ganados,
  p.meta_partidos_perdidos,
  p.meta_detalle_count,
  p.tiene_partidos_detalle,
  p.created_at AS participacion_created_at,
  t.is_finished AS torneo_is_finished,
  t.is_started AS torneo_is_started,
  COUNT(m.id) FILTER (WHERE m.status = 'finished') AS matches_finished_en_bd,
  COUNT(m.id) AS matches_total_en_bd
FROM participaciones p
LEFT JOIN public.tournaments t ON t.id::text = p.evento_id::text
LEFT JOIN public.matches m ON m.tournament_id = t.id
GROUP BY
  p.participacion_id,
  p.evento_id,
  p.evento_nombre,
  p.tipo_evento,
  p.puntos_obtenidos,
  p.fecha,
  p.meta_partidos_jugados,
  p.meta_partidos_ganados,
  p.meta_partidos_perdidos,
  p.meta_detalle_count,
  p.tiene_partidos_detalle,
  p.created_at,
  t.is_finished,
  t.is_started
ORDER BY p.fecha DESC, p.evento_nombre;

-- ── 2) Detalle de matches por torneo (HACK THE GAME / Hack) ───────────────
-- Columnas validadas en public.matches (prod, 2026-07-11):
--   id, tournament_id, pair1_id, pair2_id, pair1_name, pair2_name,
--   court, round, status, pair1_score, pair2_score, created_at
-- NO existen: match_type, user_id
WITH nevyl AS (
  SELECT id AS jugador_id
  FROM public.riviera_jugadores
  WHERE slug = 'nevyl'
    AND organizador_id = '2770b522-9064-4c7b-a729-4a0ea7e3f6e8'::uuid
  LIMIT 1
),
eventos AS (
  SELECT DISTINCT jp.evento_id::uuid AS tournament_id, jp.evento_nombre
  FROM public.jugador_participaciones jp
  CROSS JOIN nevyl n
  WHERE jp.jugador_id = n.jugador_id
    AND jp.tipo_evento = 'reta'
    AND (
      lower(trim(jp.evento_nombre)) LIKE '%hack the game%'
      OR lower(trim(jp.evento_nombre)) = 'hack'
    )
)
SELECT
  e.evento_nombre,
  m.id AS match_id,
  m.status,
  m.round,
  m.court,
  m.pair1_name,
  m.pair2_name,
  m.pair1_score,
  m.pair2_score,
  m.created_at
FROM eventos e
JOIN public.matches m ON m.tournament_id = e.tournament_id
ORDER BY e.evento_nombre, m.round, m.court;

-- ── 3) Resumen jugador_stats vs suma participaciones ──────────────────────
WITH nevyl AS (
  SELECT id AS jugador_id
  FROM public.riviera_jugadores
  WHERE slug = 'nevyl'
    AND organizador_id = '2770b522-9064-4c7b-a729-4a0ea7e3f6e8'::uuid
  LIMIT 1
)
SELECT
  js.total_partidos,
  js.victorias,
  js.derrotas,
  js.pct_victorias,
  js.puntos_totales,
  (
    SELECT COALESCE(SUM(jp.puntos_obtenidos), 0)
    FROM public.jugador_participaciones jp
    CROSS JOIN nevyl n
    WHERE jp.jugador_id = n.jugador_id
  ) AS suma_pts_participaciones,
  (
    SELECT COUNT(*)
    FROM public.jugador_participaciones jp
    CROSS JOIN nevyl n
    WHERE jp.jugador_id = n.jugador_id
  ) AS count_participaciones
FROM public.jugador_stats js
CROSS JOIN nevyl n
WHERE js.jugador_id = n.jugador_id;
