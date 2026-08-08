-- =============================================================================
-- VERIFY P0 career RPC grants — SOLO LECTURA
-- Ejecutar BEFORE/AFTER del hotfix en local, staging o prod.
-- No GRANT / REVOKE / CREATE / UPDATE / INSERT / DELETE.
-- =============================================================================

WITH targets AS (
  SELECT unnest(ARRAY[
    '_riviera_orphan_profile_audit',
    '_riviera_profile_link_resolution',
    'try_write_riviera_official_ledger',
    'refresh_jugador_stats',
    'ensure_official_profile_link_for_participacion'
  ]) AS proname
),
procs AS (
  SELECT
    n.nspname AS schema,
    p.proname,
    p.oid,
    pg_get_function_identity_arguments(p.oid) AS identity_args,
    pg_get_function_result(p.oid) AS result_type,
    pg_get_userbyid(p.proowner) AS owner,
    p.prosecdef AS security_definer,
    p.proconfig AS config_settings,
    length(p.prosrc) AS body_bytes,
    (p.prosrc ILIKE '%auth.uid%') AS body_has_auth_uid,
    (p.prosrc ILIKE '%auth.role%') AS body_has_auth_role,
    (
      p.prosrc ILIKE '%permission_denied%'
      OR p.prosrc ILIKE '%not_authenticated%'
    ) AS body_has_auth_guard,
    CASE
      WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto')
      THEN encode(digest(p.prosrc, 'sha256'), 'hex')
      ELSE NULL
    END AS body_sha256
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN targets t ON t.proname = p.proname
  WHERE n.nspname = 'public'
),
grants AS (
  SELECT
    p.oid,
    bool_or(COALESCE(r.rolname, 'PUBLIC') = 'PUBLIC' AND a.privilege_type = 'EXECUTE') AS exec_public,
    bool_or(r.rolname = 'anon' AND a.privilege_type = 'EXECUTE') AS exec_anon,
    bool_or(r.rolname = 'authenticated' AND a.privilege_type = 'EXECUTE') AS exec_authenticated,
    bool_or(r.rolname = 'service_role' AND a.privilege_type = 'EXECUTE') AS exec_service_role
  FROM procs p
  LEFT JOIN LATERAL aclexplode(COALESCE(
    (SELECT proacl FROM pg_proc WHERE oid = p.oid),
    acldefault('f', (SELECT proowner FROM pg_proc WHERE oid = p.oid))
  )) a ON true
  LEFT JOIN pg_roles r ON r.oid = a.grantee
  GROUP BY p.oid
)
SELECT
  p.schema,
  p.proname,
  p.identity_args,
  p.result_type,
  p.owner,
  p.security_definer,
  p.config_settings,
  COALESCE(g.exec_public, false) AS exec_public,
  COALESCE(g.exec_anon, false) AS exec_anon,
  COALESCE(g.exec_authenticated, false) AS exec_authenticated,
  COALESCE(g.exec_service_role, false) AS exec_service_role,
  p.body_has_auth_uid,
  p.body_has_auth_role,
  p.body_has_auth_guard,
  p.body_bytes,
  p.body_sha256,
  CASE p.proname
    WHEN '_riviera_orphan_profile_audit' THEN
      CASE WHEN NOT COALESCE(g.exec_anon, false)
            AND NOT COALESCE(g.exec_public, false)
            AND NOT COALESCE(g.exec_authenticated, false)
           THEN 'PASS' ELSE 'FAIL' END
    WHEN '_riviera_profile_link_resolution' THEN
      CASE WHEN NOT COALESCE(g.exec_anon, false)
            AND NOT COALESCE(g.exec_public, false)
            AND NOT COALESCE(g.exec_authenticated, false)
           THEN 'PASS' ELSE 'FAIL' END
    WHEN 'try_write_riviera_official_ledger' THEN
      CASE WHEN NOT COALESCE(g.exec_anon, false)
            AND NOT COALESCE(g.exec_public, false)
            AND COALESCE(g.exec_authenticated, false)
            AND p.body_has_auth_guard
           THEN 'PASS' ELSE 'FAIL' END
    WHEN 'refresh_jugador_stats' THEN
      CASE WHEN NOT COALESCE(g.exec_anon, false)
            AND NOT COALESCE(g.exec_public, false)
            AND COALESCE(g.exec_authenticated, false)
           THEN 'PASS' ELSE 'FAIL' END
    WHEN 'ensure_official_profile_link_for_participacion' THEN
      CASE WHEN NOT COALESCE(g.exec_anon, false)
            AND NOT COALESCE(g.exec_public, false)
            AND COALESCE(g.exec_authenticated, false)
            AND p.body_has_auth_guard
           THEN 'PASS' ELSE 'FAIL' END
    ELSE 'UNKNOWN'
  END AS expected_post_p0
FROM procs p
LEFT JOIN grants g ON g.oid = p.oid
ORDER BY p.proname;

-- Firmas críticas de wrappers (no deben desaparecer)
SELECT
  to_regprocedure('public.try_write_riviera_official_ledger(uuid)') IS NOT NULL AS try_write_ok,
  to_regprocedure('public.ensure_official_profile_link_for_participacion(uuid,uuid)') IS NOT NULL AS ensure_ok,
  to_regprocedure('public.refresh_jugador_stats(uuid)') IS NOT NULL AS refresh_ok,
  to_regprocedure('public._riviera_orphan_profile_audit()') IS NOT NULL AS orphan_ok,
  to_regprocedure('public._riviera_profile_link_resolution(uuid)') IS NOT NULL AS resolution_ok,
  to_regprocedure('public.registrar_participacion_jugador_con_ledger(uuid,jugador_tipo_evento,uuid,text,text,jugador_resultado,integer,integer,integer,jsonb,date)') IS NOT NULL AS registrar_con_ledger_ok,
  to_regprocedure('public.actualizar_participacion_jugador_con_ledger(uuid,text,jugador_resultado,integer,integer,integer,text,jsonb)') IS NOT NULL AS actualizar_con_ledger_ok;
