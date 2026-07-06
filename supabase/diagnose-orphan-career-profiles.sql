-- Diagnóstico: perfiles huérfanos con participaciones/puntos fuera del grafo oficial.
--
-- PREREQUISITO OBLIGATORIO:
--   supabase/career-profile-link-integrity.sql
--
-- Solo lectura. No redefine funciones — usa _riviera_orphan_profile_audit() canónica.

DO $$
BEGIN
  IF to_regprocedure('public._riviera_orphan_profile_audit()') IS NULL THEN
    RAISE EXCEPTION
      'Falta _riviera_orphan_profile_audit — ejecutar career-profile-link-integrity.sql primero';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Resultado principal
-- ═══════════════════════════════════════════════════════════════════════════
SELECT *
FROM public._riviera_orphan_profile_audit()
ORDER BY
  CASE confidence
    WHEN 'HIGH' THEN 1
    WHEN 'REVIEW' THEN 2
    ELSE 3
  END,
  total_puntos DESC,
  orphan_nombre;

-- ═══════════════════════════════════════════════════════════════════════════
-- Resumen
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  confidence,
  COUNT(*) AS perfiles,
  COALESCE(SUM(total_puntos), 0) AS puntos_afectados
FROM public._riviera_orphan_profile_audit()
GROUP BY confidence
ORDER BY 1;

-- ═══════════════════════════════════════════════════════════════════════════
-- HIGH pendientes (candidatos a repair batch)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  orphan_jugador_id,
  orphan_nombre,
  orphan_club_name,
  total_puntos,
  candidate_riviera_id,
  reason
FROM public._riviera_orphan_profile_audit()
WHERE confidence = 'HIGH'
ORDER BY total_puntos DESC, orphan_nombre;

-- ═══════════════════════════════════════════════════════════════════════════
-- REVIEW pendientes (revisión manual obligatoria)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  orphan_jugador_id,
  orphan_nombre,
  orphan_club_name,
  total_puntos,
  candidate_riviera_id,
  candidate_count,
  reason,
  host_clubs
FROM public._riviera_orphan_profile_audit()
WHERE confidence = 'REVIEW'
ORDER BY total_puntos DESC, orphan_nombre;
