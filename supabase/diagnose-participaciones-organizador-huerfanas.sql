-- ═══════════════════════════════════════════════════════════════════════════
-- PASO 1 — DIAGNÓSTICO (SOLO LECTURA)
-- Separación EXPLÍCITA: candidatos a borrar vs excepciones a conservar
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Tras revisión humana (2026-07-13):
--   CONSERVAR (backfill, NO delete):
--     participacion_id = c46767cf-74fd-4e03-9e39-5c5773319f20
--     jugador = Marco M · evento = Reta 5ta Fuerza
--     → repair-marco-reta-5ta-fuerza-organizador.sql
--
--   DELETE (solo pruebas):
--     filas "Test interclubes" (3) + su ledger
--     → backup-…sql → delete-…sql
--
-- NO borrar automáticamente por “huérfana + padre ausente”:
-- ese criterio mezcló historial real (Marco) con basura de pruebas.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION pg_temp._orphan_meta_org_missing(p_metadata jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(trim(COALESCE(p_metadata->>'organizador_id', '')), '') IS NULL;
$$;

CREATE OR REPLACE FUNCTION pg_temp._try_parse_uuid(p_text text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text := NULLIF(trim(COALESCE(p_text, '')), '');
BEGIN
  IF v IS NULL THEN
    RETURN NULL;
  END IF;
  IF v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;
  RETURN v::uuid;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp._orphan_parent_exists(
  p_tipo_evento text,
  p_evento_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN pg_temp._try_parse_uuid(p_evento_id) IS NULL THEN false
    WHEN p_tipo_evento = 'reta' THEN EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = pg_temp._try_parse_uuid(p_evento_id)
    )
    WHEN p_tipo_evento = 'americano' THEN EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = pg_temp._try_parse_uuid(p_evento_id)
    )
    WHEN p_tipo_evento = 'duelo_2v2' THEN EXISTS (
      SELECT 1 FROM public.duelos_2v2 d
      WHERE d.id = pg_temp._try_parse_uuid(p_evento_id)
    )
    WHEN p_tipo_evento = 'torneo_express' THEN EXISTS (
      SELECT 1 FROM public.torneo_express t
      WHERE t.id = pg_temp._try_parse_uuid(p_evento_id)
    )
    WHEN p_tipo_evento = 'liga' THEN (
      EXISTS (
        SELECT 1 FROM public.liga_jornadas lj
        WHERE lj.id = pg_temp._try_parse_uuid(p_evento_id)
      )
      OR EXISTS (
        SELECT 1 FROM public.ligas l
        WHERE l.id = pg_temp._try_parse_uuid(p_evento_id)
      )
    )
    ELSE false
  END;
$$;

-- Constantes de revisión humana
CREATE OR REPLACE FUNCTION pg_temp._excepcion_conservar_id()
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'c46767cf-74fd-4e03-9e39-5c5773319f20'::uuid;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- A) EXCEPCIONES — CONSERVAR (no borrar; van a repair/backfill)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  'excepciones_conservar' AS bucket,
  jp.id AS participacion_id,
  jp.jugador_id,
  rj.nombre AS jugador_nombre,
  jp.tipo_evento::text AS tipo_evento,
  jp.evento_id,
  jp.evento_nombre,
  jp.puntos_obtenidos,
  jp.created_at,
  l.id AS ledger_id,
  l.points AS ledger_points,
  l.source_organizer_id AS ledger_source_organizer_id,
  'repair-marco-reta-5ta-fuerza-organizador.sql' AS next_script
FROM public.jugador_participaciones jp
LEFT JOIN public.riviera_official_points_ledger l
  ON l.participacion_id = jp.id
LEFT JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
WHERE jp.id = pg_temp._excepcion_conservar_id();

