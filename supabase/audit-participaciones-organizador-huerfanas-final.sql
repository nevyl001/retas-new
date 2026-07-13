-- ═══════════════════════════════════════════════════════════════════════════
-- AUDITORÍA FINAL — solo lectura
-- Limpieza huérfanas + repair Marco + delete Test interclubes
-- ═══════════════════════════════════════════════════════════════════════════
--
-- NO hace UPDATE / DELETE / INSERT / CREATE TABLE / COMMIT.
-- Ejecutar entero en SQL Editor. El último SELECT da PASS o FAIL.
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

-- Constantes de la limpieza aprobada
-- Marco (conservar / reparado)
--   c46767cf-74fd-4e03-9e39-5c5773319f20
-- Test interclubes (debieron borrarse) — IDs del backup/delete si los pegaste;
--   aquí se valida por evento_nombre + ausencia.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Huérfanas — conteo y buckets
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  COUNT(*) AS orphan_total
FROM public.jugador_participaciones jp
WHERE pg_temp._orphan_meta_org_missing(jp.metadata);

-- 1a) candidatos_delete_confirmados (Test interclubes que AÚN existan → FAIL)
SELECT
  'candidatos_delete_confirmados' AS bucket,
  jp.id AS participacion_id,
  jp.jugador_id,
  jp.tipo_evento::text AS tipo_evento,
  jp.evento_id,
  jp.evento_nombre,
  jp.puntos_obtenidos,
  l.id AS ledger_id
FROM public.jugador_participaciones jp
LEFT JOIN public.riviera_official_points_ledger l
  ON l.participacion_id = jp.id
WHERE pg_temp._orphan_meta_org_missing(jp.metadata)
  AND jp.evento_nombre ILIKE '%Test interclubes%'
ORDER BY jp.id;

-- 1b) excepciones_conservar (Marco — debe existir CON organizador_id, no huérfana)
SELECT
  'excepciones_conservar' AS bucket,
  jp.id AS participacion_id,
  jp.jugador_id,
  rj.nombre AS jugador_nombre,
  jp.evento_nombre,
  jp.metadata->>'organizador_id' AS metadata_organizador_id,
  pg_temp._orphan_meta_org_missing(jp.metadata) AS sigue_huerfana
FROM public.jugador_participaciones jp
LEFT JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
WHERE jp.id = 'c46767cf-74fd-4e03-9e39-5c5773319f20';

-- 1c) revisar_manual (huérfanas que no son Test interclubes ni Marco)
SELECT
  'revisar_manual' AS bucket,
  jp.id AS participacion_id,
  jp.jugador_id,
  rj.nombre AS jugador_nombre,
  jp.tipo_evento::text AS tipo_evento,
  jp.evento_id,
  jp.evento_nombre,
  jp.puntos_obtenidos,
  l.id AS ledger_id
FROM public.jugador_participaciones jp
LEFT JOIN public.riviera_official_points_ledger l
  ON l.participacion_id = jp.id
LEFT JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
WHERE pg_temp._orphan_meta_org_missing(jp.metadata)
  AND jp.id IS DISTINCT FROM 'c46767cf-74fd-4e03-9e39-5c5773319f20'
  AND COALESCE(jp.evento_nombre, '') NOT ILIKE '%Test interclubes%'
ORDER BY jp.created_at DESC NULLS LAST
LIMIT 50;

SELECT
  COUNT(*) AS revisar_manual_count
FROM public.jugador_participaciones jp
WHERE pg_temp._orphan_meta_org_missing(jp.metadata)
  AND jp.id IS DISTINCT FROM 'c46767cf-74fd-4e03-9e39-5c5773319f20'
  AND COALESCE(jp.evento_nombre, '') NOT ILIKE '%Test interclubes%';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Marco M — reparación
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  'marco_check' AS check_name,
  (jp.id IS NOT NULL) AS existe,
  (jp.evento_nombre = 'Reta 5ta Fuerza') AS evento_ok,
  (jp.metadata->>'organizador_id' = 'e724de97-3552-4a01-a269-f621e6f1ed26')
    AS metadata_organizador_ok,
  (l.source_organizer_id::text = 'e724de97-3552-4a01-a269-f621e6f1ed26')
    AS ledger_source_coincide,
  (l.source_organizer_id::text = (jp.metadata->>'organizador_id'))
    AS metadata_igual_ledger_source,
  jp.puntos_obtenidos,
  l.points AS ledger_points,
  (jp.puntos_obtenidos IS NOT DISTINCT FROM l.points)
    AS puntos_alineados_con_ledger,
  NOT pg_temp._orphan_meta_org_missing(jp.metadata) AS ya_no_huerfana
