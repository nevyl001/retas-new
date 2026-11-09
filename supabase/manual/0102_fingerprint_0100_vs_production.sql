-- =============================================================================
-- FINGERPRINT PROFUNDO 0100 ↔ PRODUCTION — UN SOLO RESULT SET (SOLO LECTURA)
-- =============================================================================
-- Contrasta tipos, defaults, CHECKs, índices, trigger, cuerpos de funciones,
-- grants y policies con lo definido en
-- supabase/migrations/0100_liga_notificaciones_bienvenida.sql.
--
-- NO basta con nombres/conteos: cada fila es una comprobación semántica.
-- NO modifica datos ni historial. NO aplica migraciones.
--
-- Interpretación:
--   OK        = alineado con 0100 local
--   DIFF      = existe pero no coincide (conciliación / no baseline ciego)
--   FALTA     = ausente (0100 incompleta)
--   INFO      = contexto (formato de versiones, etc.)
-- =============================================================================

WITH
-- ----- Columnas: tipo + nullability + default (normalizado) -----
esperado_cols(tabla, columna, data_type, is_nullable, default_like) AS (
  VALUES
    ('liga_notificaciones_config', 'liga_id', 'uuid', 'NO', NULL),
    ('liga_notificaciones_config', 'bienvenida_pausada', 'boolean', 'NO', '%true%'),
    ('liga_notificaciones_config', 'modo_prueba', 'boolean', 'NO', '%true%'),
    ('liga_notificaciones_config', 'updated_at', 'timestamp with time zone', 'NO', '%now()%'),
    ('liga_notificaciones_preferencias', 'id', 'uuid', 'NO', '%gen_random_uuid%'),
    ('liga_notificaciones_preferencias', 'liga_id', 'uuid', 'NO', NULL),
    ('liga_notificaciones_preferencias', 'liga_jugador_id', 'uuid', 'NO', NULL),
    ('liga_notificaciones_preferencias', 'riviera_jugador_id', 'uuid', 'YES', NULL),
    ('liga_notificaciones_preferencias', 'admin_habilitado', 'boolean', 'NO', '%false%'),
    ('liga_notificaciones_preferencias', 'consentimiento_estado', 'text', 'NO', '%sin_autorizacion%'),
    ('liga_notificaciones_preferencias', 'consentimiento_origen', 'text', 'YES', NULL),
    ('liga_notificaciones_preferencias', 'consentimiento_registrado_at', 'timestamp with time zone', 'YES', NULL),
    ('liga_notificaciones_preferencias', 'consentimiento_registrado_por', 'uuid', 'YES', NULL),
    ('liga_notificaciones_preferencias', 'correo_verificado', 'boolean', 'NO', '%false%'),
    ('liga_notificaciones_preferencias', 'correo_verificado_at', 'timestamp with time zone', 'YES', NULL),
    ('liga_notificaciones_preferencias', 'created_at', 'timestamp with time zone', 'NO', '%now()%'),
    ('liga_notificaciones_preferencias', 'updated_at', 'timestamp with time zone', 'NO', '%now()%'),
    ('liga_notificaciones_queue', 'id', 'uuid', 'NO', '%gen_random_uuid%'),
    ('liga_notificaciones_queue', 'liga_id', 'uuid', 'NO', NULL),
    ('liga_notificaciones_queue', 'liga_jugador_id', 'uuid', 'NO', NULL),
    ('liga_notificaciones_queue', 'inscripcion_id', 'uuid', 'YES', NULL),
    ('liga_notificaciones_queue', 'tipo', 'text', 'NO', '%bienvenida%'),
    ('liga_notificaciones_queue', 'idempotency_key', 'text', 'NO', NULL),
    ('liga_notificaciones_queue', 'estado', 'text', 'NO', '%pendiente%'),
    ('liga_notificaciones_queue', 'attempts', 'integer', 'NO', '%0%'),
    ('liga_notificaciones_queue', 'motivo', 'text', 'YES', NULL),
    ('liga_notificaciones_queue', 'created_at', 'timestamp with time zone', 'NO', '%now()%'),
    ('liga_notificaciones_queue', 'updated_at', 'timestamp with time zone', 'NO', '%now()%'),
    ('liga_notificaciones_queue', 'processed_at', 'timestamp with time zone', 'YES', NULL),
    ('liga_notificaciones_log', 'id', 'uuid', 'NO', '%gen_random_uuid%'),
    ('liga_notificaciones_log', 'liga_id', 'uuid', 'NO', NULL),
    ('liga_notificaciones_log', 'liga_jugador_id', 'uuid', 'NO', NULL),
    ('liga_notificaciones_log', 'queue_id', 'uuid', 'YES', NULL),
    ('liga_notificaciones_log', 'tipo', 'text', 'NO', NULL),
    ('liga_notificaciones_log', 'estado', 'text', 'NO', NULL),
    ('liga_notificaciones_log', 'attempts', 'integer', 'NO', '%0%'),
    ('liga_notificaciones_log', 'motivo', 'text', 'YES', NULL),
    ('liga_notificaciones_log', 'proveedor_estado', 'text', 'YES', NULL),
    ('liga_notificaciones_log', 'created_at', 'timestamp with time zone', 'NO', '%now()%')
),
col_checks AS (
  SELECT
    'columna'::text AS familia,
    e.tabla || '.' || e.columna AS comprobacion,
    CASE
      WHEN c.column_name IS NULL THEN 'FALTA'
      WHEN c.data_type IS DISTINCT FROM e.data_type THEN 'DIFF'
      WHEN c.is_nullable IS DISTINCT FROM e.is_nullable THEN 'DIFF'
      WHEN e.default_like IS NOT NULL
           AND coalesce(c.column_default, '') NOT ILIKE e.default_like THEN 'DIFF'
      ELSE 'OK'
    END AS estado,
    format(
      'tipo=%s null=%s default=%s',
      coalesce(c.data_type, '∅'),
      coalesce(c.is_nullable, '∅'),
      coalesce(c.column_default, 'NULL')
    ) AS observado,
    format(
      'esperado tipo=%s null=%s default~%s',
      e.data_type, e.is_nullable, coalesce(e.default_like, 'NULL')
    ) AS esperado
  FROM esperado_cols e
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public'
   AND c.table_name = e.tabla
   AND c.column_name = e.columna
),

