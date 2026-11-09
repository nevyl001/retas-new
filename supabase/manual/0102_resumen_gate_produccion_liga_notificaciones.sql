-- =============================================================================
-- RESUMEN GATE (SOLO LECTURA) — ¿Production listo para 0100/0101/0102?
-- =============================================================================
-- Proyecto: giswxhmjgjepoobdoljb
--
-- Una sola consulta. Devuelve filas:
--   comprobacion | observado | estado | explicacion
--
-- estados:
--   OK        → cumple la dependencia / precondición esperada
--   REVISAR   → ambigüedad o señal que requiere juicio humano
--   BLOQUEADO → no aplicar 0100–0102 hasta corregir
--
-- REGLAS: solo SELECT / catálogos. Sin INSERT/UPDATE/DELETE/DDL/set_config.
--         Sin llamar RPCs de escritura. Sin Resend. Sin migraciones. Sin deploy.
-- =============================================================================

WITH
-- ----- A) Extensiones / crypto -----
ext_pgcrypto AS (
  SELECT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'
  ) AS ok
),
crypto_procs AS (
  SELECT
    to_regprocedure('extensions.gen_random_bytes(integer)') IS NOT NULL AS gen_bytes_ext,
    to_regprocedure('extensions.digest(bytea, text)') IS NOT NULL AS digest_ext,
    to_regprocedure('public.gen_random_bytes(integer)') IS NOT NULL AS gen_bytes_public
),

-- ----- B) Tablas / columnas dependencia -----
dep_tables AS (
  SELECT
    COUNT(*) FILTER (WHERE existe) AS presentes,
    5 AS esperadas,
    string_agg(relname, ', ' ORDER BY relname) FILTER (WHERE NOT existe) AS faltantes
  FROM (
    SELECT t.relname,
           to_regclass(format('public.%I', t.relname)) IS NOT NULL AS existe
    FROM (VALUES
      ('ligas'),
      ('liga_jugadores'),
      ('liga_inscripciones'),
      ('liga_equipos'),
      ('riviera_jugadores')
    ) AS t(relname)
  ) s
),
dep_id_uuid AS (
  SELECT
    bool_and(c.data_type = 'uuid') AS todos_id_uuid,
    COUNT(*) AS ids_encontrados
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.column_name = 'id'
    AND c.table_name IN (
      'ligas', 'liga_jugadores', 'liga_inscripciones',
      'liga_equipos', 'riviera_jugadores'
    )
),

-- ----- C) Helpers auth -----
helpers AS (
  SELECT
    to_regprocedure('public.is_master_admin()') IS NOT NULL AS has_master_admin,
    to_regprocedure('auth.uid()') IS NOT NULL AS has_auth_uid
),

-- ----- D) Objetos liga_notificaciones ya presentes -----
objs_tablas AS (
  SELECT COUNT(*)::int AS n
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'v', 'i')
    AND c.relname LIKE 'liga_notificaciones%'
),
objs_funcs AS (
  SELECT COUNT(*)::int AS n
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
),
objs_pols AS (
  SELECT COUNT(*)::int AS n
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND (pol.polname LIKE 'liga_notificaciones%' OR c.relname LIKE 'liga_notificaciones%')
),

-- ----- E) Migraciones registradas (solo columna version) -----
mig_schema AS (
  SELECT
    to_regnamespace('supabase_migrations') IS NOT NULL AS schema_ok,
    to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS tabla_ok
),
mig_cols AS (
  SELECT string_agg(column_name, ', ' ORDER BY ordinal_position) AS columnas
  FROM information_schema.columns
  WHERE table_schema = 'supabase_migrations'
    AND table_name = 'schema_migrations'
),
mig_010x AS (
  SELECT COUNT(*)::int AS n,
         string_agg(version, ', ' ORDER BY version) AS versiones
  FROM supabase_migrations.schema_migrations
  WHERE version IN ('0100', '0101', '0102')
     OR version LIKE '0100%'
     OR version LIKE '0101%'
     OR version LIKE '0102%'
),

