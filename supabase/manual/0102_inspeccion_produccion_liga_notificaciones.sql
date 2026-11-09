-- =============================================================================
-- INSPECCIÓN DE SOLO LECTURA — Centro de notificaciones de liga (0100/0101/0102)
-- =============================================================================
-- Proyecto Production vinculado: giswxhmjgjepoobdoljb
--
-- PROPÓSITO: contrastar el esquema real de Production con lo que asumen las
-- migraciones 0100, 0101 y 0102 ANTES de aplicarlas.
--
-- REGLAS:
--   * NO EJECUTAR sin autorización expresa del dueño del proyecto.
--   * Solo SELECT / catalog queries. No INSERT, UPDATE, DELETE, DDL, SET ROLE
--     privilegiado, set_config, ni llamadas a funciones de escritura.
--   * No habilita destinatarios. No envía correos. No toca Resend.
--   * No modifica resultados, rankings, jornadas ni inscripciones.
--   * No aplicar migraciones desde este archivo.
--
-- Cómo usar (cuando se autorice la inspección):
--   1. Abrir el SQL Editor de Supabase Production (rol de lectura o postgres).
--   2. Ejecutar sección por sección.
--   3. Guardar el resultado junto a la autorización del despliegue.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A) Extensiones y pgcrypto
-- Esperado para autorizar 0100–0102:
--   * pgcrypto instalada (schema extensions o public).
--   * gen_random_bytes_extensions = true (0101 usa extensions.gen_random_bytes).
--   * digest_extensions = true (hash de token).
-- -----------------------------------------------------------------------------
SELECT e.extname, n.nspname AS schema, e.extversion
FROM pg_extension e
JOIN pg_namespace n ON n.oid = e.extnamespace
WHERE e.extname IN ('pgcrypto', 'uuid-ossp')
ORDER BY e.extname;

SELECT
  to_regprocedure('extensions.gen_random_bytes(integer)') IS NOT NULL AS gen_random_bytes_extensions,
  to_regprocedure('public.gen_random_bytes(integer)') IS NOT NULL AS gen_random_bytes_public,
  to_regprocedure('extensions.digest(bytea, text)') IS NOT NULL AS digest_extensions,
  to_regprocedure('public.gen_random_uuid()') IS NOT NULL AS gen_random_uuid_public;

-- -----------------------------------------------------------------------------
-- B) Dependencias de tablas que 0100/0101 referencian
-- Esperado: las cinco tablas existen en public con id uuid.
-- Columnas críticas listadas abajo deben aparecer (una fila por columna).
-- -----------------------------------------------------------------------------
SELECT t.relname AS tabla,
       c.oid IS NOT NULL AS existe_en_public,
       EXISTS (
         SELECT 1
         FROM information_schema.columns col
         WHERE col.table_schema = 'public'
           AND col.table_name = t.relname
           AND col.column_name = 'id'
           AND col.data_type = 'uuid'
       ) AS tiene_id_uuid
FROM (VALUES
  ('ligas'),
  ('liga_jugadores'),
  ('liga_inscripciones'),
  ('liga_equipos'),
  ('riviera_jugadores')
) AS t(relname)
LEFT JOIN pg_class c
  ON c.relname = t.relname
 AND c.relkind IN ('r', 'p')
 AND c.relnamespace = 'public'::regnamespace
ORDER BY t.relname;

SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'ligas' AND column_name IN ('id', 'organizador_id', 'nombre'))
    OR (table_name = 'liga_jugadores' AND column_name IN ('id', 'organizador_id', 'nombre', 'email'))
    OR (table_name = 'liga_inscripciones' AND column_name IN ('id', 'liga_id', 'jugador_id'))
    OR (table_name = 'liga_equipos' AND column_name IN ('id', 'liga_id', 'jugador1_id', 'jugador2_id'))
    OR (table_name = 'riviera_jugadores' AND column_name IN (
      'id', 'legacy_liga_jugador_id', 'email', 'estado', 'created_at'
    ))
  )
ORDER BY table_name, ordinal_position;

-- -----------------------------------------------------------------------------
-- C) Funciones auxiliares requeridas
-- Esperado:
--   * public.is_master_admin() existe.
--   * auth.uid() existe en schema auth.
-- -----------------------------------------------------------------------------
SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE (n.nspname, p.proname) IN (
  ('public', 'is_master_admin'),
  ('auth', 'uid')
)
ORDER BY n.nspname, p.proname;

-- -----------------------------------------------------------------------------
-- D) Conflictos de nombres (¿ya existen objetos de 0100/0101/0102?)
-- Esperado ANTES de aplicar: 0 filas en tablas/funciones/políticas de
-- liga_notificaciones_*. Si ya hay filas, NO reaplicar a ciegas: revisar diff.
-- -----------------------------------------------------------------------------
SELECT c.relname AS objeto, c.relkind
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'liga_notificaciones_config',
    'liga_notificaciones_preferencias',
    'liga_notificaciones_queue',
    'liga_notificaciones_log',
    'liga_notificaciones_verificaciones',
    'liga_notificaciones_verificacion_outbox',
    'liga_notificaciones_queue_una_bienvenida',
    'liga_notificaciones_queue_pendientes',
    'liga_notificaciones_log_liga',
    'liga_notificaciones_verificaciones_jugador',
    'liga_notificaciones_verificaciones_pendientes',
    'liga_notificaciones_verificacion_outbox_liga'
  )
