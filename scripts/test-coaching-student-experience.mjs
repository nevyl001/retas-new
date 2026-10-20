/**
 * Test Suite: Experiencia del Alumno en Riviera Coaching ("Mi Coaching")
 * Validación con PostgreSQL Aislado (PGlite)
 */
import { PGlite } from "@electric-sql/pglite";

async function runStudentExperienceTests() {
  console.log("\n========================================================");
  console.log("🧪  TEST: RIVIERA COACHING — EXPERIENCIA DEL ALUMNO (PGlite)");
  console.log("========================================================\n");

  const db = new PGlite();

  // 1. Esquema base
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

    CREATE TABLE IF NOT EXISTS public.organizador_game_modes (
      organizador_id uuid PRIMARY KEY,
      branding_key text,
      coaching_enabled boolean DEFAULT false,
      updated_at timestamptz DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.riviera_coaches (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      auth_user_id uuid UNIQUE REFERENCES auth.users(id),
      coach_code text UNIQUE,
      nombre text NOT NULL,
      foto_url text,
      bio text,
      especialidades text[] DEFAULT '{}',
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.coach_club_memberships (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      coach_id uuid NOT NULL REFERENCES public.riviera_coaches(id) ON DELETE CASCADE,
      organizador_id uuid NOT NULL,
      status text NOT NULL DEFAULT 'ACTIVE',
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      CONSTRAINT coach_club_memberships_unique UNIQUE (coach_id, organizador_id)
    );

    CREATE TABLE IF NOT EXISTS public.riviera_jugadores (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      nombre text NOT NULL,
      email text,
      organizador_id uuid NOT NULL,
      estado text NOT NULL DEFAULT 'activo',
      updated_at timestamptz DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.riviera_official_player_identity (
      official_player_key uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      canonical_riviera_jugador_id uuid NOT NULL UNIQUE REFERENCES public.riviera_jugadores(id),
      riviera_id text NOT NULL UNIQUE,
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.riviera_official_player_profile_link (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      official_player_key uuid NOT NULL,
      riviera_jugador_id uuid NOT NULL UNIQUE,
      organizer_id uuid NOT NULL,
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.rewards_player_links (
      jugador_id uuid PRIMARY KEY,
      organizador_id uuid NOT NULL,
      auth_user_id uuid NOT NULL,
      created_at timestamptz DEFAULT now(),
      CONSTRAINT rewards_player_links_auth_uidx UNIQUE (organizador_id, auth_user_id)
    );

    CREATE TABLE IF NOT EXISTS public.coach_player_relationships (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      coach_id uuid NOT NULL REFERENCES public.riviera_coaches(id) ON DELETE CASCADE,
      jugador_id uuid NOT NULL REFERENCES public.riviera_jugadores(id) ON DELETE CASCADE,
      organizador_id uuid NOT NULL,
      status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'ENDED')),
      is_primary boolean NOT NULL DEFAULT false,
      started_at timestamptz NOT NULL DEFAULT now(),
      ended_at timestamptz NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (coach_id, jugador_id, organizador_id)
    );

    CREATE TABLE IF NOT EXISTS public.coach_player_class_balances (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      relationship_id uuid NOT NULL UNIQUE REFERENCES public.coach_player_relationships(id) ON DELETE CASCADE,
      organizador_id uuid NOT NULL,
      coach_id uuid NOT NULL REFERENCES public.riviera_coaches(id) ON DELETE CASCADE,
      jugador_id uuid NOT NULL REFERENCES public.riviera_jugadores(id) ON DELETE CASCADE,
      balance_classes integer NOT NULL DEFAULT 0,
      total_classes_given integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.coach_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      coach_id uuid NOT NULL REFERENCES public.riviera_coaches(id) ON DELETE CASCADE,
      relationship_id uuid NOT NULL REFERENCES public.coach_player_relationships(id) ON DELETE CASCADE,
      organizador_id uuid NOT NULL,
      starts_at timestamptz NOT NULL DEFAULT now(),
      ends_at timestamptz,
      duration_minutes integer DEFAULT 60,
      focus text,
      worked_on text[],
      notes_summary text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      jugador_id uuid NOT NULL,
      status text DEFAULT 'COMPLETED'
    );

    CREATE TABLE IF NOT EXISTS public.coach_class_ledger (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      relationship_id uuid NOT NULL REFERENCES public.coach_player_relationships(id) ON DELETE CASCADE,
      organizador_id uuid NOT NULL,
      coach_id uuid NOT NULL REFERENCES public.riviera_coaches(id) ON DELETE CASCADE,
      jugador_id uuid NOT NULL REFERENCES public.riviera_jugadores(id) ON DELETE CASCADE,
      delta integer NOT NULL,
      tipo text NOT NULL,
      notas text,
      idempotency_key text,
      recorded_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      session_id uuid REFERENCES public.coach_sessions(id) ON DELETE SET NULL
    );

    CREATE OR REPLACE FUNCTION public._resolve_official_player_key(p_id uuid)
    RETURNS uuid AS $$
      SELECT official_player_key FROM public.riviera_official_player_identity WHERE canonical_riviera_jugador_id = p_id;
    $$ LANGUAGE sql STABLE;
  `);

  // 2. Definir las funciones que se incorporarán en la migración 0067
  await db.exec(`
    CREATE OR REPLACE FUNCTION public.get_student_coaching_overview()
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
    DECLARE
      v_caller uuid := auth.uid();
      v_caller_email text;
      v_jugador_ids uuid[];
      v_official_keys uuid[];
      v_user_riviera_id text;
      v_results jsonb;
    BEGIN
      IF v_caller IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
      END IF;

      SELECT lower(btrim(email)) INTO v_caller_email
      FROM auth.users
      WHERE id = v_caller;

      -- 1. Resolver jugador_ids candidatos
      SELECT COALESCE(array_agg(DISTINCT cand.j_id), '{}'::uuid[])
      INTO v_jugador_ids
      FROM (
        SELECT l.jugador_id AS j_id
        FROM public.rewards_player_links l
        WHERE l.auth_user_id = v_caller
        UNION
        SELECT rj.id AS j_id
        FROM public.riviera_jugadores rj
        WHERE v_caller_email IS NOT NULL
          AND lower(btrim(COALESCE(rj.email, ''))) = v_caller_email
          AND rj.estado = 'activo'
      ) cand;

      -- Si se encontró por correo pero no está en rewards_player_links, auto-vincular
      IF array_length(v_jugador_ids, 1) > 0 THEN
        INSERT INTO public.rewards_player_links (jugador_id, organizador_id, auth_user_id)
        SELECT rj.id, rj.organizador_id, v_caller
        FROM public.riviera_jugadores rj
        WHERE rj.id = ANY(v_jugador_ids)
        ON CONFLICT (jugador_id) DO NOTHING;
      END IF;

      -- 2. Expandir a través de identidad oficial multiclub
      SELECT COALESCE(array_agg(DISTINCT k.official_key), '{}'::uuid[])
      INTO v_official_keys
      FROM (
        SELECT public._resolve_official_player_key(j_id) AS official_key
        FROM unnest(v_jugador_ids) AS j_id
        WHERE public._resolve_official_player_key(j_id) IS NOT NULL
      ) k;

      IF array_length(v_official_keys, 1) > 0 THEN
        SELECT COALESCE(array_agg(DISTINCT exp_id), v_jugador_ids)
        INTO v_jugador_ids
        FROM (
          SELECT unnest(v_jugador_ids) AS exp_id
          UNION
          SELECT i.canonical_riviera_jugador_id AS exp_id
          FROM public.riviera_official_player_identity i
          WHERE i.official_player_key = ANY(v_official_keys)
          UNION
          SELECT l.riviera_jugador_id AS exp_id
          FROM public.riviera_official_player_profile_link l
          WHERE l.official_player_key = ANY(v_official_keys)
        ) exp;
      END IF;

      -- 3. Resolver Riviera ID del alumno
      SELECT i.riviera_id INTO v_user_riviera_id
      FROM public.riviera_official_player_identity i
      WHERE i.canonical_riviera_jugador_id = ANY(v_jugador_ids)
         OR i.official_player_key = ANY(v_official_keys)
      ORDER BY i.created_at ASC
      LIMIT 1;

      IF array_length(v_jugador_ids, 1) IS NULL OR array_length(v_jugador_ids, 1) = 0 THEN
        RETURN jsonb_build_object(
          'ok', true,
          'linked', false,
          'riviera_id', NULL,
          'relationships', '[]'::jsonb
        );
      END IF;

      -- 4. Construir resultado multi-relación de coaching
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'relationship_id', r.id,
          'status', r.status,
          'is_primary', r.is_primary,
          'started_at', r.started_at,
          'ended_at', r.ended_at,
          'club', jsonb_build_object(
            'organizador_id', r.organizador_id,
            'nombre', COALESCE(u.name, ogm.branding_key, 'Club Riviera'),
            'branding_key', ogm.branding_key
          ),
          'coach', jsonb_build_object(
            'id', c.id,
            'nombre', c.nombre,
            'coach_code', c.coach_code,
            'foto_url', c.foto_url,
            'especialidades', c.especialidades
          ),
          'player', jsonb_build_object(
            'id', rj.id,
            'nombre', rj.nombre,
            'riviera_id', COALESCE(
              (SELECT i.riviera_id FROM public.riviera_official_player_identity i 
               WHERE i.canonical_riviera_jugador_id = rj.id LIMIT 1),
              v_user_riviera_id
            )
          ),
          'balance', jsonb_build_object(
            'balance_classes', COALESCE(b.balance_classes, 0),
            'total_classes_given', COALESCE(b.total_classes_given, 0),
            'updated_at', b.updated_at
          ),
          'ledger', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', l.id,
                'delta', l.delta,
                'tipo', l.tipo,
                'notas', l.notas,
                'created_at', l.created_at,
                'session', CASE WHEN s.id IS NOT NULL THEN jsonb_build_object(
                  'id', s.id,
                  'starts_at', s.starts_at,
                  'duration_minutes', s.duration_minutes,
                  'focus', s.focus,
                  'worked_on', s.worked_on,
                  'notes_summary', s.notes_summary
                ) ELSE NULL END
              ) ORDER BY l.created_at DESC
            )
            FROM public.coach_class_ledger l
            LEFT JOIN public.coach_sessions s ON s.id = l.session_id
            WHERE l.relationship_id = r.id
          ), '[]'::jsonb)
        ) ORDER BY r.is_primary DESC, r.created_at DESC
      ), '[]'::jsonb)
      INTO v_results
      FROM public.coach_player_relationships r
      JOIN public.riviera_coaches c ON c.id = r.coach_id
      JOIN public.riviera_jugadores rj ON rj.id = r.jugador_id
      LEFT JOIN public.users u ON u.id = r.organizador_id
      LEFT JOIN public.organizador_game_modes ogm ON ogm.organizador_id = r.organizador_id
      LEFT JOIN public.coach_player_class_balances b ON b.relationship_id = r.id
      WHERE r.jugador_id = ANY(v_jugador_ids);

      RETURN jsonb_build_object(
        'ok', true,
        'linked', true,
        'riviera_id', v_user_riviera_id,
        'relationships', v_results
      );
    END;
    $$;

    CREATE OR REPLACE FUNCTION public.link_student_by_riviera_id(p_riviera_id text)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
    DECLARE
      v_caller uuid := auth.uid();
      v_caller_email text;
      v_norm_id text;
      v_jugador record;
    BEGIN
      IF v_caller IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
      END IF;

      v_norm_id := upper(btrim(COALESCE(p_riviera_id, '')));
      IF v_norm_id !~ '^RIV-[0-9]{5,8}$' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Formato de Riviera ID inválido. Debe tener la estructura RIV-########');
      END IF;

      SELECT lower(btrim(email)) INTO v_caller_email
      FROM auth.users
      WHERE id = v_caller;

      SELECT rj.id, rj.nombre, rj.email, rj.organizador_id, i.riviera_id
      INTO v_jugador
      FROM public.riviera_official_player_identity i
      JOIN public.riviera_jugadores rj ON rj.id = i.canonical_riviera_jugador_id
      WHERE upper(btrim(i.riviera_id)) = v_norm_id
      LIMIT 1;

      IF v_jugador.id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'No se encontró un perfil deportivo oficial con ese Riviera ID.');
      END IF;

      IF v_jugador.email IS NOT NULL AND btrim(v_jugador.email) <> '' THEN
        IF lower(btrim(v_jugador.email)) <> v_caller_email THEN
          RETURN jsonb_build_object('ok', false, 'error', 'El correo de tu cuenta no coincide con el registrado en el club para este Riviera ID.');
        END IF;
      ELSE
        UPDATE public.riviera_jugadores
        SET email = v_caller_email, updated_at = now()
        WHERE id = v_jugador.id;
      END IF;

      INSERT INTO public.rewards_player_links (jugador_id, organizador_id, auth_user_id)
      VALUES (v_jugador.id, v_jugador.organizador_id, v_caller)
      ON CONFLICT (jugador_id) DO UPDATE
      SET auth_user_id = EXCLUDED.auth_user_id,
          organizador_id = EXCLUDED.organizador_id;

      RETURN jsonb_build_object(
        'ok', true,
        'jugador_id', v_jugador.id,
        'nombre', v_jugador.nombre,
        'riviera_id', v_jugador.riviera_id
      );
    END;
    $$;
  `);

  // 3. Crear datos de prueba para Hack Pádel, Coach, Alumno A y Alumno B
  const HACK_ORG = "e724de97-3552-4a01-a269-f621e6f1ed26";
  const COACH_USER = "11111111-1111-4111-8111-111111111111";
  const COACH_ID = "22222222-2222-4222-8222-222222222222";
  const STUDENT_A_USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const STUDENT_A_JUGADOR = "33333333-3333-4333-8333-333333333333";
  const STUDENT_B_USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const STUDENT_B_JUGADOR = "44444444-4444-4444-8444-444444444444";
  const REL_A = "55555555-5555-4555-8555-555555555555";
  const BAL_A = "66666666-6666-4666-8666-666666666666";

  await db.exec(`
    -- Hack Padel
    INSERT INTO auth.users (id, email) VALUES ('${HACK_ORG}', 'aaronduran2020@gmail.com');
    INSERT INTO public.users (id, email, name) VALUES ('${HACK_ORG}', 'aaronduran2020@gmail.com', 'Hackpadel');
    INSERT INTO public.organizador_game_modes (organizador_id, branding_key, coaching_enabled)
    VALUES ('${HACK_ORG}', 'hack-padel', true);

    -- Coach
    INSERT INTO auth.users (id, email) VALUES ('${COACH_USER}', 'coach.hack@gmail.com');
    INSERT INTO public.riviera_coaches (id, auth_user_id, coach_code, nombre, especialidades)
    VALUES ('${COACH_ID}', '${COACH_USER}', 'COACH-001', 'Prof. Roberto M', ARRAY['Volea', 'Bandeja', 'Estrategia']);
    INSERT INTO public.coach_club_memberships (coach_id, organizador_id, status)
    VALUES ('${COACH_ID}', '${HACK_ORG}', 'ACTIVE');

    -- Alumno A (Diego)
    INSERT INTO auth.users (id, email) VALUES ('${STUDENT_A_USER}', 'diego@gmail.com');
    INSERT INTO public.users (id, email, name) VALUES ('${STUDENT_A_USER}', 'diego@gmail.com', 'Diego Palomares');
    INSERT INTO public.riviera_jugadores (id, nombre, email, organizador_id)
    VALUES ('${STUDENT_A_JUGADOR}', 'Diego Palomares', 'diego@gmail.com', '${HACK_ORG}');
    INSERT INTO public.riviera_official_player_identity (canonical_riviera_jugador_id, riviera_id)
    VALUES ('${STUDENT_A_JUGADOR}', 'RIV-00000356');

    -- Alumno B (Pedro)
    INSERT INTO auth.users (id, email) VALUES ('${STUDENT_B_USER}', 'pedro@gmail.com');
    INSERT INTO public.users (id, email, name) VALUES ('${STUDENT_B_USER}', 'pedro@gmail.com', 'Pedro Torres');
    INSERT INTO public.riviera_jugadores (id, nombre, email, organizador_id)
    VALUES ('${STUDENT_B_JUGADOR}', 'Pedro Torres', 'pedro@gmail.com', '${HACK_ORG}');
    INSERT INTO public.riviera_official_player_identity (canonical_riviera_jugador_id, riviera_id)
    VALUES ('${STUDENT_B_JUGADOR}', 'RIV-00000543');

    -- Relación Alumno A con Coach en Hack Pádel
    INSERT INTO public.coach_player_relationships (id, coach_id, jugador_id, organizador_id, is_primary)
    VALUES ('${REL_A}', '${COACH_ID}', '${STUDENT_A_JUGADOR}', '${HACK_ORG}', true);

    -- Saldo inicial Alumno A: 5 clases asignadas, 1 tomada -> balance = 4
    INSERT INTO public.coach_player_class_balances (id, relationship_id, organizador_id, coach_id, jugador_id, balance_classes, total_classes_given)
    VALUES ('${BAL_A}', '${REL_A}', '${HACK_ORG}', '${COACH_ID}', '${STUDENT_A_JUGADOR}', 4, 1);

    -- Historial (Ledger) Alumno A
    INSERT INTO public.coach_class_ledger (relationship_id, organizador_id, coach_id, jugador_id, delta, tipo, notas, recorded_by, created_at)
    VALUES ('${REL_A}', '${HACK_ORG}', '${COACH_ID}', '${STUDENT_A_JUGADOR}', 5, 'ASSIGN', 'Paquete 5 clases inicial', '${HACK_ORG}', now() - interval '2 days');

    INSERT INTO public.coach_sessions (id, coach_id, relationship_id, organizador_id, starts_at, duration_minutes, focus, notes_summary, jugador_id)
    VALUES ('77777777-7777-4777-8777-777777777777', '${COACH_ID}', '${REL_A}', '${HACK_ORG}', now() - interval '1 day', 60, 'Bandeja profunda', 'Excelente progreso técnico en armado', '${STUDENT_A_JUGADOR}');

    INSERT INTO public.coach_class_ledger (relationship_id, organizador_id, coach_id, jugador_id, delta, tipo, notas, recorded_by, created_at, session_id)
    VALUES ('${REL_A}', '${HACK_ORG}', '${COACH_ID}', '${STUDENT_A_JUGADOR}', -1, 'CLASS_SESSION', 'Clase 1 completada', '${COACH_USER}', now() - interval '1 day', '77777777-7777-4777-8777-777777777777');
  `);

  console.log("✅ Datos base cargados exitosamente.");

  // Test 1: Alumno A consulta su resumen de coaching
  await db.exec(`SET request.jwt.claim.sub = '${STUDENT_A_USER}';`);
  const resA = await db.query(`SELECT public.get_student_coaching_overview() AS overview;`);
  const dataA = resA.rows[0].overview;

  console.log("\n[TEST 1] Consulta de Alumno A:");
  if (dataA.ok !== true) throw new Error("Test 1 Falló: ok debe ser true");
  if (dataA.linked !== true) throw new Error("Test 1 Falló: linked debe ser true");
  if (dataA.riviera_id !== "RIV-00000356") throw new Error(`Test 1 Falló: riviera_id incorrecto: ${dataA.riviera_id}`);
  if (!Array.isArray(dataA.relationships) || dataA.relationships.length !== 1) {
    throw new Error("Test 1 Falló: debe tener 1 relación de coaching");
  }

  const rel = dataA.relationships[0];
  if (rel.club.nombre !== "Hackpadel") throw new Error(`Club incorrecto: ${rel.club.nombre}`);
  if (rel.coach.nombre !== "Prof. Roberto M") throw new Error(`Coach incorrecto: ${rel.coach.nombre}`);
  if (rel.balance.balance_classes !== 4) throw new Error(`Balance incorrecto: ${rel.balance.balance_classes}`);
  if (rel.balance.total_classes_given !== 1) throw new Error(`Total clases incorrecto: ${rel.balance.total_classes_given}`);
  if (!Array.isArray(rel.ledger) || rel.ledger.length !== 2) throw new Error(`Ledger length incorrecto: ${rel.ledger.length}`);

  console.log("  - Riviera ID:", dataA.riviera_id);
  console.log("  - Club:", rel.club.nombre, `(${rel.club.branding_key})`);
  console.log("  - Coach:", rel.coach.nombre);
  console.log("  - Saldo Disponible:", rel.balance.balance_classes);
  console.log("  - Clases Tomadas:", rel.balance.total_classes_given);
  console.log("  - Movimientos en Ledger:", rel.ledger.length);
  console.log("  - Última sesión:", rel.ledger[0].session?.focus);
  console.log("✅ Test 1 Pasó con éxito.");

  // Test 2: Alumno B (sin coaching asignado todavía) consulta su resumen
  await db.exec(`SET request.jwt.claim.sub = '${STUDENT_B_USER}';`);
  const resB = await db.query(`SELECT public.get_student_coaching_overview() AS overview;`);
  const dataB = resB.rows[0].overview;

  console.log("\n[TEST 2] Aislamiento Estricto: Alumno B consulta su resumen:");
  if (dataB.ok !== true) throw new Error("Test 2 Falló: ok debe ser true");
  if (dataB.riviera_id !== "RIV-00000543") throw new Error(`Test 2 Falló: Riviera ID debe ser de Alumno B`);
  if (!Array.isArray(dataB.relationships) || dataB.relationships.length !== 0) {
    throw new Error("Test 2 Falló: Alumno B NO debe ver las clases de Alumno A (aislamiento violado)");
  }
  console.log("  - Alumno B ve 0 relaciones ajenas. Aislamiento multi-inquilino confirmado.");
  console.log("✅ Test 2 Pasó con éxito.");

  // Test 3: Usuario no registrado intenta reclamar un Riviera ID ajeno con correo no coincidente
  const ATTACKER = "99999999-9999-4999-8999-999999999999";
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${ATTACKER}', 'attacker@gmail.com');
    SET request.jwt.claim.sub = '${ATTACKER}';
  `);
  const resHacker = await db.query(`SELECT public.link_student_by_riviera_id('RIV-00000356') AS link_res;`);
  const dataHacker = resHacker.rows[0].link_res;

  console.log("\n[TEST 3] Protección contra suplantación de Riviera ID:");
  if (dataHacker.ok === true) {
    throw new Error("Test 3 Falló: Atacante no debió poder reclamar el Riviera ID de Diego");
  }
  console.log("  - Rechazo controlado:", dataHacker.error);
  console.log("✅ Test 3 Pasó con éxito.");

  // Test 4: Sin sesión
  await db.exec(`RESET request.jwt.claim.sub;`);
  const resAnon = await db.query(`SELECT public.get_student_coaching_overview() AS overview;`);
  if (resAnon.rows[0].overview.ok !== false) {
    throw new Error("Test 4 Falló: Anónimo debe ser rechazado");
  }
  console.log("\n[TEST 4] Rechazo de usuario no autenticado confirmado.");
  console.log("✅ Test 4 Pasó con éxito.");

  console.log("\n========================================================");
  console.log("🎉  TODAS LAS PRUEBAS POSTGRESQL PASARON EXITOSAMENTE");
  console.log("========================================================\n");
}

runStudentExperienceTests().catch((e) => {
  console.error("❌ ERROR EN PRUEBAS:", e);
  process.exit(1);
});

