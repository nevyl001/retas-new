-- =============================================================================
-- LIMPIEZA FINAL — public.profiles, public.boxes, is_admin(), is_coach_or_admin(),
-- account_status, user_role, box_plan, box_status.
--
-- Continuación de cleanup-foreign-block-20260728.sql (ya ejecutado y comiteado
-- en producción el 2026-07-28). Estos 8 objetos quedaron protegidos en esa
-- ronda porque profiles tenía 2 filas ligadas a usuarios reales de Riviera
-- Open y boxes estaba bloqueada por la FK profiles.box_id. Autorizado ahora
-- explícitamente a eliminarlos.
--
-- Evidencia pg_depend (2026-07-28, post primera limpieza): CERO dependencias
-- externas a este bloque de 8 objetos. Todo lo que pg_depend reporta es
-- interno (constraints/índices/policies propios de profiles y boxes, o el
-- FK profiles.user_id -> auth.users, que es profiles apuntando HACIA
-- auth.users, no al revés — no bloquea el DROP de profiles).
--
-- Confirmado además:
--   • auth.users es la identidad real; profiles.user_id -> auth.users(id)
--     ON DELETE CASCADE va en un solo sentido (borrar un usuario de
--     auth.users borraría su fila en profiles, NUNCA al revés). Eliminar
--     la TABLA profiles no borra ninguna cuenta de auth.users.
--   • El login real (src/contexts/UserContext.tsx) resuelve identidad solo
--     con supabase.auth.* + la tabla real public.users — cero referencia a
--     profiles/boxes en todo el frontend ni en supabase/functions/.
--   • boxes no tiene políticas RLS propias (0 filas en pg_policies).
--   • profiles no tiene triggers propios (el único, on_auth_user_created
--     en auth.users, ya se eliminó en la limpieza anterior).
--
-- ORDEN (sin CASCADE):
--   0. Revocar permisos públicos (higiene, aunque se van a dropear igual).
--   1. Dropear explícitamente las 5 políticas de profiles (aunque
--      DROP TABLE las eliminaría solas — se listan para dejar auditoría
--      clara de "qué dependía de qué antes de borrar").
--   2. Dropear la tabla profiles (nada más depende de ella — sus antiguos
--      dependientes, membresias/clases/reservas/atleta_*, ya no existen).
--   3. Dropear la tabla boxes (ahora libre: la única FK que la referenciaba,
--      profiles_box_id_fkey, se fue con profiles en el paso 2).
--   4. Dropear is_admin() e is_coach_or_admin() — ahora seguro, las 3
--      políticas de profiles que las usaban ya no existen.
--   5. Dropear los 4 enums — ahora seguro, las columnas que los usaban
--      (profiles.rol/estado_cuenta, boxes.plan/status) ya no existen.
-- =============================================================================

BEGIN;

-- ── 0. Revocar permisos públicos ──────────────────────────────────────────
REVOKE ALL ON public.profiles FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.boxes FROM anon, authenticated, PUBLIC;

-- ── 1. Políticas de profiles (explícitas, para auditoría) ────────────────
DROP POLICY IF EXISTS profiles_insert_admin ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
DROP POLICY IF EXISTS profiles_select_coaches ON public.profiles;
DROP POLICY IF EXISTS profiles_select_own_or_staff ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own_or_admin ON public.profiles;
-- boxes: confirmado sin políticas propias, nada que dropear aquí.

-- ── 2. Tabla profiles ──────────────────────────────────────────────────────
-- Contenía 2 filas ligadas a usuarios reales de Riviera Open (ver backup).
-- Esas cuentas siguen existiendo intactas en auth.users y (si alguna vez
-- las usaron) en public.users/riviera_jugadores — profiles nunca fue su
-- fuente de identidad real, solo un efecto secundario del trigger ya
-- eliminado.
DROP TABLE IF EXISTS public.profiles;

-- ── 3. Tabla boxes ─────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.boxes;

-- ── 4. Funciones ───────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.is_admin();
DROP FUNCTION IF EXISTS public.is_coach_or_admin();

