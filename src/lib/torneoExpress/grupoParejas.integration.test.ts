/**
 * @jest-environment node
 */
/**
 * RUN_SQL_INTEGRATION=1 NODE_OPTIONS=--experimental-vm-modules \
 *   npx react-scripts test --watchAll=false --runInBand \
 *   src/lib/torneoExpress/grupoParejas.integration.test.ts
 *
 * PGlite no cruza dos transacciones. Los conflictos se prueban en secuencia:
 * versión vieja, fase ya cerrada, reset después del cambio.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import type { PGlite as PGliteType } from "@electric-sql/pglite";

const nodeBuffer = require("buffer");
if (typeof (global as { Blob?: unknown }).Blob === "undefined") {
  (global as { Blob?: unknown }).Blob = nodeBuffer.Blob;
}

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

const maybeDescribe = process.env.RUN_SQL_INTEGRATION === "1" ? describe : describe.skip;

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
const T = "22222222-2222-4222-8222-222222222222";
const G = "33333333-3333-4333-8333-333333333333";
const G2 = "33333333-3333-4333-8333-333333333334";
const PA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const PB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const PC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const PD = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4";
const P2A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const J = [
  "20000000-0000-4000-8000-000000000001",
  "20000000-0000-4000-8000-000000000002",
  "20000000-0000-4000-8000-000000000003",
  "20000000-0000-4000-8000-000000000004",
  "20000000-0000-4000-8000-000000000005",
  "20000000-0000-4000-8000-000000000006",
  "20000000-0000-4000-8000-000000000007",
  "20000000-0000-4000-8000-000000000008",
];
const JNEW = "20000000-0000-4000-8000-000000000009";
const JNEW2 = "20000000-0000-4000-8000-000000000010";
const JREX = "20000000-0000-4000-8000-000000000011";
const JSOL = "20000000-0000-4000-8000-000000000012";
const MAB = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const MAC = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const MAD = "cccccccc-cccc-4ccc-8ccc-ccccccccccc3";
const MBC = "cccccccc-cccc-4ccc-8ccc-ccccccccccc4";
const MBD = "cccccccc-cccc-4ccc-8ccc-ccccccccccc5";
const MCD = "cccccccc-cccc-4ccc-8ccc-ccccccccccc6";
const M2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc7";
const ELIM = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

type Rpc = { ok: boolean; error?: string; version?: number; mode?: string; pareja_id?: string; partidos_creados?: number; creados?: number; retirados?: number; pendientes_retirados?: number; unchanged?: boolean };

maybeDescribe("fase 3 roster de grupos", () => {
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
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      END $$;
      CREATE TABLE public.players (id uuid PRIMARY KEY, name text);
      CREATE TABLE public.pairs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tournament_id uuid,
        player1_id uuid, player2_id uuid, player1_name text, player2_name text,
        created_at timestamptz DEFAULT now()
      );
      CREATE TABLE public.torneo_express (
        id uuid PRIMARY KEY, organizador_id uuid, fase_torneo text, estado text,
        fase_eliminacion text, bracket_slots jsonb, fase_grupos_finalizada_at timestamptz,
        nombre text
      );
      CREATE TABLE public.torneo_express_grupos (
        id uuid PRIMARY KEY, torneo_id uuid, nombre text, orden integer
      );
      CREATE TABLE public.torneo_express_grupo_parejas (
        grupo_id uuid, pareja_id uuid, PRIMARY KEY (grupo_id, pareja_id)
      );
      CREATE TABLE public.torneo_express_partidos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), grupo_id uuid, pareja_local_id uuid, pareja_visitante_id uuid,
        estado text, puntos_local integer, puntos_visitante integer, ganador_id uuid,
        sets_resultado jsonb, ronda integer, orden integer, cancha text, programado_en timestamptz
      );
      CREATE TABLE public.torneo_express_eliminatoria_partidos (
        id uuid PRIMARY KEY, torneo_id uuid NOT NULL, ronda integer NOT NULL DEFAULT 1,
        orden integer NOT NULL DEFAULT 1, cruce_index integer NOT NULL DEFAULT 0,
        pareja_local_id uuid, pareja_visitante_id uuid, puntos_local integer,
        puntos_visitante integer, ganador_id uuid, estado text, es_bye boolean,
        cancha text, programado_en timestamptz, created_at timestamptz DEFAULT now(),
        sets_resultado jsonb
      );
      CREATE TABLE public.rating_historial (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        jugador_id uuid, partido_ref text
      );
      CREATE FUNCTION public._is_legal_padel_set(p_local integer, p_visitante integer)
      RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT true $$;
      CREATE FUNCTION public._are_legal_padel_sets(p_sets jsonb)
      RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT true $$;
    `);
    for (const file of [
      "0003_apply_torneo_express_grupo_resultado.sql",
      "0044_torneo_express_categoria_edicion.sql",
      "0046_torneo_express_virtual_pairs.sql",
      "0048_torneo_express_grupo_reset.sql",
      "0049_torneo_express_grupo_parejas.sql",
    ]) {
      const source = readFileSync(resolve(__dirname, "../../../supabase/migrations", file), "utf8");
      const statements = splitSql(source);
      for (let index = 0; index < statements.length; index += 1) {
        try {
          await db.exec(statements[index]);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`${file} #${index}: ${message}\n${statements[index].slice(0, 200)}`);
        }
      }
    }
    await db.exec(`
      CREATE OR REPLACE FUNCTION public._revert_rating_for_partido_ref(p_ref text)
      RETURNS void LANGUAGE plpgsql AS $fn$
      BEGIN
        DELETE FROM public.rating_historial WHERE partido_ref = p_ref;
      END;
      $fn$;
    `);
    await db.query(`SELECT set_config('app.user_id', $1, false)`, [ORG]);
  }, 90000);

  afterAll(async () => {
    await db.close();
  });

  async function seed(): Promise<void> {
    await db.exec(`
      DELETE FROM public.rating_historial;
      DELETE FROM public.torneo_express_partidos;
      DELETE FROM public.torneo_express_grupo_parejas;
      DELETE FROM public.torneo_express_eliminatoria_partidos;
      DELETE FROM public.torneo_express_grupos;
      DELETE FROM public.torneo_express;
      DELETE FROM public.pairs;
      DELETE FROM public.players;
    `);
    await db.query(
      `INSERT INTO public.players (id, name) VALUES
        ($1,'Ana'),($2,'Luis'),($3,'Mara'),($4,'Paz'),
        ($5,'Noa'),($6,'Teo'),($7,'Ira'),($8,'Leo'),
        ($9,'Eva'),($10,'Otto'),($11,'Rex'),($12,'Sol')`,
      [...J, JNEW, JNEW2, JREX, JSOL]
    );
    await db.query(
      `INSERT INTO public.pairs
        (id, tournament_id, player1_id, player2_id, player1_name, player2_name, is_virtual, virtual_label)
       VALUES
        ($1,$2,$3,$4,'Ana','Luis',false,NULL),
        ($5,$2,$6,$7,'Mara','Paz',false,NULL),
        ($8,$2,$9,$10,'Noa','Teo',false,NULL),
        ($11,$2,$12,$13,'Ira','Leo',false,NULL)`,
      [PA, T, J[0], J[1], PB, J[2], J[3], PC, J[4], J[5], PD, J[6], J[7]]
    );
    await db.query(
      `INSERT INTO public.torneo_express (id, organizador_id, fase_torneo, estado, nombre)
       VALUES ($1,$2,'grupos','en_curso','Open')`,
      [T, ORG]
    );
    await db.query(
      `INSERT INTO public.torneo_express_grupos (id, torneo_id, nombre, orden)
       VALUES ($1,$3,'A',1),($2,$3,'B',2)`,
      [G, G2, T]
    );
    await db.query(
      `INSERT INTO public.torneo_express_grupo_parejas (grupo_id, pareja_id)
       VALUES ($1,$2),($1,$3),($1,$4),($1,$5),($6,$3),($6,$4)`,
      [G, PA, PB, PC, PD, G2]
    );
    await db.query(
      `INSERT INTO public.torneo_express_partidos
        (id, grupo_id, pareja_local_id, pareja_visitante_id, estado, ronda, orden, cancha, programado_en)
       VALUES
        ($1,$7,$8,$9,'pendiente',1,1,'1','2026-08-01T15:00:00Z'),
        ($2,$7,$8,$10,'pendiente',1,2,'1','2026-08-01T16:00:00Z'),
        ($3,$7,$8,$11,'pendiente',1,3,'2','2026-08-01T15:00:00Z'),
        ($4,$7,$9,$10,'pendiente',1,4,'2','2026-08-01T16:00:00Z'),
        ($5,$7,$9,$11,'pendiente',1,5,'1','2026-08-01T17:00:00Z'),
        ($6,$7,$10,$11,'pendiente',1,6,'2','2026-08-01T17:00:00Z'),
        ($12,$13,$9,$10,'jugado',1,1,'3','2026-08-01T18:00:00Z')`,
      [MAB, MAC, MAD, MBC, MBD, MCD, G, PA, PB, PC, PD, M2, G2]
    );
    await db.query(
      `UPDATE public.torneo_express_partidos
       SET puntos_local = 6, puntos_visitante = 3, ganador_id = $2
       WHERE id = $1`,
      [M2, PB]
    );
  }

  function expected(local1 = J[0], local2 = J[1], visit1 = J[2], visit2 = J[3], localPair = PA, visitPair = PB): string {
    return JSON.stringify({
      local: { pair_id: localPair, player1_id: local1, player2_id: local2, is_virtual: false },
      visitante: { pair_id: visitPair, player1_id: visit1, player2_id: visit2, is_virtual: false },
    });
  }

  async function play(matchId: string, expectedJson: string, force = false): Promise<Rpc> {
    const result = await db.query<{ r: Rpc }>(
      `SELECT public.apply_torneo_express_grupo_resultado($1, 6, 4, 'local', NULL, $2, $3::jsonb) AS r`,
      [matchId, force, expectedJson]
    );
    return result.rows[0].r;
  }

  async function version(): Promise<number> {
    const result = await db.query<{ version: number }>(
      `SELECT version FROM public.torneo_express_grupos WHERE id = $1`,
      [G]
    );
    return result.rows[0].version;
  }

  beforeEach(async () => {
    await seed();
    await db.query(`SELECT set_config('app.user_id', $1, false)`, [ORG]);
  });

  it("al jugar congela a los jugadores y una corrección no los cambia", async () => {
    const saved = await play(MAB, expected());
    expect(saved).toMatchObject({ ok: true, status: "updated" });
    const snap = await db.query<{ participantes: { local: { player1_id: string; player1_name: string } } }>(
      `SELECT participantes FROM public.torneo_express_partidos WHERE id = $1`,
      [MAB]
    );
    expect(snap.rows[0].participantes.local.player1_id).toBe(J[0]);
    expect(snap.rows[0].participantes.local.player1_name).toBe("Ana");

    await db.query(
      `UPDATE public.pairs SET player1_id = $2, player1_name = 'Eva' WHERE id = $1`,
      [PA, JNEW]
    );
    const corrected = await play(MAB, expected(JNEW, J[1]), true);
    expect(corrected.ok).toBe(true);
    const after = await db.query<{ player1_id: string; puntos_local: number }>(
      `SELECT participantes->'local'->>'player1_id' AS player1_id, puntos_local
       FROM public.torneo_express_partidos WHERE id = $1`,
      [MAB]
    );
    expect(after.rows[0].player1_id).toBe(J[0]);
    expect(after.rows[0].puntos_local).toBe(6);
    const schedule = await db.query<{ cancha: string; orden: number }>(
      `SELECT cancha, orden FROM public.torneo_express_partidos WHERE id = $1`,
      [MAB]
    );
    expect(schedule.rows[0]).toEqual({ cancha: "1", orden: 1 });
  });

  it("cambiar antes de jugar muta la pareja y una versión vieja no escribe", async () => {
    const changed = await db.query<{ r: Rpc }>(
      `SELECT public.cambiar_torneo_express_jugador_grupo($1,$2,$3,$4,1) AS r`,
      [G, PA, J[0], JNEW]
    );
    expect(changed.rows[0].r).toMatchObject({ ok: true, mode: "in_place", pareja_id: PA, version: 2 });
    const pair = await db.query<{ player1_id: string }>(
      `SELECT player1_id FROM public.pairs WHERE id = $1`,
      [PA]
    );
    expect(pair.rows[0].player1_id).toBe(JNEW);
    const stale = await db.query<{ r: Rpc }>(
      `SELECT public.cambiar_torneo_express_jugador_grupo($1,$2,$3,$4,1) AS r`,
      [G, PA, JNEW, JNEW2]
    );
    expect(stale.rows[0].r.error).toBe("STALE_GROUP_VERSION");
    const still = await db.query<{ player1_id: string }>(
      `SELECT player1_id FROM public.pairs WHERE id = $1`,
      [PA]
    );
    expect(still.rows[0].player1_id).toBe(JNEW);
    const other = await db.query<{ estado: string }>(
      `SELECT estado FROM public.torneo_express_partidos WHERE id = $1`,
      [M2]
    );
    expect(other.rows[0].estado).toBe("jugado");
  });

  it("cambiar después de jugar deja el histórico y mueve solo los pendientes", async () => {
    expect((await play(MAB, expected())).ok).toBe(true);
    const changed = await db.query<{ r: Rpc }>(
      `SELECT public.cambiar_torneo_express_jugador_grupo($1,$2,$3,$4,$5) AS r`,
      [G, PA, J[0], JNEW, await version()]
    );
    expect(changed.rows[0].r.mode).toBe("desde_ahora");
    const played = await db.query<{ local: string; player: string }>(
      `SELECT pareja_local_id AS local, participantes->'local'->>'player1_id' AS player
       FROM public.torneo_express_partidos WHERE id = $1`,
      [MAB]
    );
    expect(played.rows[0]).toEqual({ local: PA, player: J[0] });
    const pending = await db.query<{ local: string }>(
      `SELECT pareja_local_id AS local FROM public.torneo_express_partidos WHERE id = $1`,
      [MAC]
    );
    expect(pending.rows[0].local).toBe(changed.rows[0].r.pareja_id);
    const oldPair = await db.query<{ player1_id: string }>(
      `SELECT player1_id FROM public.pairs WHERE id = $1`,
      [PA]
    );
    expect(oldPair.rows[0].player1_id).toBe(J[0]);
    expect(await version()).toBe(3);
  });

  it("agregar pareja crea solo los cruces nuevos y no pisa lo jugado", async () => {
    expect((await play(MAB, expected())).ok).toBe(true);
    const before = await db.query<{ id: string; orden: number; cancha: string; estado: string }>(
      `SELECT id, orden, cancha, estado FROM public.torneo_express_partidos
       WHERE grupo_id = $1 ORDER BY orden`,
      [G]
    );
    const payload = [PA, PB, PC, PD].map((rival, index) => ({
      rival_id: rival,
      ronda: 2,
      orden: 7 + index,
      cancha: "9",
      programado_en: `2026-08-01T${20 + index}:00:00Z`,
    }));
    const added = await db.query<{ r: Rpc }>(
      `SELECT public.append_torneo_express_pareja_grupo($1,$2,$3,$4,$5::jsonb,$6) AS r`,
      [T, G, JNEW, JNEW2, JSON.stringify(payload), await version()]
    );
    expect(added.rows[0].r).toMatchObject({ ok: true, partidos_creados: 4 });
    const count = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.torneo_express_partidos WHERE grupo_id = $1`,
      [G]
    );
    expect(count.rows[0].n).toBe(10);
    const after = await db.query<{ id: string; orden: number; cancha: string; estado: string }>(
      `SELECT id, orden, cancha, estado FROM public.torneo_express_partidos
       WHERE id = ANY($1::uuid[]) ORDER BY orden`,
      [[MAB, MAC, MAD, MBC, MBD, MCD]]
    );
    expect(after.rows).toEqual(before.rows);
    const again = await db.query<{ r: Rpc }>(
      `SELECT public.append_torneo_express_pareja_grupo($1,$2,$3,$4,$5::jsonb,$6) AS r`,
      [T, G, JNEW, JNEW2, JSON.stringify(payload), added.rows[0].r.version]
    );
    expect(again.rows[0].r.error).toBe("PAIR_ALREADY_IN_GROUP");
    const stale = await db.query<{ r: Rpc }>(
      `SELECT public.append_torneo_express_pareja_grupo($1,$2,$3,$4,'[]'::jsonb,1) AS r`,
      [T, G, J[0], J[1]]
    );
    expect(stale.rows[0].r.error).toBe("STALE_GROUP_VERSION");
  });

  it("reemplaza in-place sin historial y desde ahora si ya jugó", async () => {
    const fresh = await db.query<{ r: Rpc }>(
      `SELECT public.reemplazar_torneo_express_pareja_grupo($1,$2,$3,$4,1) AS r`,
      [G, PD, JNEW, JNEW2]
    );
    expect(fresh.rows[0].r).toMatchObject({ ok: true, mode: "in_place", pareja_id: PD });
    expect((await play(MAB, expected())).ok).toBe(true);
    const current = await version();
    const replaced = await db.query<{ r: Rpc }>(
      `SELECT public.reemplazar_torneo_express_pareja_grupo($1,$2,$3,$4,$5) AS r`,
      [G, PA, JREX, JSOL, current]
    );
    expect(replaced.rows[0].r.mode).toBe("desde_ahora");
    const played = await db.query<{ local: string; player: string }>(
      `SELECT pareja_local_id AS local, participantes->'local'->>'player1_id' AS player
       FROM public.torneo_express_partidos WHERE id = $1`,
      [MAB]
    );
    expect(played.rows[0]).toEqual({ local: PA, player: J[0] });
    const pending = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.torneo_express_partidos
       WHERE grupo_id = $1 AND (pareja_local_id = $2 OR pareja_visitante_id = $2)`,
      [G, replaced.rows[0].r.pareja_id]
    );
    expect(pending.rows[0].n).toBe(2);
    const keys = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM (
         SELECT public.te_matchup_key(pareja_local_id, pareja_visitante_id)
         FROM public.torneo_express_partidos WHERE grupo_id = $1
         GROUP BY 1 HAVING count(*) > 1
       ) d`,
      [G]
    );
    expect(keys.rows[0].n).toBe(0);
    expect(await version()).toBe(current + 1);
  });

  it("retirar conserva jugados, rating y snapshot, y finaliza sin esos pendientes", async () => {
    expect((await play(MAB, expected())).ok).toBe(true);
    expect((await play(MBC, expected(J[2], J[3], J[4], J[5], PB, PC))).ok).toBe(true);
    expect((await play(MBD, expected(J[2], J[3], J[6], J[7], PB, PD))).ok).toBe(true);
    expect((await play(MCD, expected(J[4], J[5], J[6], J[7], PC, PD))).ok).toBe(true);
    await db.query(
      `INSERT INTO public.rating_historial (jugador_id, partido_ref) VALUES ($1, $2)`,
      [J[0], `te-grupo:${MAB}`]
    );
    const current = await version();
    const withdrawn = await db.query<{ r: Rpc }>(
      `SELECT public.retirar_torneo_express_pareja_grupo($1,$2,$3) AS r`,
      [G, PA, current]
    );
    expect(withdrawn.rows[0].r.pendientes_retirados).toBe(2);
    const played = await db.query<{ estado: string; player: string }>(
      `SELECT estado, participantes->'local'->>'player1_id' AS player
       FROM public.torneo_express_partidos WHERE id = $1`,
      [MAB]
    );
    expect(played.rows[0]).toEqual({ estado: "jugado", player: J[0] });
    const rating = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.rating_historial WHERE partido_ref = $1`,
      [`te-grupo:${MAB}`]
    );
    expect(rating.rows[0].n).toBe(1);
    const pending = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.torneo_express_partidos
       WHERE grupo_id = $1 AND estado = 'pendiente'`,
      [G]
    );
    expect(pending.rows[0].n).toBe(0);
    const again = await db.query<{ r: Rpc }>(
      `SELECT public.retirar_torneo_express_pareja_grupo($1,$2,$3) AS r`,
      [G, PA, withdrawn.rows[0].r.version]
    );
    expect(again.rows[0].r.error).toBe("PAIR_ALREADY_WITHDRAWN");
    const closed = await db.query<{ r: Rpc }>(
      `SELECT public.confirmar_torneo_express_fase_eliminatoria_transicion($1,'semifinal','[]'::jsonb) AS r`,
      [T]
    );
    expect(closed.rows[0].r.ok).toBe(true);
  });

  it("reconciliar es idempotente y no toca jugados ni su snapshot", async () => {
    expect((await play(MAB, expected())).ok).toBe(true);
    const snap = await db.query<{ participantes: unknown }>(
      `SELECT participantes FROM public.torneo_express_partidos WHERE id = $1`,
      [MAB]
    );
    await db.query(`DELETE FROM public.torneo_express_partidos WHERE id = $1`, [MAC]);
    const current = await version();
    const once = await db.query<{ r: Rpc }>(
      `SELECT public.reconciliar_torneo_express_grupo($1,$2) AS r`,
      [G, current]
    );
    expect(once.rows[0].r).toMatchObject({ ok: true, creados: 1, retirados: 0 });
    const twice = await db.query<{ r: Rpc }>(
      `SELECT public.reconciliar_torneo_express_grupo($1,$2) AS r`,
      [G, once.rows[0].r.version]
    );
    expect(twice.rows[0].r).toMatchObject({ ok: true, creados: 0, retirados: 0, version: once.rows[0].r.version });
    const played = await db.query<{ estado: string; participantes: unknown }>(
      `SELECT estado, participantes FROM public.torneo_express_partidos WHERE id = $1`,
      [MAB]
    );
    expect(played.rows[0].estado).toBe("jugado");
    expect(played.rows[0].participantes).toEqual(snap.rows[0].participantes);
    await expect(db.query(
      `INSERT INTO public.torneo_express_partidos
        (grupo_id, pareja_local_id, pareja_visitante_id, estado, ronda, orden)
       VALUES ($1,$2,$3,'pendiente',9,99)`,
      [G, PB, PA]
    )).rejects.toThrow(/duplicate key|torneo_express_partidos_grupo_matchup_uidx/);
  });

  it("el reset limpia el snapshot y el siguiente juego usa la composición vigente", async () => {
    expect((await play(MAB, expected())).ok).toBe(true);
    await db.query(
      `INSERT INTO public.rating_historial (jugador_id, partido_ref) VALUES ($1,$2),($3,$4)`,
      [J[0], `te-grupo:${MAB}`, J[0], `te-elim:${ELIM}`]
    );
    const changed = await db.query<{ r: Rpc }>(
      `SELECT public.cambiar_torneo_express_jugador_grupo($1,$2,$3,$4,$5) AS r`,
      [G, PA, J[0], JNEW, await version()]
    );
    const reset = await db.query<{ r: { ok: boolean; version: number } }>(
      `SELECT public.reset_torneo_express_grupo($1,$2) AS r`,
      [G, changed.rows[0].r.version]
    );
    expect(reset.rows[0].r.ok).toBe(true);
    const row = await db.query<{ estado: string; local: string; participantes: unknown }>(
      `SELECT estado, pareja_local_id AS local, participantes
       FROM public.torneo_express_partidos WHERE id = $1`,
      [MAB]
    );
    expect(row.rows[0].estado).toBe("pendiente");
    expect(row.rows[0].participantes).toBeNull();
    expect(row.rows[0].local).toBe(changed.rows[0].r.pareja_id);
    const rating = await db.query<{ grupo: number; elim: number }>(
      `SELECT
         count(*) FILTER (WHERE partido_ref = $1)::int AS grupo,
         count(*) FILTER (WHERE partido_ref = $2)::int AS elim
       FROM public.rating_historial`,
      [`te-grupo:${MAB}`, `te-elim:${ELIM}`]
    );
    expect(rating.rows[0]).toEqual({ grupo: 0, elim: 1 });
    const replay = await play(
      MAB,
      expected(JNEW, J[1], J[2], J[3], changed.rows[0].r.pareja_id as string, PB)
    );
    expect(replay.ok).toBe(true);
    const next = await db.query<{ player: string }>(
      `SELECT participantes->'local'->>'player1_id' AS player
       FROM public.torneo_express_partidos WHERE id = $1`,
      [MAB]
    );
    expect(next.rows[0].player).toBe(JNEW);
  });

  it("rechaza categoría cerrada, ajeno, pareja virtual y pareja de otro grupo", async () => {
    const virtual = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5";
    await db.query(
      `INSERT INTO public.pairs
        (id, tournament_id, player1_id, player2_id, player1_name, player2_name, is_virtual, virtual_label)
       VALUES ($1,$2,NULL,NULL,NULL,NULL,true,'Por definir')`,
      [virtual, T]
    );
    await db.query(
      `INSERT INTO public.torneo_express_grupo_parejas (grupo_id, pareja_id) VALUES ($1,$2)`,
      [G, virtual]
    );
    const before = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.torneo_express_partidos WHERE grupo_id = $1`,
      [G]
    );
    const virtualChange = await db.query<{ r: Rpc }>(
      `SELECT public.cambiar_torneo_express_jugador_grupo($1,$2,$3,$4,1) AS r`,
      [G, virtual, J[0], JNEW]
    );
    expect(virtualChange.rows[0].r.error).toBe("PAIR_IS_VIRTUAL");
    const after = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.torneo_express_partidos WHERE grupo_id = $1`,
      [G]
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);
    await db.query(`UPDATE public.torneo_express SET fase_torneo = 'eliminatoria' WHERE id = $1`, [T]);
    const closed = await db.query<{ r: Rpc }>(
      `SELECT public.cambiar_torneo_express_jugador_grupo($1,$2,$3,$4,1) AS r`,
      [G, PA, J[0], JNEW]
    );
    expect(closed.rows[0].r.error).toBe("GROUP_NOT_EDITABLE");
    await db.query(`UPDATE public.torneo_express SET fase_torneo = 'grupos' WHERE id = $1`, [T]);
    await db.query(`SELECT set_config('app.user_id', $1, false)`, [OTHER]);
    await expect(db.query(
      `SELECT public.retirar_torneo_express_pareja_grupo($1,$2,1)`,
      [G, PA]
    )).rejects.toThrow(/Sin permiso/);
    await db.query(`SELECT set_config('app.user_id', $1, false)`, [ORG]);
    const missing = await db.query<{ r: Rpc }>(
      `SELECT public.retirar_torneo_express_pareja_grupo($1,$2,1) AS r`,
      [G, P2A]
    );
    expect(missing.rows[0].r.error).toBe("PAIR_NOT_IN_GROUP");
  });
});
