/**
 * @jest-environment node
 *
 * Prueba de integración de los tres scripts SQL ejecutables de producción:
 * 1. 01_diagnostico_rewards_octubre_loco.sql (Solo lectura)
 * 2. 02_recuperacion_idempotente_rewards_octubre_loco.sql (Idempotencia y aislamiento)
 * 3. 03_verificacion_integral_rewards_octubre_loco.sql (Consistencia matemática de saldos)
 *
 * Demuestra:
 * - Que la recuperación funciona con las 8 participaciones reales.
 * - Que una segunda ejecución consecutiva del Script 2 NO DUPLICA puntos ni movimientos en ledger.
 * - Que los rechazos manuales se conservan intactos.
 * - Que el Script 3 valida la consistencia matemática de saldos y vencimientos.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import type { PGlite as PGliteType } from "@electric-sql/pglite";

declare const global: any;
const nodeBuffer = require("buffer");
if (typeof global.Blob === "undefined") {
  global.Blob = nodeBuffer.Blob;
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

  const trimmed = current.trim();
  if (trimmed.length > 0) {
    statements.push(trimmed);
  }
  return statements;
}

const maybeDescribe =
  process.env.RUN_SQL_INTEGRATION === "1" ||
  Boolean(process.env.NODE_OPTIONS && process.env.NODE_OPTIONS.includes("--experimental-vm-modules"))
    ? describe
    : describe.skip;


maybeDescribe("Verificación de Scripts SQL de Riviera Rewards (01, 02, 03)", () => {
  let db: PGliteType;


  const CLUB_PADELITO = "11111111-1111-4111-8111-111111111111";
  const AMERICANO_ID = "33333333-3333-4333-8333-333333333333";

  const TARGET_PARTICIPACIONES = [
    { id: "1297cfb0-88dc-4ae0-80c7-1e732a9e2d43", jugador_id: "a1111111-0000-4000-8000-000000000001", nombre: "Jesús Fernando", riviera_id: "RIV-00000001" },
    { id: "f9ef66cc-032f-450d-867b-1e00e86f5c87", jugador_id: "a1111111-0000-4000-8000-000000000002", nombre: "Lalo B", riviera_id: "RIV-00000119" },
    { id: "9f9a24f4-5e1c-433b-917a-42d544858547", jugador_id: "a1111111-0000-4000-8000-000000000003", nombre: "Ricardo P", riviera_id: "RIV-00000003" },
    { id: "26fbdcd5-b728-4179-90a4-c3a9b4837a5a", jugador_id: "a1111111-0000-4000-8000-000000000004", nombre: "César G", riviera_id: "RIV-00000004" },
    { id: "a2069224-75e5-4ba0-9d11-29b2953d9bd3", jugador_id: "a1111111-0000-4000-8000-000000000005", nombre: "Ivan Cazares", riviera_id: "RIV-00000005" },
    { id: "783c7d94-7a94-4638-9517-df3fde35681f", jugador_id: "a1111111-0000-4000-8000-000000000006", nombre: "Isbi", riviera_id: "RIV-00000006" },
    { id: "62acb7b9-d0f6-4644-84e7-e9e1ba5652c4", jugador_id: "a1111111-0000-4000-8000-000000000007", nombre: "Paco", riviera_id: "RIV-00000007" },
    { id: "9c7c2f6d-20af-4d35-b3d1-7439d21cd588", jugador_id: "a1111111-0000-4000-8000-000000000008", nombre: "Said C", riviera_id: "RIV-00000008" },
  ];


  beforeAll(async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    db = new PGlite();


    // 1. Roles y esquemas base
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
      CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text);
      CREATE TABLE IF NOT EXISTS public.tournaments (id uuid PRIMARY KEY, user_id uuid NOT NULL, organizador_id uuid, format text);
      CREATE TABLE IF NOT EXISTS public.riviera_jugadores (id uuid PRIMARY KEY, organizador_id uuid, nombre text, categoria text, estado text);
      CREATE TABLE IF NOT EXISTS public.riviera_official_player_identity (official_player_key uuid PRIMARY KEY DEFAULT gen_random_uuid(), canonical_riviera_jugador_id uuid, riviera_id text NOT NULL);

      CREATE TABLE IF NOT EXISTS public.riviera_official_player_profile_link (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), official_player_key uuid NOT NULL, riviera_jugador_id uuid NOT NULL, organizer_id uuid NOT NULL);
      CREATE TABLE IF NOT EXISTS public.organizer_game_modes (organizador_id uuid PRIMARY KEY, branding_key text);


      CREATE TABLE IF NOT EXISTS public.jugador_participaciones (
        id uuid PRIMARY KEY,
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

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$ LANGUAGE sql STABLE;

      CREATE OR REPLACE FUNCTION public.is_master_admin() RETURNS boolean AS $$
        SELECT true;
      $$ LANGUAGE sql STABLE;

      CREATE OR REPLACE FUNCTION public._resolve_official_player_key(p_id uuid) RETURNS uuid AS $$
        SELECT p_id;
      $$ LANGUAGE sql STABLE;

      CREATE OR REPLACE FUNCTION public.riviera_participacion_expected_host_org(p_tipo_evento text, p_evento_id text)
      RETURNS uuid AS $$
        SELECT user_id FROM public.tournaments WHERE id = NULLIF(trim(p_evento_id), '')::uuid LIMIT 1;
      $$ LANGUAGE sql STABLE;
    `);

    // 2. Ejecutar migraciones 0058, 0059 y 0061
    const runSqlFile = async (path: string) => {
      const content = readFileSync(path, "utf8");
      const stmts = splitSqlStatements(content);
      for (const s of stmts) {
        if (s.includes("cron.schedule") || s.includes("pg_cron") || s.includes("pg_extension")) continue;
        await db.exec(s);
      }
    };

    await runSqlFile(resolve(__dirname, "../../../supabase/migrations/0058_riviera_rewards_phase1.sql"));
    await runSqlFile(resolve(__dirname, "../../../supabase/migrations/0059_rewards_multiclub_identity_resolution.sql"));
    await runSqlFile(resolve(__dirname, "../../../supabase/migrations/0061_rewards_auto_accrual_and_expires_at.sql"));

    // 3. Poblar seed para el evento de Octubre Loco
    await db.exec(`
      SELECT set_config('request.jwt.claim.sub', '${CLUB_PADELITO}', false);
      SELECT set_config('request.jwt.claim.is_master', 'true', false);
      INSERT INTO auth.users (id, email) VALUES ('${CLUB_PADELITO}', 'padelitopadel@gmail.com') ON CONFLICT DO NOTHING;
      INSERT INTO public.tournaments (id, user_id, format) VALUES ('${AMERICANO_ID}', '${CLUB_PADELITO}', 'americano') ON CONFLICT DO NOTHING;
      INSERT INTO public.organizer_game_modes (organizador_id, branding_key) VALUES ('${CLUB_PADELITO}', 'padelito-warehouse') ON CONFLICT DO NOTHING;

      -- Campaña activa Octubre Loco
      SELECT public.rewards_save_campaign(jsonb_build_object(

        'organizador_id', '${CLUB_PADELITO}',
        'nombre', 'Octubre Loco',
        'estado', 'activa',
        'acumula_desde', '2026-10-01T06:00:00Z',
        'acumula_hasta', '2026-11-01T06:00:00Z',
        'canje_desde', '2026-11-01T06:00:00Z',
        'canje_hasta', '2026-12-01T06:00:00Z',
        'puntos_por_participacion', 10,
        'modalidades', jsonb_build_array('americano')
      ));
    `);

    // Insertar jugadores y sus identidades oficiales
    for (const p of TARGET_PARTICIPACIONES) {
      await db.exec(`
        INSERT INTO public.riviera_jugadores (id, nombre, organizador_id)
        VALUES ('${p.jugador_id}', '${p.nombre}', '${CLUB_PADELITO}')
        ON CONFLICT DO NOTHING;

        INSERT INTO public.riviera_official_player_identity (canonical_riviera_jugador_id, riviera_id)
        VALUES ('${p.jugador_id}', '${p.riviera_id}')
        ON CONFLICT DO NOTHING;
      `);
    }

    // Insertar las 8 participaciones exactas simulando el estado previo de error/pendiente
    for (let i = 0; i < TARGET_PARTICIPACIONES.length; i++) {
      const p = TARGET_PARTICIPACIONES[i];
      await db.exec(`
        INSERT INTO public.jugador_participaciones (
          id, jugador_id, tipo_evento, evento_id, evento_nombre, resultado,
          puntos_obtenidos, sets_favor, sets_contra, fecha, metadata
        ) VALUES (
          '${p.id}', '${p.jugador_id}', 'americano', '${AMERICANO_ID}', 'Americano Dinámico', 'participación',
          ${(i + 1) * 5}, 6, 2, '2026-10-12',
          jsonb_build_object(
            'organizador_id', '${CLUB_PADELITO}',
            'subtipo', 'americano_cierre',
            'partidos', 4
          )
        );
      `);
    }

    // Simular el estado de error histórico: 2 con error previo, 6 pendientes
    await db.exec(`
      -- Limpiar lotes creados por el trigger inicial para simular la situación de producción antes de migrar
      DELETE FROM public.rewards_ledger;
      DELETE FROM public.rewards_lots;
      
      -- Jesús Fernando y Lalo B con error de expires_at
      UPDATE public.rewards_accrual_queue
      SET estado = 'error', last_error = 'null value in column "expires_at" of relation "rewards_lots" violates not-null constraint', attempts = 2
      WHERE participacion_id IN ('1297cfb0-88dc-4ae0-80c7-1e732a9e2d43', 'f9ef66cc-032f-450d-867b-1e00e86f5c87');

      -- Los otros 6 quedan en revisión pendiente
      DELETE FROM public.rewards_accrual_queue
      WHERE participacion_id NOT IN ('1297cfb0-88dc-4ae0-80c7-1e732a9e2d43', 'f9ef66cc-032f-450d-867b-1e00e86f5c87');

      UPDATE public.rewards_participation_reviews
      SET estado = 'pendiente', validation_source = NULL
      WHERE participacion_id NOT IN ('1297cfb0-88dc-4ae0-80c7-1e732a9e2d43', 'f9ef66cc-032f-450d-867b-1e00e86f5c87');
    `);
  });

  afterAll(async () => {
    if (db) await db.close();
  });

  it("1. Script 1 (Diagnóstico) ejecuta limpiamente y devuelve las 8 filas exactas sin modificar nada", async () => {
    const diagSql = readFileSync(resolve(__dirname, "../../../supabase/scripts/01_diagnostico_rewards_octubre_loco.sql"), "utf8");
    const res = await db.query<any>(diagSql);

    expect(res.rows.length).toBe(8);
    for (const row of res.rows) {
      expect(row.participacion_id).toBeDefined();
      expect(row.jugador_nombre).toBeDefined();
      expect(row.riviera_id_oficial).toMatch(/^RIV-/);
      expect(row.juego_comprobado).toBe(true);
      expect(row.campana_titulo).toBe("Octubre Loco");
    }

    // Comprobar que no hay lotes aún
    const lotCount = await db.query<{ count: number }>("SELECT count(*)::int as count FROM public.rewards_lots;");
    expect(lotCount.rows[0].count).toBe(0);
  });

  it("2. Script 2 (Recuperación) recupera las 8 participaciones, emite 80 puntos y no fuerza rechazos", async () => {
    const recSql = readFileSync(resolve(__dirname, "../../../supabase/scripts/02_recuperacion_idempotente_rewards_octubre_loco.sql"), "utf8");
    const stmts = splitSqlStatements(recSql);
    
    let lastRows: any[] = [];
    for (const stmt of stmts) {
      const res = await db.query<any>(stmt);
      if (res && res.rows && res.rows.length > 0) {
        lastRows = res.rows;
      }
    }

    expect(lastRows.length).toBe(8);
    for (const row of lastRows) {
      expect(row.estado_final).toBe("Acreditada durante esta recuperación");
      expect(Number(row.puntos_emitidos)).toBe(10);
      expect(row.vencimiento_lote).toBeDefined();
    }

    // Verificar que los 8 lotes fueron creados
    const lotsRes = await db.query<{ count: number; sum_puntos: number }>(`
      SELECT count(*)::int as count, sum(puntos_originales)::int as sum_puntos
      FROM public.rewards_lots
      WHERE organizador_id = '${CLUB_PADELITO}';
    `);
    expect(lotsRes.rows[0].count).toBe(8);
    expect(lotsRes.rows[0].sum_puntos).toBe(80);

    // Verificar que cada uno tiene exactamente 1 movimiento de acreditación en ledger
    const ledgerRes = await db.query<{ count: number; sum_delta: number }>(`
      SELECT count(*)::int as count, sum(puntos)::int as sum_delta
      FROM public.rewards_ledger
      WHERE organizador_id = '${CLUB_PADELITO}' AND tipo = 'acreditacion';
    `);
    expect(ledgerRes.rows[0].count).toBe(8);
    expect(ledgerRes.rows[0].sum_delta).toBe(80);
  });

  it("3. Script 2 (Segunda ejecución consecutiva) es 100% IDEMPOTENTE: Cero duplicados", async () => {
    const recSql = readFileSync(resolve(__dirname, "../../../supabase/scripts/02_recuperacion_idempotente_rewards_octubre_loco.sql"), "utf8");
    const stmts = splitSqlStatements(recSql);
    
    let lastRows: any[] = [];
    for (const stmt of stmts) {
      const res = await db.query<any>(stmt);
      if (res && res.rows && res.rows.length > 0) {
        lastRows = res.rows;
      }
    }

    expect(lastRows.length).toBe(8);
    for (const row of lastRows) {
      expect(row.estado_final).toBe("Ya acreditada previamente");
      expect(Number(row.puntos_emitidos)).toBe(10);
    }



    // Verificar que SIGUEN siendo exactamente 8 lotes y 80 puntos totales (cero duplicados)
    const lotsRes = await db.query<{ count: number; sum_puntos: number }>(`
      SELECT count(*)::int as count, sum(puntos_originales)::int as sum_puntos
      FROM public.rewards_lots
      WHERE organizador_id = '${CLUB_PADELITO}';
    `);
    expect(lotsRes.rows[0].count).toBe(8);
    expect(lotsRes.rows[0].sum_puntos).toBe(80);

    const ledgerRes = await db.query<{ count: number; sum_delta: number }>(`
      SELECT count(*)::int as count, sum(puntos)::int as sum_delta
      FROM public.rewards_ledger
      WHERE organizador_id = '${CLUB_PADELITO}' AND tipo = 'acreditacion';
    `);
    expect(ledgerRes.rows[0].count).toBe(8);
    expect(ledgerRes.rows[0].sum_delta).toBe(80);
  });

  it("4. Script 3 (Verificación) valida crédito original, coherencia de saldo y vencimiento para todas", async () => {
    const verifSql = readFileSync(resolve(__dirname, "../../../supabase/scripts/03_verificacion_integral_rewards_octubre_loco.sql"), "utf8");
    const res = await db.query<any>(verifSql);

    expect(res.rows.length).toBe(8);
    for (const row of res.rows) {
      expect(row.check_credito_original_10).toBe(true);
      expect(row.check_vencimiento_valido).toBe(true);
      expect(row.check_coherencia_saldo).toBe(true);
      expect(row.check_sin_duplicados).toBe(true);
      expect(row.veredicto).toBe("CONSISTENTE");
    }
  });

  it("5. Verificación de saldo dinámico: Script 3 se mantiene consistente tras un canje parcial de puntos", async () => {
    // Simular que Lalo B realiza un canje de 5 puntos
    const laloLot = await db.query<{ id: string }>(`
      SELECT id FROM public.rewards_lots WHERE participacion_id = 'f9ef66cc-032f-450d-867b-1e00e86f5c87';
    `);
    const lotId = laloLot.rows[0].id;

    // Descontar 5 puntos del lote y registrar en ledger
    await db.exec(`
      UPDATE public.rewards_lots SET puntos_restantes = puntos_restantes - 5 WHERE id = '${lotId}';
      INSERT INTO public.rewards_ledger (organizador_id, jugador_id, campaign_id, lot_id, tipo, puntos, idempotency_key, motivo)
      VALUES (
        '${CLUB_PADELITO}',
        'a1111111-0000-4000-8000-000000000002',
        (SELECT id FROM public.rewards_campaigns LIMIT 1),
        '${lotId}',
        'canje',
        -5,
        'test-canje-lalo-1',
        'Canje de bebida deportiva'
      );
    `);

    // Ejecutar Script 3 de verificación
    const verifSql = readFileSync(resolve(__dirname, "../../../supabase/scripts/03_verificacion_integral_rewards_octubre_loco.sql"), "utf8");
    const res = await db.query<any>(verifSql);

    const laloRow = res.rows.find((r: any) => r.participacion_id === "f9ef66cc-032f-450d-867b-1e00e86f5c87");
    expect(laloRow).toBeDefined();
    // Crédito original sigue siendo 10
    expect(laloRow.pts_originales_lote).toBe(10);
    expect(laloRow.pts_originales_ledger).toBe(10);
    // Canjes refleja -5
    expect(laloRow.pts_canjeados).toBe(-5);
    // Saldo restante es 5 en lote y 5 en ledger
    expect(laloRow.saldo_lote).toBe(5);
    expect(laloRow.saldo_ledger).toBe(5);
    // Veredicto sigue siendo CONSISTENTE porque el ledger cuadra perfectamente con el saldo del lote
    expect(laloRow.veredicto).toBe("CONSISTENTE");
  });

  it("6. Rechazos manuales: Script 2 respeta y no sobreescribe una revisión 'rechazada' ni borra motivo", async () => {
    // Tomar una de las participaciones, por ejemplo Said C, y marcar su revisión como 'rechazada' manualmente
    const saidPid = "9c7c2f6d-20af-4d35-b3d1-7439d21cd588";
    
    // Limpiar lote previo de Said para simular que no tenía lote y fue rechazado por el administrador

    await db.exec(`
      DELETE FROM public.rewards_ledger WHERE lot_id IN (SELECT id FROM public.rewards_lots WHERE participacion_id = '${saidPid}');
      DELETE FROM public.rewards_lots WHERE participacion_id = '${saidPid}';
      DELETE FROM public.rewards_accrual_queue WHERE participacion_id = '${saidPid}';
      UPDATE public.rewards_participation_reviews
      SET estado = 'rechazada', motivo = 'Sanción administrativa: conducta antideportiva', decided_at = now()
      WHERE participacion_id = '${saidPid}';
    `);

    // Ejecutar Script 2 de recuperación
    const recSql = readFileSync(resolve(__dirname, "../../../supabase/scripts/02_recuperacion_idempotente_rewards_octubre_loco.sql"), "utf8");
    const stmts = splitSqlStatements(recSql);
    
    let tableRows: any[] = [];
    for (const stmt of stmts) {
      const res = await db.query<any>(stmt);
      if (res && res.rows && res.rows.length > 0) {
        tableRows = res.rows;
      }
    }
    expect(tableRows.length).toBeGreaterThan(0);

    // Verificar en la tabla de resultados de la recuperación

    const checkSaid = await db.query<{ estado: string; motivo: string }>(`
      SELECT estado, motivo FROM public.rewards_participation_reviews WHERE participacion_id = '${saidPid}';
    `);
    // El estado SIGUE siendo 'rechazada' y el motivo se preservó
    expect(checkSaid.rows[0].estado).toBe('rechazada');
    expect(checkSaid.rows[0].motivo).toContain('conducta antideportiva');

    // Jamás se le emitió un lote
    const lotCheck = await db.query<{ count: number }>(`
      SELECT count(*)::int as count FROM public.rewards_lots WHERE participacion_id = '${saidPid}';
    `);
    expect(lotCheck.rows[0].count).toBe(0);
  });
});

