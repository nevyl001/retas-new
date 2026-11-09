-- =============================================================================
-- FORENSE DE SOLO LECTURA — ¿De dónde salen los 13/4/4 de liga_notificaciones*?
-- =============================================================================
-- Proyecto Production: giswxhmjgjepoobdoljb
--
-- Contexto del gate:
--   * 13 objetos pg_class LIKE 'liga_notificaciones%'
--   * 4 funciones de notificaciones de liga
--   * 4 políticas RLS
--   * 0 versiones 0100/0101/0102 en schema_migrations
--   * solicitar_verificacion / simulacion_activa ausentes
--   * 0 funciones SQL %notificaciones_evento%
--
-- REGLAS: SOLO SELECT / catálogos. Sin DROP/ALTER/INSERT/UPDATE/DELETE.
--         Sin aplicar migraciones. Sin Resend. Sin push/deploy.
--         Sin llamar RPCs de escritura.
--         NUNCA hacer FROM a tablas opcionales (ni dentro de CASE): Postgres
--         planifica igual y lanza 42P01 si la relación no existe.
--         Filas = estimaciones via pg_class.reltuples / pg_stat_user_tables.
--
-- Ejecutar sección por sección o todo el archivo (varios result sets).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Los 13 objetos: nombre, schema, tipo, tamaño, dueño, definición de índice
-- -----------------------------------------------------------------------------
SELECT
  n.nspname AS schema,
  c.relname AS nombre,
  CASE c.relkind
    WHEN 'r' THEN 'table'
    WHEN 'p' THEN 'partitioned_table'
    WHEN 'i' THEN 'index'
    WHEN 'S' THEN 'sequence'
    WHEN 'v' THEN 'view'
    WHEN 'm' THEN 'materialized_view'
    WHEN 'c' THEN 'composite_type'
    WHEN 't' THEN 'toast'
    WHEN 'f' THEN 'foreign_table'
    ELSE c.relkind::text
  END AS tipo,
  pg_get_userbyid(c.relowner) AS owner,
  pg_size_pretty(pg_total_relation_size(c.oid)) AS tamaño,
  CASE
    WHEN c.relkind = 'i' THEN pg_get_indexdef(c.oid)
    ELSE NULL
  END AS indexdef,
  CASE
    WHEN c.relkind = 'i' THEN (
      SELECT tc.relname
      FROM pg_index x
      JOIN pg_class tc ON tc.oid = x.indrelid
      WHERE x.indexrelid = c.oid
    )
    ELSE NULL
  END AS tabla_del_indice,
  obj_description(c.oid, 'pg_class') AS comentario
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname LIKE 'liga_notificaciones%'
ORDER BY
  CASE c.relkind WHEN 'r' THEN 0 WHEN 'p' THEN 1 WHEN 'i' THEN 2 ELSE 3 END,
  c.relname;

-- -----------------------------------------------------------------------------
-- 2) Conteos por tipo (debe sumar ~13 si el gate era correcto)
-- -----------------------------------------------------------------------------
SELECT
  CASE c.relkind
    WHEN 'r' THEN 'table'
    WHEN 'i' THEN 'index'
    WHEN 'S' THEN 'sequence'
    WHEN 'v' THEN 'view'
    ELSE c.relkind::text
  END AS tipo,
  COUNT(*)::int AS n,
  string_agg(c.relname, ', ' ORDER BY c.relname) AS nombres
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname LIKE 'liga_notificaciones%'
GROUP BY c.relkind
ORDER BY tipo;

-- -----------------------------------------------------------------------------
-- 3) Columnas reales de cada tabla liga_notificaciones_*
--    (comparar luego con 0100 vs 0101: 0101 añade correo_verificacion_origen,
--     correo_verificado_email y tablas verificaciones/outbox)
-- -----------------------------------------------------------------------------
SELECT
  c.table_name,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default,
  c.ordinal_position
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name LIKE 'liga_notificaciones%'
ORDER BY c.table_name, c.ordinal_position;

-- -----------------------------------------------------------------------------
-- 4) Constraints (PK / UNIQUE / CHECK / FK)
-- -----------------------------------------------------------------------------
SELECT
  n.nspname AS schema,
  c.relname AS tabla,
  con.conname AS constraint_name,
  CASE con.contype
    WHEN 'p' THEN 'PRIMARY KEY'
    WHEN 'u' THEN 'UNIQUE'
    WHEN 'c' THEN 'CHECK'
    WHEN 'f' THEN 'FOREIGN KEY'
    WHEN 'x' THEN 'EXCLUDE'
    ELSE con.contype::text
  END AS tipo,
  pg_get_constraintdef(con.oid) AS definicion
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname LIKE 'liga_notificaciones%'
ORDER BY c.relname, con.contype, con.conname;

