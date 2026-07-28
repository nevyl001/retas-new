-- =============================================================================
-- LIMPIEZA — bloque ajeno confirmado (app de gimnasio/box "Parabellum Cross")
--
-- NO EJECUTAR SIN AUTORIZACIÓN EXPLÍCITA. Ejecutar solo después de:
--   1) Correr backup-foreign-block-pre-cleanup-20260728.sql y guardar su salida.
--   2) Confirmar que los conteos de fila siguen siendo los de la auditoría.
--
-- QUÉ NO TOCA ESTE SCRIPT (a propósito):
--   • public.profiles           — PROTEGIDA. Contiene 2 filas de usuarios
--     REALES de Riviera Open (verificado: created_at idéntico al segundo
--     con sus filas en auth.users — son efecto secundario del trigger
--     ajeno, no datos de prueba del gimnasio). Decisión pendiente, fuera
--     de este script.
--   • public.boxes               — BLOQUEADA por dependencia. profiles.box_id
--     es NOT NULL + FK a boxes(id), y profiles no se toca en este pase.
--     Dropear boxes rompería esa FK o forzaría a tocar profiles. Se deja
--     para cuando se resuelva profiles.
--   • account_status, user_role  — usados por profiles, quedan con ella.
--   • box_plan, box_status       — usados por boxes, quedan con ella.
--   • public.riviera_jugadores_sitio_oficial
--   • public._career_participacion_host_audit
--   • public._historical_orphan_parent_participaciones
--     (confirmadas RIVIERA_LEGITIMO — se atienden en otra migración de
--     seguridad, no en esta limpieza de dominio ajeno)
--
-- ORDEN (v2 — corregido tras un intento fallido en vivo: Postgres rechazó
-- dropear is_coach_of_clase() en el orden original porque las políticas
-- reservas_select_coach_of_class / reservas_update_coach_of_class de la
-- tabla reservas (que se elimina en el MISMO script, más abajo) todavía
-- la referenciaban en ese punto. La transacción entera hizo ROLLBACK
-- automático — cero cambios aplicados, confirmado antes de corregir.
-- Fix: las TABLAS deben dropearse antes que las FUNCIONES independientes
-- (get_my_profile_id, get_my_box_id, is_my_box_active, is_coach_of_clase,
-- is_super_admin) — al dropear la tabla, sus políticas se van con ella,
-- y solo entonces la función queda sin nada que la referencie):
--   0. Revocar permisos públicos (anon/authenticated) de los objetos ajenos.
--   1. Desactivar el trigger en auth.users — CRÍTICO, primero de todo:
--      si no se hace, el próximo registro real de Riviera Open falla.
--   2. Dropear las 3 vistas ajenas (nada depende de ellas — verificado:
--      cero funciones/vistas de Riviera las referencian).
--   3. Dropear los 4 triggers propios del bloque ajeno (viven en tablas
--      que se van a dropear de todos modos, pero se listan explícitos).
--   4. Dropear tablas HIJAS antes que PADRES (esto también elimina, junto
--      con cada tabla, todas sus políticas RLS — las mismas que en el
--      intento anterior bloquearon el DROP FUNCTION prematuro):
--        atleta_skill_historial (FK -> atleta_skills)  antes de
--        atleta_skills                                  antes de
--        atleta_pr_marcas  (hija de profiles, sin hijas propias)
--        reservas (FK -> clases, FK -> profiles)        antes de
--        clases   (FK -> profiles)
--        membresias (FK -> planes, FK -> profiles)      antes de
--        planes
--   5. Dropear las funciones exclusivas del bloque ajeno — AHORA seguro,
--      sus tablas/políticas ya no existen (verificado: cero políticas ni
--      funciones de Riviera las llaman; NO incluye is_admin() ni
--      is_coach_or_admin(), en uso real por 3 políticas de profiles).
--   6. Dropear los enums que quedan huérfanos tras el paso 4 (verificado:
--      cada uno usado EXCLUSIVAMENTE por columnas de las tablas recién
--      eliminadas — ninguno lo usa profiles/boxes/tabla de Riviera).
-- =============================================================================

BEGIN;

-- ── 0. Revocar permisos públicos de los objetos ajenos ──────────────────
-- (Mitigación inmediata de exposición aunque el DROP falle más adelante
-- por algún motivo no previsto — revocar es idempotente y no destructivo.)
REVOKE ALL ON public.alertas_membresia FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.membresia_actual FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.reservas_con_cupo FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.membresias FROM anon, PUBLIC;
REVOKE ALL ON public.planes FROM anon, PUBLIC;
REVOKE ALL ON public.clases FROM anon, PUBLIC;
REVOKE ALL ON public.reservas FROM anon, PUBLIC;
REVOKE ALL ON public.atleta_pr_marcas FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.atleta_skills FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.atleta_skill_historial FROM anon, authenticated, PUBLIC;

-- ── 1. Trigger en auth.users — PRIMERO, sin excepción ────────────────────
-- Verificado: es el único punto donde el bloque ajeno "toca" a un usuario
-- real de Riviera Open (inserta una fila en profiles en cada signup real).
-- Sin este paso, el resto de la limpieza deja el INSERT del trigger
-- apuntando a tablas que ya no existen -> el próximo registro real falla
-- dentro de la misma transacción del signup.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- La función queda huérfana tras quitar el trigger; nada más la usa
-- (verificado: ninguna otra función/trigger de la base la referencia).
DROP FUNCTION IF EXISTS public.handle_new_user();

-- ── 2. Vistas ajenas ──────────────────────────────────────────────────────
-- Verificado (pg_get_functiondef de TODAS las funciones public + grep en
-- src/ y supabase/functions/): cero consumidores en código de Riviera.
DROP VIEW IF EXISTS public.alertas_membresia;
DROP VIEW IF EXISTS public.membresia_actual;
DROP VIEW IF EXISTS public.reservas_con_cupo;