-- ----- CHECKs clave (fragmentos canónicos de 0100) -----
esperado_checks(tabla, conname_like, def_like) AS (
  VALUES
    ('liga_notificaciones_preferencias', '%consentimiento%',
     '%sin_autorizacion%autorizado%revocado%'),
    ('liga_notificaciones_preferencias', '%consentimiento_evidencia%',
     '%consentimiento_estado%autorizado%'),
    ('liga_notificaciones_queue', '%tipo%', '%bienvenida%'),
    ('liga_notificaciones_queue', '%estado%', '%pendiente%procesando%enviado%error%omitido%pausado%'),
    ('liga_notificaciones_queue', '%attempts%', '%0%3%'),
    ('liga_notificaciones_log', '%tipo%', '%bienvenida%'),
    ('liga_notificaciones_log', '%proveedor_estado%', '%aceptado%entregado%')
),
check_checks AS (
  SELECT
    'check'::text,
    e.tabla || ' :: ' || e.conname_like,
    CASE
      WHEN NOT EXISTS (
        SELECT 1
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = e.tabla
          AND con.contype = 'c'
          AND con.conname ILIKE e.conname_like
          AND pg_get_constraintdef(con.oid) ILIKE e.def_like
      ) THEN
        CASE WHEN EXISTS (
          SELECT 1
          FROM pg_constraint con
          JOIN pg_class c ON c.oid = con.conrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relname = e.tabla
            AND con.contype = 'c'
            AND (
              con.conname ILIKE e.conname_like
              OR pg_get_constraintdef(con.oid) ILIKE e.def_like
            )
        ) THEN 'DIFF' ELSE 'FALTA' END
      ELSE 'OK'
    END,
    coalesce((
      SELECT string_agg(con.conname || '=' || pg_get_constraintdef(con.oid), ' | ')
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = e.tabla AND con.contype = 'c'
        AND (con.conname ILIKE e.conname_like OR pg_get_constraintdef(con.oid) ILIKE e.def_like)
    ), '∅'),
    e.def_like
  FROM esperado_checks e
),

