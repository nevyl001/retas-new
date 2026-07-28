-- =============================================================================
-- BACKUP — bloque ajeno (app de gimnasio/box CrossFit) detectado en la BD
-- de Riviera Open. Solo lectura / definiciones. NO ejecutar sin autorización.
--
-- Contexto: este proyecto Supabase alojó anteriormente (o en paralelo) una
-- app de gestión de gimnasio/box "Parabellum Cross". Su esquema completo
-- sigue desplegado junto al de Riviera Open. Este script deja constancia
-- de definiciones y datos ANTES de cualquier limpieza, para poder revertir.
--
-- Generado: 2026-07-28, vía introspección de catálogo en producción
-- (pg_get_viewdef, pg_get_functiondef, pg_get_constraintdef, información
-- de esquema). Cero filas reales con datos sensibles más allá de lo ya
-- reportado en la auditoría (profiles: 2 filas, protegidas, NO se tocan).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1. CONTEO DE FILAS (verificado en vivo, 2026-07-28)
-- ─────────────────────────────────────────────────────────────────────────
-- boxes                    1 fila   (Parabellum Cross)
-- profiles                 2 filas  (PROTEGIDAS — no forman parte de este backup/cleanup)
-- membresias                0 filas
-- planes                    0 filas
-- clases                    0 filas
-- reservas                  0 filas
-- atleta_pr_marcas          0 filas
-- atleta_skills              0 filas
-- atleta_skill_historial     0 filas

-- Re-verificar en el momento de ejecutar (por si cambió algo):
SELECT 'boxes' t, count(*) n FROM boxes
UNION ALL SELECT 'membresias', count(*) FROM membresias
UNION ALL SELECT 'planes', count(*) FROM planes
UNION ALL SELECT 'clases', count(*) FROM clases
UNION ALL SELECT 'reservas', count(*) FROM reservas
UNION ALL SELECT 'atleta_pr_marcas', count(*) FROM atleta_pr_marcas
UNION ALL SELECT 'atleta_skills', count(*) FROM atleta_skills
UNION ALL SELECT 'atleta_skill_historial', count(*) FROM atleta_skill_historial;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. EXPORTACIÓN DE FILAS EXISTENTES
-- Todas las tablas del bloque ajeno están vacías EXCEPTO `boxes` (1 fila).
-- La fila real (Parabellum Cross) para restaurar si hace falta rollback:
-- ─────────────────────────────────────────────────────────────────────────
-- id:         ef073de3-2b88-4725-bb5f-bbbfa51fd851
-- name:       Parabellum Cross
-- slug:       parabellum-cross
-- status:     active
-- created_at: 2026-07-01 16:17:02.04018+00
-- (owner_user_id, address, phone, email, logo_url, plan, timezone, updated_at:
--  re-consultar antes de ejecutar el rollback si se necesita exactitud total —
--  este backup no los volcó para no exponer más de lo necesario en un archivo
--  de texto; el SQL de rollback trae un SELECT para recuperarlos en vivo.)

-- Ejecutar y guardar el resultado si se procede con la limpieza real:
SELECT * FROM boxes;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. DEFINICIONES — VISTAS (para poder recrearlas exactas)
-- ─────────────────────────────────────────────────────────────────────────
-- public.alertas_membresia
--   SELECT pr.id AS profile_id, pr.nombre_completo, pr.telefono, pr.user_id,
--          ma.plan_nombre, ma.fecha_fin,
--          CASE WHEN ma.fecha_fin < CURRENT_DATE THEN 'vencida'
--               WHEN ma.fecha_fin <= (CURRENT_DATE + '3 days'::interval) THEN 'por_vencer'
--               ELSE 'ok' END AS tipo_alerta
--   FROM profiles pr LEFT JOIN membresia_actual ma ON ma.usuario_id = pr.id
--   WHERE pr.rol = 'socio'::user_role
--     AND (ma.fecha_fin IS NULL OR ma.fecha_fin < CURRENT_DATE OR ma.fecha_fin <= (CURRENT_DATE + '3 days'::interval));
--
-- public.membresia_actual
--   SELECT DISTINCT ON (m.usuario_id) m.id, m.usuario_id, m.plan_id, m.fecha_inicio,
--          m.fecha_fin, m.estado, m.metodo_asignacion, m.notas,
--          p.nombre AS plan_nombre, p.tipo AS plan_tipo, p.precio AS plan_precio
--   FROM membresias m JOIN planes p ON p.id = m.plan_id
--   WHERE m.estado = ANY (ARRAY['vigente'::membresia_estado, 'vencida'::membresia_estado])
--   ORDER BY m.usuario_id, m.fecha_fin DESC;
--
-- public.reservas_con_cupo
--   SELECT c.id, c.nombre, c.fecha, c.hora_inicio, c.hora_fin, c.cupo_maximo,
--          c.coach_id, c.entrenamiento, c.estado, c.created_at, c.updated_at,
--          COALESCE(pr.nombre_completo, 'Sin coach') AS coach_nombre,
--          (SELECT count(*)::integer FROM reservas r
--            WHERE r.clase_id = c.id AND r.estado = ANY (ARRAY['confirmada'::reserva_estado,'asistio'::reserva_estado])) AS cupo_ocupado
--   FROM clases c LEFT JOIN profiles pr ON pr.id = c.coach_id;

-- Comando para re-extraer definiciones exactas justo antes de ejecutar la
-- limpieza (por si algo cambió desde esta auditoría):
SELECT c.relname, pg_get_viewdef(c.oid, true)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'v'
  AND c.relname IN ('alertas_membresia', 'membresia_actual', 'reservas_con_cupo');

-- ─────────────────────────────────────────────────────────────────────────
-- 4. DEFINICIONES — FUNCIONES/TRIGGERS (re-extraer en vivo antes de dropear)
-- ─────────────────────────────────────────────────────────────────────────
SELECT p.proname, pg_get_functiondef(p.oid)
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN (
    'handle_new_user', 'check_reserva_cupo', 'check_reserva_timing',
    'is_coach_of_clase', 'is_coach_or_admin', 'is_super_admin',
    'get_my_box_id', 'get_my_profile_id', 'is_my_box_active',
    'validate_coach_profile', 'sync_membresia_estado', 'refresh_vencidas_membresias',
    'is_admin'
  );

SELECT tgname, tgrelid::regclass, pg_get_triggerdef(oid)
FROM pg_trigger
WHERE NOT tgisinternal
  AND tgrelid IN ('auth.users'::regclass, 'membresias'::regclass, 'clases'::regclass, 'reservas'::regclass);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. DEFINICIONES — TABLAS (DDL completo ya reconstruido a mano en el
--    script de rollback, a partir de columnas + constraints + índices
--    verificados en catálogo el 2026-07-28. Re-extraer aquí como
--    verificación cruzada antes de ejecutar cualquier cosa:
-- ─────────────────────────────────────────────────────────────────────────
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('boxes', 'membresias', 'planes', 'clases', 'reservas',
                      'atleta_pr_marcas', 'atleta_skills', 'atleta_skill_historial')
ORDER BY table_name, ordinal_position;

SELECT conrelid::regclass AS tbl, conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid::regclass::text IN ('boxes', 'membresias', 'planes', 'clases', 'reservas',
                                    'atleta_pr_marcas', 'atleta_skills', 'atleta_skill_historial')
ORDER BY tbl, contype;
