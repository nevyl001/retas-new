/**
 * @jest-environment node
 *
 * Pruebas de integración SQL en PostgreSQL WASM (PGlite):
 * 1. Corrección de expires_at NOT NULL en rewards_lots con fecha canje_hasta de la campaña.
 * 2. Acreditación automática integral sin requerir aprobación manual.
 * 3. Filtro de participación comprobada: no otorgar puntos por inscripción simple sin juego.
 * 4. Aislamiento por club anfitrión real del evento (incluso si el jugador es de otro club).
 * 5. Idempotencia absoluta ante reintentos, recargas o llamadas repetidas (cero duplicados).
 * 6. Recuperación idempotente de los 8 jugadores del americano y resolución de errores previos.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import type { PGlite as PGliteType } from "@electric-sql/pglite";

const nodeBuffer = require("buffer");
if (typeof (global as { Blob?: unknown }).Blob === "undefined") {
  (global as { Blob?: unknown }).Blob = nodeBuffer.Blob;
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let i = 0;
  let inDollarQuote: string | null = null;
  let inSingleQuote = false;

  while (i < sql.length) {
    if (inDollarQuote) {
      if (sql.startsWith(inDollarQuote, i)) {
        current += inDollarQuote;
        i += inDollarQuote.length;
        inDollarQuote = null;
        continue;
      }
      current += sql[i];
      i++;
      continue;
    }

    if (inSingleQuote) {
      if (sql[i] === "'" && sql[i + 1] === "'") {
        current += "''";
        i += 2;
        continue;
      }
      if (sql[i] === "'") {
        inSingleQuote = false;
      }
      current += sql[i];
      i++;
      continue;
    }

    if (sql.startsWith("--", i)) {
      const nl = sql.indexOf("\n", i);
      if (nl === -1) break;
      i = nl + 1;
      continue;
    }

    if (sql[i] === "$") {
      const match = sql.slice(i).match(/^(\$[a-zA-Z0-9_]*\$)/);
      if (match) {
        inDollarQuote = match[1];
        current += inDollarQuote;
        i += inDollarQuote.length;
        continue;
      }
    }

    if (sql[i] === "'") {
      inSingleQuote = true;
      current += "'";
      i++;
      continue;
    }

    if (sql[i] === ";") {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        statements.push(trimmed);
      }
      current = "";
      i++;
      continue;
    }

    current += sql[i];
    i++;
  }

  const trailing = current.trim();
  if (trailing.length > 0) {
    statements.push(trailing);
  }

  return statements;
}

describe("Riviera Rewards 0061 — Acreditación Automática, expires_at y Recuperación", () => {
  let db: PGliteType;

  const CLUB_PADELITO = "11111111-1111-4111-a111-111111111111"; // Club anfitrión (Padelito Warehouse)
  const CLUB_HACKPADEL = "22222222-2222-4222-a222-222222222222"; // Club origen de jugadores
  const AMERICANO_ID = "33333333-3333-4333-a333-333333333333";

  // 8 jugadores del Americano
  const PLAYERS = [
    { id: "aaaaaaaa-1111-4aaa-aaaa-aaaaaaaaaaaa", nombre: "Ivan Cazares", homeOrg: CLUB_HACKPADEL },
    { id: "aaaaaaaa-2222-4aaa-aaaa-aaaaaaaaaaaa", nombre: "Ricardo P", homeOrg: CLUB_HACKPADEL },
    { id: "aaaaaaaa-3333-4aaa-aaaa-aaaaaaaaaaaa", nombre: "Jesús Fernando", homeOrg: CLUB_PADELITO },
    { id: "aaaaaaaa-4444-4aaa-aaaa-aaaaaaaaaaaa", nombre: "Lalo B", homeOrg: CLUB_HACKPADEL },
    { id: "aaaaaaaa-5555-4aaa-aaaa-aaaaaaaaaaaa", nombre: "Paco", homeOrg: CLUB_HACKPADEL },
    { id: "aaaaaaaa-6666-4aaa-aaaa-aaaaaaaaaaaa", nombre: "Said C", homeOrg: CLUB_HACKPADEL },
    { id: "aaaaaaaa-7777-4aaa-aaaa-aaaaaaaaaaaa", nombre: "César G", homeOrg: CLUB_PADELITO },
    { id: "aaaaaaaa-8888-4aaa-aaaa-aaaaaaaaaaaa", nombre: "Isbi", homeOrg: CLUB_HACKPADEL },
  ];

  beforeAll(async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    db = new PGlite();

    // 1. Esquema base simulado
    await db.exec(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated;
        END IF;
      END $$;

      CREATE SCHEMA IF NOT EXISTS auth;

      CREATE TABLE IF NOT EXISTS auth.users (
        id uuid PRIMARY KEY,
        email text
      );

      CREATE TABLE IF NOT EXISTS public.tournaments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        organizador_id uuid,
        format text DEFAULT 'americano'
      );

      CREATE TABLE IF NOT EXISTS public.duelos_2v2 (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organizador_id uuid NOT NULL
      );

      CREATE TABLE IF NOT EXISTS public.torneo_express (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organizador_id uuid NOT NULL
      );

      CREATE TABLE IF NOT EXISTS public.ligas (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organizador_id uuid NOT NULL
      );

      CREATE TABLE IF NOT EXISTS public.liga_jornadas (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        liga_id uuid NOT NULL
      );

      CREATE TABLE IF NOT EXISTS public.riviera_jugadores (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organizador_id uuid,
        nombre text NOT NULL,
        categoria text DEFAULT 'open',
        estado text DEFAULT 'activo'
      );

      CREATE TABLE IF NOT EXISTS public.jugador_participaciones (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        jugador_id uuid NOT NULL,
        tipo_evento text NOT NULL,
        evento_id uuid NOT NULL,
        evento_nombre text,
        fecha date,
        pareja_con text,
        resultado text,
        sets_favor integer DEFAULT 0,
        sets_contra integer DEFAULT 0,
        puntos_obtenidos integer DEFAULT 0,
        metadata jsonb DEFAULT '{}'::jsonb,
        created_at timestamptz DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.organizer_player_access (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_organizador_id uuid NOT NULL,
        grantee_organizer_id uuid NOT NULL,
        jugador_id uuid NOT NULL,
        local_jugador_id uuid NOT NULL,
        is_active boolean DEFAULT true
      );

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$ LANGUAGE sql STABLE;

      CREATE OR REPLACE FUNCTION public.is_master_admin() RETURNS boolean AS $$
        SELECT COALESCE(current_setting('request.jwt.claim.is_master', true) = 'true', false);
      $$ LANGUAGE sql STABLE;

      CREATE OR REPLACE FUNCTION public._resolve_official_player_key(p_id uuid)
      RETURNS uuid AS $$
        SELECT p_id;
      $$ LANGUAGE sql STABLE;

      CREATE OR REPLACE FUNCTION public.riviera_participacion_expected_host_org(
        p_tipo_evento text,
        p_evento_id text
      )
      RETURNS uuid AS $$
        SELECT CASE p_tipo_evento
          WHEN 'americano' THEN (
            SELECT t.user_id FROM public.tournaments t WHERE t.id = NULLIF(trim(p_evento_id), '')::uuid LIMIT 1
          )
          WHEN 'reta' THEN (
            SELECT t.user_id FROM public.tournaments t WHERE t.id = NULLIF(trim(p_evento_id), '')::uuid LIMIT 1
          )
          ELSE NULL
        END;
      $$ LANGUAGE sql STABLE;
    `);

    // 2. Ejecutar migraciones
    const runMigration = async (fileName: string, allowSkipLegacyCron = false) => {
      const sqlPath = resolve(__dirname, `../../../supabase/migrations/${fileName}`);
      const sqlContent = readFileSync(sqlPath, "utf8");
      const statements = splitSqlStatements(sqlContent);
      for (const stmt of statements) {
        if (
          allowSkipLegacyCron &&
          (stmt.includes("cron.schedule") ||
            stmt.includes("pg_cron") ||
            stmt.includes("pg_extension"))
        ) {
          continue;
        }
        await db.exec(stmt);
      }
    };

    await runMigration("0058_riviera_rewards_phase1.sql", true);
    await runMigration("0059_rewards_multiclub_identity_resolution.sql", true);

    // Simular el estado de error de producción: la tabla rewards_lots tenía
    // la columna expires_at timestamptz NOT NULL pero las inserciones de 0058 no la poblaban.
    await db.exec(`
      ALTER TABLE public.rewards_lots ADD COLUMN IF NOT EXISTS expires_at timestamptz;
      ALTER TABLE public.rewards_lots ALTER COLUMN expires_at SET NOT NULL;
    `);

    // 3. Ejecutar migración 0061 (la solución) — AL 100% SIN OMITIR NINGUNA DECLARACIÓN
    await runMigration("0061_rewards_auto_accrual_and_expires_at.sql", false);
  });

  afterAll(async () => {
    if (db) {
      await db.close();
    }
  });

  const setAuthSession = async (userId: string | null, isMaster = false) => {
    if (userId) {
      await db.exec(`SELECT set_config('request.jwt.claim.sub', '${userId}', false);`);
    } else {
      await db.exec(`SELECT set_config('request.jwt.claim.sub', '', false);`);
    }
    await db.exec(`SELECT set_config('request.jwt.claim.is_master', '${isMaster}', false);`);
  };

  it("1. expires_at en rewards_lots es NOT NULL y se puebla con canje_hasta de la campaña", async () => {
    await setAuthSession(CLUB_PADELITO);

    // Crear campaña "Octubre Loco"
    const campRes = await db.query<{ rewards_save_campaign: string }>(`
      SELECT public.rewards_save_campaign(jsonb_build_object(
        'organizador_id', '${CLUB_PADELITO}',
        'nombre', 'Octubre Loco',
        'estado', 'activa',
        'acumula_desde', '2026-10-01T06:00:00Z',
        'acumula_hasta', '2026-11-01T06:00:00Z',
        'canje_desde', '2026-11-01T06:00:00Z',
        'canje_hasta', '2026-12-01T06:00:00Z',
        'puntos_por_participacion', 10,
        'modalidades', jsonb_build_array('americano', 'reta_equipos')
      ));
    `);
    const campId = campRes.rows[0].rewards_save_campaign;
    expect(campId).toBeDefined();

    // Crear torneo Americano con anfitrión CLUB_PADELITO
    await db.exec(`
      INSERT INTO public.tournaments (id, user_id, format)
      VALUES ('${AMERICANO_ID}', '${CLUB_PADELITO}', 'americano')
      ON CONFLICT DO NOTHING;
    `);

    // Insertar jugadores
    for (const p of PLAYERS) {
      await db.exec(`
        INSERT INTO public.riviera_jugadores (id, nombre, organizador_id)
        VALUES ('${p.id}', '${p.nombre}', '${p.homeOrg}')
        ON CONFLICT DO NOTHING;
      `);
    }

    // Verificar que la columna expires_at existe y tiene NOT NULL
    const colCheck = await db.query<{ is_nullable: string }>(`
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_name = 'rewards_lots' AND column_name = 'expires_at';
    `);
    expect(colCheck.rows[0].is_nullable).toBe("NO");
  });

  it("2. Acreditación automática integral: toda participación real recibe puntos sin aprobación manual", async () => {
    await setAuthSession(CLUB_PADELITO);

    // Insertar participación de Jesús Fernando (jugador del club anfitrión)
    const jf = PLAYERS[2]; // Jesús Fernando
    const partRes = await db.query<{ id: string }>(`
      INSERT INTO public.jugador_participaciones (
        jugador_id, tipo_evento, evento_id, evento_nombre, resultado,
        puntos_obtenidos, sets_favor, sets_contra, fecha,
        metadata
      )
      VALUES (
        '${jf.id}', 'americano', '${AMERICANO_ID}', 'Americano Dinámico - Sesión', 'victoria',
        45, 12, 4, '2026-10-12',
        jsonb_build_object(
          'organizador_id', '${CLUB_PADELITO}',
          'club_name', 'Padelito Warehouse',
          'partidos', 4,
          'subtipo', 'americano_cierre'
        )
      )
      RETURNING id;
    `);
    const partId = partRes.rows[0].id;

    // Verificar que el review fue aprobado AUTOMÁTICAMENTE
    const reviewRes = await db.query<{ estado: string; validation_source: string; campaign_id: string }>(`
      SELECT estado, validation_source, campaign_id
      FROM public.rewards_participation_reviews
      WHERE participacion_id = '${partId}';
    `);
    expect(reviewRes.rows[0].estado).toBe("aprobada");
    expect(reviewRes.rows[0].validation_source).toBe("automatic");

    // Verificar que el lote se acreditó inmediatamente en rewards_lots
    const lotRes = await db.query<{
      puntos_originales: number;
      puntos_restantes: number;
      expires_at: string;
      anulado: boolean;
    }>(`
      SELECT puntos_originales, puntos_restantes, expires_at, anulado
      FROM public.rewards_lots
      WHERE participacion_id = '${partId}';
    `);
    expect(lotRes.rows.length).toBe(1);
    expect(lotRes.rows[0].puntos_originales).toBe(10);
    expect(lotRes.rows[0].puntos_restantes).toBe(10);
    expect(lotRes.rows[0].anulado).toBe(false);
    expect(lotRes.rows[0].expires_at).toBeDefined();
    // Debe coincidir con el canje_hasta de la campaña (2026-12-01)
    expect(new Date(lotRes.rows[0].expires_at).toISOString()).toBe("2026-12-01T06:00:00.000Z");

    // Verificar que rewards_accrual_queue quedó en 'acreditada' sin error
    const queueRes = await db.query<{ estado: string; last_error: string | null }>(`
      SELECT estado, last_error
      FROM public.rewards_accrual_queue
      WHERE participacion_id = '${partId}';
    `);
    expect(queueRes.rows[0].estado).toBe("acreditada");
    expect(queueRes.rows[0].last_error).toBeNull();
  });

  it("3. Aislamiento por club anfitrión: jugador de otro club (Lalo B) acumula puntos en Padelito", async () => {
    await setAuthSession(CLUB_PADELITO);

    // Lalo B está registrado en Hack Padel (CLUB_HACKPADEL)
    const lalo = PLAYERS[3]; // Lalo B
    expect(lalo.homeOrg).toBe(CLUB_HACKPADEL);

    // Juega el Americano en Padelito Warehouse (CLUB_PADELITO)
    const partRes = await db.query<{ id: string }>(`
      INSERT INTO public.jugador_participaciones (
        jugador_id, tipo_evento, evento_id, evento_nombre, resultado,
        puntos_obtenidos, sets_favor, sets_contra, fecha,
        metadata
      )
      VALUES (
        '${lalo.id}', 'americano', '${AMERICANO_ID}', 'Americano Dinámico - Sesión', 'victoria',
        45, 10, 6, '2026-10-12',
        jsonb_build_object(
          'organizador_id', '${CLUB_PADELITO}',
          'club_name', 'Padelito Warehouse',
          'partidos', 4,
          'subtipo', 'americano_cierre'
        )
      )
      RETURNING id;
    `);
    const partId = partRes.rows[0].id;

    // Los puntos de Rewards se deben acreditar a Padelito Warehouse (CLUB_PADELITO)
    const lotRes = await db.query<{ organizador_id: string; puntos_restantes: number }>(`
      SELECT organizador_id, puntos_restantes
      FROM public.rewards_lots
      WHERE participacion_id = '${partId}';
    `);
    expect(lotRes.rows.length).toBe(1);
    expect(lotRes.rows[0].organizador_id).toBe(CLUB_PADELITO);
    expect(lotRes.rows[0].puntos_restantes).toBe(10);
  });

  it("4. Filtro de comprobación: una simple inscripción o sin juego comprobado NO recibe puntos", async () => {
    await setAuthSession(CLUB_PADELITO);

    // Jugador que solo se inscribió pero no jugó (0 puntos, 0 sets, 0 partidos, subtipo inscripcion)
    const dummyPlayer = "aaaaaaaa-9999-4aaa-aaaa-aaaaaaaaaaaa";
    await db.exec(`
      INSERT INTO public.riviera_jugadores (id, nombre, organizador_id)
      VALUES ('${dummyPlayer}', 'Jugador No Show', '${CLUB_PADELITO}')
      ON CONFLICT DO NOTHING;
    `);

    // Inserción con subtipo inscripción
    const inscRes = await db.query<{ id: string }>(`
      INSERT INTO public.jugador_participaciones (
        jugador_id, tipo_evento, evento_id, evento_nombre, resultado,
        puntos_obtenidos, sets_favor, sets_contra, fecha,
        metadata
      )
      VALUES (
        '${dummyPlayer}', 'americano', '${AMERICANO_ID}', 'Inscripción Americano', 'participación',
        0, 0, 0, '2026-10-12',
        jsonb_build_object(
          'organizador_id', '${CLUB_PADELITO}',
          'subtipo', 'inscripcion'
        )
      )
      RETURNING id;
    `);

    // No debe existir review ni lote de rewards
    const lotRes = await db.query(`
      SELECT * FROM public.rewards_lots WHERE participacion_id = '${inscRes.rows[0].id}';
    `);
    expect(lotRes.rows.length).toBe(0);
  });

  it("5. Idempotencia y tolerancia a fallos: reintentos y recargas jamás duplican puntos", async () => {
    await setAuthSession(CLUB_PADELITO);

    const jf = PLAYERS[2]; // Jesús Fernando
    // Buscar su lote existente
    const beforeLots = await db.query<{ count: number }>(`
      SELECT count(*)::int as count FROM public.rewards_lots WHERE jugador_id = '${jf.id}';
    `);
    expect(beforeLots.rows[0].count).toBe(1);

    // Intentar re-encolar o re-procesar la misma participación
    const partRes = await db.query<{ id: string }>(`
      SELECT id FROM public.jugador_participaciones WHERE jugador_id = '${jf.id}' LIMIT 1;
    `);
    await db.exec(`SELECT public.rewards_enqueue_candidate('${partRes.rows[0].id}');`);

    // El número de lotes sigue siendo exactamente 1
    const afterLots = await db.query<{ count: number }>(`
      SELECT count(*)::int as count FROM public.rewards_lots WHERE jugador_id = '${jf.id}';
    `);
    expect(afterLots.rows[0].count).toBe(1);

    // Ejecutar rewards_recover_participaciones varias veces
    await db.exec(`SELECT public.rewards_recover_participaciones('${CLUB_PADELITO}');`);
    await db.exec(`SELECT public.rewards_recover_participaciones('${CLUB_PADELITO}');`);

    const finalLots = await db.query<{ count: number }>(`
      SELECT count(*)::int as count FROM public.rewards_lots WHERE jugador_id = '${jf.id}';
    `);
    expect(finalLots.rows[0].count).toBe(1);
  });

  it("6. Recuperación integral de los 8 inscritos del Americano", async () => {
    await setAuthSession(CLUB_PADELITO);

    // Insertar las participaciones restantes de los 8 jugadores del Americano
    for (const p of PLAYERS) {
      // Si ya tiene participación, saltar
      const check = await db.query<{ count: number }>(`
        SELECT count(*)::int as count FROM public.jugador_participaciones
        WHERE jugador_id = '${p.id}' AND evento_id = '${AMERICANO_ID}';
      `);
      if (check.rows[0].count === 0) {
        await db.exec(`
          INSERT INTO public.jugador_participaciones (
            jugador_id, tipo_evento, evento_id, evento_nombre, resultado,
            puntos_obtenidos, sets_favor, sets_contra, fecha,
            metadata
          )
          VALUES (
            '${p.id}', 'americano', '${AMERICANO_ID}', 'Americano Dinámico - Sesión', 'participación',
            20, 8, 8, '2026-10-12',
            jsonb_build_object(
              'organizador_id', '${CLUB_PADELITO}',
              'club_name', 'Padelito Warehouse',
              'partidos', 4,
              'subtipo', 'americano_cierre'
            )
          );
        `);
      }
    }

    // Ejecutar recuperación idempotente
    const recoverRes = await db.query<{ rewards_recover_participaciones: any }>(`
      SELECT public.rewards_recover_participaciones('${CLUB_PADELITO}');
    `);
    expect(recoverRes.rows[0].rewards_recover_participaciones).toBeDefined();

    // Comprobar que los 8 jugadores tienen su lote acreditado en Padelito Warehouse
    for (const p of PLAYERS) {
      const lot = await db.query<{ count: number }>(`
        SELECT count(*)::int as count
        FROM public.rewards_lots
        WHERE organizador_id = '${CLUB_PADELITO}'
          AND jugador_id = '${p.id}';
      `);
      expect(lot.rows[0].count).toBe(1);
    }

    // Comprobar que el listado de jugadores de rewards_list_players incluye a los 8
    const playersList = await db.query<{ nombre: string }>(`
      SELECT nombre FROM public.rewards_list_players('${CLUB_PADELITO}');
    `);
    const names = playersList.rows.map((r) => r.nombre);
    for (const p of PLAYERS) {
      expect(names).toContain(p.nombre);
    }
  });

  it("7. Participación con derrota, cero puntos deportivos y cero games ganados es 100% elegible", async () => {
    await setAuthSession(CLUB_PADELITO);

    const loserPlayer = "aaaaaaaa-0000-4aaa-aaaa-aaaaaaaaaaaa";
    await db.exec(`
      INSERT INTO public.riviera_jugadores (id, nombre, organizador_id)
      VALUES ('${loserPlayer}', 'Jugador Derrota Cero Puntos', '${CLUB_PADELITO}')
      ON CONFLICT DO NOTHING;
    `);

    // Participación real donde perdió todos sus juegos: 0 puntos obtenidos, 0 sets_favor,
    // pero con evidencia de juego (partidos = 3, subtipo americano_cierre, sets_contra = 18)
    const partRes = await db.query<{ id: string }>(`
      INSERT INTO public.jugador_participaciones (
        jugador_id, tipo_evento, evento_id, evento_nombre, resultado,
        puntos_obtenidos, sets_favor, sets_contra, fecha,
        metadata
      )
      VALUES (
        '${loserPlayer}', 'americano', '${AMERICANO_ID}', 'Americano Dinámico - Sesión', 'participación',
        0, 0, 18, '2026-10-12',
        jsonb_build_object(
          'organizador_id', '${CLUB_PADELITO}',
          'club_name', 'Padelito Warehouse',
          'partidos', 3,
          'partidos_perdidos', 3,
          'partidos_ganados', 0,
          'posicion', 8,
          'subtipo', 'americano_cierre'
        )
      )
      RETURNING id;
    `);
    const partId = partRes.rows[0].id;

    // Debe haberse acreditado automáticamente
    const lotRes = await db.query<{ puntos_originales: number; puntos_restantes: number }>(`
      SELECT puntos_originales, puntos_restantes
      FROM public.rewards_lots
      WHERE participacion_id = '${partId}';
    `);
    expect(lotRes.rows.length).toBe(1);
    expect(lotRes.rows[0].puntos_originales).toBe(10);
    expect(lotRes.rows[0].puntos_restantes).toBe(10);
  });

  it("8. Aislamiento y permisos: un organizador no puede consultar ni recuperar datos de otro club", async () => {
    // Sesión como Hackpadel (CLUB_HACKPADEL)
    await setAuthSession(CLUB_HACKPADEL);

    // Intentar listar jugadores de Padelito Warehouse
    await expect(
      db.query(`SELECT * FROM public.rewards_list_players('${CLUB_PADELITO}');`)
    ).rejects.toThrow(/Sin permiso sobre este club/);

    // Intentar ejecutar recuperación en Padelito Warehouse
    await expect(
      db.query(`SELECT public.rewards_recover_participaciones('${CLUB_PADELITO}');`)
    ).rejects.toThrow(/Sin permiso sobre este club/);

    // Intentar recuperación global sin ser master admin
    await expect(
      db.query(`SELECT public.rewards_recover_participaciones(NULL);`)
    ).rejects.toThrow(/Sin permiso para recuperación global de todos los clubes/);
  });

  it("9. Concurrencia: llamadas simultáneas generan exactamente una sola acreditación (cero duplicados)", async () => {
    await setAuthSession(CLUB_PADELITO);

    const concurrentPlayer = "bbbbbbbb-1111-4bbb-bbbb-bbbbbbbbbbbb";
    await db.exec(`
      INSERT INTO public.riviera_jugadores (id, nombre, organizador_id)
      VALUES ('${concurrentPlayer}', 'Jugador Concurrente', '${CLUB_PADELITO}')
      ON CONFLICT DO NOTHING;
    `);

    const partRes = await db.query<{ id: string }>(`
      INSERT INTO public.jugador_participaciones (
        jugador_id, tipo_evento, evento_id, evento_nombre, resultado,
        puntos_obtenidos, sets_favor, sets_contra, fecha,
        metadata
      )
      VALUES (
        '${concurrentPlayer}', 'americano', '${AMERICANO_ID}', 'Americano Dinámico - Sesión', 'victoria',
        30, 6, 2, '2026-10-12',
        jsonb_build_object(
          'organizador_id', '${CLUB_PADELITO}',
          'subtipo', 'americano_cierre'
        )
      )
      RETURNING id;
    `);
    const partId = partRes.rows[0].id;

    // Simular ejecuciones concurrentes / paralelas de rewards_enqueue_candidate
    await Promise.all([
      db.exec(`SELECT public.rewards_enqueue_candidate('${partId}');`),
      db.exec(`SELECT public.rewards_enqueue_candidate('${partId}');`),
      db.exec(`SELECT public.rewards_enqueue_candidate('${partId}');`),
    ]);

    // Verificar que solo existe exactamente 1 lote y 1 registro en ledger
    const lotRes = await db.query<{ count: number }>(`
      SELECT count(*)::int as count FROM public.rewards_lots WHERE participacion_id = '${partId}';
    `);
    expect(lotRes.rows[0].count).toBe(1);

    const ledgerRes = await db.query<{ count: number }>(`
      SELECT count(*)::int as count FROM public.rewards_ledger
      WHERE jugador_id = '${concurrentPlayer}' AND tipo = 'acreditacion';
    `);
    expect(ledgerRes.rows[0].count).toBe(1);
  });

  it("10. Anulación y corrección: invalidar participación revierte saldo en ledger y no se re-acredita", async () => {
    await setAuthSession(CLUB_PADELITO);

    const toCancelPlayer = "cccccccc-1111-4ccc-cccc-cccccccccccc";
    await db.exec(`
      INSERT INTO public.riviera_jugadores (id, nombre, organizador_id)
      VALUES ('${toCancelPlayer}', 'Jugador A Cancelar', '${CLUB_PADELITO}')
      ON CONFLICT DO NOTHING;
    `);

    const partRes = await db.query<{ id: string }>(`
      INSERT INTO public.jugador_participaciones (
        jugador_id, tipo_evento, evento_id, evento_nombre, resultado,
        puntos_obtenidos, sets_favor, sets_contra, fecha,
        metadata
      )
      VALUES (
        '${toCancelPlayer}', 'americano', '${AMERICANO_ID}', 'Americano Dinámico - Sesión', 'victoria',
        30, 6, 2, '2026-10-12',
        jsonb_build_object(
          'organizador_id', '${CLUB_PADELITO}',
          'subtipo', 'americano_cierre'
        )
      )
      RETURNING id;
    `);
    const partId = partRes.rows[0].id;

    // Verificar que inicialmente fue acreditado
    const lotBefore = await db.query<{ id: string; puntos_restantes: number; anulado: boolean }>(`
      SELECT id, puntos_restantes, anulado FROM public.rewards_lots WHERE participacion_id = '${partId}';
    `);
    expect(lotBefore.rows[0].puntos_restantes).toBe(10);
    expect(lotBefore.rows[0].anulado).toBe(false);

    // Invalidar la participación (ej. corrección o descalificación)
    await db.exec(`
      SELECT public.rewards_invalidate_participation('${CLUB_PADELITO}', '${partId}', 'Error en captura');
    `);

    // El lote queda anulado con saldo 0
    const lotAfter = await db.query<{ puntos_restantes: number; anulado: boolean }>(`
      SELECT puntos_restantes, anulado FROM public.rewards_lots WHERE participacion_id = '${partId}';
    `);
    expect(lotAfter.rows[0].puntos_restantes).toBe(0);
    expect(lotAfter.rows[0].anulado).toBe(true);

    // El ledger registra la reversión con puntos negativos (-10)
    const ledgerRev = await db.query<{ tipo: string; puntos: number; motivo: string }>(`
      SELECT tipo, puntos, motivo FROM public.rewards_ledger
      WHERE lot_id = '${lotBefore.rows[0].id}' AND tipo = 'reversion';
    `);
    expect(ledgerRev.rows.length).toBe(1);
    expect(ledgerRev.rows[0].puntos).toBe(-10);
    expect(ledgerRev.rows[0].motivo).toBe('Error en captura');

    // La revisión queda rechazada
    const revAfter = await db.query<{ estado: string }>(`
      SELECT estado FROM public.rewards_participation_reviews WHERE participacion_id = '${partId}';
    `);
    expect(revAfter.rows[0].estado).toBe('rechazada');

    // Ejecutar recuperación: NUNCA debe re-acreditar ni revertir una participación rechazada
    await db.exec(`SELECT public.rewards_recover_participaciones('${CLUB_PADELITO}');`);

    const lotFinal = await db.query<{ puntos_restantes: number; anulado: boolean }>(`
      SELECT puntos_restantes, anulado FROM public.rewards_lots WHERE participacion_id = '${partId}';
    `);
    expect(lotFinal.rows[0].puntos_restantes).toBe(0);
    expect(lotFinal.rows[0].anulado).toBe(true);
  });

  it("11. Fallo antes de crear la cola: registro durable en rewards_enqueue_failures y reconciliación sin navegador", async () => {
    await setAuthSession(CLUB_PADELITO);

    const failPlayer = "dddddddd-1111-4ddd-dddd-dddddddddddd";
    await db.exec(`
      INSERT INTO public.riviera_jugadores (id, nombre, organizador_id)
      VALUES ('${failPlayer}', 'Jugador Fallo Inicial', '${CLUB_PADELITO}')
      ON CONFLICT DO NOTHING;
    `);

    // Participación real
    const partRes = await db.query<{ id: string }>(`
      INSERT INTO public.jugador_participaciones (
        jugador_id, tipo_evento, evento_id, evento_nombre, resultado,
        puntos_obtenidos, sets_favor, sets_contra, fecha,
        metadata
      )
      VALUES (
        '${failPlayer}', 'americano', '${AMERICANO_ID}', 'Americano Dinámico - Sesión', 'victoria',
        35, 8, 4, '2026-10-12',
        jsonb_build_object(
          'organizador_id', '${CLUB_PADELITO}',
          'subtipo', 'americano_cierre'
        )
      )
      RETURNING id;
    `);
    const partId = partRes.rows[0].id;

    // Simular que ocurrió un fallo previo antes de encolar y se registró durablemente en rewards_enqueue_failures
    await db.exec(`
      INSERT INTO public.rewards_enqueue_failures (participacion_id, error, attempts)
      VALUES ('${partId}', 'Simulated transient connection timeout', 1)
      ON CONFLICT (participacion_id) DO UPDATE SET resolved_at = NULL;
    `);

    // El lote aún no existe
    const lotCheck = await db.query<{ count: number }>(`
      SELECT count(*)::int as count FROM public.rewards_lots WHERE participacion_id = '${partId}';
    `);
    // Si la inserción del trigger ya lo hubiera procesado, forzamos simulación eliminando el review/lot para probar la reconciliación
    if (lotCheck.rows[0].count > 0) {
      await db.exec(`
        DELETE FROM public.rewards_ledger WHERE lot_id IN (SELECT id FROM public.rewards_lots WHERE participacion_id = '${partId}');
        DELETE FROM public.rewards_lots WHERE participacion_id = '${partId}';
        DELETE FROM public.rewards_accrual_queue WHERE participacion_id = '${partId}';
        DELETE FROM public.rewards_participation_reviews WHERE participacion_id = '${partId}';
      `);
    }

    // Ejecutar el proceso en servidor (lo que corre en pg_cron cada minuto sin navegador)
    await setAuthSession(null); // simular proceso del sistema/cron
    await db.exec(`SELECT set_config('request.jwt.claim.is_master', 'true', false);`);
    const retryRes = await db.query<{ rewards_retry_accruals: number }>(`
      SELECT public.rewards_retry_accruals(100);
    `);
    expect(retryRes.rows[0].rewards_retry_accruals).toBeGreaterThan(0);

    // Verificar que rewards_enqueue_failures quedó marcado como resuelto
    const failRow = await db.query<{ resolved_at: string | null }>(`
      SELECT resolved_at FROM public.rewards_enqueue_failures WHERE participacion_id = '${partId}';
    `);
    expect(failRow.rows[0].resolved_at).not.toBeNull();

    // Verificar que el lote se generó y acreditó exitosamente
    const lotAfter = await db.query<{ puntos_originales: number; puntos_restantes: number }>(`
      SELECT puntos_originales, puntos_restantes FROM public.rewards_lots WHERE participacion_id = '${partId}';
    `);
    expect(lotAfter.rows.length).toBe(1);
    expect(lotAfter.rows[0].puntos_originales).toBe(10);
    expect(lotAfter.rows[0].puntos_restantes).toBe(10);
  });

  it("12. Recuperación acotada estricta: filtrar por evento y participaciones exactas no toca otros eventos", async () => {
    await setAuthSession(CLUB_PADELITO);

    const OTHER_EVENT_ID = "44444444-4444-4444-4444-444444444444";
    await db.exec(`
      INSERT INTO public.tournaments (id, user_id, format)
      VALUES ('${OTHER_EVENT_ID}', '${CLUB_PADELITO}', 'americano')
      ON CONFLICT DO NOTHING;
    `);

    const playerTarget = "eeeeeeee-1111-4eee-eeee-eeeeeeeeeeee";
    const playerOther = "eeeeeeee-2222-4eee-eeee-eeeeeeeeeeee";
    await db.exec(`
      INSERT INTO public.riviera_jugadores (id, nombre, organizador_id)
      VALUES ('${playerTarget}', 'Jugador Evento Target', '${CLUB_PADELITO}'),
             ('${playerOther}', 'Jugador Evento Otro', '${CLUB_PADELITO}')
      ON CONFLICT DO NOTHING;
    `);

    // Participación en evento objetivo
    const partTargetRes = await db.query<{ id: string }>(`
      INSERT INTO public.jugador_participaciones (
        jugador_id, tipo_evento, evento_id, evento_nombre, resultado,
        puntos_obtenidos, sets_favor, sets_contra, fecha, metadata
      ) VALUES (
        '${playerTarget}', 'americano', '${AMERICANO_ID}', 'Americano Dinámico - Sesión', 'victoria',
        40, 10, 2, '2026-10-12', jsonb_build_object('organizador_id', '${CLUB_PADELITO}', 'subtipo', 'americano_cierre')
      ) RETURNING id;
    `);
    const partTargetId = partTargetRes.rows[0].id;

    // Participación en otro evento
    const partOtherRes = await db.query<{ id: string }>(`
      INSERT INTO public.jugador_participaciones (
        jugador_id, tipo_evento, evento_id, evento_nombre, resultado,
        puntos_obtenidos, sets_favor, sets_contra, fecha, metadata
      ) VALUES (
        '${playerOther}', 'americano', '${OTHER_EVENT_ID}', 'Otro Torneo Distinto', 'victoria',
        40, 10, 2, '2026-10-12', jsonb_build_object('organizador_id', '${CLUB_PADELITO}', 'subtipo', 'americano_cierre')
      ) RETURNING id;
    `);
    const partOtherId = partOtherRes.rows[0].id;

    // Limpiar para simular estado pendiente en ambos
    await db.exec(`
      DELETE FROM public.rewards_ledger WHERE lot_id IN (SELECT id FROM public.rewards_lots WHERE participacion_id IN ('${partTargetId}', '${partOtherId}'));
      DELETE FROM public.rewards_lots WHERE participacion_id IN ('${partTargetId}', '${partOtherId}');
      DELETE FROM public.rewards_accrual_queue WHERE participacion_id IN ('${partTargetId}', '${partOtherId}');
      DELETE FROM public.rewards_participation_reviews WHERE participacion_id IN ('${partTargetId}', '${partOtherId}');
    `);

    // Ejecutar recuperación acotada ÚNICAMENTE al evento AMERICANO_ID y la participación partTargetId
    const scopedRes = await db.query<{ rewards_recover_participaciones: any }>(`
      SELECT public.rewards_recover_participaciones(
        '${CLUB_PADELITO}',
        NULL,
        '${AMERICANO_ID}',
        ARRAY['${partTargetId}']::uuid[]
      );
    `);
    expect(scopedRes.rows[0].rewards_recover_participaciones).toBeDefined();

    // Verificar que partTargetId fue acreditada
    const targetLot = await db.query<{ count: number }>(`
      SELECT count(*)::int as count FROM public.rewards_lots WHERE participacion_id = '${partTargetId}';
    `);
    expect(targetLot.rows[0].count).toBe(1);

    // Verificar que partOtherId NO fue tocada
    const otherLot = await db.query<{ count: number }>(`
      SELECT count(*)::int as count FROM public.rewards_lots WHERE participacion_id = '${partOtherId}';
    `);
    expect(otherLot.rows[0].count).toBe(0);

    // Repetir la recuperación acotada debe emitir 0 puntos adicionales
    const repeatRes = await db.query<{ rewards_recover_participaciones: any }>(`
      SELECT public.rewards_recover_participaciones(
        '${CLUB_PADELITO}',
        NULL,
        '${AMERICANO_ID}',
        ARRAY['${partTargetId}']::uuid[]
      );
    `);
    const repeatData = repeatRes.rows[0].rewards_recover_participaciones;
    expect(repeatData.recovered_queue_errors).toBe(0);
    expect(repeatData.recovered_missing_participations).toBe(0);
  });

  it("13. Lógica trivaluada segura: campos NULL no permiten que una inscripción no jugada pase el filtro", async () => {
    await setAuthSession(CLUB_PADELITO);

    const ghostPlayer = "ffffffff-1111-4fff-ffff-ffffffffffff";
    await db.exec(`
      INSERT INTO public.riviera_jugadores (id, nombre, organizador_id)
      VALUES ('${ghostPlayer}', 'Jugador Fantasma Incompleto', '${CLUB_PADELITO}')
      ON CONFLICT DO NOTHING;
    `);

    // Participación donde todo resultado, subtipo, sets y partidos son NULL
    const ghostRes = await db.query<{ id: string }>(`
      INSERT INTO public.jugador_participaciones (
        jugador_id, tipo_evento, evento_id, evento_nombre, resultado,
        puntos_obtenidos, sets_favor, sets_contra, fecha, metadata
      ) VALUES (
        '${ghostPlayer}', 'americano', '${AMERICANO_ID}', 'Americano Dinámico - Sesión', NULL,
        0, 0, 0, '2026-10-12', jsonb_build_object('organizador_id', '${CLUB_PADELITO}')
      ) RETURNING id;
    `);
    const ghostId = ghostRes.rows[0].id;

    // Verificar que NO se generó revisión ni lote de puntos
    const ghostReview = await db.query<{ count: number }>(`
      SELECT count(*)::int as count FROM public.rewards_participation_reviews WHERE participacion_id = '${ghostId}';
    `);
    expect(ghostReview.rows[0].count).toBe(0);

    const ghostLot = await db.query<{ count: number }>(`
      SELECT count(*)::int as count FROM public.rewards_lots WHERE participacion_id = '${ghostId}';
    `);
    expect(ghostLot.rows[0].count).toBe(0);
  });

  it("14. Revisión rechazada manualmente persiste y aborta encolamiento y acreditación", async () => {
    await setAuthSession(CLUB_PADELITO);

    const rejectedPlayer = "ffffffff-2222-4fff-ffff-ffffffffffff";
    await db.exec(`
      INSERT INTO public.riviera_jugadores (id, nombre, organizador_id)
      VALUES ('${rejectedPlayer}', 'Jugador Rechazado Manual', '${CLUB_PADELITO}')
      ON CONFLICT DO NOTHING;
    `);

    // Participación válida jugada
    const rejRes = await db.query<{ id: string }>(`
      INSERT INTO public.jugador_participaciones (
        jugador_id, tipo_evento, evento_id, evento_nombre, resultado,
        puntos_obtenidos, sets_favor, sets_contra, fecha, metadata
      ) VALUES (
        '${rejectedPlayer}', 'americano', '${AMERICANO_ID}', 'Americano Dinámico - Sesión', 'victoria',
        30, 6, 2, '2026-10-12', jsonb_build_object('organizador_id', '${CLUB_PADELITO}', 'subtipo', 'americano_cierre')
      ) RETURNING id;
    `);
    const rejId = rejRes.rows[0].id;

    // Forzar estado 'rechazada' manualmente en la revisión
    await db.exec(`
      UPDATE public.rewards_participation_reviews
      SET estado = 'rechazada', motivo = 'Sanción administrativa manual', decided_at = now()
      WHERE participacion_id = '${rejId}';
      DELETE FROM public.rewards_ledger WHERE lot_id IN (SELECT id FROM public.rewards_lots WHERE participacion_id = '${rejId}');
      DELETE FROM public.rewards_lots WHERE participacion_id = '${rejId}';
      DELETE FROM public.rewards_accrual_queue WHERE participacion_id = '${rejId}';
    `);

    // Intentar re-encolar mediante rewards_enqueue_candidate: debe abortar sin tocar 'rechazada'
    await db.exec(`SELECT public.rewards_enqueue_candidate('${rejId}');`);

    const revCheck = await db.query<{ estado: string }>(`
      SELECT estado FROM public.rewards_participation_reviews WHERE participacion_id = '${rejId}';
    `);
    expect(revCheck.rows[0].estado).toBe('rechazada');

    const queueCheck = await db.query<{ count: number }>(`
      SELECT count(*)::int as count FROM public.rewards_accrual_queue WHERE participacion_id = '${rejId}';
    `);
    expect(queueCheck.rows[0].count).toBe(0);

    const lotCheck = await db.query<{ count: number }>(`
      SELECT count(*)::int as count FROM public.rewards_lots WHERE participacion_id = '${rejId}';
    `);
    expect(lotCheck.rows[0].count).toBe(0);
  });
});