-- ----- Índices nombrados -----
esperado_idx(nombre, def_like) AS (
  VALUES
    ('liga_notificaciones_queue_una_bienvenida',
     '%liga_notificaciones_queue%COALESCE%inscripcion_id%00000000-0000-0000-0000-000000000000%WHERE%pendiente%procesando%enviado%'),
    ('liga_notificaciones_queue_pendientes',
     '%liga_notificaciones_queue%liga_id%estado%'),
    ('liga_notificaciones_log_liga',
     '%liga_notificaciones_log%liga_id%created_at%')
),
idx_checks AS (
  SELECT
    'indice'::text,
    e.nombre,
    CASE
      WHEN i.oid IS NULL THEN 'FALTA'
      WHEN pg_get_indexdef(i.oid) ILIKE e.def_like THEN 'OK'
      ELSE 'DIFF'
    END,
    coalesce(CASE WHEN i.oid IS NULL THEN NULL ELSE pg_get_indexdef(i.oid) END, '∅'),
    e.def_like
  FROM esperado_idx e
  LEFT JOIN pg_class i
    ON i.relname = e.nombre
   AND i.relkind = 'i'
   AND i.relnamespace = 'public'::regnamespace
),

-- ----- UNIQUE / PK esperados -----
esperado_unique(tabla, def_like) AS (
  VALUES
    ('liga_notificaciones_preferencias', '%UNIQUE%liga_id%liga_jugador_id%'),
    ('liga_notificaciones_queue', '%UNIQUE%idempotency_key%'),
    ('liga_notificaciones_config', '%PRIMARY KEY%liga_id%')
),
unique_checks AS (
  SELECT
    'constraint'::text,
    e.tabla || ' :: ' || e.def_like,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = e.tabla
        AND con.contype IN ('p', 'u')
        AND pg_get_constraintdef(con.oid) ILIKE e.def_like
    ) THEN 'OK' ELSE 'FALTA' END,
    coalesce((
      SELECT string_agg(pg_get_constraintdef(con.oid), ' | ')
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = e.tabla AND con.contype IN ('p', 'u')
    ), '∅'),
    e.def_like
  FROM esperado_unique e
),

-- ----- Trigger -----
trigger_checks AS (
  SELECT
    'trigger'::text,
    'liga_notificaciones_preferencias_guardar',
    CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'liga_notificaciones_preferencias'
          AND t.tgname = 'liga_notificaciones_preferencias_guardar'
          AND NOT t.tgisinternal
      ) THEN 'FALTA'
      WHEN pg_get_triggerdef((
        SELECT t.oid FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'liga_notificaciones_preferencias'
          AND t.tgname = 'liga_notificaciones_preferencias_guardar'
          AND NOT t.tgisinternal
        LIMIT 1
      )) ILIKE '%BEFORE INSERT OR UPDATE%liga_notificaciones_preferencias_guardar%'
        THEN 'OK'
      ELSE 'DIFF'
    END,
    coalesce((
      SELECT pg_get_triggerdef(t.oid)
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'liga_notificaciones_preferencias'
        AND t.tgname = 'liga_notificaciones_preferencias_guardar'
        AND NOT t.tgisinternal
      LIMIT 1
    ), '∅'),
    'BEFORE INSERT OR UPDATE … EXECUTE FUNCTION preferencias_guardar'
),