-- ----- F) Torneo Express intacto -----
te_surface AS (
  SELECT
    to_regclass('public.torneo_express') IS NOT NULL AS has_te,
    to_regclass('public.notificaciones_eventos_queue') IS NOT NULL AS has_te_queue,
    (
      SELECT COUNT(*)::int
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname ILIKE '%notificaciones_evento%'
    ) AS n_te_notif_funcs
),

-- ----- G) Simulación / GUC / privilegios (sin ejecutar RPCs) -----
sim_guc AS (
  SELECT nullif(current_setting('app.liga_notificaciones_simulacion', true), '') AS guc
),
sim_funcs AS (
  SELECT
    to_regprocedure('public.liga_notificaciones_simulacion_activa()') IS NOT NULL AS sim_existe,
    to_regprocedure('public.solicitar_verificacion_correo_liga(uuid, uuid)') IS NOT NULL AS sol_existe
),
sim_privs AS (
  SELECT
    CASE
      WHEN to_regprocedure('public.liga_notificaciones_simulacion_activa()') IS NULL
        THEN NULL
      ELSE has_function_privilege(
        'anon',
        'public.liga_notificaciones_simulacion_activa()',
        'EXECUTE'
      )
    END AS anon_sim,
    CASE
      WHEN to_regprocedure('public.liga_notificaciones_simulacion_activa()') IS NULL
        THEN NULL
      ELSE has_function_privilege(
        'authenticated',
        'public.liga_notificaciones_simulacion_activa()',
        'EXECUTE'
      )
    END AS auth_sim,
    CASE
      WHEN to_regprocedure('public.solicitar_verificacion_correo_liga(uuid, uuid)') IS NULL
        THEN NULL
      ELSE has_function_privilege(
        'anon',
        'public.solicitar_verificacion_correo_liga(uuid, uuid)',
        'EXECUTE'
      )
    END AS anon_sol,
    CASE
      WHEN to_regprocedure('public.solicitar_verificacion_correo_liga(uuid, uuid)') IS NULL
        THEN NULL
      ELSE has_function_privilege(
        'authenticated',
        'public.solicitar_verificacion_correo_liga(uuid, uuid)',
        'EXECUTE'
      )
    END AS auth_sol
),
sim_body AS (
  SELECT
    bool_or(p.prosrc ILIKE '%liga_notificaciones_simulacion_activa%') AS usa_guc_helper,
    bool_or(p.prosrc ~* 'IF[[:space:]]+v_modo_prueba[[:space:]]+THEN') AS abre_por_modo_prueba,
    bool_or(p.prosrc ILIKE '%enlace_simulado%') AS menciona_enlace
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'solicitar_verificacion_correo_liga'
    AND pg_get_function_identity_arguments(p.oid) = 'uuid, uuid'
),

-- Conteos de columnas dep: el VALUES tiene 19 filas (corrigiendo esperadas)
dep_cols_count AS (
  SELECT
    (
      SELECT COUNT(*) FROM (VALUES
        ('ligas', 'id'),
        ('ligas', 'organizador_id'),
        ('ligas', 'nombre'),
        ('liga_jugadores', 'id'),
        ('liga_jugadores', 'organizador_id'),
        ('liga_jugadores', 'nombre'),
        ('liga_jugadores', 'email'),
        ('liga_inscripciones', 'id'),
        ('liga_inscripciones', 'liga_id'),
        ('liga_inscripciones', 'jugador_id'),
        ('liga_equipos', 'id'),
        ('liga_equipos', 'liga_id'),
        ('liga_equipos', 'jugador1_id'),
        ('liga_equipos', 'jugador2_id'),
        ('riviera_jugadores', 'id'),
        ('riviera_jugadores', 'legacy_liga_jugador_id'),
        ('riviera_jugadores', 'email'),
        ('riviera_jugadores', 'estado'),
        ('riviera_jugadores', 'created_at')
      ) v(t, c)
    ) AS esperadas,
    (
      SELECT COUNT(*)
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND (
          (c.table_name = 'ligas' AND c.column_name IN ('id', 'organizador_id', 'nombre'))
          OR (c.table_name = 'liga_jugadores' AND c.column_name IN ('id', 'organizador_id', 'nombre', 'email'))
          OR (c.table_name = 'liga_inscripciones' AND c.column_name IN ('id', 'liga_id', 'jugador_id'))
          OR (c.table_name = 'liga_equipos' AND c.column_name IN ('id', 'liga_id', 'jugador1_id', 'jugador2_id'))
          OR (c.table_name = 'riviera_jugadores' AND c.column_name IN (
            'id', 'legacy_liga_jugador_id', 'email', 'estado', 'created_at'
          ))
        )
    ) AS encontradas
)

