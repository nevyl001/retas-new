/**
 * Test Suite: Hotfix de Seguridad y Titularidad de Identidad en Riviera Coaching
 * Validación en PostgreSQL Aislado (PGlite)
 *
 * Casos obligatorios:
 * 1. Alumno correctamente autenticado y verificado.
 * 2. Alumno con cuenta de correo no verificada (email_confirmed_at IS NULL).
 * 3. Perfil deportivo sin correo registrado (email IS NULL).
 * 4. Perfil vinculado previamente a otro usuario (intento de suplantación/robo).
 * 5. Intento de reclamar un Riviera ID ajeno.
 * 6. Dos perfiles con correos coincidentes (colisión en club).
 * 7. Alumno perteneciente a distintos clubes (multiclub).
 * 8. Lectura de saldos e historial de otro alumno (aislamiento).
 * 9. Confirmación de que NO se alteran vínculos de Rewards (inmutabilidad).
 */
import { PGlite } from "@electric-sql/pglite";

async function runHardeningTests() {
  console.log("\n========================================================");
  console.log("🛡️  TEST: RIVIERA COACHING — HARDENING DE IDENTIDAD (PGlite)");
  console.log("========================================================\n");

  const db = new PGlite();

  // 1. Esquema base auth y public
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (
      id uuid PRIMARY KEY,
      email text UNIQUE,
      email_confirmed_at timestamptz
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
      created_at timestamptz DEFAULT now(),
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

    -- Roles emulados
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
    END $$;
  `);

  // 2. Aplicar la nueva migración incremental 0068
  await db.exec(`
    -- Tabla dedicada para vínculos de coaching con titularidad verificada
    CREATE TABLE IF NOT EXISTS public.coach_student_account_links (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      jugador_id uuid NOT NULL REFERENCES public.riviera_jugadores(id) ON DELETE CASCADE,
      auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      organizador_id uuid NOT NULL,
      verification_method text NOT NULL CHECK (verification_method IN ('CLUB_ADMIN', 'VERIFIED_EMAIL_MATCH')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT coach_student_account_links_jugador_uq UNIQUE (jugador_id),
      CONSTRAINT coach_student_account_links_auth_org_uq UNIQUE (organizador_id, auth_user_id)
    );

    ALTER TABLE public.coach_student_account_links ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS csal_select ON public.coach_student_account_links;
    CREATE POLICY csal_select ON public.coach_student_account_links
      FOR SELECT
      TO authenticated
      USING (
        auth_user_id = auth.uid()
        OR organizador_id = auth.uid()
        OR COALESCE(public.is_master_admin(), false)
      );

    -- Políticas RLS protegidas sobre balances y ledger
    DROP POLICY IF EXISTS cpcb_student_select ON public.coach_player_class_balances;
    CREATE POLICY cpcb_student_select ON public.coach_player_class_balances
      FOR SELECT
      TO authenticated
      USING (
        jugador_id IN (
          SELECT csl.jugador_id FROM public.coach_student_account_links csl WHERE csl.auth_user_id = auth.uid()
          UNION
          SELECT rpl.jugador_id FROM public.rewards_player_links rpl WHERE rpl.auth_user_id = auth.uid()
        )
      );

    DROP POLICY IF EXISTS ccl_student_select ON public.coach_class_ledger;
    CREATE POLICY ccl_student_select ON public.coach_class_ledger
      FOR SELECT
      TO authenticated
      USING (
        jugador_id IN (
          SELECT csl.jugador_id FROM public.coach_student_account_links csl WHERE csl.auth_user_id = auth.uid()
          UNION
          SELECT rpl.jugador_id FROM public.rewards_player_links rpl WHERE rpl.auth_user_id = auth.uid()
        )
      );

    -- Función autorizada para que el club vincule al alumno con consentimiento
    CREATE OR REPLACE FUNCTION public.link_coach_student_by_club(
      p_organizador_id uuid,
      p_jugador_id uuid,
      p_student_email text
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
    DECLARE
      v_caller uuid := auth.uid();
      v_is_master boolean := COALESCE(public.is_master_admin(), false);
      v_target_user record;
      v_jugador record;
      v_existing_link record;
    BEGIN
      IF v_caller IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
      END IF;

      IF v_caller <> p_organizador_id AND NOT v_is_master THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Solo el administrador del club puede autorizar la vinculación de alumnos.');
      END IF;

      -- Verificar que el jugador pertenezca al club
      SELECT id, nombre, email, organizador_id INTO v_jugador
      FROM public.riviera_jugadores
      WHERE id = p_jugador_id AND organizador_id = p_organizador_id;

      IF v_jugador.id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'El alumno no pertenece a este club.');
      END IF;

      -- Buscar cuenta de usuario por correo verificado
      SELECT id, email, email_confirmed_at INTO v_target_user
      FROM auth.users
      WHERE lower(btrim(email)) = lower(btrim(p_student_email));

      IF v_target_user.id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'No existe una cuenta registrada con ese correo electrónico.');
      END IF;

      IF v_target_user.email_confirmed_at IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'La cuenta del alumno no ha confirmado su correo electrónico.');
      END IF;

      -- Comprobar si el jugador ya está vinculado a otra cuenta
      SELECT auth_user_id, organizador_id INTO v_existing_link
      FROM public.coach_student_account_links
      WHERE jugador_id = p_jugador_id;

      IF v_existing_link.auth_user_id IS NOT NULL THEN
        IF v_existing_link.auth_user_id = v_target_user.id THEN
          RETURN jsonb_build_object('ok', true, 'message', 'Alumno ya vinculado previamente.');
        ELSE
          RETURN jsonb_build_object('ok', false, 'error', 'Este perfil deportivo ya se encuentra vinculado a otra cuenta de usuario.');
        END IF;
      END IF;

      -- Insertar vínculo verificado por el club
      INSERT INTO public.coach_student_account_links (
        jugador_id, auth_user_id, organizador_id, verification_method
      ) VALUES (
        p_jugador_id, v_target_user.id, p_organizador_id, 'CLUB_ADMIN'
      );

      RETURN jsonb_build_object(
        'ok', true,
        'jugador_id', p_jugador_id,
        'auth_user_id', v_target_user.id,
        'nombre', v_jugador.nombre
      );
    END;
    $$;

    -- Función segura link_student_by_riviera_id
    CREATE OR REPLACE FUNCTION public.link_student_by_riviera_id(p_riviera_id text)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
    DECLARE
      v_caller uuid := auth.uid();
      v_caller_email text;
      v_email_confirmed_at timestamptz;
      v_norm_id text;
      v_jugador record;
      v_existing_auth uuid;
      v_email_collision_count int;
    BEGIN
      IF v_caller IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
      END IF;

      -- Verificar estado de confirmación del correo de la cuenta que llama
      SELECT lower(btrim(email)), email_confirmed_at
      INTO v_caller_email, v_email_confirmed_at
      FROM auth.users
      WHERE id = v_caller;

      IF v_email_confirmed_at IS NULL THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'Tu cuenta de correo no ha sido verificada. Confirma tu correo antes de vincular tu credencial.'
        );
      END IF;

      v_norm_id := upper(btrim(COALESCE(p_riviera_id, '')));
      IF v_norm_id !~ '^RIV-[0-9]{5,8}$' THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'Formato de Riviera ID inválido. Debe tener la estructura RIV-########'
        );
      END IF;

      -- Buscar perfil deportivo canónico por Riviera ID
      SELECT rj.id, rj.nombre, rj.email, rj.organizador_id, i.riviera_id
      INTO v_jugador
      FROM public.riviera_official_player_identity i
      JOIN public.riviera_jugadores rj ON rj.id = i.canonical_riviera_jugador_id
      WHERE upper(btrim(i.riviera_id)) = v_norm_id
      LIMIT 1;

      IF v_jugador.id IS NULL THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'No se encontró un perfil deportivo oficial con ese Riviera ID.'
        );
      END IF;

      -- REGLA DE SEGURIDAD 1: Si ya está vinculado a otro usuario, NUNCA reemplazar propietario (Anti-hijack)
      SELECT auth_user_id INTO v_existing_auth
      FROM public.coach_student_account_links
      WHERE jugador_id = v_jugador.id;

      IF v_existing_auth IS NOT NULL THEN
        IF v_existing_auth = v_caller THEN
          RETURN jsonb_build_object(
            'ok', true,
            'jugador_id', v_jugador.id,
            'nombre', v_jugador.nombre,
            'riviera_id', v_jugador.riviera_id,
            'message', 'Perfil ya vinculado previamente.'
          );
        ELSE
          RETURN jsonb_build_object(
            'ok', false,
            'error', 'Este perfil ya se encuentra vinculado a otra cuenta de usuario. No se puede transferir sin autorización del club.'
          );
        END IF;
      END IF;

      -- Comprobar si está vinculado a otro usuario en Rewards
      SELECT auth_user_id INTO v_existing_auth
      FROM public.rewards_player_links
      WHERE jugador_id = v_jugador.id;

      IF v_existing_auth IS NOT NULL AND v_existing_auth <> v_caller THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'Este perfil ya se encuentra asociado a otra cuenta en el sistema.'
        );
      END IF;

      -- REGLA DE SEGURIDAD 2: Si el perfil deportivo NO tiene correo registrado en el club,
      -- NO se puede reclamar por el cliente; exige vinculación autorizada del club.
      IF v_jugador.email IS NULL OR btrim(v_jugador.email) = '' THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'Este perfil no cuenta con correo registrado por el club. Por seguridad, solicita a la administración de tu club la vinculación autorizada de tu cuenta.'
        );
      END IF;

      -- REGLA DE SEGURIDAD 3: El correo registrado en el club DEBE coincidir con el correo verificado del usuario
      IF lower(btrim(v_jugador.email)) <> v_caller_email THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'El correo de tu cuenta no coincide con el registrado en el club para este Riviera ID.'
        );
      END IF;

      -- REGLA DE SEGURIDAD 4: Colisión de correos en el mismo club (dos personas con mismo correo)
      SELECT count(*) INTO v_email_collision_count
      FROM public.riviera_jugadores
      WHERE organizador_id = v_jugador.organizador_id
        AND lower(btrim(email)) = v_caller_email
        AND estado = 'activo';

      IF v_email_collision_count > 1 THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'Existen múltiples perfiles con este correo en el club. Solicita a tu club una vinculación autorizada individual para evitar ambigüedades.'
        );
      END IF;

      -- Registrar vínculo EXCLUSIVAMENTE en coach_student_account_links (sin tocar rewards_player_links)
      INSERT INTO public.coach_student_account_links (
        jugador_id, auth_user_id, organizador_id, verification_method
      ) VALUES (
        v_jugador.id, v_caller, v_jugador.organizador_id, 'VERIFIED_EMAIL_MATCH'
      );

      RETURN jsonb_build_object(
        'ok', true,
        'jugador_id', v_jugador.id,
        'nombre', v_jugador.nombre,
        'riviera_id', v_jugador.riviera_id
      );
    END;
    $$;

    -- Función segura get_student_coaching_overview (100% solo lectura, sin alterar Rewards)
    CREATE OR REPLACE FUNCTION public.get_student_coaching_overview()
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
    DECLARE
      v_caller uuid := auth.uid();
      v_caller_email text;
      v_email_confirmed_at timestamptz;
      v_verified_jugador_ids uuid[];
      v_official_keys uuid[];
      v_user_riviera_id text;
      v_results jsonb;
    BEGIN
      IF v_caller IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
      END IF;

      SELECT lower(btrim(email)), email_confirmed_at
      INTO v_caller_email, v_email_confirmed_at
      FROM auth.users
      WHERE id = v_caller;

      -- Resolver perfiles cuya titularidad esté estrictamente verificada para v_caller:
      SELECT COALESCE(array_agg(DISTINCT cand.j_id), '{}'::uuid[])
      INTO v_verified_jugador_ids
      FROM (
        -- 1. Vinculación explícita de coaching
        SELECT csl.jugador_id AS j_id
        FROM public.coach_student_account_links csl
        WHERE csl.auth_user_id = v_caller

        UNION

        -- 2. Vinculación previa en rewards_player_links (solo lectura)
        SELECT rpl.jugador_id AS j_id
        FROM public.rewards_player_links rpl
        WHERE rpl.auth_user_id = v_caller

        UNION

        -- 3. Coincidencia estricta con correo confirmado (sin colisión y sin conflicto con otro usuario)
        SELECT rj.id AS j_id
        FROM public.riviera_jugadores rj
        WHERE v_email_confirmed_at IS NOT NULL
          AND v_caller_email IS NOT NULL
          AND v_caller_email <> ''
          AND lower(btrim(rj.email)) = v_caller_email
          AND rj.estado = 'activo'
          AND NOT EXISTS (
            SELECT 1 FROM public.coach_student_account_links csl
            WHERE csl.jugador_id = rj.id AND csl.auth_user_id <> v_caller
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.rewards_player_links rpl
            WHERE rpl.jugador_id = rj.id AND rpl.auth_user_id <> v_caller
          )
          -- Excluir si hay más de 1 perfil con este correo en el mismo club (colisión no resuelta)
          AND (
            SELECT count(*) FROM public.riviera_jugadores dup
            WHERE dup.organizador_id = rj.organizador_id
              AND lower(btrim(dup.email)) = v_caller_email
              AND dup.estado = 'activo'
          ) = 1
      ) cand;

      -- Expansión multiclub: única y exclusivamente perfiles hermanos NO vinculados a otro usuario
      SELECT COALESCE(array_agg(DISTINCT k.official_key), '{}'::uuid[])
      INTO v_official_keys
      FROM (
        SELECT public._resolve_official_player_key(j_id) AS official_key
        FROM unnest(v_verified_jugador_ids) AS j_id
        WHERE public._resolve_official_player_key(j_id) IS NOT NULL
      ) k;

      IF array_length(v_official_keys, 1) > 0 THEN
        SELECT COALESCE(array_agg(DISTINCT exp.j_id), v_verified_jugador_ids)
        INTO v_verified_jugador_ids
        FROM (
          SELECT unnest(v_verified_jugador_ids) AS j_id
          UNION
          SELECT i.canonical_riviera_jugador_id AS j_id
          FROM public.riviera_official_player_identity i
          WHERE i.official_player_key = ANY(v_official_keys)
            AND NOT EXISTS (
              SELECT 1 FROM public.coach_student_account_links csl
              WHERE csl.jugador_id = i.canonical_riviera_jugador_id AND csl.auth_user_id <> v_caller
            )
            AND NOT EXISTS (
              SELECT 1 FROM public.rewards_player_links rpl
              WHERE rpl.jugador_id = i.canonical_riviera_jugador_id AND rpl.auth_user_id <> v_caller
            )
          UNION
          SELECT l.riviera_jugador_id AS j_id
          FROM public.riviera_official_player_profile_link l
          WHERE l.official_player_key = ANY(v_official_keys)
            AND NOT EXISTS (
              SELECT 1 FROM public.coach_student_account_links csl
              WHERE csl.jugador_id = l.riviera_jugador_id AND csl.auth_user_id <> v_caller
            )
            AND NOT EXISTS (
              SELECT 1 FROM public.rewards_player_links rpl
              WHERE rpl.jugador_id = l.riviera_jugador_id AND rpl.auth_user_id <> v_caller
            )
        ) exp;
      END IF;

      -- Resolver Riviera ID del alumno
      SELECT i.riviera_id INTO v_user_riviera_id
      FROM public.riviera_official_player_identity i
      WHERE i.canonical_riviera_jugador_id = ANY(v_verified_jugador_ids)
         OR i.official_player_key = ANY(v_official_keys)
      ORDER BY i.created_at ASC
      LIMIT 1;

      -- Si no hay perfiles verificados para este usuario, retornar estado limpio
      IF array_length(v_verified_jugador_ids, 1) IS NULL OR array_length(v_verified_jugador_ids, 1) = 0 THEN
        RETURN jsonb_build_object(
          'ok', true,
          'linked', false,
          'riviera_id', NULL,
          'relationships', '[]'::jsonb
        );
      END IF;

      -- Construir resumen
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
      WHERE r.jugador_id = ANY(v_verified_jugador_ids);

      RETURN jsonb_build_object(
        'ok', true,
        'linked', true,
        'riviera_id', v_user_riviera_id,
        'relationships', v_results
      );
    END;
    $$;
  `);

  console.log("✅ Esquema base y migración 0068 aplicados exitosamente.");

  // 3. Crear fixtures de prueba
  const HACK_ORG = "e724de97-3552-4a01-a269-f621e6f1ed26";
  const PADELITO_ORG = "92985a71-93c2-47d7-b298-2a800185c1aa";
  const COACH_USER = "11111111-1111-4111-8111-111111111111";
  const COACH_ID = "22222222-2222-4222-8222-222222222222";

  // Alumno Verificado (Diego)
  const STUDENT_VERIFIED_USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const JUGADOR_DIEGO = "33333333-3333-4333-8333-333333333333";

  // Alumno No Verificado (Carlos)
  const STUDENT_UNVERIFIED_USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const JUGADOR_CARLOS = "44444444-4444-4444-8444-444444444444";

  // Perfil Sin Correo (Kevin)
  const JUGADOR_KEVIN_NO_EMAIL = "55555555-5555-4555-8555-555555555555";

  // Perfil de Pedro (previamente vinculado a otro usuario)
  const PREVIOUS_OWNER_USER = "77777777-7777-4777-8777-777777777777";
  const JUGADOR_PEDRO = "88888888-8888-4888-8888-888888888888";

  // Colisión de correo: dos perfiles con mismo correo en Hack Pádel
  const JUGADOR_COLLISION_1 = "99999999-9999-4999-8999-999999999991";
  const JUGADOR_COLLISION_2 = "99999999-9999-4999-8999-999999999992";
  const COLLISION_USER = "99999999-9999-4999-8999-999999999990";

  // Multiclub Diego: segundo perfil en Padelito
  const JUGADOR_DIEGO_PADELITO = "33333333-3333-4333-8333-333333333334";
  const OFFICIAL_KEY_DIEGO = "aaaaaaaa-0000-4000-8000-000000000001";

  await db.exec(`
    -- Hack Padel
    INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('${HACK_ORG}', 'aaronduran2020@gmail.com', now());
    INSERT INTO public.users (id, email, name) VALUES ('${HACK_ORG}', 'aaronduran2020@gmail.com', 'Hackpadel');
    INSERT INTO public.organizador_game_modes (organizador_id, branding_key, coaching_enabled)
    VALUES ('${HACK_ORG}', 'hack-padel', true);

    -- Padelito
    INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('${PADELITO_ORG}', 'padelitopadel@gmail.com', now());
    INSERT INTO public.users (id, email, name) VALUES ('${PADELITO_ORG}', 'padelitopadel@gmail.com', 'Padelito Warehouse');
    INSERT INTO public.organizador_game_modes (organizador_id, branding_key, coaching_enabled)
    VALUES ('${PADELITO_ORG}', 'padelito-warehouse', true);

    -- Coach
    INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('${COACH_USER}', 'coach.hack@gmail.com', now());
    INSERT INTO public.riviera_coaches (id, auth_user_id, coach_code, nombre, especialidades)
    VALUES ('${COACH_ID}', '${COACH_USER}', 'COACH-001', 'Prof. Roberto M', ARRAY['Volea', 'Bandeja']);
    INSERT INTO public.coach_club_memberships (coach_id, organizador_id, status)
    VALUES ('${COACH_ID}', '${HACK_ORG}', 'ACTIVE');
    INSERT INTO public.coach_club_memberships (coach_id, organizador_id, status)
    VALUES ('${COACH_ID}', '${PADELITO_ORG}', 'ACTIVE');

    -- 1. Alumno Verificado (Diego)
    INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('${STUDENT_VERIFIED_USER}', 'diego@gmail.com', now());
    INSERT INTO public.users (id, email, name) VALUES ('${STUDENT_VERIFIED_USER}', 'diego@gmail.com', 'Diego Palomares');
    INSERT INTO public.riviera_jugadores (id, nombre, email, organizador_id)
    VALUES ('${JUGADOR_DIEGO}', 'Diego Palomares', 'diego@gmail.com', '${HACK_ORG}');
    INSERT INTO public.riviera_official_player_identity (official_player_key, canonical_riviera_jugador_id, riviera_id)
    VALUES ('${OFFICIAL_KEY_DIEGO}', '${JUGADOR_DIEGO}', 'RIV-00000356');

    -- Relación coaching de Diego en Hack
    INSERT INTO public.coach_player_relationships (id, coach_id, jugador_id, organizador_id, is_primary)
    VALUES ('f1111111-1111-4111-8111-111111111111', '${COACH_ID}', '${JUGADOR_DIEGO}', '${HACK_ORG}', true);
    INSERT INTO public.coach_player_class_balances (relationship_id, organizador_id, coach_id, jugador_id, balance_classes, total_classes_given)
    VALUES ('f1111111-1111-4111-8111-111111111111', '${HACK_ORG}', '${COACH_ID}', '${JUGADOR_DIEGO}', 5, 0);
    INSERT INTO public.coach_class_ledger (relationship_id, organizador_id, coach_id, jugador_id, delta, tipo, notas, recorded_by)
    VALUES ('f1111111-1111-4111-8111-111111111111', '${HACK_ORG}', '${COACH_ID}', '${JUGADOR_DIEGO}', 5, 'ASSIGN', 'Paquete inicial', '${HACK_ORG}');

    -- 2. Alumno No Verificado (Carlos) - email_confirmed_at IS NULL
    INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('${STUDENT_UNVERIFIED_USER}', 'carlos@gmail.com', NULL);
    INSERT INTO public.users (id, email, name) VALUES ('${STUDENT_UNVERIFIED_USER}', 'carlos@gmail.com', 'Carlos R');
    INSERT INTO public.riviera_jugadores (id, nombre, email, organizador_id)
    VALUES ('${JUGADOR_CARLOS}', 'Carlos Rodriguez', 'carlos@gmail.com', '${HACK_ORG}');
    INSERT INTO public.riviera_official_player_identity (canonical_riviera_jugador_id, riviera_id)
    VALUES ('${JUGADOR_CARLOS}', 'RIV-00000539');

    -- 3. Perfil Sin Correo (Kevin)
    INSERT INTO public.riviera_jugadores (id, nombre, email, organizador_id)
    VALUES ('${JUGADOR_KEVIN_NO_EMAIL}', 'Kevin Perez', NULL, '${HACK_ORG}');
    INSERT INTO public.riviera_official_player_identity (canonical_riviera_jugador_id, riviera_id)
    VALUES ('${JUGADOR_KEVIN_NO_EMAIL}', 'RIV-00000999');

    -- 4. Perfil Previamente Vinculado (Pedro) a PREVIOUS_OWNER_USER
    INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('${PREVIOUS_OWNER_USER}', 'pedro.original@gmail.com', now());
    INSERT INTO public.riviera_jugadores (id, nombre, email, organizador_id)
    VALUES ('${JUGADOR_PEDRO}', 'Pedro Torres', 'pedro.original@gmail.com', '${HACK_ORG}');
    INSERT INTO public.riviera_official_player_identity (canonical_riviera_jugador_id, riviera_id)
    VALUES ('${JUGADOR_PEDRO}', 'RIV-00000543');
    INSERT INTO public.coach_student_account_links (jugador_id, auth_user_id, organizador_id, verification_method)
    VALUES ('${JUGADOR_PEDRO}', '${PREVIOUS_OWNER_USER}', '${HACK_ORG}', 'CLUB_ADMIN');

    -- Relación coaching de Pedro
    INSERT INTO public.coach_player_relationships (id, coach_id, jugador_id, organizador_id, is_primary)
    VALUES ('f2222222-2222-4222-8222-222222222222', '${COACH_ID}', '${JUGADOR_PEDRO}', '${HACK_ORG}', true);
    INSERT INTO public.coach_player_class_balances (relationship_id, organizador_id, coach_id, jugador_id, balance_classes, total_classes_given)
    VALUES ('f2222222-2222-4222-8222-222222222222', '${HACK_ORG}', '${COACH_ID}', '${JUGADOR_PEDRO}', 8, 2);

    -- 5. Colisión de correos: dos perfiles con 'colision@gmail.com' en Hack
    INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('${COLLISION_USER}', 'colision@gmail.com', now());
    INSERT INTO public.riviera_jugadores (id, nombre, email, organizador_id)
    VALUES ('${JUGADOR_COLLISION_1}', 'Jugador Colision Uno', 'colision@gmail.com', '${HACK_ORG}');
    INSERT INTO public.riviera_official_player_identity (canonical_riviera_jugador_id, riviera_id)
    VALUES ('${JUGADOR_COLLISION_1}', 'RIV-00000771');
    INSERT INTO public.riviera_jugadores (id, nombre, email, organizador_id)
    VALUES ('${JUGADOR_COLLISION_2}', 'Jugador Colision Dos', 'colision@gmail.com', '${HACK_ORG}');
    INSERT INTO public.riviera_official_player_identity (canonical_riviera_jugador_id, riviera_id)
    VALUES ('${JUGADOR_COLLISION_2}', 'RIV-00000772');

    -- 6. Multiclub Diego: perfil en Padelito vinculado a la misma official_player_key
    INSERT INTO public.riviera_jugadores (id, nombre, email, organizador_id)
    VALUES ('${JUGADOR_DIEGO_PADELITO}', 'Diego Palomares', 'diego@gmail.com', '${PADELITO_ORG}');
    INSERT INTO public.riviera_official_player_profile_link (official_player_key, riviera_jugador_id, organizer_id)
    VALUES ('${OFFICIAL_KEY_DIEGO}', '${JUGADOR_DIEGO_PADELITO}', '${PADELITO_ORG}');

    INSERT INTO public.coach_player_relationships (id, coach_id, jugador_id, organizador_id, is_primary)
    VALUES ('f3333333-3333-4333-8333-333333333333', '${COACH_ID}', '${JUGADOR_DIEGO_PADELITO}', '${PADELITO_ORG}', false);
    INSERT INTO public.coach_player_class_balances (relationship_id, organizador_id, coach_id, jugador_id, balance_classes, total_classes_given)
    VALUES ('f3333333-3333-4333-8333-333333333333', '${PADELITO_ORG}', '${COACH_ID}', '${JUGADOR_DIEGO_PADELITO}', 2, 1);

    -- Vínculo preexistente de Rewards de Diego para comprobar que NO se modifica
    INSERT INTO public.rewards_player_links (jugador_id, organizador_id, auth_user_id)
    VALUES ('${JUGADOR_DIEGO}', '${HACK_ORG}', '${STUDENT_VERIFIED_USER}');
  `);

  console.log("✅ Fixtures cargados para todos los escenarios.\n");

  // Contador inicial de rewards_player_links
  const countRewardsInitial = (await db.query(`SELECT count(*) FROM public.rewards_player_links;`)).rows[0].count;

  // ── PRUEBA 1: Alumno correctamente autenticado y verificado ────────────────
  console.log("▶ [PRUEBA 1] Alumno autenticado y verificado consulta Mi Coaching:");
  await db.exec(`SET request.jwt.claim.sub = '${STUDENT_VERIFIED_USER}';`);
  const res1 = await db.query(`SELECT public.get_student_coaching_overview() AS res;`);
  const data1 = res1.rows[0].res;
  if (!data1.ok || !data1.linked) throw new Error("Prueba 1 falló: debe devolver linked = true");
  if (data1.riviera_id !== "RIV-00000356") throw new Error(`Prueba 1 falló: riviera_id incorrecto: ${data1.riviera_id}`);
  console.log("  - OK. Perfil resuelto con Riviera ID:", data1.riviera_id);

  // ── PRUEBA 2: Alumno con cuenta de correo no verificada ────────────────────
  console.log("\n▶ [PRUEBA 2] Alumno con cuenta de correo NO verificada intenta vincularse:");
  await db.exec(`SET request.jwt.claim.sub = '${STUDENT_UNVERIFIED_USER}';`);
  const res2 = await db.query(`SELECT public.link_student_by_riviera_id('RIV-00000539') AS res;`);
  const data2 = res2.rows[0].res;
  if (data2.ok !== false || !data2.error.includes("no ha sido verificada")) {
    throw new Error(`Prueba 2 falló: debe rechazar cuenta sin email verificado. Obtenido: ${JSON.stringify(data2)}`);
  }
  console.log("  - OK. Rechazado correctamente:", data2.error);

  // ── PRUEBA 3: Perfil deportivo sin correo registrado ──────────────────────
  console.log("\n▶ [PRUEBA 3] Intento de reclamar perfil deportivo sin correo registrado en el club:");
  await db.exec(`SET request.jwt.claim.sub = '${STUDENT_VERIFIED_USER}';`);
  const res3 = await db.query(`SELECT public.link_student_by_riviera_id('RIV-00000999') AS res;`);
  const data3 = res3.rows[0].res;
  if (data3.ok !== false || !data3.error.includes("no cuenta con correo registrado")) {
    throw new Error(`Prueba 3 falló: debe exigir vinculación por club si no tiene correo. Obtenido: ${JSON.stringify(data3)}`);
  }
  // Verificar que el correo en riviera_jugadores NO fue alterado
  const kevinEmail = (await db.query(`SELECT email FROM public.riviera_jugadores WHERE id = '${JUGADOR_KEVIN_NO_EMAIL}';`)).rows[0].email;
  if (kevinEmail !== null) {
    throw new Error(`Prueba 3 falló: el correo de riviera_jugadores no debió alterarse.`);
  }
  console.log("  - OK. Rechazado y correo protegido (NULL preservado):", data3.error);

  // ── PRUEBA 4: Perfil vinculado previamente a otro usuario (Anti-hijack) ───
  console.log("\n▶ [PRUEBA 4] Intento de reclamar un perfil ya vinculado a otro usuario:");
  // Un atacante con correo verificado intenta reclamar a Pedro
  const ATTACKER = "aaaaaaaa-9999-4999-8999-999999999999";
  await db.exec(`
    INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('${ATTACKER}', 'atacante@gmail.com', now());
    SET request.jwt.claim.sub = '${ATTACKER}';
  `);
  const res4 = await db.query(`SELECT public.link_student_by_riviera_id('RIV-00000543') AS res;`);
  const data4 = res4.rows[0].res;
  if (data4.ok !== false || !data4.error.includes("ya se encuentra vinculado a otra cuenta")) {
    throw new Error(`Prueba 4 falló: debe impedir robo de perfil ya vinculado. Obtenido: ${JSON.stringify(data4)}`);
  }
  // Verificar que el titular en coach_student_account_links sigue siendo el original
  const pedroOwner = (await db.query(`SELECT auth_user_id FROM public.coach_student_account_links WHERE jugador_id = '${JUGADOR_PEDRO}';`)).rows[0].auth_user_id;
  if (pedroOwner !== PREVIOUS_OWNER_USER) {
    throw new Error(`Prueba 4 falló: el titular fue alterado.`);
  }
  console.log("  - OK. Intento de robo denegado y titularidad preservada:", data4.error);

  // ── PRUEBA 5: Intento de reclamar un Riviera ID ajeno ──────────────────────
  console.log("\n▶ [PRUEBA 5] Intento de reclamar Riviera ID de otra persona (correo no coincide):");
  const OTHER_STUDENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  await db.exec(`
    INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('${OTHER_STUDENT}', 'otro.alumno@gmail.com', now());
    SET request.jwt.claim.sub = '${OTHER_STUDENT}';
  `);
  const res5 = await db.query(`SELECT public.link_student_by_riviera_id('RIV-00000539') AS res;`);
  const data5 = res5.rows[0].res;
  if (data5.ok !== false || !data5.error.includes("no coincide con el registrado")) {
    throw new Error(`Prueba 5 falló: debe rechazar cuando los correos difieren. Obtenido: ${JSON.stringify(data5)}`);
  }
  console.log("  - OK. Rechazo seguro por no coincidencia de correo:", data5.error);

  // ── PRUEBA 6: Dos perfiles con correos coincidentes (colisión en club) ────
  console.log("\n▶ [PRUEBA 6] Dos perfiles con el mismo correo registrado en el club (ambigüedad):");
  await db.exec(`SET request.jwt.claim.sub = '${COLLISION_USER}';`);
  const res6 = await db.query(`SELECT public.link_student_by_riviera_id('RIV-00000771') AS res;`);
  const data6 = res6.rows[0].res;
  if (data6.ok !== false || !data6.error.includes("múltiples perfiles")) {
    throw new Error(`Prueba 6 falló: debe exigir vinculación por club ante colisión. Obtenido: ${JSON.stringify(data6)}`);
  }
  console.log("  - OK. Detección de colisión previene ambigüedad:", data6.error);

  // ── PRUEBA 7: Alumno perteneciente a distintos clubes (multiclub) ──────────
  console.log("\n▶ [PRUEBA 7] Alumno con perfiles en distintos clubes (Hack y Padelito):");
  await db.exec(`SET request.jwt.claim.sub = '${STUDENT_VERIFIED_USER}';`);
  const res7 = await db.query(`SELECT public.get_student_coaching_overview() AS res;`);
  const data7 = res7.rows[0].res;
  if (!Array.isArray(data7.relationships) || data7.relationships.length !== 2) {
    throw new Error(`Prueba 7 falló: debe devolver las relaciones de ambos clubes. Total obtenido: ${data7.relationships?.length}`);
  }
  const clubNames = data7.relationships.map(r => r.club.nombre);
  if (!clubNames.includes("Hackpadel") || !clubNames.includes("Padelito Warehouse")) {
    throw new Error(`Prueba 7 falló: faltan clubes en el resultado: ${JSON.stringify(clubNames)}`);
  }
  console.log("  - OK. Multiclub unificado correctamente:", clubNames.join(", "));

  // ── PRUEBA 8: Lectura de saldos e historial de otro alumno (Aislamiento) ───
  console.log("\n▶ [PRUEBA 8] Aislamiento: Alumno de Carlos intenta leer balances de Diego:");
  await db.exec(`SET request.jwt.claim.sub = '${STUDENT_UNVERIFIED_USER}';`);
  const res8 = await db.query(`SELECT public.get_student_coaching_overview() AS res;`);
  const data8 = res8.rows[0].res;
  if (data8.relationships.length !== 0) {
    throw new Error(`Prueba 8 falló: Alumno no verificado vio relaciones ajenas.`);
  }
  console.log("  - OK. Aislamiento total: 0 relaciones ajenas expuestas.");

  // ── PRUEBA 9: Confirmación de que NO se alteraron vínculos de Rewards ──────
  console.log("\n▶ [PRUEBA 9] Integridad de Rewards: Confirmar que rewards_player_links no fue modificado:");
  const countRewardsFinal = (await db.query(`SELECT count(*) FROM public.rewards_player_links;`)).rows[0].count;
  if (countRewardsInitial !== countRewardsFinal) {
    throw new Error(`Prueba 9 falló: rewards_player_links cambió de ${countRewardsInitial} a ${countRewardsFinal}`);
  }
  console.log("  - OK. Inmutabilidad de Rewards verificada (filas iniciales == filas finales).");

  // ── PRUEBA 10: Vinculación autorizada por el administrador del club ───────
  console.log("\n▶ [PRUEBA 10] Vinculación autorizada desde el administrador del club:");
  await db.exec(`SET request.jwt.claim.sub = '${HACK_ORG}';`);
  // Hack vincula a Carlos (ahora confirmamos su email para simular verificación)
  await db.exec(`UPDATE auth.users SET email_confirmed_at = now() WHERE id = '${STUDENT_UNVERIFIED_USER}';`);
  const res10 = await db.query(`
    SELECT public.link_coach_student_by_club('${HACK_ORG}', '${JUGADOR_CARLOS}', 'carlos@gmail.com') AS res;
  `);
  const data10 = res10.rows[0].res;
  if (!data10.ok) {
    throw new Error(`Prueba 10 falló: la vinculación por club debió ser exitosa. Obtenido: ${JSON.stringify(data10)}`);
  }
  console.log("  - OK. Administrador del club vinculó con éxito al alumno verificado:", data10.nombre);

  console.log("\n========================================================");
  console.log("🎉  TODAS LAS 10 PRUEBAS OBLIGATORIAS DE SEGURIDAD PASARON");
  console.log("========================================================\n");
}

runHardeningTests().catch((e) => {
  console.error("❌ ERROR EN PRUEBAS:", e);
  process.exit(1);
});
