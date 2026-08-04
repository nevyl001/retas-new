-- ══════════════════════════════════════════════════════════════════════════════
-- FASE B — Rate limiting persistente para Edge Functions
--
-- Problema: ninguna de las 6 Edge Functions tiene rate limiting (confirmado
-- en la auditoría de preproducción y reconfirmado en Fase B). El entorno es
-- serverless (cada invocación puede ser una instancia distinta) — un
-- contador en memoria del proceso Deno NO sirve, se resetearía en cada cold
-- start y no se compartiría entre instancias concurrentes. Necesita ser
-- persistente y atómico en un solo lugar: Postgres.
--
-- Diseño: mismo patrón ya usado en este repo para
-- _riviera_id_lookup_throttle (hotfix-riviera-id-lookup-throttle.sql) —
-- tabla con RLS habilitado y SIN policies (deny-all para anon/authenticated
-- directo), accesible únicamente a través de la función SECURITY DEFINER de
-- abajo, que además se restringe a service_role (las Edge Functions llaman
-- con la service role key, nunca el navegador directo).
--
-- Ventana fija por bucket_key (1 fila por bucket, UPSERT atómico vía
-- INSERT ... ON CONFLICT): evita condiciones de carrera entre instancias
-- serverless concurrentes porque el UPSERT usa el lock de fila de Postgres,
-- no un read-then-write en dos pasos desde el cliente.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE FUNCTION son
-- repetibles sin error.
-- Rollback: DROP FUNCTION public.check_rate_limit(text, integer, integer);
--           DROP FUNCTION public.cleanup_edge_rate_limits();
--           DROP TABLE public._edge_rate_limits;
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public._edge_rate_limits (
  bucket_key text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  count integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public._edge_rate_limits ENABLE ROW LEVEL SECURITY;
-- Sin policies a propósito: deny-all para anon/authenticated. Solo
-- check_rate_limit() (SECURITY DEFINER) puede leer/escribir esta tabla.

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_bucket_key text,
  p_max_requests integer,
  p_window_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_count integer;
  v_reset_at timestamptz;
BEGIN
  IF p_bucket_key IS NULL OR length(trim(p_bucket_key)) = 0 THEN
    RAISE EXCEPTION 'bucket_key requerido';
  END IF;
  IF p_max_requests IS NULL OR p_max_requests <= 0 THEN
    RAISE EXCEPTION 'max_requests debe ser positivo';
  END IF;
  IF p_window_seconds IS NULL OR p_window_seconds <= 0 THEN
    RAISE EXCEPTION 'window_seconds debe ser positivo';
  END IF;

  INSERT INTO public._edge_rate_limits (bucket_key, window_start, count, updated_at)
  VALUES (p_bucket_key, v_now, 1, v_now)
  ON CONFLICT (bucket_key) DO UPDATE SET
    window_start = CASE
      WHEN public._edge_rate_limits.window_start <= v_now - make_interval(secs => p_window_seconds)
        THEN v_now
      ELSE public._edge_rate_limits.window_start
    END,
    count = CASE
      WHEN public._edge_rate_limits.window_start <= v_now - make_interval(secs => p_window_seconds)
        THEN 1
      ELSE public._edge_rate_limits.count + 1
    END,
    updated_at = v_now
  RETURNING window_start, count INTO v_window_start, v_count;

  v_reset_at := v_window_start + make_interval(secs => p_window_seconds);

  -- Limpieza probabilística (1%) de buckets viejos, sin depender de pg_cron.
  IF random() < 0.01 THEN
    DELETE FROM public._edge_rate_limits
    WHERE updated_at < v_now - interval '1 day'
      AND bucket_key IN (
        SELECT bucket_key FROM public._edge_rate_limits
        WHERE updated_at < v_now - interval '1 day'
        LIMIT 500
      );
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_count <= p_max_requests,
    'count', v_count,
    'limit', p_max_requests,
    'remaining', GREATEST(0, p_max_requests - v_count),
    'reset_at', v_reset_at,
    'retry_after_seconds', GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_reset_at - v_now)))::integer)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;

-- ── Verificación en la misma transacción implícita del CREATE anterior ───
DO $$
BEGIN
  IF to_regprocedure('public.check_rate_limit(text,integer,integer)') IS NULL THEN
    RAISE EXCEPTION 'Fix incompleto: check_rate_limit no existe tras el CREATE';
  END IF;
  IF to_regclass('public._edge_rate_limits') IS NULL THEN
    RAISE EXCEPTION 'Fix incompleto: _edge_rate_limits no existe tras el CREATE';
  END IF;
END $$;