-- ═══════════════════════════════════════════════════════════════════════════
-- B) CANDIDATOS DELETE CONFIRMADOS — solo "Test interclubes"
--    (excluye siempre a Marco; no usa el criterio general solo)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  'candidatos_delete_confirmados' AS bucket,
  jp.id AS participacion_id,
  jp.jugador_id,
  rj.nombre AS jugador_nombre,
  jp.tipo_evento::text AS tipo_evento,
  jp.evento_id,
  jp.evento_nombre,
  jp.puntos_obtenidos,
  jp.created_at,
  l.id AS ledger_id,
  l.points AS ledger_points,
  l.source_organizer_id AS ledger_source_organizer_id
FROM public.jugador_participaciones jp
INNER JOIN public.riviera_official_points_ledger l
  ON l.participacion_id = jp.id
LEFT JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
WHERE pg_temp._orphan_meta_org_missing(jp.metadata)
  AND NOT pg_temp._orphan_parent_exists(jp.tipo_evento::text, jp.evento_id::text)
  AND jp.id IS DISTINCT FROM pg_temp._excepcion_conservar_id()
  AND jp.evento_nombre ILIKE '%Test interclubes%'
ORDER BY jp.created_at DESC NULLS LAST, jp.id;

-- Conteo esperado: 3 participaciones / 3 ledger
SELECT
  COUNT(DISTINCT jp.id) AS candidatos_delete_jp,
  COUNT(l.id) AS candidatos_delete_ledger
FROM public.jugador_participaciones jp
INNER JOIN public.riviera_official_points_ledger l
  ON l.participacion_id = jp.id
WHERE pg_temp._orphan_meta_org_missing(jp.metadata)
  AND NOT pg_temp._orphan_parent_exists(jp.tipo_evento::text, jp.evento_id::text)
  AND jp.id IS DISTINCT FROM pg_temp._excepcion_conservar_id()
  AND jp.evento_nombre ILIKE '%Test interclubes%';

-- Lista lista para pegar en backup/delete (VALUES)
SELECT
  format(
    E'  (%L::uuid),\n  (%L::uuid),\n  (%L::uuid)',
    (array_agg(jp.id ORDER BY jp.id))[1],
    (array_agg(jp.id ORDER BY jp.id))[2],
    (array_agg(jp.id ORDER BY jp.id))[3]
  ) AS pegar_en_backup_y_delete_values
FROM public.jugador_participaciones jp
INNER JOIN public.riviera_official_points_ledger l
  ON l.participacion_id = jp.id
WHERE pg_temp._orphan_meta_org_missing(jp.metadata)
  AND NOT pg_temp._orphan_parent_exists(jp.tipo_evento::text, jp.evento_id::text)
  AND jp.id IS DISTINCT FROM pg_temp._excepcion_conservar_id()
  AND jp.evento_nombre ILIKE '%Test interclubes%';

-- ═══════════════════════════════════════════════════════════════════════════
-- C) REVISAR — huérfanas+ledger+padre ausente que NO son Test interclubes
--    ni la excepción Marco (no borrar a ciegas)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  'revisar_no_borrar_automatico' AS bucket,
  jp.id AS participacion_id,
  jp.jugador_id,
  rj.nombre AS jugador_nombre,
  jp.tipo_evento::text AS tipo_evento,
  jp.evento_id,
  jp.evento_nombre,
  jp.puntos_obtenidos,
  l.id AS ledger_id
FROM public.jugador_participaciones jp
INNER JOIN public.riviera_official_points_ledger l
  ON l.participacion_id = jp.id
LEFT JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
WHERE pg_temp._orphan_meta_org_missing(jp.metadata)
  AND NOT pg_temp._orphan_parent_exists(jp.tipo_evento::text, jp.evento_id::text)
  AND jp.id IS DISTINCT FROM pg_temp._excepcion_conservar_id()
  AND jp.evento_nombre NOT ILIKE '%Test interclubes%'
ORDER BY jp.evento_nombre, jp.id;

-- Fin diagnose.
-- Siguiente si B = exactamente 3+3:
--   backup-participaciones-organizador-huerfanas.sql
--   delete-participaciones-organizador-huerfanas.sql
-- Marco → repair-marco-reta-5ta-fuerza-organizador.sql (aparte)