-- ----- Funciones: security + search_path + huellas de cuerpo -----
-- Nota PG: la lista de columnas del CTE no admite tipos (p.ej. text[]);
-- tipar en las expresiones VALUES con ::boolean / ::text[].
esperado_fn(nombre, args, security_definer, body_likes) AS (
  VALUES
    (
      'liga_notificaciones_preferencias_guardar'::text,
      ''::text,
      false::boolean,
      ARRAY[
        'consentimiento_sin_evidencia',
        'correo_sin_verificacion',
        'correo_verificado_at'
      ]::text[]
    ),
    (
      'liga_notificacion_evaluar_correo'::text,
      'uuid'::text,
      true::boolean,
      ARRAY[
        'sin_correo',
        'correo_invalido',
        'correo_ambiguo',
        '@padel.local'
      ]::text[]
    ),
    (
      'encolar_bienvenida_liga'::text,
      'uuid, uuid'::text,
      true::boolean,
      ARRAY[
        'sin_permiso',
        'sin_autorizacion',
        'bienvenida_pausada',
        'idempotency_key'
      ]::text[]
    ),
    (
      'pausar_bienvenida_pendiente_liga'::text,
      'uuid, uuid'::text,
      true::boolean,
      ARRAY[
        'pausadas',
        'bienvenida',
        'pendiente'
      ]::text[]
    )
),
-- PG16: pg_get_function_identity_arguments incluye nombres
-- (`p_liga_id uuid, …`). Para comparar firmas usar oidvectortypes(proargtypes)
-- → `uuid, uuid` sin nombres (portable y sin falsos FALTA).
fn_checks AS (
  SELECT
    'funcion'::text,
    e.nombre || '(' || e.args || ')',
    CASE
      WHEN p.oid IS NULL AND NOT EXISTS (
        SELECT 1 FROM pg_proc p2
        WHERE p2.pronamespace = 'public'::regnamespace
          AND p2.proname = e.nombre
      ) THEN 'FALTA'
      WHEN p.oid IS NULL THEN 'DIFF'
      WHEN p.prosecdef IS DISTINCT FROM e.security_definer THEN 'DIFF'
      WHEN NOT (
        SELECT bool_and(p.prosrc ILIKE ('%' || marker || '%'))
        FROM unnest(e.body_likes) AS marker
      ) THEN 'DIFF'
      WHEN coalesce(array_to_string(p.proconfig, ','), '') NOT ILIKE '%search_path%'
        THEN 'DIFF'
      ELSE 'OK'
    END,
    CASE
      WHEN p.oid IS NULL THEN format(
        '∅ types-match; por_nombre=%s identity=[%s] oidvectortypes=[%s]',
        EXISTS (
          SELECT 1 FROM pg_proc p2
          WHERE p2.pronamespace = 'public'::regnamespace
            AND p2.proname = e.nombre
        ),
        coalesce((
          SELECT string_agg(pg_get_function_identity_arguments(p2.oid), ' | ')
          FROM pg_proc p2
          WHERE p2.pronamespace = 'public'::regnamespace
            AND p2.proname = e.nombre
        ), ''),
        coalesce((
          SELECT string_agg(oidvectortypes(p2.proargtypes), ' | ')
          FROM pg_proc p2
          WHERE p2.pronamespace = 'public'::regnamespace
            AND p2.proname = e.nombre
        ), '')
      )
      ELSE format(
        'identity=%s types=%s secdef=%s config=%s markers_ok=%s',
        pg_get_function_identity_arguments(p.oid),
        oidvectortypes(p.proargtypes),
        p.prosecdef,
        coalesce(array_to_string(p.proconfig, ','), 'NULL'),
        (
          SELECT bool_and(p.prosrc ILIKE ('%' || marker || '%'))
          FROM unnest(e.body_likes) AS marker
        )
      )
    END,
    format(
      'secdef=%s search_path=public,pg_temp markers=%s',
      e.security_definer,
      array_to_string(e.body_likes, ',')
    )
  FROM esperado_fn e
  LEFT JOIN pg_proc p
    ON p.pronamespace = 'public'::regnamespace
   AND p.proname = e.nombre
   AND replace(oidvectortypes(p.proargtypes), ' ', '')
       = replace(e.args, ' ', '')
),