-- ── 5. Enums ───────────────────────────────────────────────────────────────
DROP TYPE IF EXISTS public.account_status;
DROP TYPE IF EXISTS public.user_role;
DROP TYPE IF EXISTS public.box_plan;
DROP TYPE IF EXISTS public.box_status;

-- ── Verificación final dentro de la misma transacción ─────────────────────
DO $$
DECLARE
  v_auth_users_before CONSTANT integer := 9;
  v_users_before CONSTANT integer := 20;
  v_admin_users_before CONSTANT integer := 1;
  v_riviera_jugadores_before CONSTANT integer := 156;
  v_jugador_participaciones_before CONSTANT integer := 312;
  v_tournaments_before CONSTANT integer := 129;
  v_matches_before CONSTANT integer := 130;
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    RAISE EXCEPTION 'Limpieza incompleta: public.profiles sigue existiendo';
  END IF;
  IF to_regclass('public.boxes') IS NOT NULL THEN
    RAISE EXCEPTION 'Limpieza incompleta: public.boxes sigue existiendo';
  END IF;
  IF to_regprocedure('public.is_admin()') IS NOT NULL THEN
    RAISE EXCEPTION 'Limpieza incompleta: public.is_admin() sigue existiendo';
  END IF;
  IF to_regprocedure('public.is_coach_or_admin()') IS NOT NULL THEN
    RAISE EXCEPTION 'Limpieza incompleta: public.is_coach_or_admin() sigue existiendo';
  END IF;
  IF to_regtype('public.account_status') IS NOT NULL
     OR to_regtype('public.user_role') IS NOT NULL
     OR to_regtype('public.box_plan') IS NOT NULL
     OR to_regtype('public.box_status') IS NOT NULL
  THEN
    RAISE EXCEPTION 'Limpieza incompleta: algún enum ajeno sigue existiendo';
  END IF;

  -- auth.users es la identidad real — debe seguir teniendo exactamente
  -- las mismas cuentas (confirma que dropear profiles no tocó ni una).
  IF (SELECT count(*) FROM auth.users) <> v_auth_users_before THEN
    RAISE EXCEPTION 'ALERTA: auth.users cambió de tamaño (esperado %). Abortando.', v_auth_users_before;
  END IF;

  -- Estructuras REALES de Riviera Open, sin cambios de fila.
  IF (SELECT count(*) FROM public.users) <> v_users_before THEN
    RAISE EXCEPTION 'ALERTA: public.users cambió de tamaño (esperado %). Abortando.', v_users_before;
  END IF;
  IF (SELECT count(*) FROM public.admin_users) <> v_admin_users_before THEN
    RAISE EXCEPTION 'ALERTA: public.admin_users cambió de tamaño (esperado %). Abortando.', v_admin_users_before;
  END IF;
  IF (SELECT count(*) FROM public.riviera_jugadores) <> v_riviera_jugadores_before THEN
    RAISE EXCEPTION 'ALERTA: public.riviera_jugadores cambió de tamaño (esperado %). Abortando.', v_riviera_jugadores_before;
  END IF;
  IF (SELECT count(*) FROM public.jugador_participaciones) <> v_jugador_participaciones_before THEN
    RAISE EXCEPTION 'ALERTA: public.jugador_participaciones cambió de tamaño (esperado %). Abortando.', v_jugador_participaciones_before;
  END IF;
  IF (SELECT count(*) FROM public.tournaments) <> v_tournaments_before THEN
    RAISE EXCEPTION 'ALERTA: public.tournaments cambió de tamaño (esperado %). Abortando.', v_tournaments_before;
  END IF;
  IF (SELECT count(*) FROM public.matches) <> v_matches_before THEN
    RAISE EXCEPTION 'ALERTA: public.matches cambió de tamaño (esperado %). Abortando.', v_matches_before;
  END IF;
END $$;

-- Revisar el resultado con calma antes de aceptar. Cuando estés conforme:
--   COMMIT;
-- Si algo se ve mal:
--   ROLLBACK;