-- -----------------------------------------------------------------------------
-- 5) Triggers
-- -----------------------------------------------------------------------------
SELECT
  n.nspname AS schema,
  c.relname AS tabla,
  t.tgname AS trigger_name,
  pg_get_triggerdef(t.oid) AS definicion,
  p.proname AS funcion_asociada
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_proc p ON p.oid = t.tgfoid
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
  AND (
    c.relname LIKE 'liga_notificaciones%'
    OR p.proname LIKE 'liga_notificacion%'
  )
ORDER BY c.relname, t.tgname;

-- -----------------------------------------------------------------------------
-- 6) Las 4 funciones: firma, security, privilegios, origen probable
-- -----------------------------------------------------------------------------
SELECT
  n.nspname AS schema,
  p.proname AS funcion,
  pg_get_function_identity_arguments(p.oid) AS args,
  pg_get_function_result(p.oid) AS returns,
  CASE p.prokind
    WHEN 'f' THEN 'function'
    WHEN 'p' THEN 'procedure'
    WHEN 'a' THEN 'aggregate'
    WHEN 'w' THEN 'window'
    ELSE p.prokind::text
  END AS kind,
  p.prosecdef AS security_definer,
  p.provolatile AS volatility,
  pg_get_userbyid(p.proowner) AS owner,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS exec_anon,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS exec_authenticated,
  obj_description(p.oid, 'pg_proc') AS comentario,
  CASE
    WHEN p.proname IN (
      'liga_notificaciones_preferencias_guardar',
      'liga_notificacion_evaluar_correo',
      'encolar_bienvenida_liga',
      'pausar_bienvenida_pendiente_liga'
    ) THEN 'coincide_0100'
    WHEN p.proname IN (
      'liga_notificacion_hash_token',
      'liga_notificacion_enmascarar_correo',
      'solicitar_verificacion_correo_liga',
      'inspeccionar_verificacion_correo_liga',
      'confirmar_verificacion_correo_liga'
    ) THEN 'coincide_0101'
    WHEN p.proname = 'liga_notificaciones_simulacion_activa'
      THEN 'coincide_0102'
    ELSE 'otro_o_previo'
  END AS clasificacion_prevista
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (
    p.proname LIKE 'liga_notificacion%'
    OR p.proname IN (
      'encolar_bienvenida_liga',
      'pausar_bienvenida_pendiente_liga',
      'solicitar_verificacion_correo_liga',
      'inspeccionar_verificacion_correo_liga',
      'confirmar_verificacion_correo_liga'
    )
  )
ORDER BY p.proname, args;

-- -----------------------------------------------------------------------------
-- 7) Definiciones completas de esas funciones (solo lectura)
-- -----------------------------------------------------------------------------
SELECT
  p.proname AS funcion,
  pg_get_function_identity_arguments(p.oid) AS args,
  pg_get_functiondef(p.oid) AS definicion
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (
    p.proname LIKE 'liga_notificacion%'
    OR p.proname IN (
      'encolar_bienvenida_liga',
      'pausar_bienvenida_pendiente_liga',
      'solicitar_verificacion_correo_liga',
      'inspeccionar_verificacion_correo_liga',
      'confirmar_verificacion_correo_liga'
    )
  )
ORDER BY p.proname, args;

-- -----------------------------------------------------------------------------
-- 8) Señales 0100 vs 0101 en el cuerpo / columnas
-- -----------------------------------------------------------------------------
SELECT
  'preferencias.correo_verificacion_origen' AS senal,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'liga_notificaciones_preferencias'
      AND column_name = 'correo_verificacion_origen'
  ) AS presente,
  'Columna añadida por 0101'::text AS nota
UNION ALL
SELECT
  'preferencias.correo_verificado_email',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'liga_notificaciones_preferencias'
      AND column_name = 'correo_verificado_email'
  ),
  'Columna añadida por 0101'
UNION ALL
SELECT
  'tabla liga_notificaciones_verificaciones',
  to_regclass('public.liga_notificaciones_verificaciones') IS NOT NULL,
  'Tabla creada por 0101'
UNION ALL
SELECT
  'tabla liga_notificaciones_verificacion_outbox',
  to_regclass('public.liga_notificaciones_verificacion_outbox') IS NOT NULL,
  'Tabla creada por 0101'
