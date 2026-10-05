/**
 * @jest-environment node
 */
/**
 * Ejecutar:
 * RUN_SQL_INTEGRATION=1 NODE_OPTIONS=--experimental-vm-modules \
 *   npx react-scripts test --watchAll=false --runInBand \
 *   src/lib/torneoExpress/resetGrupo.integration.test.ts
 *
 * PGlite abre una sola conexión. Dos resets simultáneos de verdad no se
 * pueden cruzar aquí: el lock de la categoría los serializaría, y estos
 * tests cubren el resultado de esa serialización (versión vieja, fase ya
 * cerrada, reversa que aborta).
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import type { PGlite as PGliteType } from "@electric-sql/pglite";

// PGlite necesita Blob. El harness de locks de 0044 usa el mismo puente.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodeBuffer = require("buffer");
if (typeof (global as { Blob?: unknown }).Blob === "undefined") {
  (global as { Blob?: unknown }).Blob = nodeBuffer.Blob;
}

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
const T = "22222222-2222-4222-8222-222222222222";
const G = "33333333-3333-4333-8333-333333333333";
const G2 = "33333333-3333-4333-8333-333333333334";
const PAIR_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PAIR_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PAIR_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const M1 = "d1000000-0000-4000-8000-000000000001";
const M2 = "d1000000-0000-4000-8000-000000000002";
const M3 = "d1000000-0000-4000-8000-000000000003";
const M_OTHER = "d1000000-0000-4000-8000-000000000004";
const ELIM = "e1000000-0000-4000-8000-000000000001";
const J1 = "20000000-0000-4000-8000-000000000001";
const J2 = "20000000-0000-4000-8000-000000000002";
const J3 = "20000000-0000-4000-8000-000000000003";
const J4 = "20000000-0000-4000-8000-000000000004";
const J_OTHER = "20000000-0000-4000-8000-000000000005";

type ResetResult = {
  ok: boolean;
  error?: string;
  reason?: string;
  version?: number;
  group_id?: string;
  matches_reset?: number;
  ratings_reverted?: number;
};

type PartidoRow = {
  id: string;
  estado: string;
  puntos_local: number | null;
  puntos_visitante: number | null;
  ganador_id: string | null;
  sets_resultado: unknown;
  orden: number | null;
  ronda: number | null;
  cancha: string | null;
  programado_en: string | null;
  pareja_local_id: string;
  pareja_visitante_id: string;
};

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

const maybeDescribe =
  process.env.RUN_SQL_INTEGRATION === "1" ? describe : describe.skip;

maybeDescribe("reset_torneo_express_grupo", () => {
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
        id uuid PRIMARY KEY,
        tournament_id uuid,
        player1_id uuid,
        player2_id uuid,
        player1_name text,
        player2_name text,
        created_at timestamptz DEFAULT now()
      );
      CREATE TABLE public.torneo_express (
        id uuid PRIMARY KEY,
        organizador_id uuid,
        fase_torneo text,
        estado text,
        fase_eliminacion text,
        bracket_slots jsonb,
        fase_grupos_finalizada_at timestamptz
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
        id uuid PRIMARY KEY,
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
        estado text,
        es_bye boolean
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
      CREATE TABLE public.riviera_jugadores (
        id uuid PRIMARY KEY,
        rating numeric,
        rating_partidos integer,
        rating_fiabilidad numeric,
        updated_at timestamptz
      );
      CREATE TABLE public.rating_historial (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        jugador_id uuid,
        rating_antes numeric,
        rating_despues numeric,
        delta numeric,
        partido_ref text,
        fecha timestamptz DEFAULT now()
      );
    `);

    for (const file of [
      "0003_apply_torneo_express_grupo_resultado.sql",
      "0044_torneo_express_categoria_edicion.sql",
      "0046_torneo_express_virtual_pairs.sql",
      "0048_torneo_express_grupo_reset.sql",
    ]) {
      const source = readFileSync(
        resolve(__dirname, "../../../supabase/migrations", file),
        "utf8"
      );
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
      CREATE OR REPLACE FUNCTION public._revert_rating_for_partido_ref(p_partido_ref text)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $fn$
      DECLARE
        r record;
      BEGIN
        IF p_partido_ref IS NULL THEN
          RETURN;
        END IF;
        FOR r IN
          SELECT rh.jugador_id, rh.rating_antes
          FROM rating_historial rh
          WHERE rh.partido_ref = p_partido_ref
        LOOP
          UPDATE riviera_jugadores
          SET
            rating = r.rating_antes,
            rating_partidos = GREATEST(0, COALESCE(rating_partidos, 1) - 1),
            rating_fiabilidad = LEAST(1.0, 0.2 + GREATEST(0, COALESCE(rating_partidos, 1) - 1) * 0.04),
            updated_at = now()
          WHERE id = r.jugador_id;
        END LOOP;
        DELETE FROM rating_historial WHERE partido_ref = p_partido_ref;
      END;
      $fn$;

      CREATE OR REPLACE FUNCTION public.te_test_fail_second_rating_delete()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $fn$
      BEGIN
        IF coalesce(current_setting('te.fail_rating_delete', true), '') = '1' THEN
          PERFORM set_config(
            'te.fail_rating_count',
            (coalesce(nullif(current_setting('te.fail_rating_count', true), ''), '0')::int + 1)::text,
            true
          );
          IF current_setting('te.fail_rating_count', true)::int >= 2 THEN
            RAISE EXCEPTION 'forced rating failure';
          END IF;
        END IF;
        RETURN OLD;
      END;
      $fn$;

      DROP TRIGGER IF EXISTS te_test_fail_rating ON public.rating_historial;
      CREATE TRIGGER te_test_fail_rating
        BEFORE DELETE ON public.rating_historial
        FOR EACH ROW
        EXECUTE FUNCTION public.te_test_fail_second_rating_delete();
    `);
    await db.query(`SELECT set_config('app.user_id', $1, false)`, [ORG]);
  }, 90000);

  afterAll(async () => {
    await db.close();
  });

  async function seed(input?: {
    fase?: string;
    estado?: string;
    withElim?: boolean;
    played?: Array<"m1" | "m2" | "m3">;
    ratings?: Array<"m1" | "m2" | "m3">;
  }): Promise<void> {
    const fase = input?.fase ?? "grupos";
    const estado = input?.estado ?? "en_curso";
    const played = new Set(input?.played ?? []);
    const ratings = new Set(input?.ratings ?? []);
    await db.query(`SELECT set_config('te.fail_rating_delete', '', false)`);
    await db.query(`SELECT set_config('app.user_id', $1, false)`, [ORG]);
    await db.exec(`
      DELETE FROM public.rating_historial;
      DELETE FROM public.riviera_jugadores;
      DELETE FROM public.torneo_express_partidos;
      DELETE FROM public.torneo_express_grupo_parejas;
      DELETE FROM public.torneo_express_eliminatoria_partidos;
      DELETE FROM public.torneo_express_grupos;
      DELETE FROM public.torneo_express;
      DELETE FROM public.pairs;
      DELETE FROM public.players;
    `);
    await db.exec(`
      INSERT INTO public.players (id, name) VALUES
        ('${J1}', 'Ana'), ('${J2}', 'Luis'), ('${J3}', 'Mara'), ('${J4}', 'Paz');
      INSERT INTO public.pairs
        (id, tournament_id, player1_id, player2_id, player1_name, player2_name, is_virtual, virtual_label)
      VALUES
        ('${PAIR_A}', '${T}', '${J1}', '${J2}', 'Ana', 'Luis', false, NULL),
        ('${PAIR_B}', '${T}', '${J3}', '${J4}', 'Mara', 'Paz', false, NULL),
        ('${PAIR_C}', '${T}', NULL, NULL, NULL, NULL, true, 'Por definir');
      INSERT INTO public.torneo_express (id, organizador_id, fase_torneo, estado)
      VALUES ('${T}', '${ORG}', '${fase}', '${estado}');
      INSERT INTO public.torneo_express_grupos (id, torneo_id, nombre, orden)
      VALUES
        ('${G}', '${T}', 'Grupo 1', 1),
        ('${G2}', '${T}', 'Grupo 2', 2);
      INSERT INTO public.torneo_express_grupo_parejas (grupo_id, pareja_id)
      VALUES
        ('${G}', '${PAIR_A}'), ('${G}', '${PAIR_B}'), ('${G}', '${PAIR_C}');
    `);
    const slots = [
      { id: M1, local: PAIR_A, visit: PAIR_B, key: "m1" as const },
      { id: M2, local: PAIR_A, visit: PAIR_C, key: "m2" as const },
      { id: M3, local: PAIR_B, visit: PAIR_C, key: "m3" as const },
    ];
    for (const slot of slots) {
      const isPlayed = played.has(slot.key);
      await db.query(
        `INSERT INTO public.torneo_express_partidos
          (id, grupo_id, pareja_local_id, pareja_visitante_id, estado,
           puntos_local, puntos_visitante, ganador_id, sets_resultado,
           ronda, orden, cancha, programado_en)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, 2, 4, 'Cancha 1',
                 '2026-08-01T15:00:00Z')`,
        [
          slot.id,
          G,
          slot.local,
          slot.visit,
          isPlayed ? "jugado" : "pendiente",
          isPlayed ? 6 : null,
          isPlayed ? 4 : null,
          isPlayed ? slot.local : null,
          isPlayed ? JSON.stringify([{ local: 6, visitante: 4 }]) : null,
        ]
      );
    }
    await db.query(
      `INSERT INTO public.torneo_express_partidos
        (id, grupo_id, pareja_local_id, pareja_visitante_id, estado,
         puntos_local, puntos_visitante, ganador_id, ronda, orden, cancha)
       VALUES ($1, $2, $3, $4, 'jugado', 6, 3, $3, 1, 1, 'Cancha 2')`,
      [M_OTHER, G2, PAIR_A, PAIR_B]
    );
    await db.query(
      `INSERT INTO public.riviera_jugadores (id, rating, rating_partidos, rating_fiabilidad)
       VALUES ($1, 3.40, 5, 0.4), ($2, 3.10, 2, 0.28)`,
      [J1, J_OTHER]
    );
    if (ratings.has("m1")) {
      await db.query(
        `INSERT INTO public.rating_historial
          (jugador_id, rating_antes, rating_despues, delta, partido_ref)
         VALUES ($1, 3.20, 3.40, 0.20, $2)`,
        [J1, `te-grupo:${M1}`]
      );
    }
    if (ratings.has("m2")) {
      await db.query(
        `INSERT INTO public.rating_historial
          (jugador_id, rating_antes, rating_despues, delta, partido_ref)
         VALUES ($1, 3.20, 3.40, 0.20, $2)`,
        [J1, `te-grupo:${M2}`]
      );
    }
    await db.query(
      `INSERT INTO public.rating_historial
        (jugador_id, rating_antes, rating_despues, delta, partido_ref)
       VALUES
        ($1, 3.00, 3.10, 0.10, $2),
        ($3, 2.90, 3.10, 0.20, $4)`,
      [J_OTHER, `te-grupo:${M_OTHER}`, J_OTHER, `te-elim:${ELIM}`]
    );
    if (input?.withElim) {
      await db.query(
        `INSERT INTO public.torneo_express_eliminatoria_partidos
          (id, torneo_id, pareja_local_id, pareja_visitante_id, estado, es_bye)
         VALUES ($1, $2, $3, $4, 'pendiente', false)`,
        [ELIM, T, PAIR_A, PAIR_B]
      );
    }
  }

  async function reset(version: number | null, grupo = G): Promise<ResetResult> {
    const result = await db.query<{ r: ResetResult }>(
      `SELECT public.reset_torneo_express_grupo($1, $2) AS r`,
      [grupo, version]
    );
    return result.rows[0].r;
  }

  async function partidos(grupo = G): Promise<PartidoRow[]> {
    const result = await db.query<PartidoRow>(
      `SELECT id, estado, puntos_local, puntos_visitante, ganador_id, sets_resultado,
              orden, ronda, cancha, programado_en::text, pareja_local_id, pareja_visitante_id
       FROM public.torneo_express_partidos
       WHERE grupo_id = $1
       ORDER BY id`,
      [grupo]
    );
    return result.rows;
  }

  async function versionOf(grupo = G): Promise<number> {
    const result = await db.query<{ version: number }>(
      `SELECT version FROM public.torneo_express_grupos WHERE id = $1`,
      [grupo]
    );
    return result.rows[0].version;
  }

  async function ratingOf(id: string): Promise<{ rating: string; rating_partidos: number }> {
    const result = await db.query<{ rating: string; rating_partidos: number }>(
      `SELECT rating::text, rating_partidos FROM public.riviera_jugadores WHERE id = $1`,
      [id]
    );
    return result.rows[0];
  }

  async function historial(ref: string): Promise<number> {
    const result = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.rating_historial WHERE partido_ref = $1`,
      [ref]
    );
    return result.rows[0].n;
  }

  it("sin partidos jugados conserva programación y sube la versión", async () => {
    await seed();
    const before = await partidos();
    const result = await reset(1);
    expect(result).toMatchObject({
      ok: true,
      matches_reset: 0,
      ratings_reverted: 0,
      version: 2,
    });
    const after = await partidos();
    expect(after.map((row) => row.id)).toEqual(before.map((row) => row.id));
    expect(after.every((row) => row.estado === "pendiente")).toBe(true);
    expect(after.every((row) => row.cancha === "Cancha 1" && row.ronda === 2 && row.orden === 4)).toBe(true);
    expect(await versionOf()).toBe(2);
  });

  it("limpia un grupo parcial y uno completo sin borrar filas ni parejas", async () => {
    await seed({ played: ["m1"], ratings: ["m1"] });
    const partial = await reset(1);
    expect(partial.matches_reset).toBe(1);
    expect(partial.ratings_reverted).toBe(1);
    let rows = await partidos();
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.estado === "pendiente")).toBe(true);
    expect(rows.every((row) => row.puntos_local === null && row.ganador_id === null)).toBe(true);
    expect(rows.every((row) => row.sets_resultado === null)).toBe(true);
    expect(rows[0].pareja_local_id).toBe(PAIR_A);
    expect(rows[0].programado_en).toContain("2026-08-01");

    await seed({ played: ["m1", "m2", "m3"], ratings: ["m1", "m2"] });
    const full = await reset(1);
    expect(full.matches_reset).toBe(3);
    expect(full.ratings_reverted).toBe(2);
    rows = await partidos();
    expect(rows.every((row) => row.estado === "pendiente" && row.puntos_visitante === null)).toBe(true);
    const parejas = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.torneo_express_grupo_parejas WHERE grupo_id = $1`,
      [G]
    );
    expect(parejas.rows[0].n).toBe(3);
  });

  it("la segunda ejecución no vuelve a mover el rating", async () => {
    await seed({ played: ["m1"], ratings: ["m1"] });
    const first = await reset(1);
    expect(first.version).toBe(2);
    const afterFirst = await ratingOf(J1);
    expect(afterFirst.rating).toBe("3.20");
    expect(afterFirst.rating_partidos).toBe(4);
    expect(await historial(`te-grupo:${M1}`)).toBe(0);

    const stale = await reset(1);
    expect(stale).toMatchObject({ ok: false, error: "STALE_GROUP_VERSION", version: 2 });
    expect((await ratingOf(J1)).rating_partidos).toBe(4);

    const second = await reset(2);
    expect(second).toMatchObject({ ok: true, matches_reset: 0, ratings_reverted: 0, version: 3 });
    expect((await ratingOf(J1)).rating_partidos).toBe(4);
    expect((await ratingOf(J1)).rating).toBe("3.20");
    expect((await partidos(G2))[0].estado).toBe("jugado");
    expect(await historial(`te-grupo:${M_OTHER}`)).toBe(1);
    expect(await historial(`te-elim:${ELIM}`)).toBe(1);
    expect((await ratingOf(J_OTHER)).rating).toBe("3.10");
    expect((await ratingOf(J_OTHER)).rating_partidos).toBe(2);
  });

  it("un partido jugado sin historial de rating se resetea igual", async () => {
    await seed({ played: ["m2"] });
    const result = await reset(1);
    expect(result).toMatchObject({ ok: true, matches_reset: 1, ratings_reverted: 0 });
    expect((await partidos()).find((row) => row.id === M2)?.estado).toBe("pendiente");
  });

  it("rechaza categoría cerrada, eliminatoria y a quien no es el dueño", async () => {
    await seed({ played: ["m1"], fase: "eliminatoria" });
    expect(await reset(1)).toMatchObject({
      ok: false,
      error: "GROUP_NOT_EDITABLE",
      reason: "TOURNAMENT_NOT_EDITABLE",
    });
    expect((await partidos()).find((row) => row.id === M1)?.estado).toBe("jugado");
    expect(await versionOf()).toBe(1);

    await seed({ played: ["m1"], estado: "finalizado" });
    expect(await reset(1)).toMatchObject({ ok: false, error: "GROUP_NOT_EDITABLE" });

    await seed({ played: ["m1"], withElim: true });
    expect(await reset(1)).toMatchObject({
      ok: false,
      error: "GROUP_NOT_EDITABLE",
      reason: "ELIMINATORIA_EXISTS",
    });
    expect((await partidos()).find((row) => row.id === M1)?.puntos_local).toBe(6);

    await seed({ played: ["m1"] });
    await db.query(`SELECT set_config('app.user_id', $1, false)`, [OTHER]);
    await expect(reset(1)).rejects.toThrow(/Sin permiso/);
    await db.query(`SELECT set_config('app.user_id', $1, false)`, [ORG]);
    expect((await partidos()).find((row) => row.id === M1)?.estado).toBe("jugado");

    await db.query(`SELECT set_config('app.user_id', '', false)`);
    await expect(reset(1)).rejects.toThrow(/Sesión requerida/);
    await db.query(`SELECT set_config('app.user_id', $1, false)`, [ORG]);

    const missing = await db.query<{ r: ResetResult }>(
      `SELECT public.reset_torneo_express_grupo($1, 1) AS r`,
      ["d2000000-0000-4000-8000-000000000099"]
    );
    expect(missing.rows[0].r).toMatchObject({ ok: false, error: "GROUP_NOT_FOUND" });
  });

  it("si la reversa falla a la mitad no queda ningún partido reseteado", async () => {
    await seed({ played: ["m1", "m2", "m3"], ratings: ["m1", "m2"] });
    const beforeRating = await ratingOf(J1);
    await db.query(`SELECT set_config('te.fail_rating_delete', '1', false)`);
    await db.query(`SELECT set_config('te.fail_rating_count', '0', false)`);
    await expect(reset(1)).rejects.toThrow(/forced rating failure/);
    await db.query(`SELECT set_config('te.fail_rating_delete', '', false)`);

    const rows = await partidos();
    expect(rows.map((row) => row.estado)).toEqual(["jugado", "jugado", "jugado"]);
    expect(rows.every((row) => row.puntos_local === 6)).toBe(true);
    expect(await historial(`te-grupo:${M1}`)).toBe(1);
    expect(await historial(`te-grupo:${M2}`)).toBe(1);
    expect(await ratingOf(J1)).toEqual(beforeRating);
    expect(await versionOf()).toBe(1);
  });

  it("una versión vieja no pisa un marcador guardado después", async () => {
    await seed();
    const expected = JSON.stringify({
      local: {
        pair_id: PAIR_A,
        player1_id: J1,
        player2_id: J2,
        is_virtual: false,
      },
      visitante: {
        pair_id: PAIR_B,
        player1_id: J3,
        player2_id: J4,
        is_virtual: false,
      },
    });
    const saved = await db.query<{ r: { ok: boolean; status?: string } }>(
      `SELECT public.apply_torneo_express_grupo_resultado(
         $1, 6, 4, 'local', NULL, false, $2::jsonb
       ) AS r`,
      [M1, expected]
    );
    expect(saved.rows[0].r).toMatchObject({ ok: true, status: "updated" });
    expect(await versionOf()).toBe(2);
    expect((await partidos()).find((row) => row.id === M1)?.estado).toBe("jugado");

    const stale = await reset(1);
    expect(stale).toMatchObject({ ok: false, error: "STALE_GROUP_VERSION", version: 2 });
    expect((await partidos()).find((row) => row.id === M1)?.puntos_local).toBe(6);
    expect(await versionOf()).toBe(2);

    const fresh = await reset(2);
    expect(fresh.ok).toBe(true);
    expect((await partidos()).find((row) => row.id === M1)?.estado).toBe("pendiente");
    expect(await versionOf()).toBe(3);
  });

  it("finalizar la fase y resetear no se pisan en secuencia", async () => {
    await seed({ played: ["m1"] });
    const finalized = await db.query<{ r: { ok: boolean; error?: string } }>(
      `SELECT public.confirmar_torneo_express_fase_eliminatoria_transicion($1, 'cuartos', '[]'::jsonb) AS r`,
      [T]
    );
    expect(finalized.rows[0].r.ok).toBe(true);
    expect(await reset(1)).toMatchObject({
      ok: false,
      error: "GROUP_NOT_EDITABLE",
      reason: "TOURNAMENT_NOT_EDITABLE",
    });
    expect((await partidos()).find((row) => row.id === M1)?.estado).toBe("jugado");

    await seed({ played: ["m1"] });
    expect((await reset(1)).ok).toBe(true);
    const afterReset = await db.query<{ r: { ok: boolean } }>(
      `SELECT public.confirmar_torneo_express_fase_eliminatoria_transicion($1, 'cuartos', '[]'::jsonb) AS r`,
      [T]
    );
    expect(afterReset.rows[0].r.ok).toBe(true);
    const fase = await db.query<{ fase_torneo: string }>(
      `SELECT fase_torneo FROM public.torneo_express WHERE id = $1`,
      [T]
    );
    expect(fase.rows[0].fase_torneo).toBe("eliminatoria");
    expect((await partidos()).every((row) => row.estado === "pendiente")).toBe(true);
  });

  it("impide el mismo enfrentamiento al revés y lo permite en otro grupo", async () => {
    await seed();
    await expect(
      db.query(
        `INSERT INTO public.torneo_express_partidos
          (id, grupo_id, pareja_local_id, pareja_visitante_id, estado)
         VALUES ($1, $2, $3, $4, 'pendiente')`,
        ["d1000000-0000-4000-8000-0000000000aa", G, PAIR_B, PAIR_A]
      )
    ).rejects.toThrow(/torneo_express_partidos_grupo_matchup_uidx|duplicate key/);

    await db.query(
      `INSERT INTO public.torneo_express_partidos
        (id, grupo_id, pareja_local_id, pareja_visitante_id, estado)
       VALUES ($1, $2, $3, $4, 'pendiente')`,
      ["d1000000-0000-4000-8000-0000000000ab", G2, PAIR_A, PAIR_C]
    );
    const count = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n
       FROM public.torneo_express_partidos
       WHERE grupo_id = $1 AND pareja_local_id = $2`,
      [G2, PAIR_A]
    );
    expect(count.rows[0].n).toBe(2);
  });
});