FROM public.jugador_participaciones jp
LEFT JOIN public.riviera_official_points_ledger l
  ON l.participacion_id = jp.id
WHERE jp.id = 'c46767cf-74fd-4e03-9e39-5c5773319f20';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) Test interclubes — deben haber desaparecido (jp + ledger)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  'test_interclubes_jp_restantes' AS check_name,
  COUNT(*) AS filas
FROM public.jugador_participaciones jp
WHERE jp.evento_nombre ILIKE '%Test interclubes%';

SELECT
  'test_interclubes_ledger_restantes' AS check_name,
  COUNT(*) AS filas
FROM public.riviera_official_points_ledger l
WHERE l.event_name ILIKE '%Test interclubes%'
   OR l.participacion_id IN (
     SELECT jp.id
     FROM public.jugador_participaciones jp
     WHERE jp.evento_nombre ILIKE '%Test interclubes%'
   );

-- Si guardaste backup, opcional: IDs del backup ya no en vivo
-- (solo lectura; ignora si no existe la tabla)
DO $$
DECLARE
  r record;
  v_alive integer;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname LIKE 'jugador_participaciones_orphan_backup_%'
    ORDER BY c.relname DESC
    LIMIT 1
  LOOP
    EXECUTE format(
      'SELECT COUNT(*) FROM public.jugador_participaciones jp
       INNER JOIN public.%I b ON b.id = jp.id',
      r.relname
    ) INTO v_alive;
    RAISE NOTICE 'backup_jp=%  ids_aun_en_vivo=% (esperado 0)', r.relname, v_alive;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) Warnings — mismo criterio que participacionesOrganizadorScope.ts
--    Esperado: 0
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  COUNT(*) AS filas_que_generarian_warning_huerfana
FROM public.jugador_participaciones jp
WHERE pg_temp._orphan_meta_org_missing(jp.metadata);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) VEREDICTO (PASS / FAIL)
-- ═══════════════════════════════════════════════════════════════════════════
WITH checks AS (
  SELECT
    (
      SELECT COUNT(*) = 0
      FROM public.jugador_participaciones jp
      WHERE pg_temp._orphan_meta_org_missing(jp.metadata)
    ) AS no_huerfanas,
    (
      SELECT COUNT(*) = 0
      FROM public.jugador_participaciones jp
      WHERE jp.evento_nombre ILIKE '%Test interclubes%'
    ) AS test_interclubes_jp_gone,
    (
      SELECT COUNT(*) = 0
      FROM public.riviera_official_points_ledger l
      WHERE l.event_name ILIKE '%Test interclubes%'
    ) AS test_interclubes_ledger_gone,
    (
      SELECT
        jp.id IS NOT NULL
        AND jp.evento_nombre = 'Reta 5ta Fuerza'
        AND jp.metadata->>'organizador_id' = 'e724de97-3552-4a01-a269-f621e6f1ed26'
        AND l.source_organizer_id::text = 'e724de97-3552-4a01-a269-f621e6f1ed26'
        AND NOT pg_temp._orphan_meta_org_missing(jp.metadata)
      FROM public.jugador_participaciones jp
      LEFT JOIN public.riviera_official_points_ledger l
        ON l.participacion_id = jp.id
      WHERE jp.id = 'c46767cf-74fd-4e03-9e39-5c5773319f20'
    ) AS marco_ok
)
SELECT
  CASE
    WHEN no_huerfanas
     AND test_interclubes_jp_gone
     AND test_interclubes_ledger_gone
     AND COALESCE(marco_ok, false)
    THEN 'PASS'
    ELSE 'FAIL'
  END AS estado,
  no_huerfanas AS "no_quedan_huerfanas",
  COALESCE(marco_ok, false) AS "marco_reparado",
  test_interclubes_jp_gone AS "test_interclubes_jp_eliminado",
  test_interclubes_ledger_gone AS "test_interclubes_ledger_eliminado",
  CASE
    WHEN no_huerfanas
     AND test_interclubes_jp_gone
     AND test_interclubes_ledger_gone
     AND COALESCE(marco_ok, false)
    THEN 'Marco reparado; Test interclubes eliminado; 0 huérfanas; warning no debería reaparecer por estos datos.'
    ELSE 'Revisar columnas false arriba (marco / test interclubes / huérfanas).'
  END AS detalle
FROM checks;
