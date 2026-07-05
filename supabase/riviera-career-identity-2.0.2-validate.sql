-- Sprint 2.0.2 — Validación read-only (no modifica datos)
-- Ejecutar después de riviera-career-identity-2.0.2-engine.sql

-- V1: Secuencia existe
SELECT
  CASE
    WHEN to_regclass('public.riviera_id_serial_seq') IS NOT NULL
    THEN 'PASS: secuencia riviera_id_serial_seq'
    ELSE 'FAIL: secuencia no encontrada'
  END AS v1_sequence;

-- V2: Helpers internos existen
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    '_format_riviera_id',
    '_allocate_riviera_id_serial',
    '_assign_riviera_id_to_identity',
    '_ensure_debut_riviera_if_missing',
    'ensure_riviera_identity'
  )
ORDER BY p.proname;

-- V3: RPC ensure_riviera_identity expuesta a authenticated
SELECT
  CASE
    WHEN has_function_privilege('authenticated', 'public.ensure_riviera_identity(uuid)', 'EXECUTE')
    THEN 'PASS: GRANT EXECUTE authenticated'
    ELSE 'FAIL: falta GRANT authenticated'
  END AS v3_grant_authenticated;

SELECT
  CASE
    WHEN NOT has_function_privilege('anon', 'public.ensure_riviera_identity(uuid)', 'EXECUTE')
    THEN 'PASS: anon sin EXECUTE'
    ELSE 'FAIL: anon no debe ejecutar ensure'
  END AS v3_grant_anon;

-- V4: Formato congelado (solo superuser / SQL Editor — helpers no expuestos a authenticated)
SELECT
  public._format_riviera_id(1) AS fmt_1,
  public._format_riviera_id(1852) AS fmt_1852,
  public._format_riviera_id(15234) AS fmt_15234,
  CASE
    WHEN public._format_riviera_id(1) = 'RIV-00000001'
     AND public._format_riviera_id(1852) = 'RIV-00001852'
     AND public._format_riviera_id(15234) = 'RIV-00015234'
    THEN 'PASS: formato congelado'
    ELSE 'FAIL: formato incorrecto'
  END AS v4_format;

-- V5: Secuencia sincronizada (>= max serial en identity)
SELECT
  (SELECT last_value FROM public.riviera_id_serial_seq) AS seq_last_value,
  (SELECT coalesce(max(riviera_id_serial), 0) FROM public.riviera_official_player_identity) AS max_assigned_serial,
  CASE
    WHEN (SELECT last_value FROM public.riviera_id_serial_seq)
       >= coalesce((SELECT max(riviera_id_serial) FROM public.riviera_official_player_identity), 0)
    THEN 'PASS: secuencia >= max asignado'
    ELSE 'FAIL: secuencia desincronizada'
  END AS v5_seq_sync;

-- V6: Conteo identidades con Riviera ID (informativo)
SELECT
  count(*) AS total_identities,
  count(riviera_id) AS with_riviera_id,
  count(debut_organizer_id) AS with_debut
FROM public.riviera_official_player_identity;
