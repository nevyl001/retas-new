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
--     privilegiado ni llamadas a funciones de escritura.
--   * No habilita destinatarios. No envía correos. No toca Resend.
--   * No modifica resultados, rankings, jornadas ni inscripciones.
--
-- Cómo usar (cuando se autorice):
--   1. Abrir el SQL Editor de Supabase Production (rol de lectura o postgres).
--   2. Ejecutar sección por sección.
--   3. Guardar el resultado junto a la autorización del despliegue.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A) Extensiones y pgcrypto
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
-- -----------------------------------------------------------------------------
SELECT c.relname AS tabla,
       EXISTS (
         SELECT 1 FROM information_schema.columns col
         WHERE col.table_schema = 'public' AND col.table_name = c.relname
           AND col.column_name = 'id' AND col.data_type = 'uuid'
       ) AS tiene_id_uuid
FROM (VALUES
  ('ligas'),
  ('liga_jugadores'),
  ('liga_inscripciones'),
  ('liga_equipos'),
  ('riviera_jugadores')
) AS t(relname)
LEFT JOIN pg_class c ON c.relname = t.relname AND c.relkind = 'r'
LEFT JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
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
-- -----------------------------------------------------------------------------
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('is_master_admin', 'auth.uid')
ORDER BY p.proname;

SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE (n.nspname, p.proname) IN (('auth', 'uid'), ('public', 'is_master_admin'))
ORDER BY n.nspname, p.proname;

-- -----------------------------------------------------------------------------
-- D) Conflictos de nombres (¿ya existen objetos de 0100/0101/0102?)
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
-- -----------------------------------------------------------------------------
SELECT version, name, inserted_at
FROM supabase_migrations.schema_migrations
WHERE version LIKE '0100%'
   OR version LIKE '0101%'
   OR version LIKE '0102%'
   OR name ILIKE '%liga_notificaciones%'
ORDER BY version;

-- Si la tabla anterior no existe en algún entorno, esta consulta alternativa
-- solo lista versiones recientes (también de solo lectura):
-- SELECT * FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 30;

-- -----------------------------------------------------------------------------
-- F) Torneo Express intacto (superficie que NO deben tocar 0100–0102)
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
-- G) GUC de simulación (debe estar ausente o distinto de 'true' en Production)
-- -----------------------------------------------------------------------------
SELECT current_setting('app.liga_notificaciones_simulacion', true)
  AS liga_notificaciones_simulacion_guc;

-- -----------------------------------------------------------------------------
-- H) Tras aplicar 0100–0102 (solo lectura de control), verificar:
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