UNION ALL
SELECT
  'fn solicitar_verificacion_correo_liga',
  to_regprocedure('public.solicitar_verificacion_correo_liga(uuid, uuid)') IS NOT NULL,
  'RPC 0101 (reescrita en 0102)'
UNION ALL
SELECT
  'fn liga_notificaciones_simulacion_activa',
  to_regprocedure('public.liga_notificaciones_simulacion_activa()') IS NOT NULL,
  'Helper 0102'
UNION ALL
SELECT
  'log.tipo permite verificacion',
  EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'liga_notificaciones_log'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%verificacion%'
  ),
  'CHECK de tipo ampliado en 0101'
UNION ALL
SELECT
  'trigger preferencias_guardar',
  EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'liga_notificaciones_preferencias'
      AND t.tgname = 'liga_notificaciones_preferencias_guardar'
      AND NOT t.tgisinternal
  ),
  'Trigger de 0100';

-- -----------------------------------------------------------------------------
-- 9) Las 4 políticas RLS
-- -----------------------------------------------------------------------------
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual AS using_expr,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    policyname LIKE 'liga_notificaciones%'
    OR tablename LIKE 'liga_notificaciones%'
  )
ORDER BY tablename, policyname;

-- RLS habilitado / forzado
SELECT
  c.relname AS tabla,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname LIKE 'liga_notificaciones%'
ORDER BY c.relname;

-- -----------------------------------------------------------------------------
-- 10) Inventario esperado 0100 vs encontrado (matriz)
-- -----------------------------------------------------------------------------
WITH esperado_0100(objeto, tipo) AS (
  VALUES
    ('liga_notificaciones_config', 'table'),
    ('liga_notificaciones_preferencias', 'table'),
    ('liga_notificaciones_queue', 'table'),
    ('liga_notificaciones_log', 'table'),
    ('liga_notificaciones_queue_una_bienvenida', 'index'),
    ('liga_notificaciones_queue_pendientes', 'index'),
    ('liga_notificaciones_log_liga', 'index'),
    ('liga_notificaciones_preferencias_guardar', 'function'),
    ('liga_notificacion_evaluar_correo', 'function'),
    ('encolar_bienvenida_liga', 'function'),
    ('pausar_bienvenida_pendiente_liga', 'function'),
    ('liga_notificaciones_config_admin', 'policy'),
    ('liga_notificaciones_preferencias_admin', 'policy'),
    ('liga_notificaciones_queue_lectura', 'policy'),
    ('liga_notificaciones_log_lectura', 'policy')
),
esperado_0101(objeto, tipo) AS (
  VALUES
    ('liga_notificaciones_verificaciones', 'table'),
    ('liga_notificaciones_verificacion_outbox', 'table'),
    ('liga_notificaciones_verificaciones_jugador', 'index'),
    ('liga_notificaciones_verificaciones_pendientes', 'index'),
    ('liga_notificaciones_verificacion_outbox_liga', 'index'),
    ('liga_notificacion_hash_token', 'function'),
    ('liga_notificacion_enmascarar_correo', 'function'),
    ('solicitar_verificacion_correo_liga', 'function'),
    ('inspeccionar_verificacion_correo_liga', 'function'),
    ('confirmar_verificacion_correo_liga', 'function'),
    ('liga_notificaciones_verificaciones_lectura', 'policy'),
    ('liga_notificaciones_verificacion_outbox_lectura', 'policy')
),
esperado_0102(objeto, tipo) AS (
  VALUES
    ('liga_notificaciones_simulacion_activa', 'function')
),
encontrado AS (
  SELECT c.relname AS objeto,
         CASE c.relkind WHEN 'r' THEN 'table' WHEN 'i' THEN 'index' ELSE c.relkind::text END AS tipo
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname LIKE 'liga_notificaciones%'
  UNION ALL
  SELECT p.proname,
         'function'
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND (
      p.proname LIKE 'liga_notificacion%'
      OR p.proname IN (
        'encolar_bienvenida_liga',
        'pausar_bienvenida_pendiente_liga',
        'solicitar_verificacion_correo_liga',
        'inspeccionar_verificacion_correo_liga',
        'confirmar_verificacion_correo_liga'
      )
    )
  UNION ALL
  SELECT pol.polname, 'policy'
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND (pol.polname LIKE 'liga_notificaciones%' OR c.relname LIKE 'liga_notificaciones%')
)
SELECT
  e.origen,
  e.objeto,
  e.tipo,
  (f.objeto IS NOT NULL) AS presente_en_production
