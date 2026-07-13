-- ═══════════════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO — ~30 huérfanas restantes (SOLO LECTURA)
-- Post-cierre Test interclubes + Marco. NO UPDATE / DELETE / INSERT.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Clasificación (columna repair_bucket):
--   AUTO_PARENT   — evento padre vivo con organizador resoluble → backfill seguro
--   AUTO_LEDGER   — padre ausente/inválido, pero ledger.source_organizer_id único
--                   (mismo patrón que Marco)
--   MANUAL_REVIEW — sin fuente única / conflicto / tipo no soportado
--
-- Plan de reparación: docs/PARTICIPACIONES-HUERFANAS-RESTANTES-PLAN.md
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
  IF v IS NULL THEN RETURN NULL; END IF;
  IF v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;
  RETURN v::uuid;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$;

-- Mismo criterio que riviera_participacion_expected_host_org (cast seguro).
CREATE OR REPLACE FUNCTION pg_temp._expected_host_org(
  p_tipo_evento text,
  p_evento_id text
)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN pg_temp._try_parse_uuid(p_evento_id) IS NULL THEN NULL
    WHEN p_tipo_evento = 'reta' THEN (
      SELECT t.user_id FROM public.tournaments t
      WHERE t.id = pg_temp._try_parse_uuid(p_evento_id) LIMIT 1
    )
    WHEN p_tipo_evento = 'americano' THEN (
      SELECT t.user_id FROM public.tournaments t
      WHERE t.id = pg_temp._try_parse_uuid(p_evento_id) LIMIT 1
    )
    WHEN p_tipo_evento = 'duelo_2v2' THEN (
      SELECT d.organizador_id FROM public.duelos_2v2 d
      WHERE d.id = pg_temp._try_parse_uuid(p_evento_id) LIMIT 1
    )
    WHEN p_tipo_evento = 'torneo_express' THEN (
      SELECT t.organizador_id FROM public.torneo_express t
      WHERE t.id = pg_temp._try_parse_uuid(p_evento_id) LIMIT 1
    )
    WHEN p_tipo_evento = 'liga' THEN COALESCE(
      (
        SELECT l.organizador_id
        FROM public.liga_jornadas lj
        INNER JOIN public.ligas l ON l.id = lj.liga_id
        WHERE lj.id = pg_temp._try_parse_uuid(p_evento_id)
        LIMIT 1
      ),
      (
        SELECT l.organizador_id FROM public.ligas l
        WHERE l.id = pg_temp._try_parse_uuid(p_evento_id)
        LIMIT 1
      )
    )
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION pg_temp._parent_exists(
  p_tipo_evento text,
  p_evento_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT pg_temp._expected_host_org(p_tipo_evento, p_evento_id) IS NOT NULL
    OR (
      pg_temp._try_parse_uuid(p_evento_id) IS NOT NULL
      AND CASE p_tipo_evento
        WHEN 'reta' THEN EXISTS (
          SELECT 1 FROM public.tournaments t
          WHERE t.id = pg_temp._try_parse_uuid(p_evento_id)
        )
        WHEN 'americano' THEN EXISTS (
          SELECT 1 FROM public.tournaments t
          WHERE t.id = pg_temp._try_parse_uuid(p_evento_id)
        )
        WHEN 'duelo_2v2' THEN EXISTS (
          SELECT 1 FROM public.duelos_2v2 d
          WHERE d.id = pg_temp._try_parse_uuid(p_evento_id)
        )
        WHEN 'torneo_express' THEN EXISTS (
          SELECT 1 FROM public.torneo_express t
          WHERE t.id = pg_temp._try_parse_uuid(p_evento_id)
        )
        WHEN 'liga' THEN (
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
      END
    );
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0) Total huérfanas
-- ═══════════════════════════════════════════════════════════════════════════
SELECT COUNT(*) AS orphan_total
FROM public.jugador_participaciones jp
WHERE pg_temp._orphan_meta_org_missing(jp.metadata);

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Detalle clasificado (fila a fila)
-- ═══════════════════════════════════════════════════════════════════════════
WITH base AS (
  SELECT
    jp.id AS participacion_id,
    jp.jugador_id,
    rj.nombre AS jugador_nombre,
    jp.tipo_evento::text AS tipo_evento,
    jp.evento_id,
    jp.evento_nombre,
    jp.puntos_obtenidos,
    jp.created_at,
    pg_temp._try_parse_uuid(jp.evento_id::text) IS NULL
      AND NULLIF(trim(COALESCE(jp.evento_id::text, '')), '') IS NOT NULL
      AS evento_id_invalido,
    pg_temp._parent_exists(jp.tipo_evento::text, jp.evento_id::text)
      AS parent_exists,
    pg_temp._expected_host_org(jp.tipo_evento::text, jp.evento_id::text)
      AS expected_organizador_id,
    l.id AS ledger_id,
    l.source_organizer_id AS ledger_source_organizer_id,
    l.points AS ledger_points
  FROM public.jugador_participaciones jp
  LEFT JOIN public.riviera_official_points_ledger l
    ON l.participacion_id = jp.id
  LEFT JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
  WHERE pg_temp._orphan_meta_org_missing(jp.metadata)
),
classified AS (
  SELECT
    b.*,
    CASE
      WHEN b.expected_organizador_id IS NOT NULL
        AND (
          b.ledger_source_organizer_id IS NULL
          OR b.ledger_source_organizer_id = b.expected_organizador_id
        )
        THEN 'AUTO_PARENT'
      WHEN b.expected_organizador_id IS NULL
        AND b.ledger_source_organizer_id IS NOT NULL
        THEN 'AUTO_LEDGER'
      WHEN b.expected_organizador_id IS NOT NULL
        AND b.ledger_source_organizer_id IS NOT NULL
        AND b.ledger_source_organizer_id IS DISTINCT FROM b.expected_organizador_id
        THEN 'MANUAL_CONFLICT_PARENT_VS_LEDGER'
      WHEN b.evento_id_invalido
        THEN 'MANUAL_EVENTO_ID_INVALID'
      WHEN NOT b.parent_exists
        AND b.ledger_source_organizer_id IS NULL
        THEN 'MANUAL_PARENT_MISSING_NO_SOURCE'
      ELSE 'MANUAL_REVIEW'
    END AS repair_bucket,
    CASE
      WHEN b.expected_organizador_id IS NOT NULL
        AND (
          b.ledger_source_organizer_id IS NULL
          OR b.ledger_source_organizer_id = b.expected_organizador_id
        )
        THEN b.expected_organizador_id
      WHEN b.expected_organizador_id IS NULL
        AND b.ledger_source_organizer_id IS NOT NULL
        THEN b.ledger_source_organizer_id
      ELSE NULL
    END AS proposed_organizador_id
  FROM base b
)
SELECT
  repair_bucket,
  participacion_id,
  jugador_id,
  jugador_nombre,
  tipo_evento,
  evento_id,
  evento_nombre,
  puntos_obtenidos,
  evento_id_invalido,
  parent_exists,
  expected_organizador_id,
  ledger_id,
  ledger_source_organizer_id,
  proposed_organizador_id,
  created_at
FROM classified
ORDER BY
  CASE repair_bucket
    WHEN 'AUTO_PARENT' THEN 1
    WHEN 'AUTO_LEDGER' THEN 2
    WHEN 'MANUAL_CONFLICT_PARENT_VS_LEDGER' THEN 3
    WHEN 'MANUAL_EVENTO_ID_INVALID' THEN 4
    WHEN 'MANUAL_PARENT_MISSING_NO_SOURCE' THEN 5
    ELSE 6
  END,
  tipo_evento,
  evento_nombre,
  participacion_id;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Resumen por bucket
-- ═══════════════════════════════════════════════════════════════════════════
WITH base AS (
  SELECT
    jp.id,
    jp.tipo_evento::text AS tipo_evento,
    pg_temp._try_parse_uuid(jp.evento_id::text) IS NULL
      AND NULLIF(trim(COALESCE(jp.evento_id::text, '')), '') IS NOT NULL
      AS evento_id_invalido,
    pg_temp._parent_exists(jp.tipo_evento::text, jp.evento_id::text) AS parent_exists,
    pg_temp._expected_host_org(jp.tipo_evento::text, jp.evento_id::text)
      AS expected_organizador_id,
    l.source_organizer_id AS ledger_source_organizer_id
  FROM public.jugador_participaciones jp
  LEFT JOIN public.riviera_official_points_ledger l ON l.participacion_id = jp.id
  WHERE pg_temp._orphan_meta_org_missing(jp.metadata)
),
classified AS (
  SELECT
    CASE
      WHEN expected_organizador_id IS NOT NULL
        AND (
          ledger_source_organizer_id IS NULL
          OR ledger_source_organizer_id = expected_organizador_id
        )
        THEN 'AUTO_PARENT'
      WHEN expected_organizador_id IS NULL
        AND ledger_source_organizer_id IS NOT NULL
        THEN 'AUTO_LEDGER'
      WHEN expected_organizador_id IS NOT NULL
        AND ledger_source_organizer_id IS NOT NULL
        AND ledger_source_organizer_id IS DISTINCT FROM expected_organizador_id
        THEN 'MANUAL_CONFLICT_PARENT_VS_LEDGER'
      WHEN evento_id_invalido THEN 'MANUAL_EVENTO_ID_INVALID'
      WHEN NOT parent_exists AND ledger_source_organizer_id IS NULL
        THEN 'MANUAL_PARENT_MISSING_NO_SOURCE'
      ELSE 'MANUAL_REVIEW'
    END AS repair_bucket,
    tipo_evento
  FROM base
)
SELECT
  repair_bucket,
  COUNT(*) AS filas,
  COUNT(*) FILTER (WHERE tipo_evento = 'reta') AS reta,
  COUNT(*) FILTER (WHERE tipo_evento = 'americano') AS americano,
  COUNT(*) FILTER (WHERE tipo_evento = 'duelo_2v2') AS duelo_2v2,
  COUNT(*) FILTER (WHERE tipo_evento = 'torneo_express') AS torneo_express,
  COUNT(*) FILTER (WHERE tipo_evento = 'liga') AS liga
FROM classified
GROUP BY repair_bucket
ORDER BY filas DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) AUTO_PARENT — candidatos a backfill desde evento (preview de org)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  jp.id AS participacion_id,
  jp.tipo_evento::text AS tipo_evento,
  jp.evento_nombre,
  pg_temp._expected_host_org(jp.tipo_evento::text, jp.evento_id::text)
    AS backfill_organizador_id,
  l.source_organizer_id AS ledger_source_organizer_id
