-- Reporte de auditoría de producción (solo lectura).
-- PREREQUISITO: career-profile-link-integrity.sql desplegado.
-- Ejecutar en SQL Editor tras deploy o para reporte periódico.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Huérfanos por confidence
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  confidence,
  COUNT(*) AS perfiles,
  COALESCE(SUM(total_puntos), 0) AS puntos_afectados
FROM public._riviera_orphan_profile_audit()
GROUP BY confidence
ORDER BY 1;

-- HIGH pendientes
SELECT orphan_jugador_id, orphan_nombre, orphan_club_name, total_puntos,
       candidate_riviera_id, reason
FROM public._riviera_orphan_profile_audit()
WHERE confidence = 'HIGH'
ORDER BY total_puntos DESC;

-- REVIEW pendientes
SELECT orphan_jugador_id, orphan_nombre, orphan_club_name, total_puntos,
       candidate_riviera_id, candidate_count, reason, host_clubs
FROM public._riviera_orphan_profile_audit()
WHERE confidence = 'REVIEW'
ORDER BY total_puntos DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Links duplicados (riviera_jugador_id)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT riviera_jugador_id, COUNT(*) AS filas
FROM public.riviera_official_player_profile_link
GROUP BY riviera_jugador_id
HAVING COUNT(*) > 1;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) Riviera ID duplicados
-- ═══════════════════════════════════════════════════════════════════════════
SELECT riviera_id, COUNT(*) AS identities, array_agg(official_player_key::text) AS keys
FROM public.riviera_official_player_identity
WHERE riviera_id IS NOT NULL
GROUP BY riviera_id
HAVING COUNT(*) > 1;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) Participaciones con puntos sin metadata.organizador_id
-- ═══════════════════════════════════════════════════════════════════════════
SELECT id, jugador_id, tipo_evento, evento_id, evento_nombre, puntos_obtenidos, metadata
FROM public.jugador_participaciones
WHERE COALESCE(puntos_obtenidos, 0) > 0
  AND (
    metadata->>'organizador_id' IS NULL
    OR trim(metadata->>'organizador_id') = ''
  )
ORDER BY puntos_obtenidos DESC
LIMIT 50;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) SIN_PADRE — participaciones sin evento padre
-- ═══════════════════════════════════════════════════════════════════════════

-- Duelo 2v2
SELECT jp.id, jp.jugador_id, jp.evento_id, jp.evento_nombre, jp.puntos_obtenidos
FROM public.jugador_participaciones jp
WHERE jp.tipo_evento = 'duelo_2v2'
  AND COALESCE(jp.puntos_obtenidos, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.duelos_2v2 d WHERE d.id::text = jp.evento_id
  )
ORDER BY jp.evento_nombre
LIMIT 50;

-- Reta
SELECT jp.id, jp.jugador_id, jp.evento_id, jp.evento_nombre, jp.puntos_obtenidos
FROM public.jugador_participaciones jp
WHERE jp.tipo_evento = 'reta'
  AND COALESCE(jp.puntos_obtenidos, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.tournaments t WHERE t.id::text = jp.evento_id
  )
ORDER BY jp.evento_nombre
LIMIT 50;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) Eventos cerrados sin carrera (muestra)
-- ═══════════════════════════════════════════════════════════════════════════

-- Retas finalizadas sin participaciones
SELECT t.id, t.name, t.organizador_id, t.is_finished
FROM public.tournaments t
WHERE t.is_finished = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.jugador_participaciones jp
    WHERE jp.tipo_evento = 'reta'
      AND jp.evento_id = t.id::text
  )
ORDER BY t.updated_at DESC NULLS LAST
LIMIT 30;

-- Duelos finalizados sin participaciones
SELECT d.id, d.pareja_a_j1_nombre, d.pareja_b_j1_nombre, d.organizador_id, d.estado
FROM public.duelos_2v2 d
WHERE d.estado = 'finalizado'
  AND d.ganador IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.jugador_participaciones jp
    WHERE jp.tipo_evento = 'duelo_2v2'
      AND jp.evento_id = d.id::text
  )
ORDER BY d.finalizado_at DESC NULLS LAST
LIMIT 30;

-- Participaciones con puntos sin profile_link en jugador
SELECT jp.id, jp.jugador_id, rj.nombre, jp.evento_nombre, jp.puntos_obtenidos
FROM public.jugador_participaciones jp
INNER JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
WHERE COALESCE(jp.puntos_obtenidos, 0) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.riviera_official_player_profile_link pl
    WHERE pl.riviera_jugador_id = jp.jugador_id
  )
ORDER BY jp.puntos_obtenidos DESC
LIMIT 50;
