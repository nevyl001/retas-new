-- Diagnóstico AUDITIVO: participaciones sin evento padre (deuda histórica).
-- Solo lectura. Sin UPDATE, sin INSERT, sin inferencia de club por nombre.
--
-- PREREQUISITOS:
--   riviera_participacion_expected_host_org (repair-career-event-host-organizer.sql)
--   career_event_host_manual_overrides (career-event-host-manual-overrides.sql) — opcional
--
-- Objetivo: trazabilidad completa — por qué cada fila no tiene host inferible
-- sin asumir club por nombre. Overrides aprobados solo vía career_event_host_manual_overrides.
--
-- Post-seed: filas con override en tabla → suggested_action = READY_MANUAL_OVERRIDE
-- (re-ejecutar tras seed-career-event-host-manual-overrides.sql)

CREATE OR REPLACE FUNCTION public._riviera_normalize_evento_nombre(p_nombre text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(regexp_replace(COALESCE(p_nombre, ''), '\s+', ' ', 'g')));
$$;

-- Whitelist de nombres históricos conocidos (solo flag auditivo; NO asigna organizador).
CREATE OR REPLACE FUNCTION public._riviera_historical_event_name_whitelist_hit(p_nombre text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public._riviera_normalize_evento_nombre(p_nombre) IN (
    'hack padel',
    'remontada final',
    'hack padel 5ta fuerza',
    'hackpadel 5ta fuerza'
  );
$$;

CREATE OR REPLACE FUNCTION public._riviera_participacion_parent_lookup_table(p_tipo_evento text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_tipo_evento
    WHEN 'reta' THEN 'tournaments'
    WHEN 'americano' THEN 'tournaments'
    WHEN 'duelo_2v2' THEN 'duelos_2v2'
    WHEN 'torneo_express' THEN 'torneo_express'
    WHEN 'liga' THEN 'liga_jornadas|ligas'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public._riviera_participacion_parent_row_exists(
  p_tipo_evento text,
  p_evento_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p_tipo_evento
    WHEN 'reta' THEN EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = NULLIF(trim(p_evento_id), '')::uuid
    )
    WHEN 'americano' THEN EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = NULLIF(trim(p_evento_id), '')::uuid
    )
    WHEN 'duelo_2v2' THEN EXISTS (
      SELECT 1 FROM public.duelos_2v2 d
      WHERE d.id = NULLIF(trim(p_evento_id), '')::uuid
    )
    WHEN 'torneo_express' THEN EXISTS (
      SELECT 1 FROM public.torneo_express t
      WHERE t.id = NULLIF(trim(p_evento_id), '')::uuid
    )
    WHEN 'liga' THEN (
      EXISTS (
        SELECT 1 FROM public.liga_jornadas lj
        WHERE lj.id = NULLIF(trim(p_evento_id), '')::uuid
      )
      OR EXISTS (
        SELECT 1 FROM public.ligas l
        WHERE l.id = NULLIF(trim(p_evento_id), '')::uuid
      )
    )
    ELSE false
  END;
$$;

GRANT EXECUTE ON FUNCTION public._riviera_participacion_parent_row_exists(text, text)
  TO anon, authenticated;

-- Lookup overrides (no-op si career_event_host_manual_overrides aún no existe).
-- Callers: jp.tipo_evento::text, trim(jp.evento_id::text) — override.tipo_evento es text.
CREATE OR REPLACE FUNCTION public.riviera_career_event_host_manual_override(
  p_tipo_evento text,
  p_evento_id text
)
RETURNS TABLE (
  override_id uuid,
  organizador_id uuid,
  club_name text,
  evento_nombre text,
  approved_by uuid,
  approved_at timestamptz,
  reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF to_regclass('public.career_event_host_manual_overrides') IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.organizador_id,
    o.club_name,
    o.evento_nombre,
    o.approved_by,
    o.approved_at,
    o.reason
  FROM public.career_event_host_manual_overrides o
  WHERE o.tipo_evento = trim(p_tipo_evento)
    AND o.evento_id = trim(p_evento_id)
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.riviera_career_event_host_manual_override(text, text)
  TO anon, authenticated;

-- ── Vista auditiva principal ────────────────────────────────────────────────
-- DROP necesario: CREATE OR REPLACE no permite cambiar nombres/orden de columnas.
-- Seguro: vista read-only de diagnóstico; no almacena datos ni alimenta la app.
DROP VIEW IF EXISTS public._historical_orphan_parent_participaciones CASCADE;

CREATE VIEW public._historical_orphan_parent_participaciones AS
WITH base AS (
  SELECT
    jp.id AS participacion_id,
    jp.jugador_id,
    jp.tipo_evento,
    jp.evento_id,
    jp.evento_nombre,
    jp.puntos_obtenidos,
    jp.created_at,
    COALESCE(jp.metadata, '{}'::jsonb) AS metadata,
    COALESCE(jp.metadata->>'organizador_id', '') AS metadata_organizador_id,
    COALESCE(jp.metadata->>'club_name', '') AS metadata_club_name,
    COALESCE(jp.metadata->>'integrity_status', '') AS integrity_status,
    COALESCE(jp.metadata->>'repair_required', '') AS repair_required,
    public._riviera_normalize_evento_nombre(jp.evento_nombre) AS event_name_key,
    public._riviera_historical_event_name_whitelist_hit(jp.evento_nombre) AS event_name_whitelist_hit,
    public._riviera_participacion_parent_lookup_table(jp.tipo_evento::text) AS parent_lookup_table,
    public._riviera_participacion_parent_row_exists(
      jp.tipo_evento::text,
      jp.evento_id::text
    ) AS parent_row_found,
    public.riviera_participacion_expected_host_org(
      jp.tipo_evento::text,
      jp.evento_id::text
    ) AS expected_host_from_parent,
    mo.override_id AS manual_override_id,
    mo.organizador_id AS manual_override_organizador_id,
    mo.club_name AS manual_override_club_name,
    mo.approved_at AS manual_override_approved_at,
    mo.reason AS manual_override_reason
  FROM public.jugador_participaciones jp
  LEFT JOIN LATERAL public.riviera_career_event_host_manual_override(
    jp.tipo_evento::text,
    jp.evento_id::text
  ) mo ON true
  WHERE COALESCE(jp.puntos_obtenidos, 0) > 0
),
sibling_stats AS (
  SELECT
    b.evento_id,
    b.tipo_evento,
    COUNT(s.id)::integer AS sibling_total_count,
    COUNT(s.id) FILTER (
      WHERE NULLIF(trim(s.metadata->>'organizador_id'), '') IS NOT NULL
    )::integer AS sibling_with_org_count,
    COUNT(DISTINCT NULLIF(trim(s.metadata->>'organizador_id'), '')) FILTER (
      WHERE NULLIF(trim(s.metadata->>'organizador_id'), '') IS NOT NULL
    )::integer AS sibling_distinct_orgs
  FROM base b
  INNER JOIN public.jugador_participaciones s
    ON s.evento_id = b.evento_id
   AND s.tipo_evento = b.tipo_evento
  GROUP BY b.evento_id, b.tipo_evento
),
sibling_consensus AS (
  SELECT
    s.evento_id,
    s.tipo_evento,
    mode() WITHIN GROUP (
      ORDER BY NULLIF(trim(s.metadata->>'organizador_id'), '')
    ) AS sibling_consensus_org_id
  FROM public.jugador_participaciones s
  WHERE NULLIF(trim(s.metadata->>'organizador_id'), '') IS NOT NULL
  GROUP BY s.evento_id, s.tipo_evento
),
audited AS (
  SELECT
    b.*,
    COALESCE(ss.sibling_total_count, 0) AS sibling_total_count,
    COALESCE(ss.sibling_with_org_count, 0) AS sibling_with_org_count,
    COALESCE(ss.sibling_distinct_orgs, 0) AS sibling_distinct_orgs,
    sc.sibling_consensus_org_id,
    CASE
      WHEN b.parent_row_found AND b.expected_host_from_parent IS NOT NULL
        THEN 'EVENT_PARENT'
      WHEN b.manual_override_id IS NOT NULL
        THEN 'MANUAL_OVERRIDE'
      WHEN ss.sibling_with_org_count > 0 AND ss.sibling_distinct_orgs = 1
        THEN 'SIBLING_METADATA'
      WHEN b.metadata->>'repaired_from_orphan_parent' = 'true'
        OR b.integrity_status IN ('repaired_orphan_parent', 'orphan_parent_review')
        THEN 'MANUAL_OVERRIDE'
      WHEN b.event_name_whitelist_hit
        THEN 'EVENT_NAME_MAP'
      ELSE 'NONE'
    END AS expected_host_source
  FROM base b
  LEFT JOIN sibling_stats ss
    ON ss.evento_id = b.evento_id
   AND ss.tipo_evento = b.tipo_evento
  LEFT JOIN sibling_consensus sc
    ON sc.evento_id = b.evento_id
   AND sc.tipo_evento = b.tipo_evento
)
SELECT
  a.participacion_id,
  a.jugador_id,
  rj.nombre AS jugador_nombre,
  a.tipo_evento,
  a.evento_id,
  a.evento_nombre,
  a.puntos_obtenidos,
  a.created_at,
  a.metadata_organizador_id,
  a.metadata_club_name,
  a.integrity_status,
  a.repair_required,
  a.parent_lookup_table,
  a.parent_row_found,
  a.expected_host_from_parent,
  a.sibling_total_count,
  a.sibling_with_org_count,
  a.sibling_distinct_orgs,
  a.sibling_consensus_org_id,
  a.event_name_key,
  a.event_name_whitelist_hit,
  a.manual_override_id IS NOT NULL AS has_manual_override,
  a.manual_override_organizador_id,
  a.manual_override_club_name,
  a.manual_override_approved_at,
  a.manual_override_reason,
  a.expected_host_source,
  CASE
    WHEN a.parent_row_found AND a.expected_host_from_parent IS NOT NULL
      THEN NULL
    WHEN a.parent_lookup_table IS NULL
      THEN 'unsupported_event_type'
    WHEN a.sibling_distinct_orgs > 1
      THEN 'conflicting_sibling_metadata'
    WHEN NOT a.event_name_whitelist_hit
      AND a.sibling_with_org_count = 0
      AND NULLIF(trim(a.metadata_organizador_id), '') IS NULL
      AND a.expected_host_from_parent IS NULL
      THEN 'event_name_not_mapped'
    WHEN a.sibling_with_org_count = 0
      AND NULLIF(trim(a.metadata_organizador_id), '') IS NULL
      AND a.expected_host_from_parent IS NULL
      AND NOT a.event_name_whitelist_hit
      THEN 'no_sibling_metadata'
    WHEN NOT a.parent_row_found
      THEN 'no_parent_row'
    WHEN NULLIF(trim(a.metadata_organizador_id), '') IS NULL
      AND a.expected_host_from_parent IS NULL
      THEN 'host_unknown'
    ELSE NULL
  END AS why_not_inferred,
  CASE
    WHEN a.parent_row_found AND a.expected_host_from_parent IS NOT NULL
      THEN 'SKIP_PARENT_EXISTS'
    WHEN a.manual_override_id IS NOT NULL
      AND NULLIF(trim(a.metadata_organizador_id), '') IS NOT NULL
      AND trim(a.metadata_organizador_id) = a.manual_override_organizador_id::text
      THEN 'OK_OVERRIDE_APPLIED'
    WHEN a.manual_override_id IS NOT NULL
      THEN 'READY_MANUAL_OVERRIDE'
    WHEN NULLIF(trim(a.metadata_organizador_id), '') IS NOT NULL
      THEN 'OK_HAS_HOST_METADATA'
    WHEN a.metadata->>'repaired_from_orphan_parent' = 'true'
      OR a.integrity_status = 'repaired_orphan_parent'
      THEN 'OK_MANUAL_REPAIRED'
    WHEN a.integrity_status = 'orphan_parent_review'
      THEN 'OK_MARKED_HISTORICAL_REVIEW'
    WHEN a.sibling_with_org_count > 0 AND a.sibling_distinct_orgs = 1
      THEN 'CANDIDATE_SIBLING_CONSENSUS'
    WHEN a.event_name_whitelist_hit
      THEN 'CANDIDATE_MANUAL_NAME_MAP'
    WHEN a.parent_lookup_table IS NULL
      THEN 'REVIEW_UNSUPPORTED_TIPO'
    WHEN NOT a.parent_row_found AND a.sibling_with_org_count = 0
      THEN 'REVIEW_HISTORICO_NO_SOURCE'
    WHEN a.sibling_distinct_orgs > 1
      THEN 'REVIEW_SIBLING_CONFLICT'
    ELSE 'REVIEW_HOST_UNKNOWN'
  END AS suggested_action
FROM audited a
LEFT JOIN public.riviera_jugadores rj ON rj.id = a.jugador_id
WHERE NOT a.parent_row_found
   OR a.expected_host_from_parent IS NULL
ORDER BY a.evento_nombre, a.puntos_obtenidos DESC;

COMMENT ON VIEW public._historical_orphan_parent_participaciones IS
  'Auditoría read-only: participaciones sin host resoluble desde padre. Sin inferencia de club por nombre.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Resumen por suggested_action
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  suggested_action,
  COUNT(*) AS filas,
  COALESCE(SUM(puntos_obtenidos), 0) AS puntos
FROM public._historical_orphan_parent_participaciones
GROUP BY suggested_action
ORDER BY filas DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- Resumen por why_not_inferred
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  why_not_inferred,
  expected_host_source,
  COUNT(*) AS filas,
  COALESCE(SUM(puntos_obtenidos), 0) AS puntos
FROM public._historical_orphan_parent_participaciones
WHERE why_not_inferred IS NOT NULL
GROUP BY why_not_inferred, expected_host_source
ORDER BY filas DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- Detalle por evento (deuda histórica vs candidatos)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  evento_nombre,
  tipo_evento,
  suggested_action,
  why_not_inferred,
  event_name_whitelist_hit,
  COUNT(*) AS filas,
  MAX(sibling_total_count) AS siblings,
  MAX(sibling_with_org_count) AS siblings_with_org
FROM public._historical_orphan_parent_participaciones
GROUP BY
  evento_nombre,
  tipo_evento,
  suggested_action,
  why_not_inferred,
  event_name_whitelist_hit
ORDER BY evento_nombre, suggested_action;

-- ═══════════════════════════════════════════════════════════════════════════
-- Candidatos whitelist → pendientes de INSERT en career_event_host_manual_overrides
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  tipo_evento,
  evento_id,
  evento_nombre,
  COUNT(*) AS participaciones,
  COALESCE(SUM(puntos_obtenidos), 0) AS puntos,
  MAX(sibling_total_count) AS siblings,
  MAX(sibling_with_org_count) AS siblings_with_org,
  bool_or(has_manual_override) AS override_exists
FROM public._historical_orphan_parent_participaciones
WHERE suggested_action = 'CANDIDATE_MANUAL_NAME_MAP'
GROUP BY tipo_evento, evento_id, evento_nombre
ORDER BY evento_nombre;

-- Overrides aprobados pendientes de aplicar metadata (post-seed)
-- Esperado tras seed: suggested_action = READY_MANUAL_OVERRIDE, expected_host_source = MANUAL_OVERRIDE
SELECT
  participacion_id,
  jugador_nombre,
  evento_nombre,
  tipo_evento,
  evento_id,
  suggested_action,
  expected_host_source,
  has_manual_override,
  manual_override_organizador_id,
  manual_override_club_name,
  manual_override_reason
FROM public._historical_orphan_parent_participaciones
WHERE suggested_action = 'READY_MANUAL_OVERRIDE'
ORDER BY evento_nombre, jugador_nombre;

-- Tabla de overrides (fuente de verdad)
SELECT
  tipo_evento,
  evento_id,
  evento_nombre,
  organizador_id,
  club_name,
  approved_at,
  reason
FROM public.career_event_host_manual_overrides
ORDER BY evento_nombre;

NOTIFY pgrst, 'reload schema';
