/**
 * @jest-environment node
 */
/**
 * Integración real de "Ranking -> Participaciones" contra un Postgres real
 * (PGlite, WASM, efímero en memoria -- NO Docker, NO producción, NO Supabase
 * local). Este archivo aplica el CONTENIDO LITERAL de
 * supabase/migrations/0023_participaciones_mensual_public.sql (léelo con
 * fs.readFileSync, no lo reescribe ni lo aproxima) contra un esquema mínimo
 * que reproduce las columnas/tipos reales (enums jugador_tipo_evento /
 * jugador_resultado, jsonb metadata, tabla de exclusiones) y ejecuta las 2 RPC
 * públicas con SQL real -- no una reimplementación en TypeScript.
 *
 * Por qué PGlite y no `supabase start` / pgTAP: este entorno de ejecución no
 * tiene Docker disponible (daemon no corre y no se puede levantar sin salir
 * del sandbox). PGlite es Postgres real compilado a WASM, sin Docker, y ya
 * quedó demostrado que soporta enums, jsonb, DISTINCT ON, RANK() OVER,
 * SECURITY DEFINER, funciones que llaman a otras funciones y GRANT/roles --
 * exactamente lo que usa esta migración.
 *
 * Cubre los 15 casos de la sección "TESTS IMPORTANTES" (2026-08-08) más los
 * casos de corte de mes / timezone / filtros ya definidos en el plan.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import type { PGlite as PGliteType } from "@electric-sql/pglite";

// jest-environment-node no expone algunos globals de Node en este runtime
// (Blob/TextEncoder/TextDecoder) que PGlite (Postgres WASM) necesita para
// leer su propio bundle -- se rellenan aquí, antes de importar el paquete,
// solo para este archivo de test. No afecta el bundle de producción.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodeBuffer = require("buffer");
if (typeof (global as any).Blob === "undefined") {
  (global as any).Blob = nodeBuffer.Blob;
}
if (typeof (global as any).TextEncoder === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const util = require("util");
  (global as any).TextEncoder = util.TextEncoder;
  (global as any).TextDecoder = util.TextDecoder;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PGlite } = require("@electric-sql/pglite");

const MIGRATION_PATH = resolve(
  __dirname,
  "../../../supabase/migrations/0023_participaciones_mensual_public.sql"
);

// PGlite usa `import()` dinámico internamente (WASM) -- eso requiere Node
// arrancado con --experimental-vm-modules, flag que NO está presente en
// `npm test` / `npm run test:ci` normales. Sin este guard, cargar este
// archivo en el runner por defecto haría CRASHEAR el proceso de Jest entero
// (excepción no controlada al importar), no solo fallar este test.
//
// Por diseño: todo lo que depende de PGlite queda DENTRO de un solo
// `describe` condicionado por RUN_SQL_INTEGRATION=1. Sin esa variable, Jest
// reporta estos casos como "skipped" (mismo patrón ya usado por
// careerEventPipeline.replay.live.test.ts con REPLAY_PIPELINE_LIVE) y el
// resto de la suite (`npm test`, `npm run test:ci`) no se ve afectado.
//
// Ejecutar de verdad: npm run test:participaciones-mensual-sql
const maybeDescribe =
  process.env.RUN_SQL_INTEGRATION === "1" ? describe : describe.skip;

maybeDescribe("RPC SQL reales de Ranking -> Participaciones (PGlite)", () => {

const ORG_A = "a0000000-0000-0000-0000-00000000000a";
const ORG_B = "b0000000-0000-0000-0000-00000000000b";

let db: PGliteType;

interface ParticipacionRow {
  id: string;
  jugador_id: string;
  tipo_evento: "reta" | "torneo_express" | "liga" | "americano" | "duelo_2v2";
  evento_id: string;
  evento_nombre?: string;
  fecha: string;
  resultado?: "participación" | "victoria" | "derrota";
  puntos_obtenidos?: number;
  subtipo?: string;
  organizadorId?: string;
  createdAt?: string;
  clubName?: string;
}

// Subtipos REALES auditados en producción (2026-08-09, jugador_participaciones,
// catálogo completo de (tipo_evento, metadata.subtipo)) -- default de este
// fixture cuando un test no necesita ejercitar un subtipo específico, para
// que "insertar una reta" siga matcheando la allowlist real por defecto en
// vez de requerir pasar el subtipo explícito en cada uno de los ~25 usos.
const DEFAULT_SUBTIPO_BY_TIPO: Record<ParticipacionRow["tipo_evento"], string> = {
  reta: "reta_cierre",
  duelo_2v2: "duelo_2v2_cierre",
  americano: "americano_cierre",
  torneo_express: "express_cierre",
  liga: "liga_jornada",
};

function jsonbMetadata(row: ParticipacionRow): string {
  const metadata: Record<string, string> = {
    organizador_id: row.organizadorId ?? ORG_A,
  };
  const subtipo = row.subtipo ?? DEFAULT_SUBTIPO_BY_TIPO[row.tipo_evento];
  if (subtipo) metadata.subtipo = subtipo;
  if (row.clubName) metadata.club_name = row.clubName;
  return JSON.stringify(metadata).replace(/'/g, "''");
}

async function insertJugador(opts: {
  id: string;
  organizadorId?: string;
  nombre: string;
  categoria?: string;
  genero?: string;
  estado?: string;
}): Promise<void> {
  await db.query(
    `INSERT INTO riviera_jugadores (id, organizador_id, nombre, slug, riviera_id, categoria, genero, estado)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      opts.id,
      opts.organizadorId ?? ORG_A,
      opts.nombre,
      opts.nombre.toLowerCase().replace(/\s+/g, "-"),
      `RIV-${opts.id.slice(0, 8).toUpperCase()}`,
      opts.categoria ?? "open",
      opts.genero ?? "M",
      opts.estado ?? "activo",
    ]
  );
}

async function insertParticipacion(row: ParticipacionRow): Promise<void> {
  const createdAt = row.createdAt ?? `${row.fecha}T12:00:00Z`;
  await db.query(
    `INSERT INTO jugador_participaciones
       (id, jugador_id, tipo_evento, evento_id, evento_nombre, fecha, resultado, puntos_obtenidos, metadata, created_at)
     VALUES ($1, $2, $3::jugador_tipo_evento, $4, $5, $6::date, $7::jugador_resultado, $8, $9::jsonb, $10::timestamptz)`,
    [
      row.id,
      row.jugador_id,
      row.tipo_evento,
      row.evento_id,
      row.evento_nombre ?? "Evento test",
      row.fecha,
      row.resultado ?? "participación",
      row.puntos_obtenidos ?? 0,
      jsonbMetadata(row),
      createdAt,
    ]
  );
}

async function insertRivieraIdentity(opts: {
  officialPlayerKey: string;
  canonicalJugadorId: string;
  rivieraId: string;
  linkedJugadorId?: string; // si se da, además crea profile_link (via_link); si es igual al canonical, ambos paths matchean
}): Promise<void> {
  await db.query(
    `INSERT INTO riviera_official_player_identity (official_player_key, canonical_riviera_jugador_id, riviera_id)
     VALUES ($1, $2, $3)`,
    [opts.officialPlayerKey, opts.canonicalJugadorId, opts.rivieraId]
  );
  if (opts.linkedJugadorId) {
    await db.query(
      `INSERT INTO riviera_official_player_profile_link (id, official_player_key, riviera_jugador_id)
       VALUES (gen_random_id(), $1, $2)`,
      [opts.officialPlayerKey, opts.linkedJugadorId]
    );
  }
}

async function insertExclusion(opts: {
  scopeJugadorId: string;
  tipoEvento: string;
  eventoId: string;
}): Promise<void> {
  await db.query(
    `INSERT INTO jugador_participacion_exclusiones (id, scope_jugador_id, tipo_evento, evento_id, deleted_by_organizador_id)
     VALUES (gen_random_id(), $1, $2, $3, $4)`,
    [opts.scopeJugadorId, opts.tipoEvento, opts.eventoId, ORG_A]
  );
}

let uuidCounter = 1;
function nextUuid(prefix: string): string {
  const ns = prefix
    .replace(/[^0-9a-f]/gi, "0")
    .padEnd(4, "0")
    .slice(0, 4)
    .toLowerCase();
  const n = (uuidCounter++).toString(16).padStart(12, "0").slice(-12);
  return `${ns}0000-0000-4000-8000-${n}`;
}

async function ranking(
  organizadorId: string,
  year: number,
  month: number,
  categoria: string | null = null,
  genero: string | null = null
) {
  const res = await db.query(
    `SELECT * FROM riviera_ranking_participaciones_mensual_public($1::uuid, $2, $3, $4, $5)
     ORDER BY total_participaciones DESC, puntos_mes DESC, nombre ASC`,
    [organizadorId, year, month, categoria, genero]
  );
  return res.rows as Array<{
    jugador_id: string;
    nombre: string;
    riviera_id: string | null;
    total_participaciones: number;
    puntos_mes: number;
    posicion_competitiva: number;
    categoria: string;
    genero: string;
  }>;
}

async function detalle(
  organizadorId: string,
  jugadorId: string,
  year: number,
  month: number
) {
  const res = await db.query(
    `SELECT * FROM riviera_participaciones_mensual_detalle_public($1::uuid, $2::uuid, $3, $4)`,
    [organizadorId, jugadorId, year, month]
  );
  return res.rows as Array<{
    participacion_id: string;
    fecha: string;
    tipo_evento: string;
    resultado: string;
    puntos_obtenidos: number;
  }>;
}

beforeAll(async () => {
  db = new PGlite();

  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;

    CREATE TYPE jugador_tipo_evento AS ENUM
      ('reta', 'torneo_express', 'liga', 'americano', 'duelo_2v2', 'padel_relampago_2027');
    CREATE TYPE jugador_resultado AS ENUM ('participación', 'victoria', 'derrota');

    CREATE TABLE riviera_jugadores (
      id uuid PRIMARY KEY,
      organizador_id uuid,
      nombre text,
      slug text,
      foto_url text,
      riviera_id text,
      categoria text,
      genero text,
      estado text
    );

    CREATE TABLE jugador_participaciones (
      id uuid PRIMARY KEY,
      jugador_id uuid NOT NULL,
      tipo_evento jugador_tipo_evento NOT NULL,
      evento_id uuid NOT NULL,
      evento_nombre text,
      fecha date NOT NULL,
      resultado jugador_resultado NOT NULL DEFAULT 'participación',
      puntos_obtenidos integer NOT NULL DEFAULT 0,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE jugador_participacion_exclusiones (
      id uuid PRIMARY KEY,
      official_player_key uuid,
      scope_jugador_id uuid,
      tipo_evento text NOT NULL,
      evento_id uuid NOT NULL,
      deleted_by_organizador_id uuid,
      deleted_at timestamptz NOT NULL DEFAULT now()
    );

    -- Réplica mínima de supabase/riviera-official-multi-club-romc1.sql +
    -- riviera-career-identity-2.0.1-ddl.sql (columnas reales, sin
    -- FOREIGN KEY a riviera_jugadores/auth.users -- no aplica en este fixture
    -- aislado) -- necesaria porque 0023 las lee para resolver Riviera ID
    -- (bug real de producción 2026-08-09: riviera_id NO es columna de
    -- riviera_jugadores, vive aquí).
    CREATE TABLE riviera_official_player_identity (
      official_player_key uuid PRIMARY KEY,
      canonical_riviera_jugador_id uuid NOT NULL UNIQUE,
      riviera_id text,
      riviera_id_serial bigint,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE riviera_official_player_profile_link (
      id uuid PRIMARY KEY,
      official_player_key uuid NOT NULL
        REFERENCES riviera_official_player_identity(official_player_key),
      riviera_jugador_id uuid NOT NULL UNIQUE,
      link_source text NOT NULL DEFAULT 'owner',
      created_at timestamptz NOT NULL DEFAULT now()
    );

    -- Stub: sin identidad ROMC en este fixture -- is_jugador_participacion_excluded
    -- cae siempre en la rama scope_jugador_id = p_jugador_id (la real usa la misma
    -- rama para clubes sin identidad oficial vinculada; el comportamiento de la
    -- rama official_key no es parte de esta migración, ya está cubierto por los
    -- tests existentes de jugador-participacion-exclusiones.sql).
    CREATE FUNCTION _resolve_official_player_key(p_jugador_id uuid)
    RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid; $$;

    CREATE OR REPLACE FUNCTION is_jugador_participacion_excluded(
      p_jugador_id uuid, p_tipo_evento text, p_evento_id uuid
    )
    RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS (
        SELECT 1 FROM jugador_participacion_exclusiones e
        WHERE e.tipo_evento = p_tipo_evento
          AND e.evento_id = p_evento_id
          AND e.scope_jugador_id = p_jugador_id
      );
    $$;

    CREATE FUNCTION gen_random_id() RETURNS uuid LANGUAGE sql AS $$
      SELECT ('00000000-0000-0000-0000-' || lpad(to_hex(floor(random() * 1e10)::bigint), 12, '0'))::uuid;
    $$;
  `);

  const migrationSql = readFileSync(MIGRATION_PATH, "utf8").replace(
    /NOTIFY pgrst, 'reload schema';/g,
    ""
  );
  await db.exec(migrationSql);
});

afterAll(async () => {
  await db.close();
});

describe("Ranking -> Participaciones: allowlist fail-closed (pares reales de producción)", () => {
  it("1) reta + reta_cierre SÍ cuenta", async () => {
    const jugadorId = nextUuid("1r11");
    await insertJugador({ id: jugadorId, nombre: "Caso Reta Cierre" });
    await insertParticipacion({
      id: nextUuid("1r12"),
      jugador_id: jugadorId,
      tipo_evento: "reta",
      evento_id: nextUuid("1r13"),
      subtipo: "reta_cierre",
      fecha: "2026-08-01",
      puntos_obtenidos: 50,
    });
    const rows = await ranking(ORG_A, 2026, 8);
    expect(rows.find((r) => r.jugador_id === jugadorId)).toMatchObject({
      total_participaciones: 1,
      puntos_mes: 50,
    });
  });

  it("2) reta + subtipo desconocido NO cuenta", async () => {
    const jugadorId = nextUuid("1s11");
    await insertJugador({ id: jugadorId, nombre: "Caso Reta Subtipo Desconocido" });
    await insertParticipacion({
      id: nextUuid("1s12"),
      jugador_id: jugadorId,
      tipo_evento: "reta",
      evento_id: nextUuid("1s13"),
      subtipo: "reta_inscripcion_futura",
      fecha: "2026-08-01",
      puntos_obtenidos: 999,
    });
    const rows = await ranking(ORG_A, 2026, 8);
    expect(rows.find((r) => r.jugador_id === jugadorId)).toBeUndefined();
  });

  it("3) duelo_2v2 + duelo_2v2_cierre SÍ cuenta", async () => {
    const jugadorId = nextUuid("1t11");
    await insertJugador({ id: jugadorId, nombre: "Caso Duelo Cierre" });
    await insertParticipacion({
      id: nextUuid("1t12"),
      jugador_id: jugadorId,
      tipo_evento: "duelo_2v2",
      evento_id: nextUuid("1t13"),
      subtipo: "duelo_2v2_cierre",
      fecha: "2026-08-01",
      puntos_obtenidos: 75,
    });
    const rows = await ranking(ORG_A, 2026, 8);
    expect(rows.find((r) => r.jugador_id === jugadorId)).toMatchObject({
      total_participaciones: 1,
      puntos_mes: 75,
    });
  });

  it("4) americano + americano_cierre SÍ cuenta", async () => {
    const jugadorId = nextUuid("1u11");
    await insertJugador({ id: jugadorId, nombre: "Caso Americano Cierre" });
    await insertParticipacion({
      id: nextUuid("1u12"),
      jugador_id: jugadorId,
      tipo_evento: "americano",
      evento_id: nextUuid("1u13"),
      subtipo: "americano_cierre",
      fecha: "2026-08-01",
      puntos_obtenidos: 85,
    });
    const rows = await ranking(ORG_A, 2026, 8);
    expect(rows.find((r) => r.jugador_id === jugadorId)).toMatchObject({
      total_participaciones: 1,
      puntos_mes: 85,
    });
  });

  it("5) torneo_express + express_cierre SÍ cuenta", async () => {
    const jugadorId = nextUuid("1v11");
    await insertJugador({ id: jugadorId, nombre: "Caso Express Cierre" });
    await insertParticipacion({
      id: nextUuid("1v12"),
      jugador_id: jugadorId,
      tipo_evento: "torneo_express",
      evento_id: nextUuid("1v13"),
      subtipo: "express_cierre",
      fecha: "2026-08-01",
      puntos_obtenidos: 120,
    });
    const rows = await ranking(ORG_A, 2026, 8);
    expect(rows.find((r) => r.jugador_id === jugadorId)).toMatchObject({
      total_participaciones: 1,
      puntos_mes: 120,
    });
  });

  it("6) liga + liga_jornada SÍ cuenta", async () => {
    const jugadorId = nextUuid("1c11");
    await insertJugador({ id: jugadorId, nombre: "Caso Liga Jornada" });
    await insertParticipacion({
      id: nextUuid("1c12"),
      jugador_id: jugadorId,
      tipo_evento: "liga",
      evento_id: nextUuid("1c13"),
      subtipo: "liga_jornada",
      fecha: "2026-08-04",
      puntos_obtenidos: 40,
    });
    const rows = await ranking(ORG_A, 2026, 8);
    const row = rows.find((r) => r.jugador_id === jugadorId);
    expect(row?.total_participaciones).toBe(1);
    expect(row?.puntos_mes).toBe(40);
  });

  it("7) liga + liga_inscripcion NO cuenta", async () => {
    const jugadorId = nextUuid("1a11");
    await insertJugador({ id: jugadorId, nombre: "Caso Liga Inscripcion" });
    await insertParticipacion({
      id: nextUuid("1a12"),
      jugador_id: jugadorId,
      tipo_evento: "liga",
      evento_id: nextUuid("1a13"),
      subtipo: "liga_inscripcion",
      fecha: "2026-08-02",
      puntos_obtenidos: 0,
    });
    const rows = await ranking(ORG_A, 2026, 8);
    expect(rows.find((r) => r.jugador_id === jugadorId)).toBeUndefined();
  });

  it("8) liga + ajuste_manual NO cuenta", async () => {
    const jugadorId = nextUuid("1w11");
    await insertJugador({ id: jugadorId, nombre: "Caso Liga Ajuste Manual" });
    await insertParticipacion({
      id: nextUuid("1w12"),
      jugador_id: jugadorId,
      tipo_evento: "liga",
      evento_id: nextUuid("1w13"),
      subtipo: "ajuste_manual",
      fecha: "2026-08-02",
      puntos_obtenidos: 200,
    });
    const rows = await ranking(ORG_A, 2026, 8);
    expect(rows.find((r) => r.jugador_id === jugadorId)).toBeUndefined();
  });

  it("9) liga + liga_podio_final NO cuenta", async () => {
    const jugadorId = nextUuid("1b11");
    await insertJugador({ id: jugadorId, nombre: "Caso Liga Podio" });
    await insertParticipacion({
      id: nextUuid("1b12"),
      jugador_id: jugadorId,
      tipo_evento: "liga",
      evento_id: nextUuid("1b13"),
      subtipo: "liga_podio_final",
      fecha: "2026-08-03",
      puntos_obtenidos: 30,
    });
    const rows = await ranking(ORG_A, 2026, 8);
    expect(rows.find((r) => r.jugador_id === jugadorId)).toBeUndefined();
  });

  it("10) modalidad/subtipo futuro desconocido NO cuenta", async () => {
    const jugadorId = nextUuid("1d11");
    await insertJugador({ id: jugadorId, nombre: "Caso Modalidad Futura" });
    await insertParticipacion({
      id: nextUuid("1d12"),
      jugador_id: jugadorId,
      tipo_evento: "padel_relampago_2027" as ParticipacionRow["tipo_evento"],
      evento_id: nextUuid("1d13"),
      fecha: "2026-08-05",
      puntos_obtenidos: 999,
    });
    const rows = await ranking(ORG_A, 2026, 8);
    expect(rows.find((r) => r.jugador_id === jugadorId)).toBeUndefined();
  });
});

describe("Ranking -> Participaciones: histórico y estado del jugador", () => {
  it("5) jugador archivado DESPUÉS de jugar sigue apareciendo en el mes en que jugó", async () => {
    const jugadorId = nextUuid("2a11");
    await insertJugador({
      id: jugadorId,
      nombre: "Caso Archivado",
      estado: "archivado",
    });
    await insertParticipacion({
      id: nextUuid("2a12"),
      jugador_id: jugadorId,
      tipo_evento: "reta",
      evento_id: nextUuid("2a13"),
      fecha: "2026-08-06",
      puntos_obtenidos: 60,
    });
    const rows = await ranking(ORG_A, 2026, 8);
    const row = rows.find((r) => r.jugador_id === jugadorId);
    expect(row).toBeDefined();
    expect(row?.total_participaciones).toBe(1);
  });

  it("15) meses históricos permanecen reproducibles (julio no se contamina con agosto)", async () => {
    const jugadorId = nextUuid("2b11");
    await insertJugador({ id: jugadorId, nombre: "Caso Historico Julio" });
    await insertParticipacion({
      id: nextUuid("2b12"),
      jugador_id: jugadorId,
      tipo_evento: "reta",
      evento_id: nextUuid("2b13"),
      fecha: "2026-07-15",
      puntos_obtenidos: 70,
    });
    await insertParticipacion({
      id: nextUuid("2b14"),
      jugador_id: jugadorId,
      tipo_evento: "reta",
      evento_id: nextUuid("2b15"),
      fecha: "2026-08-15",
      puntos_obtenidos: 80,
    });
    const julio = await ranking(ORG_A, 2026, 7);
    const agosto = await ranking(ORG_A, 2026, 8);
    const filaJulio = julio.find((r) => r.jugador_id === jugadorId);
    const filaAgosto = agosto.find((r) => r.jugador_id === jugadorId);
    expect(filaJulio?.total_participaciones).toBe(1);
    expect(filaJulio?.puntos_mes).toBe(70);
    expect(filaAgosto?.total_participaciones).toBe(1);
    expect(filaAgosto?.puntos_mes).toBe(80);
  });

  it("corte de mes: 31 de julio cuenta en julio, 1 de agosto cuenta en agosto (sin fuga por timezone)", async () => {
    const jugadorId = nextUuid("2c11");
    await insertJugador({ id: jugadorId, nombre: "Caso Corte Mes" });
    await insertParticipacion({
      id: nextUuid("2c12"),
      jugador_id: jugadorId,
      tipo_evento: "reta",
      evento_id: nextUuid("2c13"),
      fecha: "2026-07-31",
      puntos_obtenidos: 10,
    });
    await insertParticipacion({
      id: nextUuid("2c14"),
      jugador_id: jugadorId,
      tipo_evento: "torneo_express",
      evento_id: nextUuid("2c15"),
      fecha: "2026-08-01",
      puntos_obtenidos: 20,
    });
    const julio = await ranking(ORG_A, 2026, 7);
    const agosto = await ranking(ORG_A, 2026, 8);
    expect(julio.find((r) => r.jugador_id === jugadorId)?.total_participaciones).toBe(1);
    expect(julio.find((r) => r.jugador_id === jugadorId)?.puntos_mes).toBe(10);
    expect(agosto.find((r) => r.jugador_id === jugadorId)?.total_participaciones).toBe(1);
    expect(agosto.find((r) => r.jugador_id === jugadorId)?.puntos_mes).toBe(20);
  });
});

describe("Ranking -> Participaciones: deduplicación canónica", () => {
  it("6) duplicado histórico del mismo evento cuenta una sola vez", async () => {
    const jugadorId = nextUuid("3a11");
    const eventoId = nextUuid("3a12");
    await insertJugador({ id: jugadorId, nombre: "Caso Duplicado" });
    await insertParticipacion({
      id: nextUuid("3a13"),
      jugador_id: jugadorId,
      tipo_evento: "reta",
      evento_id: eventoId,
      fecha: "2026-08-07",
      puntos_obtenidos: 50,
      resultado: "derrota",
      createdAt: "2026-08-07T10:00:00Z",
    });
    await insertParticipacion({
      id: nextUuid("3a14"),
      jugador_id: jugadorId,
      tipo_evento: "reta",
      evento_id: eventoId,
      fecha: "2026-08-07",
      puntos_obtenidos: 90,
      resultado: "victoria",
      createdAt: "2026-08-07T18:00:00Z",
    });
    const rows = await ranking(ORG_A, 2026, 8);
    const row = rows.find((r) => r.jugador_id === jugadorId);
    expect(row?.total_participaciones).toBe(1);
  });

  it("7) la fila con created_at más reciente gana la canonicalización", async () => {
    const jugadorId = nextUuid("3b11");
    const eventoId = nextUuid("3b12");
    await insertJugador({ id: jugadorId, nombre: "Caso Gana Reciente" });
    await insertParticipacion({
      id: nextUuid("3b13"),
      jugador_id: jugadorId,
      tipo_evento: "reta",
      evento_id: eventoId,
      fecha: "2026-08-08",
      puntos_obtenidos: 50,
      resultado: "derrota",
      createdAt: "2026-08-08T10:00:00Z",
    });
    await insertParticipacion({
      id: nextUuid("3b14"),
      jugador_id: jugadorId,
      tipo_evento: "reta",
      evento_id: eventoId,
      fecha: "2026-08-08",
      puntos_obtenidos: 90,
      resultado: "victoria",
      createdAt: "2026-08-08T18:00:00Z",
    });
    const det = await detalle(ORG_A, jugadorId, 2026, 8);
    expect(det).toHaveLength(1);
    expect(det[0].resultado).toBe("victoria");
    expect(det[0].puntos_obtenidos).toBe(90);
  });

  it("8) los puntos de la fila descartada NO entran al SUM", async () => {
    const jugadorId = nextUuid("3c11");
    const eventoId = nextUuid("3c12");
    await insertJugador({ id: jugadorId, nombre: "Caso Suma Descartado" });
    await insertParticipacion({
      id: nextUuid("3c13"),
      jugador_id: jugadorId,
      tipo_evento: "americano",
      evento_id: eventoId,
      fecha: "2026-08-09",
      puntos_obtenidos: 1000,
      resultado: "derrota",
      createdAt: "2026-08-09T09:00:00Z",
    });
    await insertParticipacion({
      id: nextUuid("3c14"),
      jugador_id: jugadorId,
      tipo_evento: "americano",
      evento_id: eventoId,
      fecha: "2026-08-09",
      puntos_obtenidos: 45,
      resultado: "victoria",
      createdAt: "2026-08-09T20:00:00Z",
    });
    const rows = await ranking(ORG_A, 2026, 8);
    const row = rows.find((r) => r.jugador_id === jugadorId);
    expect(row?.puntos_mes).toBe(45);
  });
});

describe("Ranking -> Participaciones: invariante ranking <-> detalle", () => {
  it("9) total_participaciones y puntos_mes SIEMPRE coinciden con el detalle (varias modalidades)", async () => {
    const jugadorId = nextUuid("4a11");
    await insertJugador({ id: jugadorId, nombre: "Caso Invariante" });
    const eventos: Array<[ParticipacionRow["tipo_evento"], number, string?]> = [
      ["reta", 100],
      ["duelo_2v2", 75],
      ["torneo_express", 120],
      ["americano", 85],
      ["liga", 60, "liga_jornada"],
    ];
    for (const [tipo, pts, subtipo] of eventos) {
      await insertParticipacion({
        id: nextUuid("4a"),
        jugador_id: jugadorId,
        tipo_evento: tipo,
        evento_id: nextUuid("4a"),
        fecha: "2026-08-10",
        puntos_obtenidos: pts,
        subtipo,
      });
    }
    const rows = await ranking(ORG_A, 2026, 8);
    const det = await detalle(ORG_A, jugadorId, 2026, 8);
    const row = rows.find((r) => r.jugador_id === jugadorId);
    expect(row?.total_participaciones).toBe(det.length);
    expect(row?.puntos_mes).toBe(
      det.reduce((sum, d) => sum + d.puntos_obtenidos, 0)
    );
    expect(det).toHaveLength(5);
  });
});

describe("Ranking -> Participaciones: empates competitivos", () => {
  it("10) y 11) dos jugadores con mismas participaciones/puntos comparten posicion_competitiva (nombre/UUID no decide)", async () => {
    const jugadorZ = nextUuid("5a11");
    const jugadorA = nextUuid("5a12");
    await insertJugador({ id: jugadorZ, nombre: "Zutano Empate" });
    await insertJugador({ id: jugadorA, nombre: "Alicia Empate" });
    for (const jugadorId of [jugadorZ, jugadorA]) {
      await insertParticipacion({
        id: nextUuid("5a"),
        jugador_id: jugadorId,
        tipo_evento: "reta",
        evento_id: nextUuid("5a"),
        fecha: "2026-08-11",
        puntos_obtenidos: 50,
      });
    }
    const rows = await ranking(ORG_A, 2026, 8);
    const filaZ = rows.find((r) => r.jugador_id === jugadorZ);
    const filaA = rows.find((r) => r.jugador_id === jugadorA);
    expect(filaZ?.posicion_competitiva).toBe(filaA?.posicion_competitiva);
    expect(filaZ?.total_participaciones).toBe(filaA?.total_participaciones);
    expect(filaZ?.puntos_mes).toBe(filaA?.puntos_mes);
  });
});

describe("Ranking -> Participaciones: multi-club y exclusiones oficiales", () => {
  it("12) participaciones de otro organizador no contaminan el ranking", async () => {
    const jugadorId = nextUuid("6a11");
    await insertJugador({ id: jugadorId, nombre: "Caso Otro Club", organizadorId: ORG_B });
    await insertParticipacion({
      id: nextUuid("6a12"),
      jugador_id: jugadorId,
      tipo_evento: "reta",
      evento_id: nextUuid("6a13"),
      fecha: "2026-08-12",
      puntos_obtenidos: 200,
      organizadorId: ORG_B,
    });
    const rowsA = await ranking(ORG_A, 2026, 8);
    const rowsB = await ranking(ORG_B, 2026, 8);
    expect(rowsA.find((r) => r.jugador_id === jugadorId)).toBeUndefined();
    expect(rowsB.find((r) => r.jugador_id === jugadorId)?.puntos_mes).toBe(200);
  });

  it("13) participaciones excluidas oficialmente (tombstone) no cuentan", async () => {
    const jugadorId = nextUuid("6b11");
    const eventoId = nextUuid("6b12");
    await insertJugador({ id: jugadorId, nombre: "Caso Excluido" });
    await insertParticipacion({
      id: nextUuid("6b13"),
      jugador_id: jugadorId,
      tipo_evento: "reta",
      evento_id: eventoId,
      fecha: "2026-08-13",
      puntos_obtenidos: 30,
    });
    await insertExclusion({
      scopeJugadorId: jugadorId,
      tipoEvento: "reta",
      eventoId,
    });
    const rows = await ranking(ORG_A, 2026, 8);
    expect(rows.find((r) => r.jugador_id === jugadorId)).toBeUndefined();
  });
});

describe("Ranking -> Participaciones: 0 puntos y filtros", () => {
  it("14) evento con 0 puntos SÍ cuenta como participación válida", async () => {
    const jugadorId = nextUuid("7a11");
    await insertJugador({ id: jugadorId, nombre: "Caso Cero Puntos" });
    await insertParticipacion({
      id: nextUuid("7a12"),
      jugador_id: jugadorId,
      tipo_evento: "duelo_2v2",
      evento_id: nextUuid("7a13"),
      fecha: "2026-08-14",
      puntos_obtenidos: 0,
    });
    const rows = await ranking(ORG_A, 2026, 8);
    const row = rows.find((r) => r.jugador_id === jugadorId);
    expect(row).toBeDefined();
    expect(row?.total_participaciones).toBe(1);
    expect(row?.puntos_mes).toBe(0);
  });

  it("filtro de categoría no rompe conteo -- solo filtra la lista visible", async () => {
    const jugadorId = nextUuid("7b11");
    await insertJugador({ id: jugadorId, nombre: "Caso Categoria 3ra", categoria: "3ra" });
    await insertParticipacion({
      id: nextUuid("7b12"),
      jugador_id: jugadorId,
      tipo_evento: "reta",
      evento_id: nextUuid("7b13"),
      fecha: "2026-08-15",
      puntos_obtenidos: 15,
    });
    const soloOpen = await ranking(ORG_A, 2026, 8, "open");
    const solo3ra = await ranking(ORG_A, 2026, 8, "3ra");
    expect(soloOpen.find((r) => r.jugador_id === jugadorId)).toBeUndefined();
    expect(solo3ra.find((r) => r.jugador_id === jugadorId)?.total_participaciones).toBe(1);
  });

  it("filtro de género respeta M=null-o-M / F=F (mismo patrón que ranking interno)", async () => {
    const jugadorId = nextUuid("7c11");
    await insertJugador({ id: jugadorId, nombre: "Caso Genero F", genero: "F" });
    await insertParticipacion({
      id: nextUuid("7c12"),
      jugador_id: jugadorId,
      tipo_evento: "reta",
      evento_id: nextUuid("7c13"),
      fecha: "2026-08-16",
      puntos_obtenidos: 25,
    });
    const soloM = await ranking(ORG_A, 2026, 8, null, "M");
    const soloF = await ranking(ORG_A, 2026, 8, null, "F");
    expect(soloM.find((r) => r.jugador_id === jugadorId)).toBeUndefined();
    expect(soloF.find((r) => r.jugador_id === jugadorId)?.total_participaciones).toBe(1);
  });

  describe("Ranking -> Participaciones: resolución de Riviera ID (fix 2026-08-09)", () => {
    it("resuelve riviera_id vía riviera_official_player_profile_link (via_link)", async () => {
      const jugadorId = nextUuid("9a11");
      await insertJugador({ id: jugadorId, nombre: "Caso Riviera Id Link" });
      await insertParticipacion({
        id: nextUuid("9a12"),
        jugador_id: jugadorId,
        tipo_evento: "reta",
        evento_id: nextUuid("9a13"),
        fecha: "2026-08-18",
        puntos_obtenidos: 10,
      });
      await insertRivieraIdentity({
        officialPlayerKey: nextUuid("9a14"),
        canonicalJugadorId: nextUuid("9a15"), // perfil dueño distinto -- ejercita via_link
        linkedJugadorId: jugadorId,
        rivieraId: "RIV-00000901",
      });
      const rows = await ranking(ORG_A, 2026, 8);
      expect(rows.find((r) => r.jugador_id === jugadorId)).toMatchObject({
        riviera_id: "RIV-00000901",
      });
    });

    it("resuelve riviera_id cuando el jugador ES el canonical_riviera_jugador_id (via_canonical, sin fila en profile_link)", async () => {
      const jugadorId = nextUuid("9b11");
      await insertJugador({ id: jugadorId, nombre: "Caso Riviera Id Canonical" });
      await insertParticipacion({
        id: nextUuid("9b12"),
        jugador_id: jugadorId,
        tipo_evento: "reta",
        evento_id: nextUuid("9b13"),
        fecha: "2026-08-19",
        puntos_obtenidos: 5,
      });
      await insertRivieraIdentity({
        officialPlayerKey: nextUuid("9b14"),
        canonicalJugadorId: jugadorId, // SIN profile_link -- solo matchea via_canonical
        rivieraId: "RIV-00000902",
      });
      const rows = await ranking(ORG_A, 2026, 8);
      expect(rows.find((r) => r.jugador_id === jugadorId)).toMatchObject({
        riviera_id: "RIV-00000902",
      });
    });

    it("jugador SIN identidad oficial vinculada sigue apareciendo, solo con riviera_id null (LEFT JOIN, no rompe el ranking)", async () => {
      const jugadorId = nextUuid("9c11");
      await insertJugador({ id: jugadorId, nombre: "Caso Sin Identidad" });
      await insertParticipacion({
        id: nextUuid("9c12"),
        jugador_id: jugadorId,
        tipo_evento: "reta",
        evento_id: nextUuid("9c13"),
        fecha: "2026-08-20",
        puntos_obtenidos: 8,
      });
      const rows = await ranking(ORG_A, 2026, 8);
      const row = rows.find((r) => r.jugador_id === jugadorId);
      expect(row).toBeDefined();
      expect(row?.riviera_id ?? null).toBeNull();
    });

    it("jugador archivado con identidad oficial vinculada conserva su riviera_id en un mes histórico (no se filtra por estado)", async () => {
      const jugadorId = nextUuid("9d11");
      await insertJugador({ id: jugadorId, nombre: "Caso Archivado Con Riviera Id", estado: "archivado" });
      await insertParticipacion({
        id: nextUuid("9d12"),
        jugador_id: jugadorId,
        tipo_evento: "reta",
        evento_id: nextUuid("9d13"),
        fecha: "2026-07-05",
        puntos_obtenidos: 12,
      });
      await insertRivieraIdentity({
        officialPlayerKey: nextUuid("9d14"),
        canonicalJugadorId: jugadorId,
        rivieraId: "RIV-00000904",
      });
      const rows = await ranking(ORG_A, 2026, 7);
      expect(rows.find((r) => r.jugador_id === jugadorId)).toMatchObject({
        riviera_id: "RIV-00000904",
      });
    });
  });

  describe("Ranking -> Participaciones: privilegios de la función interna", () => {
    it("anon NO puede ejecutar _riviera_participaciones_canonicas_mensual directamente (REVOKE explícito, no solo ausencia de GRANT)", async () => {
      await db.exec("SET ROLE anon;");
      try {
        await expect(
          db.query(
            `SELECT * FROM _riviera_participaciones_canonicas_mensual($1::uuid, $2, $3)`,
            [ORG_A, 2026, 8]
          )
        ).rejects.toThrow(/permission denied/i);
      } finally {
        await db.exec("RESET ROLE;");
      }
    });

    it("anon SÍ puede ejecutar las 2 RPC públicas pese al REVOKE de la función interna (SECURITY DEFINER = privilegios del owner, no del caller)", async () => {
      const jugadorId = nextUuid("8a11");
      await insertJugador({ id: jugadorId, nombre: "Caso Anon Publico" });
      await insertParticipacion({
        id: nextUuid("8a12"),
        jugador_id: jugadorId,
        tipo_evento: "reta",
        evento_id: nextUuid("8a13"),
        fecha: "2026-08-17",
        puntos_obtenidos: 40,
      });

      await db.exec("SET ROLE anon;");
      try {
        const rows = await ranking(ORG_A, 2026, 8);
        expect(rows.find((r) => r.jugador_id === jugadorId)?.puntos_mes).toBe(40);

        const detalleRows = await detalle(ORG_A, jugadorId, 2026, 8);
        expect(detalleRows).toHaveLength(1);
        expect(detalleRows[0].puntos_obtenidos).toBe(40);
      } finally {
        await db.exec("RESET ROLE;");
      }
    });
  });
  });
}); // fin maybeDescribe RUN_SQL_INTEGRATION