-- ----- Grants de tablas (0100) -----
esperado_grant_table(tabla, grantee, priv) AS (
  VALUES
    ('liga_notificaciones_config', 'authenticated', 'SELECT'),
    ('liga_notificaciones_config', 'authenticated', 'INSERT'),
    ('liga_notificaciones_config', 'authenticated', 'UPDATE'),
    ('liga_notificaciones_preferencias', 'authenticated', 'SELECT'),
    ('liga_notificaciones_preferencias', 'authenticated', 'INSERT'),
    ('liga_notificaciones_preferencias', 'authenticated', 'UPDATE'),
    ('liga_notificaciones_queue', 'authenticated', 'SELECT'),
    ('liga_notificaciones_log', 'authenticated', 'SELECT')
),
grant_table_checks AS (
  SELECT
    'grant_tabla'::text,
    e.tabla || ' → ' || e.grantee || ':' || e.priv,
    CASE
      WHEN to_regclass('public.' || e.tabla) IS NULL THEN 'FALTA'
      WHEN has_table_privilege(e.grantee, 'public.' || e.tabla, e.priv) THEN 'OK'
      ELSE 'DIFF'
    END,
    CASE
      WHEN to_regclass('public.' || e.tabla) IS NULL THEN 'tabla ausente'
      ELSE format('has=%s', has_table_privilege(e.grantee, 'public.' || e.tabla, e.priv))
    END,
    'authenticated con privilegio según 0100; anon sin ALL (revocado)'
  FROM esperado_grant_table e
),
grant_anon_denied AS (
  SELECT
    'grant_tabla'::text,
    t.tabla || ' → anon:NO_SELECT',
    CASE
      WHEN to_regclass('public.' || t.tabla) IS NULL THEN 'FALTA'
      WHEN has_table_privilege('anon', 'public.' || t.tabla, 'SELECT') THEN 'DIFF'
      ELSE 'OK'
    END,
    CASE
      WHEN to_regclass('public.' || t.tabla) IS NULL THEN 'tabla ausente'
      ELSE format('anon_select=%s', has_table_privilege('anon', 'public.' || t.tabla, 'SELECT'))
    END,
    '0100 hace REVOKE ALL … FROM anon'
  FROM (VALUES
    ('liga_notificaciones_config'),
    ('liga_notificaciones_preferencias'),
    ('liga_notificaciones_queue'),
    ('liga_notificaciones_log')
  ) AS t(tabla)
),

-- ----- EXECUTE de funciones -----
grant_fn_checks AS (
  SELECT * FROM (
    VALUES
      ('grant_fn'::text,
       'encolar_bienvenida_liga → authenticated',
       CASE
         WHEN to_regprocedure('public.encolar_bienvenida_liga(uuid,uuid)') IS NULL THEN 'FALTA'
         WHEN has_function_privilege('authenticated', 'public.encolar_bienvenida_liga(uuid,uuid)', 'EXECUTE')
           THEN 'OK' ELSE 'DIFF'
       END,
       'EXECUTE authenticated requerido',
       'GRANT EXECUTE TO authenticated'),
      ('grant_fn',
       'encolar_bienvenida_liga → anon DENY',
       CASE
         WHEN to_regprocedure('public.encolar_bienvenida_liga(uuid,uuid)') IS NULL THEN 'FALTA'
         WHEN has_function_privilege('anon', 'public.encolar_bienvenida_liga(uuid,uuid)', 'EXECUTE')
           THEN 'DIFF' ELSE 'OK'
       END,
       'anon no debe ejecutar',
       'REVOKE FROM anon'),
      ('grant_fn',
       'liga_notificacion_evaluar_correo → authenticated DENY',
       CASE
         WHEN to_regprocedure('public.liga_notificacion_evaluar_correo(uuid)') IS NULL THEN 'FALTA'
         WHEN has_function_privilege('authenticated', 'public.liga_notificacion_evaluar_correo(uuid)', 'EXECUTE')
           THEN 'DIFF' ELSE 'OK'
       END,
       'helper interna sin EXECUTE a authenticated',
       'REVOKE FROM authenticated')
  ) AS v(familia, comprobacion, estado, observado, esperado)
),