FROM (
  SELECT '0100' AS origen, objeto, tipo FROM esperado_0100
  UNION ALL
  SELECT '0101', objeto, tipo FROM esperado_0101
  UNION ALL
  SELECT '0102', objeto, tipo FROM esperado_0102
) e
LEFT JOIN encontrado f
  ON f.objeto = e.objeto AND f.tipo = e.tipo
ORDER BY e.origen, e.tipo, e.objeto;

-- Objetos EN production que NO están en la lista nominal 0100–0102
-- (p.ej. índices pkey/unique auto-nombrados: NO son conflicto, son colaterales)
SELECT
  f.objeto,
  f.tipo,
  CASE
    WHEN f.objeto ~ '_pkey$' THEN 'indice_pk_automatico'
    WHEN f.objeto ~ '_key$' THEN 'indice_unique_automatico'
    WHEN f.objeto LIKE 'liga_notificaciones%' THEN 'nombre_bajo_patron_liga'
    ELSE 'fuera_de_lista_nominal'
  END AS interpretacion
FROM (
  SELECT c.relname AS objeto,
         CASE c.relkind WHEN 'r' THEN 'table' WHEN 'i' THEN 'index' ELSE c.relkind::text END AS tipo
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname LIKE 'liga_notificaciones%'
  UNION ALL
  SELECT p.proname, 'function'
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND (
      p.proname LIKE 'liga_notificacion%'
      OR p.proname IN (
        'encolar_bienvenida_liga',
        'pausar_bienvenida_pendiente_liga',
        'solicitar_verificacion_correo_liga',
        'inspeccionar_verificacion_correo_liga',
        'confirmar_verificacion_correo_liga'
      )
    )
  UNION ALL
  SELECT pol.polname, 'policy'
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND (pol.polname LIKE 'liga_notificaciones%' OR c.relname LIKE 'liga_notificaciones%')
) f
WHERE NOT EXISTS (
  SELECT 1 FROM (
    SELECT objeto, tipo FROM (
      VALUES
        ('liga_notificaciones_config', 'table'),
        ('liga_notificaciones_preferencias', 'table'),
        ('liga_notificaciones_queue', 'table'),
        ('liga_notificaciones_log', 'table'),
        ('liga_notificaciones_queue_una_bienvenida', 'index'),
        ('liga_notificaciones_queue_pendientes', 'index'),
        ('liga_notificaciones_log_liga', 'index'),
        ('liga_notificaciones_preferencias_guardar', 'function'),
        ('liga_notificacion_evaluar_correo', 'function'),
        ('encolar_bienvenida_liga', 'function'),
        ('pausar_bienvenida_pendiente_liga', 'function'),
        ('liga_notificaciones_config_admin', 'policy'),
        ('liga_notificaciones_preferencias_admin', 'policy'),
        ('liga_notificaciones_queue_lectura', 'policy'),
        ('liga_notificaciones_log_lectura', 'policy'),
        ('liga_notificaciones_verificaciones', 'table'),
        ('liga_notificaciones_verificacion_outbox', 'table'),
        ('liga_notificaciones_verificaciones_jugador', 'index'),
        ('liga_notificaciones_verificaciones_pendientes', 'index'),
        ('liga_notificaciones_verificacion_outbox_liga', 'index'),
        ('liga_notificacion_hash_token', 'function'),
        ('liga_notificacion_enmascarar_correo', 'function'),
        ('solicitar_verificacion_correo_liga', 'function'),
        ('inspeccionar_verificacion_correo_liga', 'function'),
        ('confirmar_verificacion_correo_liga', 'function'),
        ('liga_notificaciones_verificaciones_lectura', 'policy'),
        ('liga_notificaciones_verificacion_outbox_lectura', 'policy'),
        ('liga_notificaciones_simulacion_activa', 'function')
    ) v(objeto, tipo)
  ) exp
  WHERE exp.objeto = f.objeto AND exp.tipo = f.tipo
)
ORDER BY f.tipo, f.objeto;

-- -----------------------------------------------------------------------------
-- 11) schema_migrations: columnas reales + versiones (sin asumir 4 dígitos)
-- -----------------------------------------------------------------------------
SELECT column_name, data_type, is_nullable, ordinal_position
FROM information_schema.columns
WHERE table_schema = 'supabase_migrations'
  AND table_name = 'schema_migrations'
ORDER BY ordinal_position;

