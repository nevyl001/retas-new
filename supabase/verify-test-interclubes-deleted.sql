-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN post-delete Test interclubes (SOLO LECTURA)
-- Luego corre también: audit-participaciones-organizador-huerfanas-final.sql
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  COUNT(*) AS test_interclubes_jp_restantes_esperado_0
FROM public.jugador_participaciones
WHERE evento_nombre ILIKE '%Test interclubes%';

SELECT
  COUNT(*) AS test_interclubes_ledger_restantes_esperado_0
FROM public.riviera_official_points_ledger
WHERE event_name ILIKE '%Test interclubes%';

SELECT
  'marco' AS quien,
  jp.id AS participacion_id,
  jp.evento_nombre,
  jp.metadata->>'organizador_id' AS metadata_organizador_id,
  (
    jp.metadata->>'organizador_id' = 'e724de97-3552-4a01-a269-f621e6f1ed26'
  ) AS marco_organizador_ok,
  l.id AS ledger_id,
  l.source_organizer_id,
  jp.puntos_obtenidos,
  l.points AS ledger_points
FROM public.jugador_participaciones jp
LEFT JOIN public.riviera_official_points_ledger l
  ON l.participacion_id = jp.id
WHERE jp.id = 'c46767cf-74fd-4e03-9e39-5c5773319f20';

SELECT
  CASE
    WHEN (
      SELECT COUNT(*) FROM public.jugador_participaciones
      WHERE evento_nombre ILIKE '%Test interclubes%'
    ) = 0
    AND (
      SELECT COUNT(*) FROM public.riviera_official_points_ledger
      WHERE event_name ILIKE '%Test interclubes%'
    ) = 0
    AND (
      SELECT metadata->>'organizador_id'
      FROM public.jugador_participaciones
      WHERE id = 'c46767cf-74fd-4e03-9e39-5c5773319f20'
    ) = 'e724de97-3552-4a01-a269-f621e6f1ed26'
    THEN 'PASS — Test interclubes fuera; Marco intacto'
    ELSE 'FAIL — revisa conteos / Marco'
  END AS veredicto_rapido;