ORDER BY c.relname;

SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'liga_notificacion_evaluar_correo',
    'liga_notificacion_enmascarar_correo',
    'liga_notificacion_hash_token',
    'liga_notificaciones_simulacion_activa',
    'liga_notificaciones_preferencias_guardar',
    'encolar_bienvenida_liga',
    'pausar_bienvenida_pendiente_liga',
    'solicitar_verificacion_correo_liga',
    'inspeccionar_verificacion_correo_liga',
    'confirmar_verificacion_correo_liga'
  )
ORDER BY p.proname;

SELECT pol.polname, c.relname AS tabla
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND pol.polname LIKE 'liga_notificaciones%'
ORDER BY c.relname, pol.polname;

-- -----------------------------------------------------------------------------
-- E) Estado de migraciones aplicadas (Supabase)
-- IMPORTANTE: no asumir columnas. Primero introspección; luego SELECT solo
-- sobre columnas confirmadas. En muchos proyectos Production la tabla tiene
-- `version` (y a veces `name` / `statements`) pero NO `inserted_at`.
-- -----------------------------------------------------------------------------

-- E1) Catálogo real de columnas (obligatorio antes de filtrar por name/etc.)
SELECT column_name, data_type, is_nullable, column_default, ordinal_position
FROM information_schema.columns
WHERE table_schema = 'supabase_migrations'
  AND table_name = 'schema_migrations'
ORDER BY ordinal_position;

-- E2) ¿Existe el schema/tabla de migraciones?
SELECT
  to_regnamespace('supabase_migrations') IS NOT NULL AS schema_migrations_schema_existe,
  to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS schema_migrations_tabla_existe;

-- E3) Consulta portable: SOLO `version` (columna siempre presente en CLI Supabase).
-- Esperado ANTES de aplicar 0100–0102: 0 filas.
SELECT version
FROM supabase_migrations.schema_migrations
WHERE version IN ('0100', '0101', '0102')
   OR version LIKE '0100%'
   OR version LIKE '0101%'
   OR version LIKE '0102%'
ORDER BY version;

-- E4) Contexto: últimas versiones registradas (solo `version`).
SELECT version
FROM supabase_migrations.schema_migrations
ORDER BY version DESC
LIMIT 30;

-- E5) Opcional — ejecutar SOLO si E1 mostró la columna `name`:
-- SELECT version, name
-- FROM supabase_migrations.schema_migrations
-- WHERE version IN ('0100', '0101', '0102')
--    OR version LIKE '0100%'
--    OR version LIKE '0101%'
--    OR version LIKE '0102%'
--    OR name ILIKE '%liga_notificaciones%'
-- ORDER BY version;

-- E6) Opcional — ejecutar SOLO si E1 mostró `inserted_at` (no es el caso actual):
-- SELECT version, name, inserted_at
-- FROM supabase_migrations.schema_migrations
-- WHERE version LIKE '0100%' OR version LIKE '0101%' OR version LIKE '0102%'
-- ORDER BY version;

-- -----------------------------------------------------------------------------
-- F) Torneo Express intacto (superficie que NO deben tocar 0100–0102)
-- Esperado: ambas clases existen; funciones %notificaciones_evento% siguen ahí.
-- -----------------------------------------------------------------------------
SELECT to_regclass('public.notificaciones_eventos_queue') AS cola_torneo_express,
       to_regclass('public.torneo_express') AS torneo_express;

SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname ILIKE '%notificaciones_evento%'
ORDER BY p.proname;

-- -----------------------------------------------------------------------------
-- G) Simulación de tokens — no debe poder habilitarse desde clientes
--
-- 0101 (sin 0102) devolvería enlace_simulado si modo_prueba=true (inseguro
--   si se aplicara sola en Production).
-- 0102 endurece: solo app.liga_notificaciones_simulacion='true' (GUC de
--   servidor) abre esa puerta; REVOKE EXECUTE de la helper a anon/authenticated.
--
-- Esta sección es SOLO LECTURA: no llama set_config ni solicita verificación.
-- -----------------------------------------------------------------------------

-- G1) GUC de sesión actual (SQL Editor / rol que ejecuta).
-- Esperado en Production: NULL o distinto de 'true'.
SELECT current_setting('app.liga_notificaciones_simulacion', true)
  AS liga_notificaciones_simulacion_guc;

-- G2) ¿Existe ya la helper de simulación? (antes de 0102 → 0 filas)
SELECT
  to_regprocedure('public.liga_notificaciones_simulacion_activa()')
    IS NOT NULL AS simulacion_activa_existe,
  to_regprocedure('public.solicitar_verificacion_correo_liga(uuid, uuid)')
    IS NOT NULL AS solicitar_verificacion_existe;

