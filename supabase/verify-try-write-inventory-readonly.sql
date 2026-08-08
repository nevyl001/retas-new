-- =============================================================================
-- READ-ONLY inventory: try_write_riviera_official_ledger
-- Ejecutar en SQL Editor (prod/staging/local). No modifica nada.
-- =============================================================================

-- 1) prosecdef / owner / firma / volatilidad / search_path
SELECT
  n.nspname AS schema,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_args,
  pg_get_function_result(p.oid) AS result_type,
  p.prosecdef AS security_definer,
  pg_get_userbyid(p.proowner) AS owner,
  p.provolatile AS volatility, -- i=immutable, s=stable, v=volatile
  p.proconfig AS config_settings,
  length(p.prosrc) AS body_bytes,
  encode(digest(p.prosrc, 'sha256'), 'hex') AS body_sha256_raw,
  (p.prosrc ILIKE '%auth.uid%') AS body_has_auth_uid,
  (p.prosrc ILIKE '%auth.role%') AS body_has_auth_role,
  (p.prosrc ILIKE '%permission_denied%' OR p.prosrc ILIKE '%not_authenticated%') AS body_has_auth_guard,
  (p.prosrc ILIKE '%_is_official_ranking_emitter%') AS body_has_emitter_gate,
  (p.prosrc ILIKE '%v_prev_points%' OR p.prosrc ILIKE '%v_delta%') AS body_has_rank001_reconcile
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'try_write_riviera_official_ledger';

-- 2) EXECUTE grants (incluye PUBLIC / default ACL)
SELECT
  COALESCE(r.rolname, 'PUBLIC') AS grantee,
  a.privilege_type,
  a.is_grantable
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
LEFT JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a ON true
LEFT JOIN pg_roles r ON r.oid = a.grantee
WHERE n.nspname = 'public'
  AND p.proname = 'try_write_riviera_official_ledger'
ORDER BY grantee, a.privilege_type;

-- 3) Definición completa (para diff manual vs repo)
SELECT pg_get_functiondef(p.oid) AS function_def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'try_write_riviera_official_ledger';
