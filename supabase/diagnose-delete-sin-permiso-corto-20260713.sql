-- READ-ONLY: ¿quién lanza "Sin permiso" (corto) y qué delete_riviera_jugador
-- está instalada? NO borra nada.
--
-- Ejecutar en SQL Editor (prod). Pegar resultados al chat.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Código fuente REAL instalado
-- ═══════════════════════════════════════════════════════════════════════════

SELECT 'delete_riviera_jugador' AS fn, pg_get_functiondef(p.oid) AS def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'delete_riviera_jugador';

SELECT 'register_riviera_jugador_import_blocklist' AS fn, pg_get_functiondef(p.oid) AS def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'register_riviera_jugador_import_blocklist';

SELECT
  p.proname AS fn,
  pg_get_function_identity_arguments(p.oid) AS args,
  CASE WHEN to_regprocedure(format('%I.%I(%s)', n.nspname, p.proname,
         pg_get_function_identity_arguments(p.oid))) IS NOT NULL
       THEN true ELSE false END AS exists_ok
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    '_insert_jugador_import_blocklist_internal',
    '_propagate_source_jugador_delete',
    '_purge_granted_local_jugador',
    '_purge_riviera_jugador_scoped'
  )
ORDER BY 1, 2;

-- Si existe el helper interno, ver si llama a register (bug) o INSERT directo (ok)
SELECT
  '_insert_jugador_import_blocklist_internal' AS fn,
  pg_get_functiondef(p.oid) AS def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = '_insert_jugador_import_blocklist_internal';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Huellas rápidas (sin leer todo el cuerpo a mano)
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  'delete_riviera_jugador' AS fn,
  (pg_get_functiondef(p.oid) ILIKE '%_propagate_source_jugador_delete%') AS has_propagate,
  (pg_get_functiondef(p.oid) ILIKE '%_purge_riviera_jugador_scoped%') AS has_cascade_x_purge,
  (pg_get_functiondef(p.oid) ILIKE '%_request_auth_uid%') AS has_auth_uid_helper,
  (pg_get_functiondef(p.oid) ILIKE '%register_riviera_jugador_import_blocklist%')
    AS calls_register_blocklist,
  (pg_get_functiondef(p.oid) ILIKE '%_insert_jugador_import_blocklist_internal%')
    AS calls_insert_blocklist_internal,
  (pg_get_functiondef(p.oid) LIKE '%Sin permiso para eliminar este jugador%')
    AS raise_auth_largo,
  (pg_get_functiondef(p.oid) LIKE '%Sin permiso''%') AS raise_corto_en_delete,
  (pg_get_functiondef(p.oid) ILIKE '%jugador concedido%') AS raise_concedido_viejo,
  (pg_get_functiondef(p.oid) ILIKE '%Quitar de mi club%') AS raise_concedido_nuevo
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'delete_riviera_jugador';

SELECT
  'register_riviera_jugador_import_blocklist' AS fn,
  (pg_get_functiondef(p.oid) LIKE '%RAISE EXCEPTION ''Sin permiso''%')
    AS has_raise_corto_exacto,
  (pg_get_functiondef(p.oid) ILIKE '%is_master_admin%') AS checks_master_admin
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'register_riviera_jugador_import_blocklist';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) OPA del jugador de prueba (origen vs cedido)
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  opa.id,
  opa.owner_organizador_id,
  opa.grantee_organizer_id,
  opa.jugador_id AS source_jugador_id,
  opa.local_jugador_id,
  opa.access_type,
  opa.is_active,
  (opa.grantee_organizer_id = 'cd45cea7-a8ac-4596-b0ee-24959b4cbb5d'::uuid
   AND opa.local_jugador_id = '86fa1102-7157-4808-a741-7c9d1e3d1151'::uuid)
    AS dispara_gate_cedido_viejo,
  (opa.jugador_id = '86fa1102-7157-4808-a741-7c9d1e3d1151'::uuid) AS es_source_en_grant
FROM public.organizer_player_access opa
WHERE opa.jugador_id = '86fa1102-7157-4808-a741-7c9d1e3d1151'::uuid
   OR opa.local_jugador_id = '86fa1102-7157-4808-a741-7c9d1e3d1151'::uuid
ORDER BY opa.is_active DESC, opa.created_at;
