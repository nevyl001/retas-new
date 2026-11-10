-- SOLO LECTURA. No inserta en schema_migrations. No modifica objetos.
--
-- Production, medido el 2026-11-10:
--   * schema_migrations >= 0100 solo tiene 0106.
--   * 0111 está parcial: existen sync, programar_resultados,
--     programar_bienvenida y elegible_manual. No existen las funciones
--     de verificación ni las columnas del token.
--   * La función viva de sync ya rechaza 00:00 y escribe Horario.
--     No está registrada. La cola de la jornada 2 no fue reescrita.
--   * 0112 está completa en columnas y en el check de alcance,
--     y tampoco está registrada.
--
-- No marcar 0111 como aplicada: ocultaría la parte que falta.
-- No volver a ejecutar 0111: reemplazaría sync por la versión con 00:00.
-- No ejecutar db push.
--
-- Cuando se autorice el historial, el registro fiel es:
--   1. Dejar 0111 sin marcar.
--   2. Aplicar solo 0114_liga_supervision_verificacion.sql.
--   3. Después de comprobar que sync sigue sin 00:00, registrar 0113 y 0114
--      con supabase migration repair. 0112 puede registrarse porque sus
--      objetos ya coinciden. Eso queda fuera de este archivo.

SELECT version
FROM supabase_migrations.schema_migrations
WHERE version >= '0100'
ORDER BY version;

SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname LIKE 'liga_notificacion%'
ORDER BY 1;

SELECT
  position('00:00' in pg_get_functiondef(p.oid)) > 0 AS sync_usa_00,
  position('Horario:' in pg_get_functiondef(p.oid)) > 0 AS sync_escribe_horario,
  position('v_distintas IS DISTINCT FROM 1' in pg_get_functiondef(p.oid)) > 0 AS sync_rechaza_horas_distintas
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'liga_notificaciones_sync_recordatorio';
