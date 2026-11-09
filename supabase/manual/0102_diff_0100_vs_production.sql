-- =============================================================================
-- DIFF 0100 LOCAL ↔ PRODUCTION (SOLO LECTURA)
-- =============================================================================
-- Compara el catálogo de Production con
-- supabase/migrations/0100_liga_notificaciones_bienvenida.sql.
--
-- NO modifica datos. NO registra migraciones. NO aplica 0101/0102.
-- Ejecutar completo y pegar AMBOS result sets.
-- =============================================================================

WITH esperado_columnas(tabla, columna) AS (
  VALUES
    ('liga_notificaciones_config', 'liga_id'),
    ('liga_notificaciones_config', 'bienvenida_pausada'),
    ('liga_notificaciones_config', 'modo_prueba'),
    ('liga_notificaciones_config', 'updated_at'),
    ('liga_notificaciones_preferencias', 'id'),
    ('liga_notificaciones_preferencias', 'liga_id'),
    ('liga_notificaciones_preferencias', 'liga_jugador_id'),
    ('liga_notificaciones_preferencias', 'riviera_jugador_id'),
    ('liga_notificaciones_preferencias', 'admin_habilitado'),
    ('liga_notificaciones_preferencias', 'consentimiento_estado'),
    ('liga_notificaciones_preferencias', 'consentimiento_origen'),
    ('liga_notificaciones_preferencias', 'consentimiento_registrado_at'),
    ('liga_notificaciones_preferencias', 'consentimiento_registrado_por'),
    ('liga_notificaciones_preferencias', 'correo_verificado'),
    ('liga_notificaciones_preferencias', 'correo_verificado_at'),
    ('liga_notificaciones_preferencias', 'created_at'),
    ('liga_notificaciones_preferencias', 'updated_at'),
    ('liga_notificaciones_queue', 'id'),
    ('liga_notificaciones_queue', 'liga_id'),
    ('liga_notificaciones_queue', 'liga_jugador_id'),
    ('liga_notificaciones_queue', 'inscripcion_id'),
    ('liga_notificaciones_queue', 'tipo'),
    ('liga_notificaciones_queue', 'idempotency_key'),
    ('liga_notificaciones_queue', 'estado'),
    ('liga_notificaciones_queue', 'attempts'),
    ('liga_notificaciones_queue', 'motivo'),
    ('liga_notificaciones_queue', 'created_at'),
    ('liga_notificaciones_queue', 'updated_at'),
    ('liga_notificaciones_queue', 'processed_at'),
    ('liga_notificaciones_log', 'id'),
    ('liga_notificaciones_log', 'liga_id'),
    ('liga_notificaciones_log', 'liga_jugador_id'),
    ('liga_notificaciones_log', 'queue_id'),
    ('liga_notificaciones_log', 'tipo'),
    ('liga_notificaciones_log', 'estado'),
    ('liga_notificaciones_log', 'attempts'),
    ('liga_notificaciones_log', 'motivo'),
    ('liga_notificaciones_log', 'proveedor_estado'),
    ('liga_notificaciones_log', 'created_at')
),
esperado_indices(nombre) AS (
  VALUES
    ('liga_notificaciones_queue_una_bienvenida'),
    ('liga_notificaciones_queue_pendientes'),
    ('liga_notificaciones_log_liga')
),
esperado_funcs(nombre, args) AS (
  VALUES
    ('liga_notificaciones_preferencias_guardar', ''),
    ('liga_notificacion_evaluar_correo', 'uuid'),
    ('encolar_bienvenida_liga', 'uuid, uuid'),
    ('pausar_bienvenida_pendiente_liga', 'uuid, uuid')
),
esperado_policies(tabla, policy) AS (
  VALUES
    ('liga_notificaciones_config', 'liga_notificaciones_config_admin'),
    ('liga_notificaciones_preferencias', 'liga_notificaciones_preferencias_admin'),
    ('liga_notificaciones_queue', 'liga_notificaciones_queue_lectura'),
    ('liga_notificaciones_log', 'liga_notificaciones_log_lectura')
),
hallazgos AS (
  SELECT 'columna'::text AS tipo,
         e.tabla || '.' || e.columna AS objeto,
         CASE WHEN c.column_name IS NOT NULL THEN 'OK' ELSE 'FALTA' END AS estado
  FROM esperado_columnas e
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public'
   AND c.table_name = e.tabla
   AND c.column_name = e.columna

  UNION ALL
  SELECT 'indice', e.nombre,
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'i' AND c.relname = e.nombre
         ) THEN 'OK' ELSE 'FALTA' END
  FROM esperado_indices e

  UNION ALL
  SELECT 'funcion', e.nombre || '(' || e.args || ')',
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname = e.nombre
             AND pg_get_function_identity_arguments(p.oid) = e.args
         ) THEN 'OK' ELSE 'FALTA' END
  FROM esperado_funcs e

  UNION ALL
  SELECT 'policy', e.tabla || ':' || e.policy,
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_policies p
           WHERE p.schemaname = 'public'
             AND p.tablename = e.tabla
             AND p.policyname = e.policy
         ) THEN 'OK' ELSE 'FALTA' END
  FROM esperado_policies e

  UNION ALL
  SELECT 'senal_0101', 'preferencias.' || column_name, 'PRESENTE_0101_O_PARCIAL'
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'liga_notificaciones_preferencias'
    AND column_name IN ('correo_verificacion_origen', 'correo_verificado_email')

  UNION ALL
  SELECT 'senal_0101', 'tabla.liga_notificaciones_verificaciones',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relname = 'liga_notificaciones_verificaciones'
    ) THEN 'PRESENTE_0101' ELSE 'AUSENTE_OK_PARA_SOLO_0100' END

  UNION ALL
  SELECT 'trigger', 'liga_notificaciones_preferencias_guardar',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'liga_notificaciones_preferencias'
        AND t.tgname = 'liga_notificaciones_preferencias_guardar'
        AND NOT t.tgisinternal
    ) THEN 'OK' ELSE 'FALTA' END

  UNION ALL
  SELECT 'registro', 'schema_migrations 0100*',
    CASE WHEN EXISTS (
      SELECT 1 FROM supabase_migrations.schema_migrations
      WHERE version = '0100' OR version LIKE '0100%'
    ) THEN 'REGISTRADA' ELSE 'NO_REGISTRADA' END
)
SELECT
  tipo,
  objeto,
  estado,
  CASE
    WHEN estado = 'FALTA' THEN 'BLOQUEADO'
    WHEN estado LIKE 'PRESENTE_0101%' THEN 'REVISAR'
    WHEN estado = 'NO_REGISTRADA' THEN 'REVISAR'
    ELSE 'OK'
  END AS severidad