-- ----- Policies -----
esperado_pol(tabla, policy, cmd, qual_like) AS (
  VALUES
    ('liga_notificaciones_config', 'liga_notificaciones_config_admin', 'ALL',
     '%is_master_admin%organizador_id%auth.uid%'),
    ('liga_notificaciones_preferencias', 'liga_notificaciones_preferencias_admin', 'ALL',
     '%is_master_admin%organizador_id%auth.uid%'),
    ('liga_notificaciones_queue', 'liga_notificaciones_queue_lectura', 'SELECT',
     '%is_master_admin%organizador_id%auth.uid%'),
    ('liga_notificaciones_log', 'liga_notificaciones_log_lectura', 'SELECT',
     '%is_master_admin%organizador_id%auth.uid%')
),
pol_checks AS (
  SELECT
    'policy'::text,
    e.tabla || ':' || e.policy,
    CASE
      WHEN p.policyname IS NULL THEN 'FALTA'
      WHEN upper(p.cmd) IS DISTINCT FROM e.cmd THEN 'DIFF'
      WHEN coalesce(p.qual, '') NOT ILIKE e.qual_like THEN 'DIFF'
      ELSE 'OK'
    END,
    format('cmd=%s roles=%s qual=%s', p.cmd, p.roles::text, left(coalesce(p.qual, '∅'), 180)),
    format('cmd=%s qual~%s', e.cmd, e.qual_like)
  FROM esperado_pol e
  LEFT JOIN pg_policies p
    ON p.schemaname = 'public'
   AND p.tablename = e.tabla
   AND p.policyname = e.policy
),

-- ----- RLS enabled -----
rls_checks AS (
  SELECT
    'rls'::text,
    c.relname,
    CASE WHEN c.relrowsecurity THEN 'OK' ELSE 'DIFF' END,
    format('rls=%s forced=%s', c.relrowsecurity, c.relforcerowsecurity),
    'ENABLE ROW LEVEL SECURITY'
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname IN (
      'liga_notificaciones_config',
      'liga_notificaciones_preferencias',
      'liga_notificaciones_queue',
      'liga_notificaciones_log'
    )
),

-- ----- Ausencia 0101 + defaults seguros -----
senales AS (
  SELECT * FROM (
    VALUES
      ('senal'::text, 'sin_tabla_verificaciones',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname='public' AND c.relkind='r'
           AND c.relname='liga_notificaciones_verificaciones'
       ) THEN 'DIFF' ELSE 'OK' END,
       '0101 ausente (esperado pre-apply)', 'no debe existir aún'),
      ('senal', 'sin_cols_0101_en_preferencias',
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='liga_notificaciones_preferencias'
           AND column_name IN ('correo_verificacion_origen','correo_verificado_email')
       ) THEN 'DIFF' ELSE 'OK' END,
       'columnas 0101 ausentes', 'solo tras 0101'),
      ('senal', 'default_bienvenida_pausada_true',
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='liga_notificaciones_config'
           AND column_name='bienvenida_pausada'
           AND column_default ILIKE '%true%'
       ) THEN 'OK' ELSE 'DIFF' END,
       'nuevas ligas nacen pausadas', 'DEFAULT true'),
      ('senal', 'default_admin_habilitado_false',
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='liga_notificaciones_preferencias'
           AND column_name='admin_habilitado'
           AND column_default ILIKE '%false%'
       ) THEN 'OK' ELSE 'DIFF' END,
       'destinatarios deshabilitados por defecto', 'DEFAULT false'),
      ('senal', 'migracion_0100_no_registrada',
       CASE WHEN EXISTS (
         SELECT 1 FROM supabase_migrations.schema_migrations
         WHERE version = '0100' OR version LIKE '0100%'
       ) THEN 'DIFF' ELSE 'OK' END,
       'historial sin 0100 (candidato baseline)', 'version exacta a registrar: 0100')
  ) AS v(familia, comprobacion, estado, observado, esperado)
),

-- ----- Formato real de versions (INFO) -----
version_info AS (
  SELECT
    'info'::text,
    'muestra_versions_recientes',
    'INFO'::text,
    coalesce((
      SELECT string_agg(version, ', ' ORDER BY version DESC)
      FROM (
        SELECT version
        FROM supabase_migrations.schema_migrations
        ORDER BY version DESC
        LIMIT 8
      ) s
    ), '∅'),
    'Confirmar que el proyecto usa prefijos tipo 0099/0100 (no timestamps). Identificador a baseline: 0100'
),