-- Todas las versiones (solo `version`; portable)
SELECT version
FROM supabase_migrations.schema_migrations
ORDER BY version;

-- Coincidencias por texto (liga / notif / 100-102 / timestamps)
SELECT version
FROM supabase_migrations.schema_migrations
WHERE version ILIKE '%liga%notif%'
   OR version ILIKE '%notificacion%liga%'
   OR version ILIKE '%0100%'
   OR version ILIKE '%0101%'
   OR version ILIKE '%0102%'
   OR version ~ '(^|[^0-9])100([^0-9]|$)'
   OR version ~ '(^|[^0-9])101([^0-9]|$)'
   OR version ~ '(^|[^0-9])102([^0-9]|$)'
ORDER BY version;

-- Si E1 mostró columna `name`, descomentar:
-- SELECT version, name
-- FROM supabase_migrations.schema_migrations
-- WHERE version ILIKE '%liga%'
--    OR version ILIKE '%notif%'
--    OR coalesce(name, '') ILIKE '%liga%notif%'
--    OR coalesce(name, '') ILIKE '%notificacion%'
-- ORDER BY version;

-- -----------------------------------------------------------------------------
-- 12) ¿Hay datos? — SOLO catálogo / estadísticas (NUNCA COUNT(*) sobre tablas)
--     Postgres planifica el FROM aunque esté dentro de CASE → 42P01 si falta.
--     Distingue: inexistente | existe (estimación 0) | existe (estimación >0).
-- -----------------------------------------------------------------------------
WITH esperadas(tabla, familia) AS (
  VALUES
    ('liga_notificaciones_config', '0100'),
    ('liga_notificaciones_preferencias', '0100'),
    ('liga_notificaciones_queue', '0100'),
    ('liga_notificaciones_log', '0100'),
    ('liga_notificaciones_verificaciones', '0101'),
    ('liga_notificaciones_verificacion_outbox', '0101')
)
SELECT
  e.tabla,
  e.familia,
  (c.oid IS NOT NULL) AS existe,
  CASE
    WHEN c.oid IS NULL THEN 'inexistente'
    WHEN coalesce(s.n_live_tup, greatest(c.reltuples, 0)::bigint) = 0
      THEN 'existe_sin_filas_estimadas'
    ELSE 'existe_con_filas_estimadas'
  END AS estado_datos,
  CASE
    WHEN c.oid IS NULL THEN NULL
    ELSE greatest(c.reltuples, 0)::bigint
  END AS filas_estimadas_pg_class,
  CASE
    WHEN c.oid IS NULL THEN NULL
    ELSE s.n_live_tup
  END AS filas_estimadas_pg_stat,
  CASE
    WHEN c.oid IS NULL THEN 'Tabla no presente en public (to_regclass/pg_class).'
    ELSE 'ESTIMACIÓN de estadísticas Postgres — no es COUNT(*) exacto; puede estar desactualizada.'
  END AS nota
FROM esperadas e
LEFT JOIN pg_class c
  ON c.relname = e.tabla
 AND c.relkind = 'r'
 AND c.relnamespace = 'public'::regnamespace
LEFT JOIN pg_stat_user_tables s
  ON s.relid = c.oid
ORDER BY e.familia, e.tabla;

-- -----------------------------------------------------------------------------
-- 13) Torneo Express: cola vs funciones SQL vs Edge Functions
--     (0 SQL %notificaciones_evento% NO implica TE dañado)
-- -----------------------------------------------------------------------------
SELECT
  EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = 'torneo_express'
  ) AS torneo_express_existe,
  EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname = 'notificaciones_eventos_queue'
  ) AS cola_te_existe;

-- Columnas de la cola TE vía information_schema (0 filas si la tabla no existe)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'notificaciones_eventos_queue'
ORDER BY ordinal_position;

-- Estimación de filas de la cola TE (sin FROM directo a la relación)
SELECT
  c.relname AS tabla,
  greatest(c.reltuples, 0)::bigint AS filas_estimadas_pg_class,
  s.n_live_tup AS filas_estimadas_pg_stat,
  'ESTIMACIÓN — no es COUNT(*) exacto'::text AS nota
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname = 'notificaciones_eventos_queue';

-- Funciones SQL cuyo nombre sugiere notificaciones de evento / TE
SELECT
  n.nspname AS schema,
  p.proname AS funcion,
  pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'extensions')
  AND (
    p.proname ILIKE '%notificaciones_evento%'
    OR p.proname ILIKE '%notificacion_evento%'
    OR p.proname ILIKE '%evento_notif%'
    OR p.proname ILIKE '%procesar%notif%'
    OR p.proname ILIKE '%enviar%notif%'
  )
