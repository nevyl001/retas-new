-- =============================================================================
-- PRODUCCIÓN — Instalar Centro de Comunicaciones manual (0106)
-- =============================================================================
-- NO EJECUTAR sin autorización explícita + backup.
-- NO activa Resend. NO envía correos. NO instala 0101–0104.
--
-- El assert falló con:
--   FAIL 0106: falta liga_notificacion_elegible_manual
-- porque 0106 aún NO está aplicada. Eso es el estado esperado previo.
--
-- Compatibilidad confirmada en repo:
--   * Requiere 0100: preferencias, config, queue, log, encolar_bienvenida_liga,
--     liga_notificacion_evaluar_correo, is_master_admin, ligas/inscripciones.
--   * Requiere 0105: evaluador de correo con identidad global (ya en Production).
--   * NO requiere 0101–0104 (verificación por enlace / worker staging).
--   * CREATE OR REPLACE de encolar_bienvenida_liga: actualiza firma; no DROP
--     de datos. No toca tablas deportivas (sets, rankings, partidos).
--   * Solo ALTER de liga_notificaciones_queue/log (columnas + CHECK tipo).
--
-- =============================================================================
-- A) LECTURA PREVIA (pegar en SQL Editor — solo SELECT)
-- =============================================================================

SELECT
  to_regclass('public.liga_notificaciones_preferencias') AS preferencias,
  to_regclass('public.liga_notificaciones_config') AS config,
  to_regclass('public.liga_notificaciones_queue') AS cola,
  to_regclass('public.liga_notificaciones_log') AS log,
  to_regprocedure('public.liga_notificacion_evaluar_correo(uuid)') AS eval_correo,
  to_regprocedure('public.liga_inscritos_contacto_autorizado(uuid)') AS contacto_0105,
  to_regprocedure('public.liga_notificacion_elegible_manual(uuid,uuid)') AS elegible_0106,
  to_regprocedure(
    'public.encolar_comunicacion_manual_liga(uuid,uuid,text,text,text,uuid)'
  ) AS encolar_manual_0106;

-- Esperado ANTES de instalar:
--   preferencias/config/cola/log/eval_correo/contacto_0105 → no null
--   elegible_0106 / encolar_manual_0106 → null

-- Historial (evitar reaplicar a ciegas):
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version LIKE '010%'
   OR name ILIKE '%0106%'
   OR name ILIKE '%comunicacion_manual%'
ORDER BY version;

-- =============================================================================
-- B) BACKUP LÓGICO MÍNIMO (recomendado antes del apply)
-- =============================================================================
-- En dashboard: Database → Backups, o pg_dump de:
--   liga_notificaciones_preferencias
--   liga_notificaciones_config
--   liga_notificaciones_queue
--   liga_notificaciones_log
-- No es necesario dump de tablas deportivas para este cambio.

-- =============================================================================
-- C) INSTALACIÓN (autorizar explícitamente)
-- =============================================================================
-- 1. Abrir SQL Editor en el proyecto de Production.
-- 2. Pegar ÍNTEGRO el contenido de:
--      supabase/migrations/0106_liga_comunicacion_manual_sin_verificacion_enlace.sql
-- 3. Run (una sola ejecución). Es idempotente en lo esencial:
--      ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION.
-- 4. Registrar baseline para que el CLI no intente reaplicar:
--
-- INSERT INTO supabase_migrations.schema_migrations (version, name)
-- VALUES (
--   '0106',
--   'liga_comunicacion_manual_sin_verificacion_enlace'
-- )
-- ON CONFLICT DO NOTHING;
--
-- Si tu tabla usa otra forma (p. ej. version con timestamp), adaptar al
-- formato ya usado por 0105 en ese mismo historial. No inventar un segundo 0106.

-- =============================================================================
-- D) ASSERT (después del apply)
-- =============================================================================
-- Pegar supabase/tests/0106_assert.sql
--
-- Esperado:
--   NOTICE: OK 0106: funciones, columnas, elegibilidad manual y grants correctos
--   Filas: elegible_manual=true, encolar_manual=true, encolar_bienvenida=true,
--          cola_cuerpo=true
--   Sin FAIL / sin EXCEPTION

-- =============================================================================
-- E) FRONTEND
-- =============================================================================
-- Commit local: cec067cc (y cualquier harden posterior en main).
-- Publicar SOLO cuando 0106 assert esté OK:
--   git push origin main
--   Confirmar Vercel Production Ready en el SHA publicado.
-- Sin 0106 el compositor no puede encolar plantillas nuevas (esquema_pendiente).

-- =============================================================================
-- F) CERO CORREOS
-- =============================================================================
-- 0106 solo crea RPC/columnas y encola filas pendientes.
-- LIGA_NOTIFICACIONES_ENVIOS_REALES debe permanecer unset / distinto de "true".
-- No desplegar/activar el worker Resend en este paso.
-- Encolar ≠ ENVIAR en UI ≠ fila en queue; NO entrega a jugadores.
-- Prueba real a tu correo = autorización independiente (paso Resend).
-- =============================================================================