-- ── 3. Triggers propios de tablas ajenas (explícitos, aunque se irían
--       con sus tablas en el paso 4) ────────────────────────────────────
DROP TRIGGER IF EXISTS trg_sync_membresia_estado ON public.membresias;
DROP TRIGGER IF EXISTS trg_validate_coach ON public.clases;
DROP TRIGGER IF EXISTS trg_check_reserva_cupo ON public.reservas;
DROP TRIGGER IF EXISTS trg_reserva_timing ON public.reservas;

-- ── 4. Tablas — hijas antes que padres (esto también borra, junto con
--       cada tabla, TODAS sus políticas RLS — precondición para poder
--       dropear las funciones del paso 5 sin error) ──────────────────────
-- atleta_skill_historial depende de atleta_skills (FK skill_id).
DROP TABLE IF EXISTS public.atleta_skill_historial;
DROP TABLE IF EXISTS public.atleta_skills;
DROP TABLE IF EXISTS public.atleta_pr_marcas;

-- reservas depende de clases (FK clase_id).
DROP TABLE IF EXISTS public.reservas;
DROP TABLE IF EXISTS public.clases;

-- membresias depende de planes (FK plan_id).
DROP TABLE IF EXISTS public.membresias;
DROP TABLE IF EXISTS public.planes;

-- NOTA: boxes NO se dropea aquí — ver cabecera. profiles.box_id sigue
-- apuntando a ella y profiles está protegida en este pase.

-- ── 5. Funciones exclusivas del bloque ajeno ──────────────────────────────
-- Verificado vía pg_depend: NO se incluyen is_admin() ni is_coach_or_admin()
-- — las usan 3 políticas RLS de public.profiles (profiles_insert_admin,
-- profiles_update_own_or_admin, profiles_select_own_or_staff), tabla que
-- NO se toca en este pase. Dropearlas rompería esas políticas. Quedan
-- pendientes de la decisión sobre profiles.
DROP FUNCTION IF EXISTS public.check_reserva_cupo();
DROP FUNCTION IF EXISTS public.check_reserva_timing();
DROP FUNCTION IF EXISTS public.is_coach_of_clase(uuid);
DROP FUNCTION IF EXISTS public.validate_coach_profile();
DROP FUNCTION IF EXISTS public.sync_membresia_estado();
DROP FUNCTION IF EXISTS public.refresh_vencidas_membresias();
DROP FUNCTION IF EXISTS public.is_super_admin();
DROP FUNCTION IF EXISTS public.get_my_profile_id();
DROP FUNCTION IF EXISTS public.get_my_box_id();
DROP FUNCTION IF EXISTS public.is_my_box_active();

-- ── 6. Enums huérfanos tras el paso 4 ─────────────────────────────────────
-- Verificado: cada uno usado EXCLUSIVAMENTE por columnas de las tablas
-- recién eliminadas (account_status/user_role -> profiles, protegida, NO
-- se tocan; box_plan/box_status -> boxes, bloqueada, NO se tocan).
DROP TYPE IF EXISTS public.clase_estado;
DROP TYPE IF EXISTS public.membresia_estado;
DROP TYPE IF EXISTS public.metodo_asignacion;
DROP TYPE IF EXISTS public.plan_tipo;
DROP TYPE IF EXISTS public.pr_unidad;
DROP TYPE IF EXISTS public.record_tipo;
DROP TYPE IF EXISTS public.reserva_estado;
DROP TYPE IF EXISTS public.skill_estado;

-- ── Verificación final dentro de la misma transacción ─────────────────────
-- Si algo de esto falla, ROLLBACK automático — no queda estado a medias.
DO $$
BEGIN
  IF to_regclass('public.membresias') IS NOT NULL
     OR to_regclass('public.planes') IS NOT NULL
     OR to_regclass('public.clases') IS NOT NULL
     OR to_regclass('public.reservas') IS NOT NULL
     OR to_regclass('public.atleta_pr_marcas') IS NOT NULL
     OR to_regclass('public.atleta_skills') IS NOT NULL
     OR to_regclass('public.atleta_skill_historial') IS NOT NULL
  THEN
    RAISE EXCEPTION 'Limpieza incompleta: alguna tabla ajena sigue existiendo';
  END IF;

  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'ALERTA: public.profiles desapareció — no debía tocarse. Abortando.';
  END IF;

  IF to_regclass('public.boxes') IS NULL THEN
    RAISE EXCEPTION 'ALERTA: public.boxes desapareció — no debía tocarse en este pase. Abortando.';
  END IF;

  -- Confirmar explícitamente que lo protegido sigue existiendo (no solo
  -- las 2 tablas, también las funciones y tipos de los que depende).
  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'ALERTA: public.is_admin() desapareció — es usada por políticas de profiles. Abortando.';
  END IF;

  IF to_regprocedure('public.is_coach_or_admin()') IS NULL THEN
    RAISE EXCEPTION 'ALERTA: public.is_coach_or_admin() desapareció — es usada por políticas de profiles. Abortando.';
  END IF;

  IF to_regtype('public.account_status') IS NULL
     OR to_regtype('public.user_role') IS NULL
     OR to_regtype('public.box_plan') IS NULL
     OR to_regtype('public.box_status') IS NULL
  THEN
    RAISE EXCEPTION 'ALERTA: un tipo usado por profiles/boxes desapareció. Abortando.';
  END IF;
END $$;

-- Revisar el resultado con calma antes de aceptar. Cuando estés conforme:
--   COMMIT;
-- Si algo se ve mal:
--   ROLLBACK;