SELECT * FROM (
  -- ===================== A =====================
  SELECT
    10 AS ord,
    'A1. Extensión pgcrypto'::text AS comprobacion,
    CASE WHEN (SELECT ok FROM ext_pgcrypto) THEN 'instalada' ELSE 'ausente' END AS observado,
    CASE WHEN (SELECT ok FROM ext_pgcrypto) THEN 'OK' ELSE 'BLOQUEADO' END AS estado,
    '0101 necesita gen_random_bytes/digest vía pgcrypto.'::text AS explicacion

  UNION ALL
  SELECT
    20,
    'A2. extensions.gen_random_bytes(integer)',
    CASE WHEN gen_bytes_ext THEN 'existe' ELSE 'no existe' END,
    CASE
      WHEN gen_bytes_ext THEN 'OK'
      WHEN gen_bytes_public THEN 'REVISAR'
      ELSE 'BLOQUEADO'
    END,
    CASE
      WHEN gen_bytes_ext THEN 'Ruta que usan 0101/0102.'
      WHEN gen_bytes_public THEN 'Solo en public; 0101 llama extensions.gen_random_bytes — ajustar o confirmar search_path.'
      ELSE 'Sin gen_random_bytes no se pueden emitir tokens.'
    END
  FROM crypto_procs

  UNION ALL
  SELECT
    30,
    'A3. extensions.digest(bytea, text)',
    CASE WHEN digest_ext THEN 'existe' ELSE 'no existe' END,
    CASE WHEN digest_ext THEN 'OK' ELSE 'BLOQUEADO' END,
    'Hash de token (liga_notificacion_hash_token) depende de digest.'
  FROM crypto_procs

  -- ===================== B =====================
  UNION ALL
  SELECT
    40,
    'B1. Tablas base de liga',
    format('%s/%s presentes%s',
      presentes, esperadas,
      CASE WHEN faltantes IS NULL THEN '' ELSE ' · faltan: ' || faltantes END),
    CASE WHEN presentes = esperadas THEN 'OK' ELSE 'BLOQUEADO' END,
    '0100/0101 referencian ligas, jugadores, inscripciones, equipos y riviera_jugadores.'
  FROM dep_tables

  UNION ALL
  SELECT
    50,
    'B2. Columnas críticas',
    format('%s/%s encontradas', encontradas, esperadas),
    CASE WHEN encontradas = esperadas THEN 'OK' ELSE 'BLOQUEADO' END,
    CASE
      WHEN encontradas = esperadas THEN 'Esquema compatible con FKs y email de las migraciones.'
      ELSE 'Faltan columnas que 0100/0101 asumen; no aplicar hasta alinear esquema.'
    END
  FROM dep_cols_count

  UNION ALL
  SELECT
    60,
    'B3. id uuid en tablas base',
    CASE
      WHEN ids_encontrados < 5 THEN format('solo %s ids localizados', ids_encontrados)
      WHEN todos_id_uuid THEN '5/5 uuid'
      ELSE 'algún id no es uuid'
    END,
    CASE
      WHEN ids_encontrados = 5 AND todos_id_uuid THEN 'OK'
      ELSE 'BLOQUEADO'
    END,
    'Las migraciones tipan FKs como uuid.'
  FROM dep_id_uuid

  -- ===================== C =====================
  UNION ALL
  SELECT
    70,
    'C1. public.is_master_admin()',
    CASE WHEN has_master_admin THEN 'existe' ELSE 'ausente' END,
    CASE WHEN has_master_admin THEN 'OK' ELSE 'BLOQUEADO' END,
    'RPCs de organizador/master la usan para autorización.'
  FROM helpers

  UNION ALL
  SELECT
    80,
    'C2. auth.uid()',
    CASE WHEN has_auth_uid THEN 'existe' ELSE 'ausente' END,
    CASE WHEN has_auth_uid THEN 'OK' ELSE 'BLOQUEADO' END,
    'SECURITY DEFINER de 0100–0102 identifican al caller con auth.uid().'
  FROM helpers

  -- ===================== D =====================
  UNION ALL
  SELECT
    90,
    'D1. Tablas/índices liga_notificaciones*',
    format('%s objetos', n),
    CASE WHEN n = 0 THEN 'OK' ELSE 'REVISAR' END,
    CASE
      WHEN n = 0 THEN 'Limpio: se pueden crear objetos de 0100/0101 sin colisión.'
      ELSE 'Ya hay objetos; no reaplicar a ciegas — contrastar con migraciones.'
    END
  FROM objs_tablas

  UNION ALL
  SELECT
    100,
    'D2. Funciones de notificaciones de liga',
    format('%s funciones', n),
    CASE WHEN n = 0 THEN 'OK' ELSE 'REVISAR' END,
    CASE
      WHEN n = 0 THEN 'Sin RPCs previas de bienvenida/verificación.'
      ELSE 'Funciones ya presentes; verificar si es apply parcial o entorno ya migrado.'
    END
  FROM objs_funcs

  UNION ALL
  SELECT
    110,
    'D3. Políticas liga_notificaciones*',
    format('%s políticas', n),
    CASE WHEN n = 0 THEN 'OK' ELSE 'REVISAR' END,
    CASE
      WHEN n = 0 THEN 'Sin RLS policies previas del feature.'
      ELSE 'Policies existentes: revisar antes de CREATE POLICY de 0100/0101.'
    END
  FROM objs_pols

  -- ===================== E =====================
  UNION ALL
  SELECT
    120,
    'E1. Catálogo supabase_migrations',
    CASE
      WHEN NOT schema_ok THEN 'schema ausente'
      WHEN NOT tabla_ok THEN 'tabla ausente'
      ELSE 'schema_migrations disponible'
    END,
    CASE WHEN schema_ok AND tabla_ok THEN 'OK' ELSE 'REVISAR' END,
    'Necesario para saber si 0100–0102 ya están registradas.'
  FROM mig_schema

  UNION ALL
  SELECT
    130,
    'E2. Columnas de schema_migrations',
    coalesce(columnas, '(sin acceso / vacías)'),
    CASE
      WHEN columnas IS NULL THEN 'REVISAR'
      WHEN columnas ~ '(^|.*, )version(,|$)' THEN 'OK'
      ELSE 'BLOQUEADO'
    END,
    'Solo se usa `version` en este gate (no asumir inserted_at).'
  FROM mig_cols

  UNION ALL
  SELECT
    140,
    'E3. Versiones 0100/0101/0102 registradas',
    CASE
      WHEN n = 0 THEN 'ninguna'
      ELSE format('%s · %s', n, versiones)
    END,
    CASE
      WHEN n = 0 THEN 'OK'
      WHEN n >= 3 THEN 'REVISAR'
      ELSE 'REVISAR'
    END,
    CASE
      WHEN n = 0 THEN 'Aún no aplicadas: apto para apply futuro autorizado.'
      WHEN n >= 3 THEN 'Parecen ya aplicadas; no reaplicar.'
      ELSE 'Apply parcial detectado; no completar a ciegas.'
    END
  FROM mig_010x

  -- ===================== F =====================
  UNION ALL
  SELECT
    150,
    'F1. public.torneo_express',
    CASE WHEN has_te THEN 'existe' ELSE 'ausente' END,
    CASE WHEN has_te THEN 'OK' ELSE 'REVISAR' END,
    '0100–0102 no deben tocarla; ausencia sería anomalía de Production.'
  FROM te_surface

  UNION ALL
  SELECT
    160,
    'F2. public.notificaciones_eventos_queue',
    CASE WHEN has_te_queue THEN 'existe' ELSE 'ausente' END,
    CASE WHEN has_te_queue THEN 'OK' ELSE 'REVISAR' END,
    'Cola de Torneo Express: las migraciones de liga no deben alterarla.'
  FROM te_surface

  UNION ALL
  SELECT
    170,
    'F3. Funciones %notificaciones_evento%',
    format('%s funciones', n_te_notif_funcs),
    CASE WHEN n_te_notif_funcs > 0 THEN 'OK' ELSE 'REVISAR' END,
    'Superficie TE de notificaciones sigue visible (sanity check).'
  FROM te_surface

  -- ===================== G =====================
  UNION ALL
  SELECT
    180,
    'G1. GUC app.liga_notificaciones_simulacion',
    coalesce(guc, 'NULL/vacío'),
    CASE
      WHEN guc IS NULL THEN 'OK'
      WHEN guc = 'true' THEN 'BLOQUEADO'
      ELSE 'OK'
    END,
    CASE
      WHEN guc = 'true' THEN 'Simulación activa en esta sesión/servidor: apagar antes de operar Production.'
      ELSE 'Clientes no deben poder fijar este GUC; valor seguro para Production.'
    END
  FROM sim_guc

  UNION ALL
  SELECT
    190,
    'G2. liga_notificaciones_simulacion_activa()',
    CASE WHEN sim_existe THEN 'existe' ELSE 'no existe' END,
    CASE WHEN sim_existe THEN 'REVISAR' ELSE 'OK' END,
    CASE
      WHEN sim_existe THEN 'Ya hay helper de simulación; contrastar privilegios y cuerpo.'
      ELSE 'Esperado pre-migración (tu resultado: false).'
    END
  FROM sim_funcs

  UNION ALL
  SELECT
    200,
    'G3. solicitar_verificacion_correo_liga(uuid,uuid)',
    CASE WHEN sol_existe THEN 'existe' ELSE 'no existe' END,
    CASE WHEN sol_existe THEN 'REVISAR' ELSE 'OK' END,
    CASE
      WHEN sol_existe THEN 'RPC ya presente: verificar que no sea solo-0101 (modo_prueba → enlace).'
      ELSE 'Esperado pre-migración (tu resultado: false).'
    END
  FROM sim_funcs

  UNION ALL
  SELECT
    210,
    'G4. EXECUTE de simulación (anon/authenticated)',
    CASE
      WHEN anon_sim IS NULL AND auth_sim IS NULL THEN 'N/A (función ausente)'
      ELSE format('anon=%s authenticated=%s', anon_sim, auth_sim)
    END,
    CASE
      WHEN anon_sim IS NULL THEN 'OK'
      WHEN coalesce(anon_sim, false) OR coalesce(auth_sim, false) THEN 'BLOQUEADO'
      ELSE 'OK'
    END,
    'Tras 0102 nadie de anon/authenticated debe ejecutar la helper de simulación.'
  FROM sim_privs

  UNION ALL
  SELECT
    220,
    'G5. EXECUTE de solicitar_verificacion (anon)',
    CASE
      WHEN anon_sol IS NULL THEN 'N/A (función ausente)'
      ELSE format('anon=%s authenticated=%s', anon_sol, auth_sol)
    END,
    CASE
      WHEN anon_sol IS NULL THEN 'OK'
      WHEN anon_sol THEN 'BLOQUEADO'
      WHEN auth_sol THEN 'OK'
      ELSE 'REVISAR'
    END,
    'Esperado post-0102: anon sin EXECUTE; authenticated con EXECUTE.'
  FROM sim_privs

  UNION ALL
  SELECT
    230,
    'G6. Cuerpo solicitar_verificacion (si existe)',
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM sim_funcs WHERE sol_existe) THEN 'N/A'
      ELSE format(
        'usa_guc=%s abre_modo_prueba=%s menciona_enlace=%s',
        coalesce((SELECT usa_guc_helper FROM sim_body), false),
        coalesce((SELECT abre_por_modo_prueba FROM sim_body), false),
        coalesce((SELECT menciona_enlace FROM sim_body), false)
      )
    END,
    CASE
      WHEN NOT (SELECT sol_existe FROM sim_funcs) THEN 'OK'
      WHEN coalesce((SELECT abre_por_modo_prueba FROM sim_body), false)
           AND NOT coalesce((SELECT usa_guc_helper FROM sim_body), false)
        THEN 'BLOQUEADO'
      WHEN coalesce((SELECT usa_guc_helper FROM sim_body), false)
        THEN 'OK'
      ELSE 'REVISAR'
    END,
    CASE
      WHEN NOT (SELECT sol_existe FROM sim_funcs)
        THEN 'Sin RPC aún: al aplicar, hacerlo 0100+0101+0102 juntas (nunca 0101 sola).'
      WHEN coalesce((SELECT abre_por_modo_prueba FROM sim_body), false)
           AND NOT coalesce((SELECT usa_guc_helper FROM sim_body), false)
        THEN 'Patrón solo-0101 inseguro: token simulado por modo_prueba.'
      WHEN coalesce((SELECT usa_guc_helper FROM sim_body), false)
        THEN 'Endurecido con GUC de servidor (patrón 0102).'
      ELSE 'Cuerpo ambiguo: revisar definición manualmente.'
    END

  -- ===================== Veredicto =====================
  UNION ALL
  SELECT
    900,
    'Z. Veredicto gate Production',
    CASE
      WHEN EXISTS (
        SELECT 1 FROM (
          -- recalcula bloqueos clave inline
          SELECT 1
          WHERE NOT (SELECT ok FROM ext_pgcrypto)
             OR NOT (SELECT gen_bytes_ext FROM crypto_procs)
             OR NOT (SELECT digest_ext FROM crypto_procs)
             OR (SELECT presentes FROM dep_tables) < 5
             OR (SELECT encontradas FROM dep_cols_count)
                < (SELECT esperadas FROM dep_cols_count)
             OR NOT (SELECT has_master_admin FROM helpers)
             OR NOT (SELECT has_auth_uid FROM helpers)
             OR coalesce((SELECT guc FROM sim_guc), '') = 'true'
             OR coalesce((SELECT anon_sim FROM sim_privs), false)
             OR coalesce((SELECT auth_sim FROM sim_privs), false)
             OR coalesce((SELECT anon_sol FROM sim_privs), false)
             OR (
               (SELECT sol_existe FROM sim_funcs)
               AND coalesce((SELECT abre_por_modo_prueba FROM sim_body), false)
               AND NOT coalesce((SELECT usa_guc_helper FROM sim_body), false)
             )
        ) b
      ) THEN 'NO LISTO'
      WHEN (SELECT n FROM mig_010x) > 0
        OR (SELECT n FROM objs_tablas) > 0
        OR (SELECT n FROM objs_funcs) > 0
        THEN 'REVISAR ANTES DE APPLY'
      ELSE 'DEPENDENCIAS OK — falta autorización humana para apply'
    END,
    CASE
      WHEN EXISTS (
        SELECT 1
        WHERE NOT (SELECT ok FROM ext_pgcrypto)
           OR NOT (SELECT gen_bytes_ext FROM crypto_procs)
           OR NOT (SELECT digest_ext FROM crypto_procs)
           OR (SELECT presentes FROM dep_tables) < 5
           OR (SELECT encontradas FROM dep_cols_count)
              < (SELECT esperadas FROM dep_cols_count)
           OR NOT (SELECT has_master_admin FROM helpers)
           OR NOT (SELECT has_auth_uid FROM helpers)
           OR coalesce((SELECT guc FROM sim_guc), '') = 'true'
           OR coalesce((SELECT anon_sim FROM sim_privs), false)
           OR coalesce((SELECT auth_sim FROM sim_privs), false)
           OR coalesce((SELECT anon_sol FROM sim_privs), false)
           OR (
             (SELECT sol_existe FROM sim_funcs)
             AND coalesce((SELECT abre_por_modo_prueba FROM sim_body), false)
             AND NOT coalesce((SELECT usa_guc_helper FROM sim_body), false)
           )
      ) THEN 'BLOQUEADO'
      WHEN (SELECT n FROM mig_010x) > 0
        OR (SELECT n FROM objs_tablas) > 0
        OR (SELECT n FROM objs_funcs) > 0
        THEN 'REVISAR'
      ELSE 'OK'
    END,
    'OK = dependencias satisfechas y superficie limpia. Aún NO autoriza apply: eso es decisión explícita aparte. Nunca activar Resend ni el GUC en Production.'
) gate
ORDER BY ord;