FROM public.jugador_participaciones jp
LEFT JOIN public.riviera_official_points_ledger l ON l.participacion_id = jp.id
WHERE pg_temp._orphan_meta_org_missing(jp.metadata)
  AND pg_temp._expected_host_org(jp.tipo_evento::text, jp.evento_id::text) IS NOT NULL
  AND (
    l.source_organizer_id IS NULL
    OR l.source_organizer_id
         = pg_temp._expected_host_org(jp.tipo_evento::text, jp.evento_id::text)
  )
ORDER BY jp.tipo_evento, jp.evento_nombre;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) AUTO_LEDGER — candidatos (padre ausente, source en ledger)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  jp.id AS participacion_id,
  jp.tipo_evento::text AS tipo_evento,
  jp.evento_id,
  jp.evento_nombre,
  l.id AS ledger_id,
  l.source_organizer_id AS backfill_organizador_id,
  jp.puntos_obtenidos,
  l.points AS ledger_points
FROM public.jugador_participaciones jp
INNER JOIN public.riviera_official_points_ledger l ON l.participacion_id = jp.id
WHERE pg_temp._orphan_meta_org_missing(jp.metadata)
  AND pg_temp._expected_host_org(jp.tipo_evento::text, jp.evento_id::text) IS NULL
ORDER BY jp.evento_nombre, jp.id;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) MANUAL — requieren revisión humana (no auto)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  jp.id AS participacion_id,
  rj.nombre AS jugador_nombre,
  jp.tipo_evento::text AS tipo_evento,
  jp.evento_id,
  jp.evento_nombre,
  jp.puntos_obtenidos,
  pg_temp._try_parse_uuid(jp.evento_id::text) IS NULL
    AND NULLIF(trim(COALESCE(jp.evento_id::text, '')), '') IS NOT NULL
    AS evento_id_invalido,
  pg_temp._parent_exists(jp.tipo_evento::text, jp.evento_id::text) AS parent_exists,
  pg_temp._expected_host_org(jp.tipo_evento::text, jp.evento_id::text)
    AS expected_organizador_id,
  l.source_organizer_id AS ledger_source_organizer_id,
  CASE
    WHEN pg_temp._expected_host_org(jp.tipo_evento::text, jp.evento_id::text) IS NOT NULL
      AND l.source_organizer_id IS NOT NULL
      AND l.source_organizer_id IS DISTINCT FROM
            pg_temp._expected_host_org(jp.tipo_evento::text, jp.evento_id::text)
      THEN 'conflicto padre vs ledger'
    WHEN pg_temp._try_parse_uuid(jp.evento_id::text) IS NULL
      AND NULLIF(trim(COALESCE(jp.evento_id::text, '')), '') IS NOT NULL
      THEN 'evento_id inválido'
    WHEN NOT pg_temp._parent_exists(jp.tipo_evento::text, jp.evento_id::text)
      AND l.id IS NULL
      THEN 'padre ausente sin ledger'
    ELSE 'revisar'
  END AS motivo_manual
FROM public.jugador_participaciones jp
LEFT JOIN public.riviera_official_points_ledger l ON l.participacion_id = jp.id
LEFT JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
WHERE pg_temp._orphan_meta_org_missing(jp.metadata)
  AND NOT (
    pg_temp._expected_host_org(jp.tipo_evento::text, jp.evento_id::text) IS NOT NULL
    AND (
      l.source_organizer_id IS NULL
      OR l.source_organizer_id
           = pg_temp._expected_host_org(jp.tipo_evento::text, jp.evento_id::text)
    )
  )
  AND NOT (
    pg_temp._expected_host_org(jp.tipo_evento::text, jp.evento_id::text) IS NULL
    AND l.source_organizer_id IS NOT NULL
  )
ORDER BY motivo_manual, jp.evento_nombre;

-- Fin diagnóstico. Ver plan en docs/PARTICIPACIONES-HUERFANAS-RESTANTES-PLAN.md