ORDER BY n.nspname, p.proname;

-- Nota de producto (no es SQL): el worker de TE vive como Edge Function
-- `supabase/functions/procesar-notificaciones-evento` — NO aparece en pg_proc.
-- El de liga es `procesar-liga-notificaciones`. Ambos están fuera de Postgres.

-- -----------------------------------------------------------------------------
-- 14) Veredicto forense (catálogo only) — NUNCA reporta OK si hay incompatibilidad
-- -----------------------------------------------------------------------------
WITH flags AS (
  SELECT
    EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relname = 'liga_notificaciones_config'
    ) AS t_config,
    EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relname = 'liga_notificaciones_preferencias'
    ) AS t_prefs,
    EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relname = 'liga_notificaciones_queue'
    ) AS t_queue,
    EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relname = 'liga_notificaciones_log'
    ) AS t_log,
    EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relname = 'liga_notificaciones_verificaciones'
    ) AS t_verif,
    EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relname = 'liga_notificaciones_verificacion_outbox'
    ) AS t_outbox,
    to_regprocedure('public.liga_notificaciones_preferencias_guardar()') IS NOT NULL AS f_pref_guardar,
    to_regprocedure('public.liga_notificacion_evaluar_correo(uuid)') IS NOT NULL AS f_evaluar,
    to_regprocedure('public.encolar_bienvenida_liga(uuid, uuid)') IS NOT NULL AS f_encolar,
    to_regprocedure('public.pausar_bienvenida_pendiente_liga(uuid, uuid)') IS NOT NULL AS f_pausar,
    to_regprocedure('public.liga_notificacion_hash_token(text)') IS NOT NULL AS f_hash,
    to_regprocedure('public.liga_notificacion_enmascarar_correo(text)') IS NOT NULL AS f_mask,
    to_regprocedure('public.solicitar_verificacion_correo_liga(uuid, uuid)') IS NOT NULL AS f_solicitar,
    to_regprocedure('public.inspeccionar_verificacion_correo_liga(text)') IS NOT NULL AS f_inspeccionar,
    to_regprocedure('public.confirmar_verificacion_correo_liga(text)') IS NOT NULL AS f_confirmar,
    to_regprocedure('public.liga_notificaciones_simulacion_activa()') IS NOT NULL AS f_sim,
    (
      SELECT COUNT(*)::int
      FROM pg_policy pol
      JOIN pg_class c ON c.oid = pol.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND (pol.polname LIKE 'liga_notificaciones%' OR c.relname LIKE 'liga_notificaciones%')
    ) AS n_policies,
    (
      SELECT COUNT(*)::int
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname LIKE 'liga_notificaciones%'
    ) AS n_pg_class,
    (
      SELECT COUNT(*)::int
      FROM supabase_migrations.schema_migrations
      WHERE version IN ('0100', '0101', '0102')
         OR version LIKE '0100%'
         OR version LIKE '0101%'
         OR version LIKE '0102%'
    ) AS n_mig_010x,
    nullif(current_setting('app.liga_notificaciones_simulacion', true), '') AS guc_sim,
    EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = 'torneo_express'
    ) AS te_ok,
    EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relname = 'notificaciones_eventos_queue'
    ) AS te_queue_ok,
    EXISTS (
      SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'
    ) AS pgcrypto_ok,
    to_regprocedure('extensions.gen_random_bytes(integer)') IS NOT NULL AS gen_bytes_ok,
    to_regprocedure('extensions.digest(bytea, text)') IS NOT NULL AS digest_ok
),
derived AS (
  SELECT
    f.*,
    (t_config AND t_prefs AND t_queue AND t_log
      AND f_pref_guardar AND f_evaluar AND f_encolar AND f_pausar
      AND n_policies >= 4) AS superficie_0100,
    (t_verif AND t_outbox AND f_hash AND f_mask AND f_solicitar
      AND f_inspeccionar AND f_confirmar) AS superficie_0101,
    f_sim AS superficie_0102,
    (t_config OR t_prefs OR t_queue OR t_log OR t_verif OR t_outbox
      OR f_encolar OR f_solicitar OR f_sim OR n_policies > 0) AS hay_algo_liga_notif,
    (n_mig_010x = 0) AS sin_registro_migracion
  FROM flags f
)
SELECT * FROM (
  SELECT
    10 AS ord,
    'patron_detectado'::text AS comprobacion,
    CASE
      WHEN superficie_0100 AND NOT superficie_0101 AND NOT superficie_0102 AND sin_registro_migracion
        THEN '0100 presente sin registro; 0101/0102 ausentes'
      WHEN superficie_0100 AND superficie_0101 AND NOT superficie_0102 AND sin_registro_migracion
        THEN '0100+0101 presentes sin 0102 y sin registro'
      WHEN superficie_0100 AND superficie_0101 AND superficie_0102 AND sin_registro_migracion
        THEN '0100–0102 presentes sin registro en schema_migrations'
      WHEN superficie_0100 AND superficie_0101 AND superficie_0102 AND NOT sin_registro_migracion
        THEN 'Superficie 0100–0102 alineada con registro de migraciones'
      WHEN NOT hay_algo_liga_notif AND sin_registro_migracion
        THEN 'Limpio: sin objetos liga_notificaciones*'
      ELSE 'Patrón mixto / incompleto — revisar secciones 1, 6, 8, 9, 10'
    END AS observado,
    CASE
      WHEN superficie_0100 AND superficie_0101 AND NOT superficie_0102
        THEN 'BLOQUEADO'
      WHEN superficie_0100 AND NOT superficie_0101 AND sin_registro_migracion
        THEN 'REVISAR'
      WHEN NOT hay_algo_liga_notif AND sin_registro_migracion
           AND pgcrypto_ok AND gen_bytes_ok AND digest_ok AND te_ok AND te_queue_ok
        THEN 'OK'
      WHEN hay_algo_liga_notif AND sin_registro_migracion
        THEN 'REVISAR'
      ELSE 'REVISAR'
    END AS estado,
    CASE
      WHEN superficie_0100 AND superficie_0101 AND NOT superficie_0102
        THEN '0101 sin 0102 puede devolver enlace_simulado por modo_prueba. No apply adicional a ciegas.'
      WHEN superficie_0100 AND NOT superficie_0101 AND sin_registro_migracion
        THEN 'Coincide con apply manual/parcial de 0100. No re-ejecutar 0100 cruda (conflicto de nombres). Plan: baseline + 0101+0102.'
      WHEN NOT hay_algo_liga_notif
        THEN 'Dependencias limpias para un apply futuro autorizado de 0100→0101→0102 en bloque.'
      ELSE 'Hace falta contrastar objetos vs migraciones antes de cualquier apply.'
    END AS explicacion
  FROM derived

  UNION ALL
  SELECT 20, 'objetos_pg_class_liga_notificaciones*',
    n_pg_class::text,
    CASE WHEN n_pg_class IN (0, 13) OR n_pg_class BETWEEN 11 AND 20 THEN 'OK' ELSE 'REVISAR' END,
    '13 ≈ 4 tablas 0100 + índices PK/UNIQUE + 3 índices nombrados. No son 13 tablas.'
  FROM derived

  UNION ALL
  SELECT 30, 'registro_schema_migrations_0100_0102',
    n_mig_010x::text || ' filas',
    CASE
      WHEN n_mig_010x = 0 AND superficie_0100 THEN 'REVISAR'
      WHEN n_mig_010x = 0 AND NOT hay_algo_liga_notif THEN 'OK'
      WHEN n_mig_010x > 0 AND superficie_0100 THEN 'OK'
      ELSE 'REVISAR'
    END,
    'Objetos sin versión registrada = instalación fuera del historial CLI.'
  FROM derived

  UNION ALL
  SELECT 40, 'riesgo_simulacion_solo_0101',
    CASE
      WHEN superficie_0101 AND NOT superficie_0102 THEN 'activo'
      WHEN NOT superficie_0101 THEN 'N/A (sin 0101)'
      ELSE 'mitigado_si_0102'
    END,
    CASE
      WHEN superficie_0101 AND NOT superficie_0102 THEN 'BLOQUEADO'
      ELSE 'OK'
    END,
    'Sin liga_notificaciones_simulacion_activa, modo_prueba puede filtrar el token al cliente.'
  FROM derived

  UNION ALL
  SELECT 50, 'guc_app.liga_notificaciones_simulacion',
    coalesce(guc_sim, 'NULL/vacío'),
    CASE WHEN guc_sim IS NOT DISTINCT FROM 'true' THEN 'BLOQUEADO' ELSE 'OK' END,
    'En Production debe permanecer distinto de true.'
  FROM derived

  UNION ALL
  SELECT 60, 'crypto_dependencias',
    format('pgcrypto=%s gen_bytes=%s digest=%s', pgcrypto_ok, gen_bytes_ok, digest_ok),
    CASE WHEN pgcrypto_ok AND gen_bytes_ok AND digest_ok THEN 'OK' ELSE 'BLOQUEADO' END,
    'Requeridas para tokens/hash de 0101/0102.'
  FROM derived

  UNION ALL
  SELECT 70, 'torneo_express_superficie',
    format('te=%s cola=%s', te_ok, te_queue_ok),
    CASE
      WHEN te_ok AND te_queue_ok THEN 'OK'
      WHEN te_ok OR te_queue_ok THEN 'REVISAR'
      ELSE 'REVISAR'
    END,
    '0 funciones SQL %notificaciones_evento% no implica daño; el worker es Edge Function.'
  FROM derived

  UNION ALL
  SELECT 80, 'privilegio_sim_anon_authenticated',
    CASE
      WHEN NOT f_sim THEN 'N/A (helper ausente)'
      ELSE format(
        'anon=%s auth=%s',
        has_function_privilege('anon', 'public.liga_notificaciones_simulacion_activa()', 'EXECUTE'),
        has_function_privilege('authenticated', 'public.liga_notificaciones_simulacion_activa()', 'EXECUTE')
      )
    END,
    CASE
      WHEN NOT f_sim THEN 'OK'
      WHEN has_function_privilege('anon', 'public.liga_notificaciones_simulacion_activa()', 'EXECUTE')
        OR has_function_privilege('authenticated', 'public.liga_notificaciones_simulacion_activa()', 'EXECUTE')
        THEN 'BLOQUEADO'
      ELSE 'OK'
    END,
    'Clientes no deben poder ejecutar la helper de simulación.'
  FROM derived

  UNION ALL
  SELECT 900, 'VEREDICTO_FORENSE',
    CASE
      WHEN NOT (pgcrypto_ok AND gen_bytes_ok AND digest_ok) THEN 'NO LISTO — crypto'
      WHEN guc_sim IS NOT DISTINCT FROM 'true' THEN 'NO LISTO — GUC simulación=true'
      WHEN superficie_0101 AND NOT superficie_0102 THEN 'NO LISTO — 0101 sin endurecimiento 0102'
      WHEN f_sim
       AND (
         has_function_privilege('anon', 'public.liga_notificaciones_simulacion_activa()', 'EXECUTE')
         OR has_function_privilege('authenticated', 'public.liga_notificaciones_simulacion_activa()', 'EXECUTE')
       ) THEN 'NO LISTO — simulación ejecutable por cliente'
      WHEN superficie_0100 AND NOT superficie_0101 AND sin_registro_migracion
        THEN 'REVISAR — 0100 huérfana de historial; plan baseline antes de 0101/0102'
      WHEN hay_algo_liga_notif AND sin_registro_migracion
        THEN 'REVISAR — objetos sin migración registrada'
      WHEN NOT hay_algo_liga_notif AND sin_registro_migracion
           AND te_ok AND te_queue_ok
        THEN 'DEPENDENCIAS OK — superficie limpia (apply aún no autorizado)'
      ELSE 'REVISAR — contrastar result sets 1–12'
    END,
    CASE
      WHEN NOT (pgcrypto_ok AND gen_bytes_ok AND digest_ok) THEN 'BLOQUEADO'
      WHEN guc_sim IS NOT DISTINCT FROM 'true' THEN 'BLOQUEADO'
      WHEN superficie_0101 AND NOT superficie_0102 THEN 'BLOQUEADO'
      WHEN f_sim
       AND (
         has_function_privilege('anon', 'public.liga_notificaciones_simulacion_activa()', 'EXECUTE')
         OR has_function_privilege('authenticated', 'public.liga_notificaciones_simulacion_activa()', 'EXECUTE')
       ) THEN 'BLOQUEADO'
      WHEN superficie_0100 AND sin_registro_migracion THEN 'REVISAR'
      WHEN hay_algo_liga_notif AND sin_registro_migracion THEN 'REVISAR'
      WHEN NOT hay_algo_liga_notif AND sin_registro_migracion
           AND pgcrypto_ok AND gen_bytes_ok AND digest_ok
           AND te_ok AND te_queue_ok
        THEN 'OK'
      ELSE 'REVISAR'
    END,
    'OK solo si no hay incompatibilidad crítica. REVISAR/BLOQUEADO ≠ autorización de apply. Sin DROP, sin Resend, sin deploy.'
  FROM derived
) v
ORDER BY ord;
