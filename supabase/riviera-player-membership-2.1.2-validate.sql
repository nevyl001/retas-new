-- RIVIERA 2.1.2 — Validación read-only Player Membership RPCs
-- Ejecutar después de riviera-player-membership-2.1.2-rpcs.sql

-- V1: RPCs existen
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'resolve_player_by_riviera_id',
    'add_organizer_membership_by_riviera_id',
    'leave_organizer_membership',
    'list_organizer_memberships',
    '_normalize_riviera_id_exact',
    '_resolve_identity_by_riviera_id',
    '_link_membership_local_profile'
  )
ORDER BY p.proname;

-- V2: GRANT authenticated en RPCs públicas
SELECT
  CASE
    WHEN has_function_privilege('authenticated', 'public.resolve_player_by_riviera_id(text)', 'EXECUTE')
     AND has_function_privilege('authenticated', 'public.add_organizer_membership_by_riviera_id(text)', 'EXECUTE')
     AND has_function_privilege('authenticated', 'public.leave_organizer_membership(uuid)', 'EXECUTE')
     AND has_function_privilege('authenticated', 'public.list_organizer_memberships()', 'EXECUTE')
    THEN 'PASS: GRANT EXECUTE authenticated'
    ELSE 'FAIL: falta GRANT en alguna RPC'
  END AS v2_grants_authenticated;

-- V3: anon sin EXECUTE
SELECT
  CASE
    WHEN NOT has_function_privilege('anon', 'public.resolve_player_by_riviera_id(text)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.add_organizer_membership_by_riviera_id(text)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.leave_organizer_membership(uuid)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.list_organizer_memberships()', 'EXECUTE')
    THEN 'PASS: anon sin EXECUTE'
    ELSE 'FAIL: anon no debe ejecutar membership RPCs'
  END AS v3_grants_anon;

-- V4: Helpers internos no expuestos a authenticated
SELECT
  CASE
    WHEN NOT has_function_privilege('authenticated', 'public._normalize_riviera_id_exact(text)', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public._resolve_identity_by_riviera_id(text)', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public._link_membership_local_profile(uuid, uuid, uuid, uuid)', 'EXECUTE')
    THEN 'PASS: helpers internos revocados'
    ELSE 'FAIL: helpers no deben ser EXECUTE authenticated'
  END AS v4_internal_helpers;

-- V5: Formato exacto Riviera ID (helper)
SELECT
  public._normalize_riviera_id_exact('RIV-00000001') AS fmt_ok,
  public._normalize_riviera_id_exact(' riv-00000001 ') AS fmt_reject_case,
  public._normalize_riviera_id_exact('RIV-1') AS fmt_reject_short,
  public._normalize_riviera_id_exact('RIV-00000001X') AS fmt_reject_suffix,
  CASE
    WHEN public._normalize_riviera_id_exact('RIV-00000001') = 'RIV-00000001'
     AND public._normalize_riviera_id_exact(' riv-00000001 ') IS NULL
     AND public._normalize_riviera_id_exact('RIV-1') IS NULL
    THEN 'PASS: normalización exacta'
    ELSE 'FAIL: normalización incorrecta'
  END AS v5_normalize;

-- V6: Integridad membresías activas (heredado 2.1.1)
SELECT count(*) AS active_with_left_at
FROM public.organizer_player_access
WHERE is_active = true AND left_at IS NOT NULL;
-- Esperado: 0

-- V7: Duplicados activos org+jugador (heredado 2.1.1)
SELECT grantee_organizer_id, jugador_id, count(*) AS cnt
FROM public.organizer_player_access
WHERE is_active = true
GROUP BY grantee_organizer_id, jugador_id
HAVING count(*) > 1;
-- Esperado: 0 filas

-- V8: Conteo membresías por joined_via (informativo)
SELECT
  coalesce(joined_via, '(null)') AS joined_via,
  count(*) AS total,
  count(*) FILTER (WHERE is_active) AS active
FROM public.organizer_player_access
GROUP BY joined_via
ORDER BY joined_via;

-- V9: Identidades con Riviera ID (informativo — add requiere riviera_id asignado)
SELECT
  count(*) AS total_identities,
  count(riviera_id) AS with_riviera_id
FROM public.riviera_official_player_identity;
