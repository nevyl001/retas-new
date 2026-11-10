-- SOLO LECTURA. No inserta en schema_migrations. No modifica objetos.
--
-- Production, medido el 2026-11-10:
--   * schema_migrations >= 0100 solo tiene 0106.
--   * 0111, 0112 y la verificación de 0114 están materializadas y sin registrar.
--     sync ya es el cuerpo de 0113: rechaza 00:00, exige un horario y escribe Horario.
--   * confirmar, emitir, inspeccionar y reservar existen. El token dura 30 minutos
--     al emitirse, se borra al confirmarse y la reserva exige service_role y menos de 3.
--   * La cola de la jornada 2 no fue reescrita. No hay cron.
--   * 0115 ya está aplicada por SQL directo: existe el trigger
--     liga_notificaciones_proteger_supervision. Su cuerpo vivo todavía
--     asigna supervision_activa = false si el correo no está verificado.
--     El archivo del repositorio ya no hace eso. Reemplazarlo requiere autorización.
--
-- No marcar 0111 como aplicada: su cuerpo ya no es el que está vivo.
-- No volver a ejecutar 0111 ni 0114: reemplazarían funciones modernas.
-- No ejecutar db push.
-- Registrar versiones en schema_migrations queda fuera de este archivo.

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