FROM hallazgos
ORDER BY
  CASE
    WHEN estado = 'FALTA' THEN 0
    WHEN estado LIKE 'PRESENTE_0101%' THEN 1
    WHEN estado = 'NO_REGISTRADA' THEN 2
    ELSE 3
  END,
  tipo, objeto;

-- Veredicto compacto (segundo result set)
WITH esperado_columnas(tabla, columna) AS (
  VALUES
    ('liga_notificaciones_config', 'liga_id'),
    ('liga_notificaciones_config', 'bienvenida_pausada'),
    ('liga_notificaciones_config', 'modo_prueba'),
    ('liga_notificaciones_config', 'updated_at'),
    ('liga_notificaciones_preferencias', 'id'),
    ('liga_notificaciones_preferencias', 'liga_id'),
    ('liga_notificaciones_preferencias', 'liga_jugador_id'),
    ('liga_notificaciones_preferencias', 'riviera_jugador_id'),
    ('liga_notificaciones_preferencias', 'admin_habilitado'),
    ('liga_notificaciones_preferencias', 'consentimiento_estado'),
    ('liga_notificaciones_preferencias', 'consentimiento_origen'),
    ('liga_notificaciones_preferencias', 'consentimiento_registrado_at'),
    ('liga_notificaciones_preferencias', 'consentimiento_registrado_por'),
    ('liga_notificaciones_preferencias', 'correo_verificado'),
    ('liga_notificaciones_preferencias', 'correo_verificado_at'),
    ('liga_notificaciones_preferencias', 'created_at'),
    ('liga_notificaciones_preferencias', 'updated_at'),
    ('liga_notificaciones_queue', 'id'),
    ('liga_notificaciones_queue', 'liga_id'),
    ('liga_notificaciones_queue', 'liga_jugador_id'),
    ('liga_notificaciones_queue', 'inscripcion_id'),
    ('liga_notificaciones_queue', 'tipo'),
    ('liga_notificaciones_queue', 'idempotency_key'),
    ('liga_notificaciones_queue', 'estado'),
    ('liga_notificaciones_queue', 'attempts'),
    ('liga_notificaciones_queue', 'motivo'),
    ('liga_notificaciones_queue', 'created_at'),
    ('liga_notificaciones_queue', 'updated_at'),
    ('liga_notificaciones_queue', 'processed_at'),
    ('liga_notificaciones_log', 'id'),
    ('liga_notificaciones_log', 'liga_id'),
    ('liga_notificaciones_log', 'liga_jugador_id'),
    ('liga_notificaciones_log', 'queue_id'),
    ('liga_notificaciones_log', 'tipo'),
    ('liga_notificaciones_log', 'estado'),
    ('liga_notificaciones_log', 'attempts'),
    ('liga_notificaciones_log', 'motivo'),
    ('liga_notificaciones_log', 'proveedor_estado'),
    ('liga_notificaciones_log', 'created_at')
),
faltantes AS (
  SELECT COUNT(*)::int AS n
  FROM esperado_columnas e
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = e.tabla
      AND c.column_name = e.columna
  )
),
funcs_ok AS (
  SELECT
    (to_regprocedure('public.liga_notificaciones_preferencias_guardar()') IS NOT NULL
     AND to_regprocedure('public.liga_notificacion_evaluar_correo(uuid)') IS NOT NULL
     AND to_regprocedure('public.encolar_bienvenida_liga(uuid, uuid)') IS NOT NULL
     AND to_regprocedure('public.pausar_bienvenida_pendiente_liga(uuid, uuid)') IS NOT NULL) AS ok
),
pols_ok AS (
  SELECT COUNT(*)::int AS n
  FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname IN (
      'liga_notificaciones_config_admin',
      'liga_notificaciones_preferencias_admin',
      'liga_notificaciones_queue_lectura',
      'liga_notificaciones_log_lectura'
    )
),
senal_0101 AS (
  SELECT
    EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relname = 'liga_notificaciones_verificaciones'
    ) AS tiene_verif,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'liga_notificaciones_preferencias'
        AND column_name IN ('correo_verificacion_origen', 'correo_verificado_email')
    ) AS tiene_cols_0101
),
registro AS (
  SELECT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '0100' OR version LIKE '0100%'
  ) AS registrada
)
SELECT
  f.n AS columnas_0100_faltantes,
  CASE WHEN fn.ok THEN 0 ELSE 1 END AS funciones_0100_incompletas,
  p.n AS policies_0100_encontradas,
  s.tiene_verif AS senal_tabla_0101,
  s.tiene_cols_0101 AS senal_columnas_0101,
  r.registrada AS migracion_0100_registrada,
  CASE
    WHEN f.n > 0 OR NOT fn.ok OR p.n < 4
      THEN '0100 INCOMPLETA o divergente — conciliación de esquema antes de baseline'
    WHEN s.tiene_verif OR s.tiene_cols_0101
      THEN 'Hay señales 0101 — no es solo-0100 limpio'
    WHEN NOT r.registrada
      THEN '0100 COMPLETA en catálogo pero SIN registro — candidata a baseline'
    ELSE '0100 alineada y registrada'
  END AS veredicto_diff
FROM faltantes f
CROSS JOIN funcs_ok fn
CROSS JOIN pols_ok p
CROSS JOIN senal_0101 s
CROSS JOIN registro r;