-- G3) Privilegios EXECUTE (si las funciones aún no existen, 0 filas = OK pre-migración).
-- Tras 0102, esperado:
--   * liga_notificaciones_simulacion_activa: can_execute_anon/authenticated = false
--   * solicitar_verificacion_correo_liga: anon=false, authenticated=true
SELECT
  p.proname AS function,
  pg_get_function_identity_arguments(p.oid) AS args,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS can_execute_anon,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS can_execute_authenticated,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS can_execute_service_role
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (
    (p.proname = 'liga_notificaciones_simulacion_activa'
      AND pg_get_function_identity_arguments(p.oid) = '')
    OR (p.proname = 'solicitar_verificacion_correo_liga'
      AND pg_get_function_identity_arguments(p.oid) = 'uuid, uuid')
  )
ORDER BY p.proname;

-- G4) ¿Alguna función public referencia el GUC o se llama como la helper?
-- (prosrc, sin pg_get_functiondef masivo — solo lectura de catálogo)
SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (
    p.proname ILIKE '%liga_notificaciones_simulacion%'
    OR p.prosrc ILIKE '%app.liga_notificaciones_simulacion%'
  )
ORDER BY p.proname;

-- G5) Si solicitar_verificacion_correo_liga YA existe (p.ej. 0101 parcial),
-- inspeccionar su cuerpo SIN ejecutarla:
--   * Seguro (post-0102): menciona liga_notificaciones_simulacion_activa
--     y NO abre enlace_simulado solo por modo_prueba.
--   * Inseguro (solo-0101): IF v_modo_prueba THEN … enlace_simulado.
SELECT
  p.proname,
  (pg_get_functiondef(p.oid) ILIKE '%liga_notificaciones_simulacion_activa%')
    AS usa_guc_servidor,
  (pg_get_functiondef(p.oid) ILIKE '%enlace_simulado%')
    AS menciona_enlace_simulado,
  (pg_get_functiondef(p.oid) ~* 'IF[[:space:]]+v_modo_prueba[[:space:]]+THEN')
    AS abre_por_modo_prueba
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'solicitar_verificacion_correo_liga'
  AND pg_get_function_identity_arguments(p.oid) = 'uuid, uuid';

-- -----------------------------------------------------------------------------
-- H) Criterio de autorización (checklist — no es SQL ejecutable)
-- -----------------------------------------------------------------------------
-- Autorizar aplicar 0100 + 0101 + 0102 EN BLOQUE (nunca 0101 sola) si:
--
--   A) pgcrypto / extensions.gen_random_bytes / extensions.digest = true
--   B) ligas, liga_jugadores, liga_inscripciones, liga_equipos, riviera_jugadores
--      existen con las columnas listadas (id uuid, FKs, email, etc.)
--   C) public.is_master_admin y auth.uid existen
--   D) Ningún objeto liga_notificaciones_* previo (o se documentó un diff
--      consciente). Si ya está 0100/0101/0102 aplicadas (E3 con filas), no
--      reaplicar.
--   E3) 0 filas para versiones 0100/0101/0102
--   F) Torneo Express / notificaciones_eventos_queue siguen presentes
--   G1) GUC app.liga_notificaciones_simulacion IS DISTINCT FROM 'true'
--   G2–G5) Si las funciones aún no existen → OK (estado limpio pre-migración).
--         Si existen: deben mostrar endurecimiento 0102
--         (usa_guc_servidor=true, abre_por_modo_prueba=false,
--          anon/authenticated sin EXECUTE sobre simulacion_activa).
--
-- Tras aplicar (fuera de este script, con autorización aparte), re-ejecutar
-- G1–G5 y E3: deben aparecer las tres versiones y el cuerpo post-0102.
--
-- NO activar Resend. NO enviar correos. NO poner el GUC en true en Production.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- I) Tras aplicar 0100–0102 (solo lectura de control; dejar comentado hasta entonces)
-- -----------------------------------------------------------------------------
-- SELECT column_name, data_type, column_default, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name LIKE 'liga_notificaciones%'
-- ORDER BY table_name, ordinal_position;
--
-- SELECT c.relname, i.relname AS index_name, pg_get_indexdef(i.oid)
-- FROM pg_index x
-- JOIN pg_class c ON c.oid = x.indrelid
-- JOIN pg_class i ON i.oid = x.indexrelid
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public' AND c.relname LIKE 'liga_notificaciones%'
-- ORDER BY c.relname, i.relname;
--
-- SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
-- FROM pg_policies
-- WHERE tablename LIKE 'liga_notificaciones%'
-- ORDER BY tablename, policyname;
--
-- SELECT grantee, table_name, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public'
--   AND table_name LIKE 'liga_notificaciones%'
-- ORDER BY table_name, grantee, privilege_type;
--
-- SELECT pg_get_functiondef(p.oid)
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname = 'solicitar_verificacion_correo_liga';
-- -- Esperado: referencia a liga_notificaciones_simulacion_activa, sin devolver
-- -- enlace_simulado solo por modo_prueba.
