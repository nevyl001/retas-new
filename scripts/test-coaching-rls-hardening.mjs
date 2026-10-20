/**
 * Riviera Coaching — Suite de Pruebas en PostgreSQL Aislado (PGlite)
 *
 * Ejecuta validaciones exhaustivas sobre una instancia real de PostgreSQL en WebAssembly:
 * 1. Restricción de mutación directa (INSERT, UPDATE, DELETE denegados por REVOKE a authenticated).
 * 2. Creación obligatoria de solicitudes en estado PENDING para coaches nuevos y existentes.
 * 3. Transición exclusiva de PENDING a ACTIVE por el coach titular autenticado.
 * 4. Denegación de aceptación de membresía por atacantes o usuarios de otros coaches.
 * 5. Desactivación a INACTIVE preservando historial, relaciones e identidad del coach.
 * 6. Aislamiento multi-club y RLS estricto.
 */

import { PGlite } from "@electric-sql/pglite";

const ORG_1 = "11111111-1111-4111-8111-111111111111"; // Club con coaching_enabled = true
const ORG_2 = "22222222-2222-4222-8222-222222222222"; // Club con coaching_enabled = false
const ORG_3 = "33333333-3333-4333-8333-333333333333"; // Club ajeno con coaching_enabled = true
const COACH_USER_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COACH_ID_1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const COACH_USER_2 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const COACH_ID_2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ATTACKER_USER = "99999999-9999-4999-8999-999999999999";
const JUGADOR_ID_1 = "77777777-7777-4777-8777-777777777777";

