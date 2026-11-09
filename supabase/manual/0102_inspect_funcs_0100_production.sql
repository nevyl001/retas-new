-- =============================================================================
-- INSPECCIÓN SOLO LECTURA — 4 funciones de 0100 en Production
-- =============================================================================
-- Objetivo: ver firmas REALES (pg_get_function_identity_arguments), security,
-- search_path, grants y cuerpos. Distinguir FALTA real vs falso positivo del
-- fingerprint por firma.
--
-- NO modifica datos. NO aplica migraciones. NO registra baseline.
-- =============================================================================

-- 1) Todas las sobrecargas públicas cuyo nombre coincide
SELECT
  n.nspname AS schema,
  p.proname AS funcion,
  pg_get_function_identity_arguments(p.oid) AS identity_args,
  oidvectortypes(p.proargtypes) AS type_args,
  length(pg_get_function_identity_arguments(p.oid)) AS args_len,
  encode(convert_to(pg_get_function_identity_arguments(p.oid), 'UTF8'), 'hex') AS args_hex,
  pg_get_function_result(p.oid) AS returns,
  p.prokind,
  p.prosecdef AS security_definer,
  p.provolatile,
  p.proconfig AS config_search_path,
  pg_get_userbyid(p.proowner) AS owner,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS exec_anon,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS exec_authenticated,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS exec_service_role
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'liga_notificaciones_preferencias_guardar',
    'liga_notificacion_evaluar_correo',
    'encolar_bienvenida_liga',
    'pausar_bienvenida_pendiente_liga'
  )
ORDER BY p.proname, identity_args;

-- 2) ¿El fingerprint buscaba la firma exacta?
WITH esperado(nombre, args) AS (
  VALUES
    ('liga_notificaciones_preferencias_guardar', ''),
    ('liga_notificacion_evaluar_correo', 'uuid'),
    ('encolar_bienvenida_liga', 'uuid, uuid'),
    ('pausar_bienvenida_pendiente_liga', 'uuid, uuid')
)
SELECT
  e.nombre,
  e.args AS args_fingerprint,
  coalesce(pg_get_function_identity_arguments(p.oid), '∅') AS args_reales,
  (p.oid IS NOT NULL) AS match_exacto,
  EXISTS (
    SELECT 1 FROM pg_proc p2
    JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
    WHERE n2.nspname = 'public' AND p2.proname = e.nombre
  ) AS existe_por_nombre,
  (
    SELECT string_agg(pg_get_function_identity_arguments(p2.oid), ' | ' ORDER BY 1)
    FROM pg_proc p2
    JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
    WHERE n2.nspname = 'public' AND p2.proname = e.nombre
  ) AS todas_las_firmas
FROM esperado e
LEFT JOIN pg_proc p
  ON p.pronamespace = 'public'::regnamespace
 AND p.proname = e.nombre
 AND pg_get_function_identity_arguments(p.oid) = e.args
ORDER BY e.nombre;

-- 3) Match correcto PG16: oidvectortypes (sin nombres de parámetro)
WITH esperado(nombre, args) AS (
  VALUES
    ('liga_notificaciones_preferencias_guardar', ''),
    ('liga_notificacion_evaluar_correo', 'uuid'),
    ('encolar_bienvenida_liga', 'uuid, uuid'),
    ('pausar_bienvenida_pendiente_liga', 'uuid, uuid')
)
SELECT
  e.nombre,
  e.args AS args_fingerprint,
  pg_get_function_identity_arguments(p.oid) AS identity_args,
  oidvectortypes(p.proargtypes) AS type_args,
  replace(oidvectortypes(p.proargtypes), ' ', '')
    = replace(e.args, ' ', '') AS match_por_tipos,
  p.prosecdef AS security_definer,
  p.proconfig,
  (
    SELECT bool_and(p.prosrc ILIKE ('%' || m || '%'))
    FROM unnest(
      CASE e.nombre
        WHEN 'liga_notificaciones_preferencias_guardar' THEN ARRAY[
          'consentimiento_sin_evidencia', 'correo_sin_verificacion', 'correo_verificado_at'
        ]::text[]
        WHEN 'liga_notificacion_evaluar_correo' THEN ARRAY[
          'sin_correo', 'correo_invalido', 'correo_ambiguo', '@padel.local'
        ]::text[]
        WHEN 'encolar_bienvenida_liga' THEN ARRAY[
          'sin_permiso', 'sin_autorizacion', 'bienvenida_pausada', 'idempotency_key'
        ]::text[]
        ELSE ARRAY['pausadas', 'bienvenida', 'pendiente']::text[]
      END
    ) AS m
  ) AS markers_ok
FROM esperado e
LEFT JOIN pg_proc p
  ON p.pronamespace = 'public'::regnamespace
 AND p.proname = e.nombre
 AND replace(oidvectortypes(p.proargtypes), ' ', '')
     = replace(e.args, ' ', '')
ORDER BY e.nombre;

-- 4) Definiciones completas (comparar con 0100 local)
SELECT
  p.proname AS funcion,
  pg_get_function_identity_arguments(p.oid) AS args,
  pg_get_functiondef(p.oid) AS definicion
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'liga_notificaciones_preferencias_guardar',
    'liga_notificacion_evaluar_correo',
    'encolar_bienvenida_liga',
    'pausar_bienvenida_pendiente_liga'
  )
ORDER BY p.proname, args;

-- 5) Huellas específicas de preferencias_guardar (la DIFF del fingerprint)
SELECT
  p.proname,
  p.prosecdef AS es_security_definer,
  -- 0100 local: SECURITY INVOKER ⇒ prosecdef=false
  (NOT p.prosecdef) AS coincide_invoker_0100,
  coalesce(array_to_string(p.proconfig, ','), '') AS proconfig,
  (coalesce(array_to_string(p.proconfig, ','), '') ILIKE '%search_path%') AS tiene_search_path,
  (p.prosrc ILIKE '%consentimiento_sin_evidencia%') AS has_consentimiento_sin_evidencia,
  (p.prosrc ILIKE '%correo_sin_verificacion%') AS has_correo_sin_verificacion,
  (p.prosrc ILIKE '%correo_verificado_at%') AS has_correo_verificado_at,
  (p.prosrc ILIKE '%auth.uid%') AS has_auth_uid,
  length(p.prosrc) AS prosrc_len
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'liga_notificaciones_preferencias_guardar'
  AND pg_get_function_identity_arguments(p.oid) = '';
