-- ═══════════════════════════════════════════════════════════════════════════
-- BACKUP — 30 huérfanas históricas (padre ausente, sin ledger)
-- SOLO RESPALDO. No DELETE. Sin BEGIN/ROLLBACK.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Criterio (AND):
--   1) metadata.organizador_id ausente/null/''
--   2) evento padre inexistente (por tipo_evento; UUID inválido = padre ausente)
--   3) sin fila en riviera_official_points_ledger
--   4) id <> Marco c46767cf-74fd-4e03-9e39-5c5773319f20
--
-- Aborta si el conteo ≠ 30, si alguna tiene ledger, o si incluye a Marco.
-- Guarda el NOTICE con el nombre de la tabla permanente.
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

CREATE OR REPLACE FUNCTION pg_temp._parent_row_exists(
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

-- Preview (solo lectura)
SELECT
  COUNT(*) AS candidatas,
  COUNT(*) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM public.riviera_official_points_ledger l
      WHERE l.participacion_id = jp.id
    )
  ) AS con_ledger_debe_ser_0,
  COUNT(*) FILTER (
    WHERE jp.id = 'c46767cf-74fd-4e03-9e39-5c5773319f20'
  ) AS incluye_marco_debe_ser_0
FROM public.jugador_participaciones jp
WHERE pg_temp._orphan_meta_org_missing(jp.metadata)
  AND NOT pg_temp._parent_row_exists(jp.tipo_evento::text, jp.evento_id::text)
  AND NOT EXISTS (
    SELECT 1 FROM public.riviera_official_points_ledger l
    WHERE l.participacion_id = jp.id
  )
  AND jp.id IS DISTINCT FROM 'c46767cf-74fd-4e03-9e39-5c5773319f20';

DO $$
DECLARE
  v_marco uuid := 'c46767cf-74fd-4e03-9e39-5c5773319f20';
  v_suffix text := to_char(now() AT TIME ZONE 'utc', 'YYYYMMDD_HH24MISS');
  v_backup text := 'jugador_participaciones_historical_orphan_backup_' || v_suffix;
  v_count integer := 0;
  v_ledger_hit integer := 0;
  v_marco_hit integer := 0;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.jugador_participaciones jp
  WHERE NULLIF(trim(COALESCE(jp.metadata->>'organizador_id', '')), '') IS NULL
    AND NOT pg_temp._parent_row_exists(jp.tipo_evento::text, jp.evento_id::text)
    AND NOT EXISTS (
      SELECT 1 FROM public.riviera_official_points_ledger l
      WHERE l.participacion_id = jp.id
    )
    AND jp.id IS DISTINCT FROM v_marco;

  IF v_count IS DISTINCT FROM 30 THEN
    RAISE EXCEPTION
      'ABORT: se esperaban exactamente 30 candidatas; hay %. Revisa el diagnose.',
      v_count;
  END IF;

  SELECT COUNT(*) INTO v_ledger_hit
  FROM public.jugador_participaciones jp
  INNER JOIN public.riviera_official_points_ledger l ON l.participacion_id = jp.id
  WHERE NULLIF(trim(COALESCE(jp.metadata->>'organizador_id', '')), '') IS NULL
    AND NOT pg_temp._parent_row_exists(jp.tipo_evento::text, jp.evento_id::text)
    AND jp.id IS DISTINCT FROM v_marco;

  IF v_ledger_hit > 0 THEN
    RAISE EXCEPTION 'ABORT: % candidatas tienen ledger — no respaldar este set.', v_ledger_hit;
  END IF;

  EXECUTE format(
    'CREATE TABLE public.%I AS
       SELECT jp.*
       FROM public.jugador_participaciones jp
       WHERE NULLIF(trim(COALESCE(jp.metadata->>''organizador_id'', '''')), '''') IS NULL
         AND NOT pg_temp._parent_row_exists(jp.tipo_evento::text, jp.evento_id::text)
         AND NOT EXISTS (
           SELECT 1 FROM public.riviera_official_points_ledger l
           WHERE l.participacion_id = jp.id
         )
         AND jp.id IS DISTINCT FROM $1',
    v_backup
  ) USING v_marco;

  EXECUTE format('SELECT COUNT(*) FROM public.%I', v_backup) INTO v_count;
  IF v_count IS DISTINCT FROM 30 THEN
    EXECUTE format('DROP TABLE IF EXISTS public.%I', v_backup);
    RAISE EXCEPTION
      'ABORT: backup quedó con % filas (esperado 30) — tabla droppeada.', v_count;
  END IF;

  EXECUTE format(
    'SELECT COUNT(*) FROM public.%I WHERE id = $1',
    v_backup
  ) INTO v_marco_hit USING v_marco;

  IF v_marco_hit > 0 THEN
    EXECUTE format('DROP TABLE IF EXISTS public.%I', v_backup);
    RAISE EXCEPTION 'ABORT: backup incluye a Marco — tabla droppeada.';
  END IF;

  EXECUTE format(
    'SELECT COUNT(*) FROM public.riviera_official_points_ledger l
     INNER JOIN public.%I b ON b.id = l.participacion_id',
    v_backup
  ) INTO v_ledger_hit;

  IF v_ledger_hit > 0 THEN
    EXECUTE format('DROP TABLE IF EXISTS public.%I', v_backup);
    RAISE EXCEPTION
      'ABORT: % IDs del backup tienen ledger — tabla droppeada.', v_ledger_hit;
  END IF;

  RAISE NOTICE
    'BACKUP OK — tabla=% (30 filas). Copia este nombre al script de DELETE.',
    v_backup;
END $$;

SELECT c.relname AS backup_table
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname LIKE 'jugador_participaciones_historical_orphan_backup_%'
ORDER BY c.relname DESC
LIMIT 5;
