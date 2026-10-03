/**
 * @jest-environment node
 */
/**
 * PGlite aplica 0044 y 0046 desde cero. No abre dos conexiones, así que no
 * espera un lock ajeno: demuestra el orden en el cuerpo de las funciones,
 * la forma real/virtual de pairs y el equivalente secuencial de resolver
 * la misma plaza dos veces.
 *
 * Ejecutar: RUN_SQL_INTEGRATION=1 NODE_OPTIONS=--experimental-vm-modules \
 *   npx react-scripts test --watchAll=false --runInBand \
 *   src/lib/torneoExpress/categoriaEdicionLocks.integration.test.ts
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import type { PGlite as PGliteType } from "@electric-sql/pglite";

// jest-environment-node no define Blob, y PGlite lo necesita al importarse.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodeBuffer = require("buffer");
if (typeof (global as any).Blob === "undefined") {
  (global as any).Blob = nodeBuffer.Blob;
}

const maybeDescribe =
  process.env.RUN_SQL_INTEGRATION === "1" ? describe : describe.skip;

const ORG = "11111111-1111-1111-1111-111111111111";
const T = "22222222-2222-2222-2222-222222222222";
const G = "33333333-3333-3333-3333-333333333333";
const PAIR_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PAIR_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const MATCH = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const P_PEDRO = "20000000-0000-0000-0000-000000000001";
const P_ANA = "20000000-0000-0000-0000-000000000002";
const P_LUIS = "20000000-0000-0000-0000-000000000003";
const P_MARIA = "20000000-0000-0000-0000-000000000004";
const P_CARLOS = "20000000-0000-0000-0000-000000000007";

function splitSql(sql: string): string[] {
  const out: string[] = [];
  let current = "";
  let i = 0;
  let dollar: string | null = null;
  while (i < sql.length) {
    if (dollar) {
      if (sql.startsWith(dollar, i)) {
        current += dollar;
        i += dollar.length;
        dollar = null;
        continue;
      }
      current += sql[i];
      i += 1;
      continue;
    }
    if (sql.startsWith("--", i)) {
      const nl = sql.indexOf("\n", i);
      if (nl < 0) {
        current += sql.slice(i);
        break;
      }
      current += sql.slice(i, nl + 1);
      i = nl + 1;
      continue;
    }
    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") {
          j += 2;
          continue;
        }
        if (sql[j] === "'") break;
        j += 1;
      }
      current += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (sql[i] === "$") {
      const match = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(i));
      if (match) {
        dollar = match[0];
        current += dollar;
        i += dollar.length;
        continue;
      }
    }
    if (sql[i] === ";") {
      if (current.trim()) out.push(current.trim());
      current = "";
      i += 1;
      continue;
    }
    current += sql[i];
    i += 1;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

maybeDescribe("0044 locks Torneo Express (PGlite, una conexión)", () => {
  let db: PGliteType;

  beforeAll(async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    db = new PGlite();
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('app.user_id', true), '')::uuid
      $$;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN;
        END IF;
      END $$;
      CREATE TABLE public.players (id uuid PRIMARY KEY, name text);
      CREATE TABLE public.pairs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tournament_id uuid,
        player1_id uuid REFERENCES public.players(id) ON DELETE CASCADE,
        player2_id uuid REFERENCES public.players(id) ON DELETE CASCADE,
        player1_name text,
        player2_name text,
        created_at timestamptz DEFAULT now()
      );
      CREATE TABLE public.torneo_express (
        id uuid PRIMARY KEY,
        organizador_id uuid,
        fase_torneo text,
        estado text
      );
      CREATE TABLE public.torneo_express_grupos (
        id uuid PRIMARY KEY,
        torneo_id uuid,
        nombre text,
        orden integer
      );
      CREATE TABLE public.torneo_express_grupo_parejas (
        grupo_id uuid,
        pareja_id uuid,
        PRIMARY KEY (grupo_id, pareja_id)
      );
      CREATE TABLE public.torneo_express_partidos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        grupo_id uuid,
        pareja_local_id uuid,
        pareja_visitante_id uuid,
        estado text,
        puntos_local integer,
        puntos_visitante integer,
        ganador_id uuid,
        sets_resultado jsonb,
        ronda integer,
        orden integer,
        cancha text,
        programado_en timestamptz
      );
      CREATE TABLE public.torneo_express_eliminatoria_partidos (
        id uuid PRIMARY KEY,
        torneo_id uuid NOT NULL,
        ronda integer NOT NULL DEFAULT 1,
        orden integer NOT NULL DEFAULT 1,
        cruce_index integer NOT NULL DEFAULT 0,
        pareja_local_id uuid,
        pareja_visitante_id uuid,
        puntos_local integer,
        puntos_visitante integer,
        ganador_id uuid,
        estado text,
        es_bye boolean,
        cancha text,
        programado_en timestamptz,
        created_at timestamptz DEFAULT now(),
        sets_resultado jsonb
      );
      CREATE FUNCTION public._is_legal_padel_set(p_local integer, p_visitante integer)
      RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
        SELECT p_local IS NOT NULL AND p_visitante IS NOT NULL
          AND p_local >= 0 AND p_visitante >= 0
          AND p_local <= 99 AND p_visitante <= 99;
      $$;
      CREATE FUNCTION public._are_legal_padel_sets(p_sets jsonb)
      RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
        SELECT true;
      $$;
    `);

    const migration = readFileSync(
      resolve(
        __dirname,
        "../../../supabase/migrations/0044_torneo_express_categoria_edicion.sql"
      ),
      "utf8"
    );
    const virtualPairs = readFileSync(
      resolve(
        __dirname,
        "../../../supabase/migrations/0046_torneo_express_virtual_pairs.sql"
      ),
      "utf8"
    );
    for (const source of [migration, virtualPairs]) {
      const statements = splitSql(source);
      for (let index = 0; index < statements.length; index += 1) {
        try {
          await db.exec(statements[index]);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`SQL ${index}: ${message}\n${statements[index].slice(0, 180)}`);
        }
      }
    }
    await db.query(`SELECT set_config('app.user_id', $1, false)`, [ORG]);
  }, 60000);

  afterAll(async () => {
    await db.close();
  });

  async function resetCategoria(): Promise<void> {
    await db.exec(`
      DELETE FROM public.torneo_express_partidos;
      DELETE FROM public.torneo_express_grupo_parejas;
      DELETE FROM public.torneo_express_grupos;
      DELETE FROM public.torneo_express_eliminatoria_partidos;
      DELETE FROM public.torneo_express;
      DELETE FROM public.pairs;
      DELETE FROM public.players;
    `);
    await db.query(
      `INSERT INTO public.players (id, name) VALUES
        ($1, 'Pedro'), ($2, 'Ana'), ($3, 'Luis'), ($4, 'Maria'), ($5, 'Carlos')`,
      [P_PEDRO, P_ANA, P_LUIS, P_MARIA, P_CARLOS]
    );
    await db.query(
      `INSERT INTO public.pairs
        (id, tournament_id, player1_id, player2_id, player1_name, player2_name)
       VALUES
        ($1, $2, $3, $4, 'Pedro', 'Ana'),
        ($5, $2, $6, $7, 'Luis', 'Maria')`,
      [PAIR_A, T, P_PEDRO, P_ANA, PAIR_B, P_LUIS, P_MARIA]
    );
    await db.query(
      `INSERT INTO public.torneo_express (id, organizador_id, fase_torneo, estado)
       VALUES ($1, $2, 'grupos', 'en_curso')`,
      [T, ORG]
    );
    await db.query(
      `INSERT INTO public.torneo_express_grupos (id, torneo_id, nombre, orden)
       VALUES ($1, $2, 'Grupo 1', 1)`,
      [G, T]
    );
    await db.query(
      `INSERT INTO public.torneo_express_grupo_parejas (grupo_id, pareja_id)
       VALUES ($1, $2), ($1, $3)`,
      [G, PAIR_A, PAIR_B]
    );
    await db.query(
      `INSERT INTO public.torneo_express_partidos
        (id, grupo_id, pareja_local_id, pareja_visitante_id, estado, ronda, orden)
       VALUES ($1, $2, $3, $4, 'pendiente', 1, 1)`,
      [MATCH, G, PAIR_A, PAIR_B]
    );
  }

  it("aplica el mismo orden torneo → partido → pairs en las RPC que compiten", async () => {
    const defs = await db.query<{ name: string; body: string }>(
      `SELECT p.proname AS name, pg_get_functiondef(p.oid) AS body
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN (
           'apply_torneo_express_grupo_resultado',
           'replace_torneo_express_pair_player',
           'append_torneo_express_pareja_grupo',
           'reorganize_torneo_express_grupos'
         )`
    );
    const byName = new Map(defs.rows.map((row) => [row.name, row.body]));
    const apply = byName.get("apply_torneo_express_grupo_resultado") ?? "";
    const torneo = apply.indexOf("-- lock-order: torneo");
    const partido = apply.indexOf("-- lock-order: partido");
    const pairs = apply.indexOf("-- lock-order: pairs");
    const update = apply.indexOf("UPDATE public.torneo_express_partidos");
    expect(torneo).toBeGreaterThan(0);
    expect(partido).toBeGreaterThan(torneo);
    expect(pairs).toBeGreaterThan(partido);
    expect(update).toBeGreaterThan(pairs);
    expect(apply.indexOf("FOR UPDATE")).toBeGreaterThan(torneo);
    expect(apply.indexOf("FOR UPDATE")).toBeLessThan(partido);

    for (const name of [
      "replace_torneo_express_pair_player",
      "append_torneo_express_pareja_grupo",
      "reorganize_torneo_express_grupos",
    ]) {
      const body = byName.get(name) ?? "";
      const lockTorneo = body.indexOf("te_lock_categoria_editable");
      const lockPartido = body.indexOf("FOR UPDATE OF p");
      expect(lockTorneo).toBeGreaterThan(0);
      expect(lockPartido).toBeGreaterThan(lockTorneo);
    }

    const replace = byName.get("replace_torneo_express_pair_player") ?? "";
    expect(replace.indexOf("FOR UPDATE OF p")).toBeLessThan(
      replace.indexOf("FROM public.pairs")
    );

    const signatures = await db.query<{ old_sig: string | null; new_sig: string | null }>(
      `SELECT
         to_regprocedure('public.apply_torneo_express_grupo_resultado(uuid,integer,integer,text,jsonb,boolean)')::text AS old_sig,
         to_regprocedure('public.apply_torneo_express_grupo_resultado(uuid,integer,integer,text,jsonb,boolean,jsonb)')::text AS new_sig`
    );
    expect(signatures.rows[0].old_sig).toBeNull();
    expect(signatures.rows[0].new_sig).toContain("apply_torneo_express_grupo_resultado");
  });

  function expectedJson(
    local1 = P_PEDRO,
    local2 = P_ANA,
    localPair = PAIR_A
  ): string {
    return JSON.stringify({
      local: {
        pair_id: localPair,
        player1_id: local1,
        player2_id: local2,
        is_virtual: false,
      },
      visitante: {
        pair_id: PAIR_B,
        player1_id: P_LUIS,
        player2_id: P_MARIA,
        is_virtual: false,
      },
    });
  }

  async function applyScore(
    visitante: number,
    expected: string | null,
    force = false
  ) {
    return db.query<{ r: { ok: boolean; status?: string; error?: string } }>(
      `SELECT public.apply_torneo_express_grupo_resultado(
         $1, 6, $2, 'local', NULL, $3, $4::jsonb
       ) AS r`,
      [MATCH, visitante, force, expected]
    );
  }

  it("caso A: un resultado ya persistido impide cambiar al jugador que lo disputó", async () => {
    await resetCategoria();
    const saved = await applyScore(4, expectedJson());
    expect(saved.rows[0].r).toMatchObject({ ok: true, status: "updated" });

    const replaced = await db.query<{ r: { ok: boolean; error?: string } }>(
      `SELECT public.replace_torneo_express_pair_player($1, $2, $3, $4) AS r`,
      [T, PAIR_A, P_PEDRO, P_CARLOS]
    );
    expect(replaced.rows[0].r).toEqual({ ok: false, error: "PAIR_HAS_HISTORY" });

    const pair = await db.query<{ player1_id: string; player1_name: string }>(
      `SELECT player1_id, player1_name FROM public.pairs WHERE id = $1`,
      [PAIR_A]
    );
    expect(pair.rows[0]).toEqual({
      player1_id: P_PEDRO,
      player1_name: "Pedro",
    });
  });

  it("caso B secuencial: el resultado usa la composición vigente al abrir y después ya no se reescribe", async () => {
    await resetCategoria();
    const replaced = await db.query<{ r: { ok: boolean } }>(
      `SELECT public.replace_torneo_express_pair_player($1, $2, $3, $4) AS r`,
      [T, PAIR_A, P_PEDRO, P_CARLOS]
    );
    expect(replaced.rows[0].r.ok).toBe(true);

    const saved = await applyScore(3, expectedJson(P_CARLOS, P_ANA));
    expect(saved.rows[0].r).toMatchObject({ ok: true, status: "updated" });

    const after = await db.query<{
      player1_id: string;
      puntos_local: number;
      ganador_id: string;
    }>(
      `SELECT pr.player1_id, p.puntos_local, p.ganador_id
       FROM public.torneo_express_partidos p
       JOIN public.pairs pr ON pr.id = p.pareja_local_id
       WHERE p.id = $1`,
      [MATCH]
    );
    expect(after.rows[0]).toEqual({
      player1_id: P_CARLOS,
      puntos_local: 6,
      ganador_id: PAIR_A,
    });

    const second = await db.query<{ r: { ok: boolean; error?: string } }>(
      `SELECT public.replace_torneo_express_pair_player($1, $2, $3, $4) AS r`,
      [T, PAIR_A, P_CARLOS, P_PEDRO]
    );
    expect(second.rows[0].r).toEqual({ ok: false, error: "PAIR_HAS_HISTORY" });
  });

  it("formulario viejo, slots invertidos, pair distinto, ausencia y force no escriben", async () => {
    await resetCategoria();
    await db.query(
      `UPDATE public.pairs SET player1_id = $2, player1_name = 'Carlos' WHERE id = $1`,
      [PAIR_A, P_CARLOS]
    );

    const stale = await applyScore(4, expectedJson());
    expect(stale.rows[0].r).toEqual({
      ok: false,
      error: "PAIR_COMPOSITION_CHANGED",
    });
    const untouched = await db.query<{ estado: string; puntos_local: number | null }>(
      `SELECT estado, puntos_local FROM public.torneo_express_partidos WHERE id = $1`,
      [MATCH]
    );
    expect(untouched.rows[0]).toEqual({ estado: "pendiente", puntos_local: null });

    const forced = await applyScore(4, expectedJson(), true);
    expect(forced.rows[0].r.error).toBe("PAIR_COMPOSITION_CHANGED");
    expect(untouched.rows[0].estado).toBe("pendiente");

    await resetCategoria();
    const swapped = await applyScore(4, expectedJson(P_ANA, P_PEDRO));
    expect(swapped.rows[0].r.error).toBe("PAIR_COMPOSITION_CHANGED");

    const wrongPair = await applyScore(
      4,
      expectedJson(P_PEDRO, P_ANA, "dddddddd-dddd-dddd-dddd-dddddddddddd")
    );
    expect(wrongPair.rows[0].r.error).toBe("PAIR_COMPOSITION_CHANGED");

    const missing = await applyScore(4, null);
    expect(missing.rows[0].r.error).toBe("PAIR_COMPOSITION_CHANGED");

    const malformed = await db.query<{ r: { error: string } }>(
      `SELECT public.apply_torneo_express_grupo_resultado(
         $1, 6, 4, 'local', NULL, true, '{"local":"no"}'::jsonb
       ) AS r`,
      [MATCH]
    );
    expect(malformed.rows[0].r.error).toBe("PAIR_COMPOSITION_CHANGED");

    const legacy = await db.query<{ r: { error: string } }>(
      `SELECT public.apply_torneo_express_grupo_resultado(
         $1, 6, 4, 'local', NULL, false
       ) AS r`,
      [MATCH]
    );
    expect(legacy.rows[0].r.error).toBe("PAIR_COMPOSITION_CHANGED");

    const stillPending = await db.query<{ puntos_local: number | null }>(
      `SELECT puntos_local FROM public.torneo_express_partidos WHERE id = $1`,
      [MATCH]
    );
    expect(stillPending.rows[0].puntos_local).toBeNull();
  });

  it("reabrir con la composición nueva guarda, y otra pareja no bloquea", async () => {
    await resetCategoria();
    await db.query(
      `UPDATE public.pairs SET player1_id = $2, player1_name = 'Carlos' WHERE id = $1`,
      [PAIR_A, P_CARLOS]
    );
    const reopened = await applyScore(4, expectedJson(P_CARLOS, P_ANA));
    expect(reopened.rows[0].r).toMatchObject({ ok: true, status: "updated" });

    await resetCategoria();
    await db.query(
      `INSERT INTO public.players (id, name) VALUES
        ('20000000-0000-0000-0000-000000000008', 'Extra'),
        ('20000000-0000-0000-0000-000000000009', 'Dos')
       ON CONFLICT (id) DO NOTHING`
    );
    await db.query(
      `INSERT INTO public.pairs
        (id, tournament_id, player1_id, player2_id, player1_name, player2_name)
       VALUES ($1, $2, $3, $4, 'Extra', 'Dos')`,
      [
        "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
        T,
        "20000000-0000-0000-0000-000000000008",
        "20000000-0000-0000-0000-000000000009",
      ]
    );
    await db.query(
      `UPDATE public.pairs
       SET player1_id = '20000000-0000-0000-0000-000000000007', player1_name = 'Carlos'
       WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'`
    );
    const untouchedMatch = await applyScore(4, expectedJson());
    expect(untouchedMatch.rows[0].r).toMatchObject({ ok: true, status: "updated" });
  });

  it("conserva conflicto, force y marcador idéntico cuando la composición no cambió", async () => {
    await resetCategoria();
    await applyScore(4, expectedJson());
    const same = await applyScore(4, expectedJson());
    expect(same.rows[0].r.status).toBe("unchanged");

    const conflict = await applyScore(2, expectedJson());
    expect(conflict.rows[0].r).toMatchObject({ ok: false, error: "conflict" });

    const forced = await applyScore(2, expectedJson(), true);
    expect(forced.rows[0].r).toMatchObject({ ok: true, status: "updated" });
  });

  const PAIR_V = "ffffffff-ffff-ffff-ffff-ffffffffffff";
  const P_MARA = "20000000-0000-0000-0000-000000000011";
  const P_FER = "20000000-0000-0000-0000-000000000012";
  const ELIM = "dddddddd-dddd-dddd-dddd-dddddddddddd";

  async function makeVirtualSlot(): Promise<void> {
    await resetCategoria();
    await db.query(
      `UPDATE public.pairs
       SET is_virtual = true,
           virtual_label = 'Pareja por definir 1',
           player1_id = NULL,
           player2_id = NULL,
           player1_name = NULL,
           player2_name = NULL
       WHERE id = $1`,
      [PAIR_A]
    );
    await db.query(
      `INSERT INTO public.players (id, name) VALUES ($1, 'Mara Blanco'), ($2, 'Fernanda Fabian')`,
      [P_MARA, P_FER]
    );
  }

  function virtualSnapshot(resolved = false): string {
    return JSON.stringify({
      local: resolved
        ? {
            pair_id: PAIR_A,
            player1_id: P_MARA,
            player2_id: P_FER,
            is_virtual: false,
          }
        : {
            pair_id: PAIR_A,
            player1_id: null,
            player2_id: null,
            is_virtual: true,
          },
      visitante: {
        pair_id: PAIR_B,
        player1_id: P_LUIS,
        player2_id: P_MARIA,
        is_virtual: false,
      },
    });
  }

  async function resolveVirtual(accept: boolean, p1 = P_MARA, p2 = P_FER) {
    return db.query<{
      r: { ok: boolean; error?: string; pareja_id?: string; played_count?: number };
    }>(
      `SELECT public.resolve_torneo_express_virtual_pair($1, $2, $3, $4, $5) AS r`,
      [T, PAIR_A, p1, p2, accept]
    );
  }

  it("las filas reales siguen válidas y el CHECK rechaza formas mixtas", async () => {
    await resetCategoria();
    const shape = await db.query<{ def: string; nnull: boolean; fks: number }>(
      `SELECT pg_get_constraintdef(c.oid) AS def,
              bool_or(a.attnotnull) AS nnull,
              (SELECT count(*) FROM pg_constraint f
                WHERE f.conrelid = 'public.pairs'::regclass AND f.contype = 'f') AS fks
       FROM pg_constraint c
       JOIN pg_attribute a
         ON a.attrelid = c.conrelid
        AND a.attname IN ('player1_id', 'player2_id', 'player1_name', 'player2_name')
       WHERE c.conname = 'pairs_shape_real_or_virtual'
       GROUP BY c.oid`
    );
    expect(shape.rows[0].def).toContain("is_virtual");
    expect(shape.rows[0].def).toContain("btrim");
    expect(shape.rows[0].nnull).toBe(false);
    expect(Number(shape.rows[0].fks)).toBe(2);

    const badExisting = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.pairs
       WHERE player1_id IS NULL OR player2_id IS NULL
          OR player1_name IS NULL OR player2_name IS NULL
          OR is_virtual OR virtual_label IS NOT NULL`
    );
    expect(badExisting.rows[0].n).toBe(0);

    await db.query(
      `INSERT INTO public.pairs
        (id, tournament_id, is_virtual, virtual_label)
       VALUES ($1, $2, true, 'Pareja por definir 2')`,
      [PAIR_V, T]
    );
    await db.query(`DELETE FROM public.pairs WHERE id = $1`, [PAIR_V]);

    const rejects = [
      `INSERT INTO public.pairs (id, tournament_id, is_virtual, virtual_label, player1_id)
       VALUES ('${PAIR_V}', '${T}', true, 'x', '${P_PEDRO}')`,
      `INSERT INTO public.pairs (id, tournament_id, player1_id, player2_name, player2_id, player1_name)
       VALUES ('${PAIR_V}', '${T}', NULL, 'Ana', '${P_ANA}', 'Pedro')`,
      `INSERT INTO public.pairs (id, tournament_id, player1_id, player2_id, player1_name, player2_name, virtual_label)
       VALUES ('${PAIR_V}', '${T}', '${P_PEDRO}', '${P_ANA}', 'Pedro', 'Ana', 'etiqueta')`,
      `INSERT INTO public.pairs (id, tournament_id, is_virtual, virtual_label)
       VALUES ('${PAIR_V}', '${T}', true, '   ')`,
      `INSERT INTO public.pairs (id, tournament_id, is_virtual)
       VALUES ('${PAIR_V}', '${T}', true)`,
    ];
    for (const sql of rejects) {
      await expect(db.exec(sql)).rejects.toThrow();
    }
  });

  it("resuelve la virtual en el mismo id sin tocar partidos ni crear players", async () => {
    await makeVirtualSlot();
    await db.query(
      `UPDATE public.torneo_express_partidos
       SET cancha = '1', programado_en = '2026-10-03T18:00:00Z', orden = 5, ronda = 2
       WHERE id = $1`,
      [MATCH]
    );
    await db.query(
      `INSERT INTO public.torneo_express_eliminatoria_partidos
        (id, torneo_id, pareja_local_id, pareja_visitante_id, estado, es_bye, cancha, programado_en, ronda, orden)
       VALUES ($1, $2, $3, $4, 'pendiente', false, '1', '2026-10-03T20:00:00Z', 1, 1)`,
      [ELIM, T, PAIR_A, PAIR_B]
    );
    const playersBefore = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.players`
    );

    const saved = await applyScore(4, virtualSnapshot());
    expect(saved.rows[0].r).toMatchObject({ ok: true, status: "updated" });

    const blocked = await resolveVirtual(false);
    expect(blocked.rows[0].r.error).toBe("VIRTUAL_PAIR_HAS_HISTORY");
    expect(blocked.rows[0].r.played_count).toBe(1);

    const resolved = await resolveVirtual(true);
    expect(resolved.rows[0].r).toMatchObject({
      ok: true,
      pareja_id: PAIR_A,
      played_count: 1,
    });

    const pair = await db.query<{
      id: string;
      is_virtual: boolean;
      virtual_label: string | null;
      player1_id: string;
      player2_id: string;
      player1_name: string;
      player2_name: string;
    }>(
      `SELECT id, is_virtual, virtual_label, player1_id, player2_id, player1_name, player2_name
       FROM public.pairs WHERE id = $1`,
      [PAIR_A]
    );
    expect(pair.rows[0]).toEqual({
      id: PAIR_A,
      is_virtual: false,
      virtual_label: null,
      player1_id: P_MARA,
      player2_id: P_FER,
      player1_name: "Mara Blanco",
      player2_name: "Fernanda Fabian",
    });

    const partido = await db.query<{
      pareja_local_id: string;
      cancha: string;
      orden: number;
      estado: string;
    }>(
      `SELECT pareja_local_id, cancha, orden, estado
       FROM public.torneo_express_partidos WHERE id = $1`,
      [MATCH]
    );
    expect(partido.rows[0]).toEqual({
      pareja_local_id: PAIR_A,
      cancha: "1",
      orden: 5,
      estado: "jugado",
    });

    const elim = await db.query<{ pareja_local_id: string; programado: string }>(
      `SELECT pareja_local_id,
              to_char(programado_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI') AS programado
       FROM public.torneo_express_eliminatoria_partidos WHERE id = $1`,
      [ELIM]
    );
    expect(elim.rows[0]).toEqual({
      pareja_local_id: PAIR_A,
      programado: "2026-10-03T20:00",
    });

    const playersAfter = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.players`
    );
    expect(playersAfter.rows[0].n).toBe(playersBefore.rows[0].n);

    const stale = await applyScore(4, virtualSnapshot(), true);
    expect(stale.rows[0].r.error).toBe("PAIR_COMPOSITION_CHANGED");

    const reopened = await applyScore(3, virtualSnapshot(true), true);
    expect(reopened.rows[0].r).toMatchObject({ ok: true, status: "updated" });

    const again = await resolveVirtual(true, P_CARLOS, P_MARA);
    expect(again.rows[0].r.error).toBe("VIRTUAL_PAIR_ALREADY_RESOLVED");
    const still = await db.query<{ player1_id: string }>(
      `SELECT player1_id FROM public.pairs WHERE id = $1`,
      [PAIR_A]
    );
    expect(still.rows[0].player1_id).toBe(P_MARA);
  });

  it("rechaza virtual incompleta, jugador duplicado, misma persona y cambiar jugador", async () => {
    await makeVirtualSlot();
    const mixed = await applyScore(
      4,
      JSON.stringify({
        local: {
          pair_id: PAIR_A,
          player1_id: P_MARA,
          player2_id: null,
          is_virtual: true,
        },
        visitante: {
          pair_id: PAIR_B,
          player1_id: P_LUIS,
          player2_id: P_MARIA,
          is_virtual: false,
        },
      })
    );
    expect(mixed.rows[0].r.error).toBe("PAIR_COMPOSITION_CHANGED");

    const samePerson = await resolveVirtual(false, P_MARA, P_MARA);
    expect(samePerson.rows[0].r.error).toBe("INVALID_MATCH_PAYLOAD");

    const duplicate = await resolveVirtual(false, P_LUIS, P_MARA);
    expect(duplicate.rows[0].r.error).toBe("PLAYER_ALREADY_REGISTERED");

    const replaced = await db.query<{ r: { error?: string } }>(
      `SELECT public.replace_torneo_express_pair_player($1, $2, $3, $4) AS r`,
      [T, PAIR_A, P_MARA, P_CARLOS]
    );
    expect(replaced.rows[0].r.error).toBe("PAIR_IS_VIRTUAL");

    const stillVirtual = await db.query<{ is_virtual: boolean }>(
      `SELECT is_virtual FROM public.pairs WHERE id = $1`,
      [PAIR_A]
    );
    expect(stillVirtual.rows[0].is_virtual).toBe(true);
  });

  it("bloquea cerrado y finalizado, y permite eliminatoria", async () => {
    await makeVirtualSlot();
    await db.query(
      `UPDATE public.torneo_express SET fase_torneo = 'cerrado' WHERE id = $1`,
      [T]
    );
    expect((await resolveVirtual(false)).rows[0].r.error).toBe("TOURNAMENT_CLOSED");

    await db.query(
      `UPDATE public.torneo_express
       SET fase_torneo = 'grupos', estado = 'finalizado' WHERE id = $1`,
      [T]
    );
    expect((await resolveVirtual(false)).rows[0].r.error).toBe("TOURNAMENT_CLOSED");

    await db.query(
      `UPDATE public.torneo_express
       SET fase_torneo = 'eliminatoria', estado = 'en_curso' WHERE id = $1`,
      [T]
    );
    await db.query(
      `INSERT INTO public.torneo_express_eliminatoria_partidos
        (id, torneo_id, pareja_local_id, pareja_visitante_id, estado, es_bye, programado_en, orden, ronda)
       VALUES ($1, $2, $3, $4, 'pendiente', false, '2026-10-03T21:00:00Z', 1, 1)`,
      [ELIM, T, PAIR_A, PAIR_B]
    );
    const resolved = await resolveVirtual(false);
    expect(resolved.rows[0].r.ok).toBe(true);
    const bracket = await db.query<{ pareja_local_id: string; orden: number }>(
      `SELECT pareja_local_id, orden
       FROM public.torneo_express_eliminatoria_partidos WHERE id = $1`,
      [ELIM]
    );
    expect(bracket.rows[0]).toEqual({ pareja_local_id: PAIR_A, orden: 1 });
  });

  it("la reorganización y el round robin usan pair.id de la virtual", async () => {
    await makeVirtualSlot();
    await db.query(`DELETE FROM public.torneo_express_partidos`);
    await db.query(
      `DELETE FROM public.torneo_express_grupo_parejas WHERE pareja_id = $1`,
      [PAIR_A]
    );
    await db.query(
      `INSERT INTO public.pairs (id, tournament_id, is_virtual, virtual_label)
       VALUES ($1, $2, true, 'Pareja por definir 2')`,
      [PAIR_V, T]
    );
    await db.query(
      `INSERT INTO public.torneo_express_grupo_parejas (grupo_id, pareja_id)
       VALUES ($1, $2)`,
      [G, PAIR_V]
    );

    const rr = await db.query<{
      local_id: string;
      visitante_id: string;
      ronda: number;
      orden: number;
    }>(
      `SELECT local_id, visitante_id, ronda, orden
       FROM public.te_balanced_round_robin(ARRAY[$1, $2]::uuid[])`,
      [PAIR_V, PAIR_B]
    );
    expect(rr.rows).toHaveLength(1);
    expect([rr.rows[0].local_id, rr.rows[0].visitante_id].sort()).toEqual(
      [PAIR_B, PAIR_V].sort()
    );

    const reorg = await db.query<{ r: { ok: boolean; error?: string } }>(
      `SELECT public.reorganize_torneo_express_grupos($1, $2::jsonb) AS r`,
      [
        T,
        JSON.stringify({
          grupos: [
            {
              nombre: "Grupo 1",
              orden: 1,
              pareja_ids: [PAIR_V, PAIR_B],
            },
          ],
          partidos: [
            {
              grupo_orden: 1,
              pareja_local_id: rr.rows[0].local_id,
              pareja_visitante_id: rr.rows[0].visitante_id,
              ronda: rr.rows[0].ronda,
              orden: rr.rows[0].orden,
              cancha: "1",
              programado_en: "2026-10-03T18:00:00Z",
            },
          ],
        }),
      ]
    );
    expect(reorg.rows[0].r.ok).toBe(true);
    const kept = await db.query<{ id: string; is_virtual: boolean; programado: string }>(
      `SELECT pr.id, pr.is_virtual, p.programado_en::text AS programado
       FROM public.pairs pr
       JOIN public.torneo_express_partidos p
         ON p.pareja_local_id = pr.id OR p.pareja_visitante_id = pr.id
       WHERE pr.id = $1`,
      [PAIR_V]
    );
    expect(kept.rows[0].is_virtual).toBe(true);
    expect(kept.rows[0].programado).toContain("2026-10-03");
  });
});
