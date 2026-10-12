/**
 * @jest-environment node
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

    // Comentarios de una línea
    if (sql.startsWith("--", i)) {
      const nl = sql.indexOf("\n", i);
      if (nl === -1) break;
      i = nl + 1;
      continue;
    }

    // Inicio de dollar quote: $$ o $tag$
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

describe("Riviera Rewards — Validación SQL Real (PGlite PostgreSQL WASM)", () => {
  let db: PGliteType;

  const CLUB_A = "11111111-1111-4111-a111-111111111111"; // Padelito
  const CLUB_B = "22222222-2222-4222-a222-222222222222"; // Hack Padel
  const JUGADOR_A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
  const JUGADOR_B_LOCAL = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb"; // Cedido en Club B

  beforeAll(async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    db = new PGlite();

    // 1. Esquema base simulado de Riviera Open y Supabase
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
        organizador_id uuid NOT NULL,
        format text DEFAULT 'teams'
      );

      CREATE TABLE IF NOT EXISTS public.duelos_2v2 (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organizador_id uuid NOT NULL
      );

      CREATE TABLE IF NOT EXISTS public.riviera_jugadores (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organizador_id uuid NOT NULL,
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

      -- Variable de sesión para auth.uid() y is_master_admin()
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$ LANGUAGE sql STABLE;

      CREATE OR REPLACE FUNCTION public.is_master_admin() RETURNS boolean AS $$
        SELECT COALESCE(current_setting('request.jwt.claim.is_master', true) = 'true', false);
      $$ LANGUAGE sql STABLE;
    `);

    // 2. Ejecutar la migración 0058 completa
    const sqlPath = resolve(
      __dirname,
      "../../../supabase/migrations/0058_riviera_rewards_phase1.sql"
    );
    const sqlContent = readFileSync(sqlPath, "utf8");
    const statements = splitSqlStatements(sqlContent);

    for (const stmt of statements) {
      // Omitir bloques de pg_cron si la extensión no está en PGlite
      if (
        stmt.includes("cron.schedule") ||
        stmt.includes("pg_cron") ||
        stmt.includes("pg_extension")
      ) {
        continue;
      }
      try {
        await db.exec(stmt);
      } catch (err: unknown) {
        throw new Error(`Error ejecutando statement en migración 0058:\n${stmt}\n-> ${err}`);
      }
    }
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

  it("1. Creación de campañas y aislamiento multiclub estricto", async () => {
    await setAuthSession(CLUB_A);

    // Club A crea campaña
    const res = await db.query<{ rewards_save_campaign: string }>(`
      SELECT public.rewards_save_campaign(jsonb_build_object(
        'organizador_id', '${CLUB_A}',
        'nombre', 'Campaña Octubre Padelito',
        'acumula_desde', (now() - interval '5 days')::text,
        'acumula_hasta', (now() + interval '25 days')::text,
        'canje_desde', (now() + interval '26 days')::text,
        'canje_hasta', (now() + interval '55 days')::text,
        'puntos_por_participacion', 10,
        'modalidades', jsonb_build_array('reta_equipos', 'americano'),
        'estado', 'activa',
        'visible_jugadores', true
      )) AS rewards_save_campaign;
    `);
    const campaignAId = res.rows[0].rewards_save_campaign;
    expect(campaignAId).toBeDefined();

    // Club B intenta modificar o crear con organizador_id de Club A -> DEBE FALLAR
    await setAuthSession(CLUB_B);
    await expect(
      db.exec(`
        SELECT public.rewards_save_campaign(jsonb_build_object(
          'id', '${campaignAId}',
          'organizador_id', '${CLUB_A}',
          'nombre', 'Hack Padel Hackeo'
        ));
      `)
    ).rejects.toThrow(/Sin permiso sobre este club/);
  });

  it("2. Acreditación de puntos, idempotencia y prevención de duplicados", async () => {
    await setAuthSession(CLUB_A);

    // Insertar jugador nativo en Club A
    await db.exec(`
      INSERT INTO public.riviera_jugadores (id, organizador_id, nombre)
      VALUES ('${JUGADOR_A}', '${CLUB_A}', 'Jugador Nativo A')
      ON CONFLICT DO NOTHING;
    `);

    // Crear un torneo de reta en Club A
    const torneoRes = await db.query<{ id: string }>(`
      INSERT INTO public.tournaments (organizador_id, format)
      VALUES ('${CLUB_A}', 'teams')
      RETURNING id;
    `);
    const torneoId = torneoRes.rows[0].id;

    // Insertar participación deportiva en Club A
    const partRes = await db.query<{ id: string }>(`
      INSERT INTO public.jugador_participaciones (
        jugador_id, tipo_evento, evento_id, evento_nombre, fecha
      )
      VALUES (
        '${JUGADOR_A}', 'reta', '${torneoId}', 'Reta Nocturna', CURRENT_DATE
      )
      RETURNING id;
    `);
    const partId = partRes.rows[0].id;

    // Obtener la campaña activa de Club A
    const campRes = await db.query<{ id: string }>(`
      SELECT id FROM public.rewards_campaigns WHERE organizador_id = '${CLUB_A}' LIMIT 1;
    `);
    const campaignId = campRes.rows[0].id;

    // Validar y aprobar la participación -> ACREDITA EN LÍNEA DE INMEDIATO
    await db.exec(`
      SELECT public.rewards_review_participations(
        '${CLUB_A}',
        ARRAY['${partId}']::uuid[],
        'aprobada',
        '${campaignId}',
        'Validado OK'
      );
    `);

    // Comprobar que la cola quedó acreditada de inmediato
    const queueStatus = await db.query<{ estado: string }>(`
      SELECT estado FROM public.rewards_accrual_queue WHERE participacion_id = '${partId}';
    `);
    expect(queueStatus.rows[0].estado).toBe("acreditada");

    // Verificar balance del jugador inmediatamente acreditado
    const balanceRes = await db.query<{ rewards_balance: any }>(`
      SELECT public.rewards_balance('${CLUB_A}', '${JUGADOR_A}');
    `);
    const balances = balanceRes.rows[0].rewards_balance;
    expect(balances).toHaveLength(1);
    expect(balances[0].acumulando).toBe(10);

    // Si rewards_process_accrual_queue corre, no procesa duplicados (idempotencia)
    const reprocessed = await db.query<{ rewards_process_accrual_queue: number }>(`
      SELECT public.rewards_process_accrual_queue('${CLUB_A}', 10);
    `);
    expect(reprocessed.rows[0].rewards_process_accrual_queue).toBe(0);

    // El balance sigue siendo 10 (NO duplicado)
    const balanceAfter = await db.query<{ rewards_balance: any }>(`
      SELECT public.rewards_balance('${CLUB_A}', '${JUGADOR_A}');
    `);
    expect(balanceAfter.rows[0].rewards_balance[0].acumulando).toBe(10);
  });

  it("3. Jugador cedido: acumula puntos en club receptor sin mezclarse con origen", async () => {
    // Jugador A juega en Club B
    await setAuthSession(CLUB_B);

    // Club B crea su propia campaña
    const campBRes = await db.query<{ rewards_save_campaign: string }>(`
      SELECT public.rewards_save_campaign(jsonb_build_object(
        'organizador_id', '${CLUB_B}',
        'nombre', 'Campaña Hack Padel',
        'acumula_desde', (now() - interval '5 days')::text,
        'acumula_hasta', (now() + interval '25 days')::text,
        'canje_desde', (now() + interval '26 days')::text,
        'canje_hasta', (now() + interval '55 days')::text,
        'puntos_por_participacion', 25,
        'modalidades', jsonb_build_array('reta_equipos'),
        'estado', 'activa',
        'visible_jugadores', true
      ));
    `);
    const campaignBId = campBRes.rows[0].rewards_save_campaign;

    // Crear clon local de Jugador A en Club B (concedido)
    await db.exec(`
      INSERT INTO public.riviera_jugadores (id, organizador_id, nombre)
      VALUES ('${JUGADOR_B_LOCAL}', '${CLUB_B}', 'Jugador Cedido B')
      ON CONFLICT DO NOTHING;

      INSERT INTO public.organizer_player_access (
        owner_organizador_id, grantee_organizer_id, jugador_id, local_jugador_id, is_active
      )
      VALUES ('${CLUB_A}', '${CLUB_B}', '${JUGADOR_A}', '${JUGADOR_B_LOCAL}', true)
      ON CONFLICT DO NOTHING;
    `);

    // Torneo y participación en Club B
    const torneoB = await db.query<{ id: string }>(`
      INSERT INTO public.tournaments (organizador_id, format)
      VALUES ('${CLUB_B}', 'teams')
      RETURNING id;
    `);
    const partB = await db.query<{ id: string }>(`
      INSERT INTO public.jugador_participaciones (
        jugador_id, tipo_evento, evento_id, evento_nombre, fecha
      )
      VALUES (
        '${JUGADOR_B_LOCAL}', 'reta', '${torneoB.rows[0].id}', 'Reta Hack Padel', CURRENT_DATE
      )
      RETURNING id;
    `);

    // Club B aprueba y procesa la participación
    await db.exec(`
      SELECT public.rewards_review_participations(
        '${CLUB_B}',
        ARRAY['${partB.rows[0].id}']::uuid[],
        'aprobada',
        '${campaignBId}',
        'Local Hack Padel'
      );
      SELECT public.rewards_process_accrual_queue('${CLUB_B}', 10);
    `);

    // Balance en Club B debe ser 25
    const balanceB = await db.query<{ rewards_balance: any }>(`
      SELECT public.rewards_balance('${CLUB_B}', '${JUGADOR_B_LOCAL}');
    `);
    expect(balanceB.rows[0].rewards_balance[0].acumulando).toBe(25);

    // Balance en Club A para ese jugador sigue siendo 10 (TOTALMENTE AISLADO)
    await setAuthSession(CLUB_A);
    const balanceA = await db.query<{ rewards_balance: any }>(`
      SELECT public.rewards_balance('${CLUB_A}', '${JUGADOR_A}');
    `);
    expect(balanceA.rows[0].rewards_balance[0].acumulando).toBe(10);

    // Club A intenta consultar el balance de Club B -> RECHAZADO
    await expect(
      db.query(`SELECT public.rewards_balance('${CLUB_B}', '${JUGADOR_B_LOCAL}');`)
    ).rejects.toThrow(/Sin permiso sobre este club/);
  });

  it("4. Validación estricta de saldo en rewards_request_redemption", async () => {
    await setAuthSession(CLUB_A);

    // Crear premio que cuesta 50 puntos en Club A
    const campARes = await db.query<{ id: string }>(`
      SELECT id FROM public.rewards_campaigns WHERE organizador_id = '${CLUB_A}' LIMIT 1;
    `);
    const campAId = campARes.rows[0].id;

    // Mover ventana de canje para que esté abierta
    await db.exec(`
      UPDATE public.rewards_campaigns
      SET canje_desde = now() - interval '1 hour',
          canje_hasta = now() + interval '10 days'
      WHERE id = '${campAId}';
    `);

    const rewardRes = await db.query<{ rewards_save_reward: string }>(`
      SELECT public.rewards_save_reward(jsonb_build_object(
        'campaign_id', '${campAId}',
        'organizador_id', '${CLUB_A}',
        'nombre', 'Grip Premium',
        'costo_puntos', 50,
        'tipo', 'producto',
        'estado', 'activo'
      ));
    `);
    const rewardId = rewardRes.rows[0].rewards_save_reward;

    // Jugador A solo tiene 10 puntos -> Solicitar premio de 50 puntos DEBE FALLAR
    await expect(
      db.exec(`
        SELECT public.rewards_request_redemption('${CLUB_A}', '${rewardId}', '${JUGADOR_A}');
      `)
    ).rejects.toThrow(/Saldo insuficiente para solicitar este premio/);
  });

  it("5. Cierre mensual de campañas: saldos no utilizados caducan con asiento de cierre", async () => {
    await setAuthSession(CLUB_A);

    const campRes = await db.query<{ id: string }>(`
      SELECT id FROM public.rewards_campaigns WHERE organizador_id = '${CLUB_A}' LIMIT 1;
    `);
    const campId = campRes.rows[0].id;

    // Forzar que la ventana de canje venció en el pasado
    await db.exec(`
      UPDATE public.rewards_campaigns
      SET canje_hasta = now() - interval '1 hour'
      WHERE id = '${campId}';
    `);

    // Ejecutar cierre de campaña
    const closeRes = await db.query<{ rewards_close_campaigns: number }>(`
      SELECT public.rewards_close_campaigns('${CLUB_A}');
    `);
    expect(closeRes.rows[0].rewards_close_campaigns).toBeGreaterThanOrEqual(1);

    // Verificar que en rewards_ledger existe el movimiento 'cierre'
    const ledgerRes = await db.query<{ tipo: string; puntos: number; motivo: string }>(`
      SELECT tipo, puntos, motivo
      FROM public.rewards_ledger
      WHERE campaign_id = '${campId}' AND tipo = 'cierre';
    `);
    expect(ledgerRes.rows.length).toBeGreaterThanOrEqual(1);
    expect(ledgerRes.rows[0].tipo).toBe("cierre");
    expect(ledgerRes.rows[0].puntos).toBeLessThan(0); // Puntos negativos

    // El saldo disponible pasa a 0 y la fase es 'cerrada'
    const balanceClosed = await db.query<{ rewards_balance: any }>(`
      SELECT public.rewards_balance('${CLUB_A}', '${JUGADOR_A}');
    `);
    const bal = balanceClosed.rows[0].rewards_balance[0];
    expect(bal.fase).toBe("cerrada");
    expect(bal.disponible).toBe(0);
    expect(bal.cerrado).toBe(10);
  });

  it("6. Protección absoluta del ranking deportivo: ni una sola fila deportiva alterada", async () => {
    // Comprobar que en jugador_participaciones los puntos_obtenidos (ranking) no cambiaron
    const parts = await db.query<{ puntos_obtenidos: number }>(`
      SELECT puntos_obtenidos FROM public.jugador_participaciones;
    `);
    for (const row of parts.rows) {
      expect(row.puntos_obtenidos).toBe(0); // Ninguna RPC de rewards tocó el ranking
    }
  });
});
