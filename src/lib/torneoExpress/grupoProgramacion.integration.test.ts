/**
 * @jest-environment node
 */
/**
 * RUN_SQL_INTEGRATION=1 NODE_OPTIONS=--experimental-vm-modules \
 *   npx react-scripts test --watchAll=false --runInBand \
 *   src/lib/torneoExpress/grupoProgramacion.integration.test.ts
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import type { PGlite as PGliteType } from "@electric-sql/pglite";
import { buildCourtTimeOpenings, schedulePendingGroup } from "./schedulePendingGroup";
import type { RosterSlot } from "./groupRoster";

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
const PE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5";
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
const MAB = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const MAC = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const MBC = "cccccccc-cccc-4ccc-8ccc-ccccccccccc3";
const M2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc7";
const NOW = "2026-08-01T15:00:00Z";
const T1 = "2026-08-01T16:00:00Z";
const T2 = "2026-08-01T17:00:00Z";
const T3 = "2026-08-01T18:00:00Z";

type Rpc = { ok: boolean; error?: string; version?: number; changed?: number; creados?: number; retirados?: number };

maybeDescribe("fase 4 programación de pendientes", () => {
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
      CREATE TABLE public.ratings (id integer PRIMARY KEY);
      CREATE TABLE public.carrera (id integer PRIMARY KEY);
      CREATE TABLE public.ledger (id integer PRIMARY KEY);
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
      "0050_torneo_express_grupo_programacion.sql",
    ]) {
      const source = readFileSync(resolve(__dirname, "../../../supabase/migrations", file), "utf8");
      const statements = splitSql(source);
      for (let index = 0; index < statements.length; index += 1) {
        try {
          await db.exec(statements[index]);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`${file} #${index}: ${message}\n${statements[index].slice(0, 240)}`);
        }
      }
    }
    await db.query(`SELECT set_config('app.user_id', $1, false)`, [ORG]);
  }, 90000);

  afterAll(async () => {
    await db.close();
  });

  const openings = [
    { cancha: "1", programado_en: T1 },
    { cancha: "2", programado_en: T1 },
    { cancha: "1", programado_en: T2 },
    { cancha: "2", programado_en: T2 },
    { cancha: "1", programado_en: T3 },
    { cancha: "2", programado_en: T3 },
  ];

  async function seed(): Promise<void> {
    await db.exec(`
      DELETE FROM public.rating_historial;
      DELETE FROM public.ratings;
      DELETE FROM public.carrera;
      DELETE FROM public.ledger;
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
        ($5,'Noa'),($6,'Teo'),($7,'Ira'),($8,'Leo')`,
      J
    );
    await db.query(
      `INSERT INTO public.pairs
        (id, tournament_id, player1_id, player2_id, player1_name, player2_name, is_virtual, virtual_label)
       VALUES
        ($1,$2,$3,$4,'Ana','Luis',false,NULL),
        ($5,$2,$6,$7,'Mara','Paz',false,NULL),
        ($8,$2,$9,$10,'Noa','Teo',false,NULL)`,
      [PA, T, J[0], J[1], PB, J[2], J[3], PC, J[4], J[5]]
    );
    await db.query(
      `INSERT INTO public.torneo_express (id, organizador_id, fase_torneo, estado, nombre)
       VALUES ($1,$2,'grupos','en_curso','Open')`,
      [T, ORG]
    );
    await db.query(
      `INSERT INTO public.torneo_express_grupos (id, torneo_id, nombre, orden) VALUES ($1,$2,'A',1)`,
      [G, T]
    );
    await db.query(
      `INSERT INTO public.torneo_express_grupo_parejas (grupo_id, pareja_id) VALUES ($1,$2),($1,$3),($1,$4)`,
      [G, PA, PB, PC]
    );
    await db.query(
      `INSERT INTO public.torneo_express_partidos
        (id, grupo_id, pareja_local_id, pareja_visitante_id, estado, puntos_local, puntos_visitante, ganador_id, ronda, orden, cancha, programado_en)
       VALUES
        ($1,$4,$5,$6,'jugado',6,3,$5,1,1,'1',$7),
        ($2,$4,$5,$8,'pendiente',NULL,NULL,NULL,1,2,'1',$9),
        ($3,$4,$6,$8,'pendiente',NULL,NULL,NULL,2,3,NULL,NULL)`,
      [MAB, MAC, MBC, G, PA, PB, T1, PC, T2]
    );
    await db.query(
      `INSERT INTO public.rating_historial (jugador_id, partido_ref) VALUES ($1, $2)`,
      [J[0], `te-grupo:${MAB}`]
    );
  }

  function expected(local1: string, local2: string, visit1: string, visit2: string, localPair: string, visitPair: string): string {
    return JSON.stringify({
      local: { pair_id: localPair, player1_id: local1, player2_id: local2, is_virtual: false },
      visitante: { pair_id: visitPair, player1_id: visit1, player2_id: visit2, is_virtual: false },
    });
  }

  async function apply(input: {
    version: number;
    mode: "faltantes" | "reorganizar";
    assignments: Array<{ match_id: string; cancha: string; programado_en: string; orden: number }>;
    slots?: Array<{ cancha: string; programado_en: string }>;
    occupied?: Array<{ cancha: string; programado_en: string }>;
  }): Promise<Rpc> {
    const result = await db.query<{ r: Rpc }>(
      `SELECT public.aplicar_programacion_torneo_express_grupo(
         $1, $2, $3, $4::timestamptz, $5::jsonb, ARRAY['1','2'], $6::jsonb, $7::jsonb
       ) AS r`,
      [
        G,
        input.version,
        input.mode,
        NOW,
        JSON.stringify(input.assignments),
        JSON.stringify(input.slots ?? openings),
        JSON.stringify(input.occupied ?? []),
      ]
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

  async function row(id: string): Promise<Record<string, unknown>> {
    const result = await db.query<Record<string, unknown>>(
      `SELECT pareja_local_id, pareja_visitante_id, estado, puntos_local, puntos_visitante,
              ganador_id, ronda, orden, cancha, programado_en, participantes
       FROM public.torneo_express_partidos WHERE id = $1`,
      [id]
    );
    return result.rows[0];
  }

  beforeEach(async () => {
    await seed();
    await db.query(`SELECT set_config('app.user_id', $1, false)`, [ORG]);
  });

  it("programa el faltante, conserva el jugado y no toca snapshot ni rating", async () => {
    const playedBefore = await row(MAB);
    const pendingBefore = await row(MAC);
    const saved = await apply({
      version: 1,
      mode: "faltantes",
      assignments: [{ match_id: MBC, cancha: "1", programado_en: T3, orden: 4 }],
    });
    expect(saved).toMatchObject({ ok: true, changed: 1, version: 2 });
    const placed = await row(MBC);
    expect(placed.cancha).toBe("1");
    expect(new Date(String(placed.programado_en)).toISOString()).toBe(new Date(T3).toISOString());
    expect(placed.participantes).toBeNull();
    expect(placed.estado).toBe("pendiente");
    expect(await row(MAB)).toEqual(playedBefore);
    expect(await row(MAC)).toEqual(pendingBefore);
    const rating = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.rating_historial`);
    expect(rating.rows[0].n).toBe(1);
    const sport = await db.query<{ n: number }>(
      `SELECT (SELECT count(*) FROM public.ratings)
            + (SELECT count(*) FROM public.carrera)
            + (SELECT count(*) FROM public.ledger) AS n`
    );
    expect(Number(sport.rows[0].n)).toBe(0);
    const again = await apply({
      version: 2,
      mode: "faltantes",
      assignments: [{ match_id: MBC, cancha: "1", programado_en: T3, orden: 4 }],
    });
    expect(again).toMatchObject({ ok: true, changed: 0, version: 2 });
    expect(await version()).toBe(2);
  });

  it("una versión vieja no escribe", async () => {
    const saved = await apply({
      version: 9,
      mode: "faltantes",
      assignments: [{ match_id: MBC, cancha: "1", programado_en: T3, orden: 4 }],
    });
    expect(saved.error).toBe("STALE_GROUP_VERSION");
    expect((await row(MBC)).cancha).toBeNull();
    expect(await version()).toBe(1);
  });

  it("rechaza mover un jugado y no cambia a los demás", async () => {
    const before = await row(MAB);
    const saved = await apply({
      version: 1,
      mode: "reorganizar",
      assignments: [
        { match_id: MAB, cancha: "2", programado_en: T3, orden: 2 },
        { match_id: MAC, cancha: "1", programado_en: T2, orden: 3 },
        { match_id: MBC, cancha: "2", programado_en: T2, orden: 4 },
      ],
    });
    expect(saved.error).toBe("PLAYED_MATCH_LOCKED");
    expect(await row(MAB)).toEqual(before);
    expect((await row(MBC)).cancha).toBeNull();
    expect(await version()).toBe(1);
  });

  it("una cancha repetida o un partido de otro grupo no deja cambios a medias", async () => {
    await db.query(
      `UPDATE public.torneo_express_partidos SET cancha = NULL, programado_en = NULL WHERE id = $1`,
      [MAC]
    );
    const duplicated = await apply({
      version: 1,
      mode: "faltantes",
      assignments: [
        { match_id: MAC, cancha: "1", programado_en: T3, orden: 2 },
        { match_id: MBC, cancha: "1", programado_en: T3, orden: 3 },
      ],
    });
    expect(duplicated.error).toBe("COURT_SLOT_CONFLICT");
    expect((await row(MAC)).cancha).toBeNull();
    expect((await row(MBC)).cancha).toBeNull();

    const occupied = await apply({
      version: 1,
      mode: "faltantes",
      assignments: [
        { match_id: MAC, cancha: "2", programado_en: T3, orden: 2 },
        { match_id: MBC, cancha: "1", programado_en: T2, orden: 3 },
      ],
      occupied: [{ cancha: "Cancha 2", programado_en: T3 }],
    });
    expect(occupied.error).toBe("COURT_SLOT_CONFLICT");
    expect((await row(MAC)).programado_en).toBeNull();

    await db.query(
      `INSERT INTO public.torneo_express_grupos (id, torneo_id, nombre, orden) VALUES ($1,$2,'B',2)`,
      [G2, T]
    );
    await db.query(
      `INSERT INTO public.torneo_express_partidos
        (id, grupo_id, pareja_local_id, pareja_visitante_id, estado, ronda, orden, cancha, programado_en)
       VALUES ($1,$2,$3,$4,'pendiente',1,1,'2',$5)`,
      [M2, G2, PB, PC, T3]
    );
    const foreign = await apply({
      version: 1,
      mode: "faltantes",
      assignments: [{ match_id: M2, cancha: "1", programado_en: T3, orden: 1 }],
    });
    expect(foreign.error).toBe("MATCH_NOT_IN_GROUP");
    expect(await version()).toBe(1);
  });

  it("rechaza a la misma pareja en dos canchas a la vez", async () => {
    await db.query(
      `UPDATE public.torneo_express_partidos SET cancha = NULL, programado_en = NULL WHERE id = $1`,
      [MAC]
    );
    const saved = await apply({
      version: 1,
      mode: "faltantes",
      assignments: [
        { match_id: MAC, cancha: "1", programado_en: T3, orden: 2 },
        { match_id: MBC, cancha: "2", programado_en: T3, orden: 3 },
      ],
    });
    expect(saved.error).toBe("PAIR_SLOT_CONFLICT");
    expect((await row(MAC)).cancha).toBeNull();
    expect((await row(MBC)).cancha).toBeNull();
    expect(await version()).toBe(1);
  });

  it("rechaza un pendiente de una pareja retirada", async () => {
    const withdrawn = await db.query<{ r: Rpc }>(
      `SELECT public.retirar_torneo_express_pareja_grupo($1,$2,$3) AS r`,
      [G, PC, 1]
    );
    expect(withdrawn.rows[0].r.ok).toBe(true);
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO public.torneo_express_partidos
        (grupo_id, pareja_local_id, pareja_visitante_id, estado, ronda, orden)
       VALUES ($1,$2,$3,'pendiente',3,9)
       RETURNING id`,
      [G, PA, PC]
    );
    const saved = await apply({
      version: Number(withdrawn.rows[0].r.version),
      mode: "faltantes",
      assignments: [{ match_id: inserted.rows[0].id, cancha: "1", programado_en: T3, orden: 4 }],
    });
    expect(saved.error).toBe("OBSOLETE_MATCH");
    expect(await version()).toBe(Number(withdrawn.rows[0].r.version));
  });

  it("mover un pendiente ya programado en modo faltantes no toca al nuevo", async () => {
    const saved = await apply({
      version: 1,
      mode: "faltantes",
      assignments: [
        { match_id: MBC, cancha: "1", programado_en: T3, orden: 4 },
        { match_id: MAC, cancha: "2", programado_en: T3, orden: 2 },
      ],
    });
    expect(saved.error).toBe("PENDING_ALREADY_SCHEDULED");
    expect((await row(MBC)).cancha).toBeNull();
    expect((await row(MAC)).cancha).toBe("1");
    expect(await version()).toBe(1);
  });

  it("reorganizar mueve pendientes y deja el jugado igual", async () => {
    const playedBefore = await row(MAB);
    const saved = await apply({
      version: 1,
      mode: "reorganizar",
      assignments: [
        { match_id: MAC, cancha: "2", programado_en: T3, orden: 2 },
        { match_id: MBC, cancha: "1", programado_en: T3, orden: 3 },
      ],
    });
    expect(saved.error).toBe("PAIR_SLOT_CONFLICT");
    const moved = await apply({
      version: 1,
      mode: "reorganizar",
      assignments: [
        { match_id: MAC, cancha: "1", programado_en: T3, orden: 2 },
        { match_id: MBC, cancha: "2", programado_en: T1, orden: 3 },
      ],
    });
    expect(moved.error).toBe("PAIR_SLOT_CONFLICT");
    const ok = await apply({
      version: 1,
      mode: "reorganizar",
      assignments: [
        { match_id: MAC, cancha: "2", programado_en: T3, orden: 2 },
        { match_id: MBC, cancha: "1", programado_en: T2, orden: 3 },
      ],
    });
    expect(ok).toMatchObject({ ok: true, changed: 2, version: 2 });
    expect(await row(MAB)).toEqual(playedBefore);
    expect((await row(MAC)).cancha).toBe("2");
    expect((await row(MBC)).cancha).toBe("1");
    const missing = await apply({
      version: 2,
      mode: "reorganizar",
      assignments: [{ match_id: MAC, cancha: "2", programado_en: T3, orden: 2 }],
    });
    expect(missing.error).toBe("INCOMPLETE_PROPOSAL");
  });

  it("agregar una pareja programa solo los cruces nuevos", async () => {
    const playedBefore = await row(MAB);
    const pendingBefore = await row(MAC);
    await db.query(
      `INSERT INTO public.pairs
        (id, tournament_id, player1_id, player2_id, player1_name, player2_name, is_virtual, virtual_label)
       VALUES ($1,$2,$3,$4,'Ira','Leo',false,NULL)`,
      [PE, T, J[6], J[7]]
    );
    await db.query(
      `INSERT INTO public.torneo_express_grupo_parejas (grupo_id, pareja_id) VALUES ($1,$2)`,
      [G, PE]
    );
    const reconciled = await db.query<{ r: Rpc }>(
      `SELECT public.reconciliar_torneo_express_grupo($1, 1) AS r`,
      [G]
    );
    expect(reconciled.rows[0].r).toMatchObject({ ok: true, creados: 3 });
    const loaded = await db.query<{
      id: string;
      pareja_local_id: string;
      pareja_visitante_id: string;
      estado: string;
      cancha: string | null;
      programado_en: string | null;
      ronda: number | null;
      orden: number | null;
    }>(
      `SELECT id, pareja_local_id, pareja_visitante_id, estado, cancha, programado_en, ronda, orden
       FROM public.torneo_express_partidos WHERE grupo_id = $1 ORDER BY id`,
      [G]
    );
    const roster = await db.query<{ pareja_id: string; activa: boolean; pareja_previa_ids: string[] }>(
      `SELECT pareja_id, activa, pareja_previa_ids FROM public.torneo_express_grupo_parejas WHERE grupo_id = $1`,
      [G]
    );
    const slots: RosterSlot[] = roster.rows.map((item) => ({
      parejaId: item.pareja_id,
      activa: item.activa !== false,
      parejaPreviaIds: item.pareja_previa_ids ?? [],
    }));
    const grid = buildCourtTimeOpenings({
      days: [{ date: "2026-08-01", startTime: "10:00", endTime: "16:00" }],
      courts: ["1", "2"],
      durationMinutes: 60,
      nowIso: NOW,
    });
    const plan = schedulePendingGroup({
      matches: loaded.rows.map((item) => ({
        id: item.id,
        localId: item.pareja_local_id,
        visitanteId: item.pareja_visitante_id,
        played: item.estado === "jugado",
        cancha: item.cancha,
        programadoEn: item.programado_en ? new Date(item.programado_en).toISOString() : null,
        ronda: item.ronda,
        orden: item.orden,
      })),
      slots,
      openings: grid,
      nowIso: NOW,
      mode: "faltantes",
    });
    if (!plan.ok) throw new Error(plan.error);
    const saved = await apply({
      version: Number(reconciled.rows[0].r.version),
      mode: "faltantes",
      assignments: plan.assignments.map((item) => ({
        match_id: item.matchId,
        cancha: item.cancha,
        programado_en: item.programadoEn,
        orden: item.orden,
      })),
      slots: grid.map((item) => ({ cancha: item.cancha, programado_en: item.programadoEn })),
    });
    expect(saved.ok).toBe(true);
    expect(await row(MAB)).toEqual(playedBefore);
    expect(await row(MAC)).toEqual(pendingBefore);
    const fresh = await db.query<{ n: number; scheduled: number }>(
      `SELECT count(*)::int AS n,
              count(*) FILTER (WHERE cancha IS NOT NULL AND programado_en IS NOT NULL)::int AS scheduled
       FROM public.torneo_express_partidos
       WHERE grupo_id = $1 AND (pareja_local_id = $2 OR pareja_visitante_id = $2)`,
      [G, PE]
    );
    expect(fresh.rows[0]).toEqual({ n: 3, scheduled: 3 });
    const bye = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.torneo_express_partidos
       WHERE grupo_id = $1 AND (pareja_local_id IS NULL OR pareja_visitante_id IS NULL)`,
      [G]
    );
    expect(bye.rows[0].n).toBe(0);
  });

  it("retirar deja el hueco y reorganizar solo compacta pendientes", async () => {
    await db.query(
      `INSERT INTO public.pairs
        (id, tournament_id, player1_id, player2_id, player1_name, player2_name, is_virtual, virtual_label)
       VALUES ($1,$2,$3,$4,'Ira','Leo',false,NULL)`,
      [PE, T, J[6], J[7]]
    );
    await db.query(
      `INSERT INTO public.torneo_express_grupo_parejas (grupo_id, pareja_id) VALUES ($1,$2)`,
      [G, PE]
    );
    const reconciled = await db.query<{ r: Rpc }>(
      `SELECT public.reconciliar_torneo_express_grupo($1, 1) AS r`,
      [G]
    );
    const created = await db.query<{ id: string; pareja_local_id: string; pareja_visitante_id: string }>(
      `SELECT id, pareja_local_id, pareja_visitante_id FROM public.torneo_express_partidos
       WHERE grupo_id = $1 AND (pareja_local_id = $2 OR pareja_visitante_id = $2)`,
      [G, PE]
    );
    const rivalOf = (local: string, visit: string) => (local === PE ? visit : local);
    const byRival = new Map(created.rows.map((item) => [rivalOf(item.pareja_local_id, item.pareja_visitante_id), item.id]));
    const placed = await apply({
      version: Number(reconciled.rows[0].r.version),
      mode: "faltantes",
      assignments: [
        { match_id: MBC, cancha: "2", programado_en: T3, orden: 4 },
        { match_id: byRival.get(PC) as string, cancha: "2", programado_en: T1, orden: 10 },
        { match_id: byRival.get(PB) as string, cancha: "2", programado_en: T2, orden: 11 },
        { match_id: byRival.get(PA) as string, cancha: "1", programado_en: T3, orden: 12 },
      ],
    });
    expect(placed).toMatchObject({ ok: true });
    const playedBefore = await row(MAB);
    const pendingBefore = await row(MAC);
    const withdrawn = await db.query<{ r: Rpc }>(
      `SELECT public.retirar_torneo_express_pareja_grupo($1,$2,$3) AS r`,
      [G, PE, placed.version]
    );
    expect(withdrawn.rows[0].r.ok).toBe(true);
    const leftover = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.torneo_express_partidos
       WHERE grupo_id = $1 AND estado = 'pendiente'
         AND (pareja_local_id = $2 OR pareja_visitante_id = $2)`,
      [G, PE]
    );
    expect(leftover.rows[0].n).toBe(0);
    const kept = await apply({
      version: Number(withdrawn.rows[0].r.version),
      mode: "faltantes",
      assignments: [],
    });
    expect(kept).toMatchObject({ ok: true, changed: 0 });
    expect(await row(MAC)).toEqual(pendingBefore);
    const again = await db.query<{ r: Rpc }>(
      `SELECT public.reconciliar_torneo_express_grupo($1, $2) AS r`,
      [G, kept.version]
    );
    expect(again.rows[0].r).toMatchObject({ ok: true, creados: 0, retirados: 0 });
    const compacted = await apply({
      version: Number(again.rows[0].r.version),
      mode: "reorganizar",
      assignments: [
        { match_id: MAC, cancha: "2", programado_en: T3, orden: 2 },
        { match_id: MBC, cancha: "2", programado_en: T2, orden: 3 },
      ],
    });
    expect(compacted.ok).toBe(true);
    expect((await row(MAC)).cancha).toBe("2");
    expect(await row(MAB)).toEqual(playedBefore);
    const rating = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.rating_historial`);
    expect(rating.rows[0].n).toBe(1);
  });

  it("finalizar fase exige los cruces vigentes y no un empate resuelto", async () => {
    const blocked = await db.query<{ r: Rpc }>(
      `SELECT public.confirmar_torneo_express_fase_eliminatoria_transicion($1,'semifinal','[]'::jsonb) AS r`,
      [T]
    );
    expect(blocked.rows[0].r.error).toBe("GROUP_PHASE_INCOMPLETE");
    const fase = await db.query<{ fase_torneo: string }>(
      `SELECT fase_torneo FROM public.torneo_express WHERE id = $1`,
      [T]
    );
    expect(fase.rows[0].fase_torneo).toBe("grupos");

    const mac = await db.query<{ r: { ok: boolean } }>(
      `SELECT public.apply_torneo_express_grupo_resultado($1, 6, 4, 'local', NULL, false, $2::jsonb) AS r`,
      [MAC, expected(J[0], J[1], J[4], J[5], PA, PC)]
    );
    const mbc = await db.query<{ r: { ok: boolean } }>(
      `SELECT public.apply_torneo_express_grupo_resultado($1, 6, 4, 'local', NULL, false, $2::jsonb) AS r`,
      [MBC, expected(J[2], J[3], J[4], J[5], PB, PC)]
    );
    expect(mac.rows[0].r.ok).toBe(true);
    expect(mbc.rows[0].r.ok).toBe(true);
    const done = await db.query<{ r: Rpc }>(
      `SELECT public.confirmar_torneo_express_fase_eliminatoria_transicion($1,'semifinal','[]'::jsonb) AS r`,
      [T]
    );
    expect(done.rows[0].r.ok).toBe(true);
    const after = await db.query<{ fase_torneo: string }>(
      `SELECT fase_torneo FROM public.torneo_express WHERE id = $1`,
      [T]
    );
    expect(after.rows[0].fase_torneo).toBe("eliminatoria");
  });

  it("sin permiso no programa", async () => {
    await db.query(`SELECT set_config('app.user_id', $1, false)`, [OTHER]);
    await expect(apply({
      version: 1,
      mode: "faltantes",
      assignments: [{ match_id: MBC, cancha: "1", programado_en: T3, orden: 4 }],
    })).rejects.toThrow(/Sin permiso/);
    expect(await version()).toBe(1);
  });
});