async function runSuite() {
  console.log("\n========================================================");
  console.log("🛠️  INICIANDO PRUEBAS EN POSTGRESQL AISLADO (PGlite)");
  console.log("========================================================\n");

  const db = new PGlite();

  // 1. Esquema base auth y public
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (
      id uuid PRIMARY KEY,
      email text UNIQUE
    );

    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$ LANGUAGE sql STABLE;

    CREATE SCHEMA IF NOT EXISTS public;

    CREATE TABLE IF NOT EXISTS public.users (
      id uuid PRIMARY KEY REFERENCES auth.users(id),
      email text,
      name text
    );

    CREATE TABLE IF NOT EXISTS public.admin_users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES auth.users(id),
      email text
    );

    CREATE OR REPLACE FUNCTION public.is_master_admin() RETURNS boolean AS $$
      SELECT EXISTS (
        SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
      );
    $$ LANGUAGE sql STABLE;

    CREATE TABLE IF NOT EXISTS public.organizador_game_modes (
      organizador_id uuid PRIMARY KEY,
      coaching_enabled boolean DEFAULT false
    );

    CREATE TABLE IF NOT EXISTS public.riviera_coaches (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      auth_user_id uuid UNIQUE REFERENCES auth.users(id),
      coach_code text UNIQUE,
      nombre text NOT NULL,
      foto_url text,
      bio text,
      filosofia text,
      especialidades text[] DEFAULT '{}',
      fuerzas text[] DEFAULT '{}',
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.coach_club_memberships (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      coach_id uuid NOT NULL REFERENCES public.riviera_coaches(id) ON DELETE CASCADE,
      organizador_id uuid NOT NULL,
      status text NOT NULL DEFAULT 'PENDING',
      invited_by uuid REFERENCES auth.users(id),
      invited_at timestamptz DEFAULT now(),
      activated_at timestamptz,
      deactivated_at timestamptz,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      CONSTRAINT coach_club_memberships_status_check CHECK (status IN ('ACTIVE', 'INACTIVE', 'PENDING')),
      CONSTRAINT coach_club_memberships_unique UNIQUE (coach_id, organizador_id)
    );

    CREATE TABLE IF NOT EXISTS public.riviera_jugadores (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      nombre text NOT NULL
    );

    CREATE TABLE IF NOT EXISTS public.coach_player_relationships (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      coach_id uuid NOT NULL REFERENCES public.riviera_coaches(id) ON DELETE CASCADE,
      jugador_id uuid NOT NULL REFERENCES public.riviera_jugadores(id) ON DELETE CASCADE,
      organizador_id uuid NOT NULL,
      status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'ENDED')),
      is_primary boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (coach_id, jugador_id, organizador_id)
    );

    -- Roles emulados
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
      END IF;
    END $$;

    -- Aplicar blindaje RLS y privilegios de la migración 0064
    ALTER TABLE public.coach_club_memberships ENABLE ROW LEVEL SECURITY;
    REVOKE INSERT, UPDATE, DELETE ON public.coach_club_memberships FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON public.coach_club_memberships TO authenticated;

    CREATE POLICY ccm_select ON public.coach_club_memberships
      FOR SELECT TO authenticated
      USING (
        public.is_master_admin()
        OR organizador_id = auth.uid()
        OR coach_id IN (
          SELECT rc.id FROM public.riviera_coaches rc
          WHERE rc.auth_user_id = auth.uid()
        )
      );

    -- Sección 9: Blindaje de coach_player_relationships y neutralización de vinculación de alumnos
    ALTER TABLE public.coach_player_relationships ENABLE ROW LEVEL SECURITY;
    REVOKE INSERT, UPDATE, DELETE ON public.coach_player_relationships FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON public.coach_player_relationships TO authenticated;

    CREATE POLICY cpr_select ON public.coach_player_relationships
      FOR SELECT TO authenticated
      USING (
        public.is_master_admin()
        OR organizador_id = auth.uid()
        OR coach_id IN (
          SELECT rc.id FROM public.riviera_coaches rc
          WHERE rc.auth_user_id = auth.uid()
        )
      );

    CREATE OR REPLACE FUNCTION public.link_player_to_coach_by_riviera_id(
      p_coach_id uuid,
      p_riviera_id text
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'La vinculación operativa de alumnos está reservada para la Entrega C (Coach -> Alumno por Riviera ID).'
      );
    END;
    $$;

    REVOKE ALL ON FUNCTION public.link_player_to_coach_by_riviera_id(uuid, text) FROM PUBLIC, anon, authenticated;

    -- RPCs autorizadas de la migración 0064
    CREATE OR REPLACE FUNCTION public.lookup_coach_for_invitation(p_query text)
    RETURNS TABLE (
      coach_id uuid,
      coach_code text,
      nombre text,
      foto_url text,
      bio text,
      especialidades text[],
      fuerzas text[],
      already_member boolean,
      membership_status text
    )
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_org_id uuid := auth.uid();
      v_normalized text := lower(btrim(COALESCE(p_query, '')));
      v_has_access boolean;
    BEGIN
      IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Autenticación requerida';
      END IF;

      v_has_access := public.is_master_admin() OR EXISTS (
        SELECT 1 FROM public.organizador_game_modes ogm
        WHERE ogm.organizador_id = v_org_id
          AND ogm.coaching_enabled = true
      );

      IF NOT v_has_access THEN
        RAISE EXCEPTION 'No autorizado: el club no tiene habilitado Riviera Coaching o carece de permisos de organizador.';
      END IF;

      IF v_normalized = '' THEN
        RETURN;
      END IF;

      RETURN QUERY
      SELECT
        c.id AS coach_id,
        c.coach_code,
        c.nombre,
        c.foto_url,
        c.bio,
        c.especialidades,
        c.fuerzas,
        EXISTS (
          SELECT 1 FROM public.coach_club_memberships m
          WHERE m.coach_id = c.id
            AND m.organizador_id = v_org_id
            AND m.status = 'ACTIVE'
        ) AS already_member,
        (
          SELECT m.status FROM public.coach_club_memberships m
          WHERE m.coach_id = c.id
            AND m.organizador_id = v_org_id
          LIMIT 1
        ) AS membership_status
      FROM public.riviera_coaches c
      LEFT JOIN auth.users u ON u.id = c.auth_user_id
      WHERE lower(c.coach_code) = v_normalized
         OR lower(u.email) = v_normalized
      LIMIT 1;
    END;
    $$;

    CREATE OR REPLACE FUNCTION public.link_existing_coach_to_club(p_coach_id uuid)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_org_id uuid := auth.uid();
      v_membership_id uuid;
      v_status text;
      v_coach record;
      v_has_access boolean;
      v_existing record;
    BEGIN
      IF v_org_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Autenticación requerida');
      END IF;

      v_has_access := public.is_master_admin() OR EXISTS (
        SELECT 1 FROM public.organizador_game_modes ogm
        WHERE ogm.organizador_id = v_org_id
          AND ogm.coaching_enabled = true
      );

      IF NOT v_has_access THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'No autorizado: el club no tiene habilitado Riviera Coaching o carece de permisos de organizador.'
        );
      END IF;

      SELECT id, coach_code, nombre, foto_url, bio, especialidades, fuerzas
      INTO v_coach
      FROM public.riviera_coaches
      WHERE id = p_coach_id;

      IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Coach no encontrado');
      END IF;

      SELECT id, status INTO v_existing
      FROM public.coach_club_memberships
      WHERE coach_id = p_coach_id
        AND organizador_id = v_org_id;

      IF FOUND THEN
        IF v_existing.status = 'ACTIVE' THEN
          RETURN jsonb_build_object(
            'ok', true,
            'already_member', true,
            'membership_id', v_existing.id,
            'status', 'ACTIVE',
            'message', 'El coach ya es miembro activo de tu club.'
          );
        END IF;

        IF v_existing.status = 'PENDING' THEN
          RETURN jsonb_build_object(
            'ok', true,
            'already_member', false,
            'membership_id', v_existing.id,
            'status', 'PENDING',
            'message', 'La solicitud de vinculación ya se encuentra pendiente de aceptación.'
          );
        END IF;

        UPDATE public.coach_club_memberships
        SET
          status = 'PENDING',
          invited_by = v_org_id,
          invited_at = now(),
          updated_at = now()
        WHERE id = v_existing.id
        RETURNING id, status INTO v_membership_id, v_status;
      ELSE
        INSERT INTO public.coach_club_memberships (
          coach_id,
          organizador_id,
          status,
          invited_by,
          invited_at,
          updated_at
        )
        VALUES (
          p_coach_id,
          v_org_id,
          'PENDING',
          v_org_id,
          now(),
          now()
        )
        RETURNING id, status INTO v_membership_id, v_status;
      END IF;

      RETURN jsonb_build_object(
        'ok', true,
        'already_member', false,
        'membership_id', v_membership_id,
        'status', v_status,
        'message', 'Solicitud de incorporación registrada en estado PENDING.',
        'coach', jsonb_build_object(
          'id', v_coach.id,
          'coach_code', v_coach.coach_code,
          'nombre', v_coach.nombre
        )
      );
    END;
    $$;

    CREATE OR REPLACE FUNCTION public.accept_coach_club_invitation(p_membership_id uuid)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_user_id uuid := auth.uid();
      v_coach_id uuid;
      v_membership record;
      v_updated_id uuid;
      v_club_authorized boolean;
    BEGIN
      IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Autenticación requerida');
      END IF;

      SELECT id INTO v_coach_id
      FROM public.riviera_coaches
      WHERE auth_user_id = v_user_id;

      IF v_coach_id IS NULL THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'El usuario actual no tiene perfil de coach registrado'
        );
      END IF;

      SELECT * INTO v_membership
      FROM public.coach_club_memberships
      WHERE id = p_membership_id
        AND coach_id = v_coach_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'Invitación no encontrada o no pertenece a tu perfil de coach'
        );
      END IF;

      v_club_authorized := public.is_master_admin() OR EXISTS (
        SELECT 1 FROM public.organizador_game_modes ogm
        WHERE ogm.organizador_id = v_membership.organizador_id
          AND ogm.coaching_enabled = true
      );

      IF NOT v_club_authorized THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'No autorizado: el club no tiene habilitado Riviera Coaching actualmente.'
        );
      END IF;

      IF v_membership.status = 'ACTIVE' THEN
        RETURN jsonb_build_object(
          'ok', true,
          'membership_id', p_membership_id,
          'status', 'ACTIVE',
          'message', 'La invitación ya se encuentra activa.'
        );
      END IF;

      IF v_membership.status = 'INACTIVE' THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'La membresía se encuentra inactiva. Requiere una nueva invitación formal del club.'
        );
      END IF;

      IF v_membership.status <> 'PENDING' THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'Solo las invitaciones en estado PENDING pueden ser aceptadas.'
        );
      END IF;

      UPDATE public.coach_club_memberships
      SET
        status = 'ACTIVE',
        activated_at = COALESCE(activated_at, now()),
        updated_at = now()
      WHERE id = p_membership_id
        AND coach_id = v_coach_id
        AND status = 'PENDING'
      RETURNING id INTO v_updated_id;

      IF v_updated_id IS NULL THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'Conflicto de concurrencia: la invitación ya no se encuentra en estado PENDING.'
        );
      END IF;

      RETURN jsonb_build_object(
        'ok', true,
        'membership_id', p_membership_id,
        'status', 'ACTIVE',
        'message', 'Invitación aceptada exitosamente. Ahora eres coach activo del club.'
      );
    END;
    $$;

    CREATE OR REPLACE FUNCTION public.deactivate_coach_from_club(
      p_coach_id uuid,
      p_organizador_id uuid DEFAULT NULL
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_caller_id uuid := auth.uid();
      v_target_org_id uuid;
      v_has_access boolean;
      v_membership record;
    BEGIN
      IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Autenticación requerida');
      END IF;

      v_target_org_id := COALESCE(p_organizador_id, v_caller_id);

      v_has_access := public.is_master_admin() OR (
        v_caller_id = v_target_org_id
        AND EXISTS (
          SELECT 1 FROM public.organizador_game_modes ogm
          WHERE ogm.organizador_id = v_caller_id
            AND ogm.coaching_enabled = true
        )
      );

      IF NOT v_has_access THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'No autorizado: no tienes permisos para administrar este club.'
        );
      END IF;

      SELECT id, status INTO v_membership
      FROM public.coach_club_memberships
      WHERE coach_id = p_coach_id
        AND organizador_id = v_target_org_id;

      IF NOT FOUND THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'El coach no tiene registro de membresía en este club.'
        );
      END IF;

      IF v_membership.status = 'INACTIVE' THEN
        RETURN jsonb_build_object(
          'ok', true,
          'membership_id', v_membership.id,
          'status', 'INACTIVE',
          'message', 'El coach ya se encuentra inactivo en tu club.'
        );
      END IF;

      UPDATE public.coach_club_memberships
      SET
        status = 'INACTIVE',
        deactivated_at = now(),
        updated_at = now()
      WHERE id = v_membership.id;

      RETURN jsonb_build_object(
        'ok', true,
        'membership_id', v_membership.id,
        'status', 'INACTIVE',
        'message', 'Coach desactivado del club correctamente.'
      );
    END;
    $$;

    GRANT EXECUTE ON FUNCTION public.lookup_coach_for_invitation(text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.link_existing_coach_to_club(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.accept_coach_club_invitation(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.deactivate_coach_from_club(uuid, uuid) TO authenticated;
  `);

  // Semillas
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${ORG_1}', 'club1@riviera.com'),
      ('${ORG_2}', 'club2_sin_modulo@riviera.com'),
      ('${ORG_3}', 'club3_ajeno@riviera.com'),
      ('${COACH_USER_1}', 'coach1@riviera.com'),
      ('${COACH_USER_2}', 'coach2@riviera.com'),
      ('${ATTACKER_USER}', 'attacker@evil.com');

    INSERT INTO public.organizador_game_modes (organizador_id, coaching_enabled) VALUES
      ('${ORG_1}', true),
      ('${ORG_2}', false),
      ('${ORG_3}', true);

    INSERT INTO public.riviera_coaches (id, auth_user_id, coach_code, nombre) VALUES
      ('${COACH_ID_1}', '${COACH_USER_1}', 'RIV-C-10001', 'Coach Uno'),
      ('${COACH_ID_2}', '${COACH_USER_2}', 'RIV-C-10002', 'Coach Dos');

    INSERT INTO public.riviera_jugadores (id, nombre) VALUES
      ('${JUGADOR_ID_1}', 'Jugador Alumno Uno');
  `);

  const asUser = async (userId, fn) => {
    await db.exec(`SET ROLE authenticated;`);
    await db.exec(`SET request.jwt.claim.sub = '${userId}';`);
    try {
      await fn();
    } finally {
      await db.exec(`RESET ROLE;`);
      await db.exec(`RESET request.jwt.claim.sub;`);
    }
  };

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      passed++;
      console.log(`  ✅ [PASS] ${message}`);
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // --- ESCENARIOS DE PRUEBA ---

  // 1. Mutaciones directas bloqueadas
  console.log("\n--- BLOQUE 1: CIERRE DE RUTAS DE ESCRITURA DIRECTA (REVOKE) ---");
  await asUser(ATTACKER_USER, async () => {
    let threwInsert = false;
    try {
      await db.query(
        `INSERT INTO public.coach_club_memberships (coach_id, organizador_id, status)
         VALUES ('${COACH_ID_1}', '${ORG_1}', 'ACTIVE')`
      );
    } catch (err) {
      threwInsert = err.message.toLowerCase().includes("permission denied");
    }
    assert(threwInsert, "INSERT directo a coach_club_memberships bloqueado con 'permission denied'");

    let threwUpdate = false;
    try {
      await db.query(`UPDATE public.coach_club_memberships SET status = 'ACTIVE'`);
    } catch (err) {
      threwUpdate = err.message.toLowerCase().includes("permission denied");
    }
    assert(threwUpdate, "UPDATE directo a coach_club_memberships bloqueado con 'permission denied'");

    let threwDelete = false;
    try {
      await db.query(`DELETE FROM public.coach_club_memberships`);
    } catch (err) {
      threwDelete = err.message.toLowerCase().includes("permission denied");
    }
    assert(threwDelete, "DELETE directo a coach_club_memberships bloqueado con 'permission denied'");
  });

  // 2. Registro de coach existente genera PENDING obligatorio
  console.log("\n--- BLOQUE 2: SOLICITUD DE INCORPORACIÓN EN ESTADO PENDING ---");
  let membershipId = null;
  await asUser(ORG_1, async () => {
    const res = await db.query(
      `SELECT public.link_existing_coach_to_club('${COACH_ID_1}')`
    );
    const json = res.rows[0].link_existing_coach_to_club;
    assert(json.ok === true, "link_existing_coach_to_club ejecuta exitosamente para club autorizado");
    assert(json.status === "PENDING", "Estado generado es estrictamente 'PENDING' (no ACTIVE)");
    membershipId = json.membership_id;
  });

  const dbRow = await db.query(
    `SELECT status, invited_by, activated_at FROM public.coach_club_memberships WHERE id = '${membershipId}'`
  );
  assert(dbRow.rows[0].status === "PENDING", "Persistencia física en PostgreSQL es 'PENDING'");
  assert(dbRow.rows[0].invited_by === ORG_1, "Campo invited_by corresponde al organizador");
  assert(dbRow.rows[0].activated_at === null, "Campo activated_at permanece NULL antes de aceptación");

  // 3. Club sin módulo no puede vincular
  console.log("\n--- BLOQUE 3: VALIDACIÓN DE PERMISOS DE CLUB (coaching_enabled) ---");
  await asUser(ORG_2, async () => {
    const res = await db.query(
      `SELECT public.link_existing_coach_to_club('${COACH_ID_2}')`
    );
    const json = res.rows[0].link_existing_coach_to_club;
    assert(json.ok === false, "Club con coaching_enabled=false es denegado");
    assert(json.error.includes("No autorizado"), "Mensaje de error expresa falta de permisos");
  });

  // 4. Activación exclusiva por el coach titular
  console.log("\n--- BLOQUE 4: ACTIVACIÓN EXCLUSIVA POR EL COACH TITULAR ---");
  await asUser(ATTACKER_USER, async () => {
    const res = await db.query(
      `SELECT public.accept_coach_club_invitation('${membershipId}')`
    );
    const json = res.rows[0].accept_coach_club_invitation;
    assert(json.ok === false, "Usuario no-coach no puede activar membresía");
  });

  await asUser(COACH_USER_2, async () => {
    const res = await db.query(
      `SELECT public.accept_coach_club_invitation('${membershipId}')`
    );
    const json = res.rows[0].accept_coach_club_invitation;
    assert(json.ok === false, "Coach ajeno no puede activar membresía que no le pertenece");
  });

  await asUser(COACH_USER_1, async () => {
    const res = await db.query(
      `SELECT public.accept_coach_club_invitation('${membershipId}')`
    );
    const json = res.rows[0].accept_coach_club_invitation;
    assert(json.ok === true, "Coach titular acepta exitosamente su invitación");
    assert(json.status === "ACTIVE", "Estado transiciona formalmente a 'ACTIVE'");
  });

  // 4.1 Idempotencia: re-aceptar sobre ACTIVE devuelve respuesta idempotente exitosa
  await asUser(COACH_USER_1, async () => {
    const res = await db.query(
      `SELECT public.accept_coach_club_invitation('${membershipId}')`
    );
    const json = res.rows[0].accept_coach_club_invitation;
    assert(json.ok === true, "Aceptación repetida sobre membresía ya ACTIVE es idempotente");
    assert(json.status === "ACTIVE", "Conserva estado 'ACTIVE'");
    assert(json.message.includes("ya se encuentra activa"), "Mensaje confirma idempotencia");
  });

  const activeRow = await db.query(
    `SELECT status, activated_at FROM public.coach_club_memberships WHERE id = '${membershipId}'`
  );
  assert(activeRow.rows[0].status === "ACTIVE", "BD refleja estado 'ACTIVE'");
  assert(activeRow.rows[0].activated_at !== null, "Campo activated_at queda registrado con timestamp");


  // 5. Reintento de vincular coach activo no duplica ni reinicia
  console.log("\n--- BLOQUE 5: PROTECCIÓN CONTRA DUPLICADOS Y REINICIOS ---");
  await asUser(ORG_1, async () => {
    const res = await db.query(
      `SELECT public.link_existing_coach_to_club('${COACH_ID_1}')`
    );
    const json = res.rows[0].link_existing_coach_to_club;
    assert(json.ok === true, "Respuesta exitosa al consultar coach ya miembro");
    assert(json.already_member === true, "Reporta already_member = true");
    assert(json.status === "ACTIVE", "Conserva estado 'ACTIVE' sin reiniciar a PENDING");
  });

  const countRow = await db.query(
    `SELECT count(*)::text as c FROM public.coach_club_memberships WHERE coach_id = '${COACH_ID_1}' AND organizador_id = '${ORG_1}'`
  );
  assert(countRow.rows[0].c === "1", "Exactamente un registro persiste (sin duplicaciones)");

  // 6. Desactivación por organizador
  console.log("\n--- BLOQUE 6: DESACTIVACIÓN SEGURA (PRESERVA HISTORIAL) ---");
  await asUser(ORG_1, async () => {
    const res = await db.query(
      `SELECT public.deactivate_coach_from_club('${COACH_ID_1}')`
    );
    const json = res.rows[0].deactivate_coach_from_club;
    assert(json.ok === true, "Organizador desactiva exitosamente al coach");
    assert(json.status === "INACTIVE", "Membresía transiciona a 'INACTIVE'");
  });

  const inactiveRow = await db.query(
    `SELECT status, deactivated_at FROM public.coach_club_memberships WHERE id = '${membershipId}'`
  );
  assert(inactiveRow.rows[0].status === "INACTIVE", "BD refleja status 'INACTIVE'");
  assert(inactiveRow.rows[0].deactivated_at !== null, "Timestamp deactivated_at registrado");

  // 6.1. Coach NO puede auto-activar una membresía INACTIVE
  await asUser(COACH_USER_1, async () => {
    const res = await db.query(
      `SELECT public.accept_coach_club_invitation('${membershipId}')`
    );
    const json = res.rows[0].accept_coach_club_invitation;
    assert(json.ok === false, "Coach no puede auto-activar membresía INACTIVE sin nueva invitación");
    assert(json.error.includes("inactiva"), "Error expresa que membresía requiere nueva invitación formal");
  });


  // 7. Aislamiento inter-club
  console.log("\n--- BLOQUE 7: AISLAMIENTO MULTI-CLUB Y SEGURIDAD RLS ---");
  await asUser(ORG_3, async () => {
    const res = await db.query(
      `SELECT public.deactivate_coach_from_club('${COACH_ID_1}', '${ORG_1}')`
    );
    const json = res.rows[0].deactivate_coach_from_club;
    assert(json.ok === false, "Organizador de Club 3 no puede desactivar membresía de Club 1");
    assert(json.error.includes("No autorizado"), "Error de autorización emitido");
  });

  // Re-incorporación de un coach inactivo
  console.log("\n--- BLOQUE 8: REINCORPORACIÓN DE COACH INACTIVO ---");
  await asUser(ORG_1, async () => {
    const res = await db.query(
      `SELECT public.link_existing_coach_to_club('${COACH_ID_1}')`
    );
    const json = res.rows[0].link_existing_coach_to_club;
    assert(json.ok === true, "Solicitud de reincorporación procesada exitosamente");
    assert(json.status === "PENDING", "Estado cambia a 'PENDING' para esperar nueva aceptación del coach");
  });

  // 9. Bloqueo de mutaciones directas y vinculaciones prematuras de alumnos (Entrega C)
  console.log("\n--- BLOQUE 9: BLOQUEO DE OPERACIONES DE ALUMNOS (RESERVADO A ENTREGA C) ---");
  await asUser(ATTACKER_USER, async () => {
    let threwInsert = false;
    try {
      await db.query(
        `INSERT INTO public.coach_player_relationships (coach_id, jugador_id, organizador_id, status)
         VALUES ('${COACH_ID_1}', '${JUGADOR_ID_1}', '${ORG_1}', 'ACTIVE')`
      );
    } catch (err) {
      threwInsert = err.message.toLowerCase().includes("permission denied");
    }
    assert(threwInsert, "INSERT directo a coach_player_relationships bloqueado con 'permission denied'");

    let threwUpdate = false;
    try {
      await db.query(`UPDATE public.coach_player_relationships SET status = 'ACTIVE'`);
    } catch (err) {
      threwUpdate = err.message.toLowerCase().includes("permission denied");
    }
    assert(threwUpdate, "UPDATE directo a coach_player_relationships bloqueado con 'permission denied'");

    let threwDelete = false;
    try {
      await db.query(`DELETE FROM public.coach_player_relationships`);
    } catch (err) {
      threwDelete = err.message.toLowerCase().includes("permission denied");
    }
    assert(threwDelete, "DELETE directo a coach_player_relationships bloqueado con 'permission denied'");
  });

  await asUser(ORG_1, async () => {
    let threwRpc = false;
    try {
      await db.query(
        `SELECT public.link_player_to_coach_by_riviera_id('${COACH_ID_1}', 'RIV-12345678')`
      );
    } catch (err) {
      threwRpc = err.message.toLowerCase().includes("permission denied");
    }
    assert(threwRpc, "Llamada RPC a link_player_to_coach_by_riviera_id denegada por REVOKE (permission denied)");
  });

  // Si se ejecuta en contexto sin restricción de grant, la función neutralizada responde fail-closed
  const rpcBypassRes = await db.query(
    `SELECT public.link_player_to_coach_by_riviera_id('${COACH_ID_1}', 'RIV-12345678')`
  );
  const rpcBypassJson = rpcBypassRes.rows[0].link_player_to_coach_by_riviera_id;
  assert(rpcBypassJson.ok === false, "Ejecución interna de link_player_to_coach_by_riviera_id responde fail-closed");
  assert(rpcBypassJson.error.includes("Entrega C"), "Mensaje de error estipula reserva exclusiva para Entrega C");

  console.log("\n========================================================");
  console.log(`🏁 RESULTADO: ${passed} / ${total} PRUEBAS SUPERADAS CON ÉXITO.`);
  console.log("========================================================\n");
}

runSuite().catch((err) => {
  console.error("FATAL ERROR IN SUITE:", err);
  process.exit(1);
});