-- ----- Columnas de schema_migrations (INFO) -----
mig_cols_info AS (
  SELECT
    'info'::text,
    'schema_migrations_columnas',
    'INFO'::text,
    coalesce((
      SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
      FROM information_schema.columns
      WHERE table_schema = 'supabase_migrations'
        AND table_name = 'schema_migrations'
    ), '∅'),
    'Baseline insertará solo columnas existentes (version[, name])'
),

all_rows AS (
  SELECT * FROM col_checks
  UNION ALL SELECT * FROM check_checks
  UNION ALL SELECT * FROM idx_checks
  UNION ALL SELECT * FROM unique_checks
  UNION ALL SELECT * FROM trigger_checks
  UNION ALL SELECT * FROM fn_checks
  UNION ALL SELECT * FROM grant_table_checks
  UNION ALL SELECT * FROM grant_anon_denied
  UNION ALL SELECT * FROM grant_fn_checks
  UNION ALL SELECT * FROM pol_checks
  UNION ALL SELECT * FROM rls_checks
  UNION ALL SELECT * FROM senales
  UNION ALL SELECT * FROM version_info
  UNION ALL SELECT * FROM mig_cols_info
),
summary AS (
  SELECT
    count(*) FILTER (WHERE estado = 'FALTA') AS n_falta,
    count(*) FILTER (WHERE estado = 'DIFF') AS n_diff,
    count(*) FILTER (WHERE estado = 'OK') AS n_ok,
    count(*) FILTER (WHERE estado = 'INFO') AS n_info,
    to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS tiene_historial,
    (
      SELECT count(*)::int
      FROM all_rows
      WHERE familia IN ('columna', 'check', 'indice', 'constraint', 'trigger', 'funcion', 'policy', 'rls')
    ) AS n_estructurales,
    (
      SELECT count(*)::int
      FROM all_rows
      WHERE familia IN ('columna', 'check', 'indice', 'constraint', 'trigger', 'funcion', 'policy', 'rls')
        AND estado = 'OK'
    ) AS n_estructurales_ok
  FROM all_rows
)
SELECT
  0 AS ord,
  'VEREDICTO'::text AS familia,
  'fingerprint_0100'::text AS comprobacion,
  CASE
    WHEN NOT s.tiene_historial THEN 'REVISAR_EVIDENCIA'
    WHEN s.n_estructurales = 0 THEN 'REVISAR_EVIDENCIA'
    WHEN s.n_falta > 0 OR s.n_diff > 0 THEN 'NO_IDENTICA'
    WHEN s.n_estructurales_ok < s.n_estructurales THEN 'REVISAR_EVIDENCIA'
    ELSE 'IDENTICA_PARA_BASELINE'
  END AS estado,
  format(
    'ok=%s diff=%s falta=%s info=%s historial=%s estructurales_ok=%s/%s',
    s.n_ok, s.n_diff, s.n_falta, s.n_info, s.tiene_historial,
    s.n_estructurales_ok, s.n_estructurales
  ) AS observado,
  CASE
    WHEN NOT s.tiene_historial
      THEN 'Sin supabase_migrations.schema_migrations: no se puede cerrar baseline.'
    WHEN s.n_falta > 0 OR s.n_diff > 0
      THEN 'No registrar 0100 aún. Pegar filas DIFF/FALTA para conciliación mínima.'
    WHEN s.n_estructurales_ok < s.n_estructurales
      THEN 'Evidencia incompleta: re-ejecutar y revisar filas no OK.'
    ELSE 'Segura reconciliación de historial con version=0100 sin recrear objetos. Luego 0101→0102.'
  END AS esperado
FROM summary s
UNION ALL
SELECT
  CASE a.estado
    WHEN 'FALTA' THEN 1
    WHEN 'DIFF' THEN 2
    WHEN 'OK' THEN 3
    ELSE 4
  END,
  a.familia,
  a.comprobacion,
  a.estado,
  a.observado,
  a.esperado
FROM all_rows a
ORDER BY 1, 2, 3;
