/**
 * Regresión del motor bulk de sincronización Liga <-> registro Riviera
 * (reemplaza el antiguo `for (const rj of registry) { await ... }` que hacía
 * 2-6 round-trips secuenciales POR JUGADOR). Estos tests fallan contra la
 * implementación anterior (loop secuencial, sin dedupe de concurrencia, sin
 * generación de id en cliente) y pasan contra la nueva.
 *
 * Mock de Supabase: tabla `liga_jugadores` en memoria real (select/insert/
 * update con filtros), para poder afirmar sobre el número de llamadas y
 * sobre el estado final sin asumir nada del orden de un RETURNING.
 */

import { supabase } from "../supabaseClient";
import {
  listRivieraJugadoresPrivate,
  getRivieraJugadorPrivateById,
  linkLegacyLigaJugadorId,
} from "./rivieraJugadoresService";
import {
  listActiveGrantedAccessForOrganizer,
  resolveJugadorIdForOrganizer,
} from "./organizerPlayerAccess";
import {
  loadOrganizadorLigaJugadoresPool,
  assertLigaJugadoresDelOrganizador,
} from "./playerPoolSync";
import type { RivieraJugador } from "./types";
import type { LigaJugador } from "../liga/types";
import type { OrganizerPlayerAccessRow } from "./organizerPlayerAccess";

// jest.mock se hoistea automáticamente por encima de los imports (Jest +
// babel-plugin-jest-hoist), así que escribirlo después es equivalente en
// tiempo de ejecución y respeta la regla import/first (mismo patrón que
// LigaGestionar.render.test.tsx).
jest.mock("../supabaseClient", () => ({
  supabase: { from: jest.fn() },
}));

jest.mock("./rivieraJugadoresService", () => ({
  listRivieraJugadoresPrivate: jest.fn(),
  listRivieraJugadores: jest.fn(),
  getRivieraJugadorPrivateById: jest.fn(),
  linkLegacyLigaJugadorId: jest.fn(),
  getRivieraJugadorByLegacyPlayerId: jest.fn(),
}));

jest.mock("./organizerPlayerAccess", () => ({
  isGrantedJugadorRow: (j: { concedidoPorAdmin?: boolean; grantedAccess?: unknown }) =>
    Boolean(j.concedidoPorAdmin || j.grantedAccess),
  listActiveGrantedAccessForOrganizer: jest.fn(),
  resolveJugadorIdForOrganizer: jest.fn(),
}));

/** UUID v4 válido y determinístico a partir de un entero — legacy_liga_jugador_id
 *  y organizador_id pasan por sanitizeUuid/isValidUuid, así que los fixtures
 *  no pueden ser strings arbitrarios como "rj-1". */
function uid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

// organizadorId único por test (no una constante compartida): el motor de
// sync anterior guardaba un TTL en memoria por organizadorId a nivel de
// módulo — reusar el mismo id entre tests dejaría que el primer test
// "calentara" ese caché y enmascarara el loop N+1 en los tests siguientes
// dentro del mismo archivo. Aislar por test también es mejor higiene en
// general, más allá de esta comparación puntual.
let testOrgSeq = 100000;
let ORG = uid(testOrgSeq);
let OTHER_ORG = uid(testOrgSeq + 1);

// ---------------------------------------------------------------------------
// Fake tabla `liga_jugadores` (única tabla que este módulo toca directamente)
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

function makeLigaJugadoresTable(initialRows: Row[] = []) {
  let rows: Row[] = initialRows.map((r) => ({ ...r }));
  let seq = 1;
  const calls: Array<{ op: string; payload?: unknown }> = [];

  function builder(op: "select" | "insert" | "update", payload?: unknown) {
    const filters: Array<(row: Row) => boolean> = [];
    let single = false;
    let maybeSingle = false;

    if (op === "insert" || op === "update") calls.push({ op, payload });

    const api: any = {
      select() {
        return api;
      },
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return api;
      },
      neq(col: string, val: unknown) {
        filters.push((r) => r[col] !== val);
        return api;
      },
      in(col: string, vals: unknown[]) {
        const set = new Set(vals);
        filters.push((r) => set.has(r[col]));
        return api;
      },
      order() {
        return api;
      },
      single() {
        single = true;
        return api;
      },
      maybeSingle() {
        maybeSingle = true;
        return api;
      },
      then(resolve: (v: { data: unknown; error: unknown }) => void) {
        let data: unknown = null;
        try {
          if (op === "insert") {
            const list = Array.isArray(payload) ? payload : [payload];
            const created = list.map((r) => ({
              id: (r as Row).id ?? `gen-${seq++}`,
              created_at: new Date().toISOString(),
              estado: "activo",
              ...(r as Row),
            }));
            rows.push(...created);
            data = single ? created[0] : created;
          } else if (op === "update") {
            const matched = rows.filter((r) => filters.every((f) => f(r)));
            matched.forEach((r) => Object.assign(r, payload));
            data = single || maybeSingle ? matched[0] ?? null : matched;
          } else {
            const matched = rows.filter((r) => filters.every((f) => f(r)));
            data = single || maybeSingle ? matched[0] ?? null : matched;
          }
          resolve({ data, error: null });
        } catch (e) {
          resolve({ data: null, error: { message: String(e) } });
        }
      },
    };
    return api;
  }

  return {
    getRows: () => rows,
    getCalls: () => calls,
    api: {
      select: () => builder("select"),
      insert: (payload: unknown) => builder("insert", payload),
      update: (patch: unknown) => builder("update", patch),
    },
  };
}

// ---------------------------------------------------------------------------
// Registro Riviera con estado mutable: linkLegacyLigaJugadorId muta la fila
// correspondiente, igual que en Supabase real, para que una relectura tras
// aplicar el diff vea el vínculo recién creado.
// ---------------------------------------------------------------------------
function makeRegistryState(initial: RivieraJugador[]) {
  let rows = initial.map((r) => ({ ...r }));
  return {
    getRows: () => rows,
    list: jest.fn(async () => rows.map((r) => ({ ...r }))),
    link: jest.fn(async (rivieraJugadorId: string, legacyLigaJugadorId: string) => {
      const row = rows.find((r) => r.id === rivieraJugadorId);
      if (row) row.legacy_liga_jugador_id = legacyLigaJugadorId;
    }),
  };
}

function riviera(overrides: Partial<RivieraJugador> & { id: string }): RivieraJugador {
  return {
    slug: overrides.id,
    foto_url: null,
    email: null,
    telefono: null,
    whatsapp: null,
    nivel: "intermedio",
    categoria: "3ra_fuerza",
    edad: null,
    mano_dominante: null,
    en_cancha: null,
    pais_codigo: null,
    instagram_url: null,
    facebook_url: null,
    tiktok_url: null,
    visible_publico: true,
    suma_ranking: true,
    genero: null,
    fecha_nacimiento: null,
    club: null,
    organizador_id: ORG,
    estado: "activo",
    legacy_player_id: null,
    legacy_liga_jugador_id: null,
    rating: 3,
    rating_partidos: 0,
    rating_fiabilidad: 0.2,
    created_at: "",
    updated_at: "",
    nombre: overrides.id,
    ...overrides,
  } as RivieraJugador;
}

function activo(overrides: Partial<LigaJugador> & { id: string; nombre: string }): Row {
  return {
    email: null,
    telefono: null,
    genero: null,
    nivel: null,
    estado: "activo",
    organizador_id: ORG,
    created_at: "",
    ...overrides,
  };
}

let table: ReturnType<typeof makeLigaJugadoresTable>;
let registry: ReturnType<typeof makeRegistryState>;

beforeEach(() => {
  jest.clearAllMocks();
  testOrgSeq += 2;
  ORG = uid(testOrgSeq);
  OTHER_ORG = uid(testOrgSeq + 1);
  table = makeLigaJugadoresTable([]);
  (supabase.from as jest.Mock).mockImplementation((name: string) => {
    if (name === "liga_jugadores") return table.api;
    throw new Error(`tabla no simulada en este test: ${name}`);
  });

  registry = makeRegistryState([]);
  (listRivieraJugadoresPrivate as jest.Mock).mockImplementation(registry.list);
  (linkLegacyLigaJugadorId as jest.Mock).mockImplementation(registry.link);
  (listActiveGrantedAccessForOrganizer as jest.Mock).mockResolvedValue(
    [] as OrganizerPlayerAccessRow[]
  );
});

function setRegistry(rows: RivieraJugador[]) {
  registry = makeRegistryState(rows);
  (listRivieraJugadoresPrivate as jest.Mock).mockImplementation(registry.list);
  (linkLegacyLigaJugadorId as jest.Mock).mockImplementation(registry.link);
}

function setActiveLigaJugadores(rows: Row[]) {
  table = makeLigaJugadoresTable(rows);
  (supabase.from as jest.Mock).mockImplementation((name: string) => {
    if (name === "liga_jugadores") return table.api;
    throw new Error(`tabla no simulada en este test: ${name}`);
  });
}

describe("playerPoolSync — motor bulk (sin N+1)", () => {
  it("30 jugadores ya enlazados se reconcilian sin ninguna llamada por jugador", async () => {
    const N = 30;
    const rjs: RivieraJugador[] = [];
    const activos: Row[] = [];
    for (let i = 0; i < N; i++) {
      const ligaId = uid(1000 + i);
      rjs.push(
        riviera({ id: uid(2000 + i), nombre: `Jugador ${i}`, legacy_liga_jugador_id: ligaId })
      );
      activos.push(activo({ id: ligaId, nombre: `Jugador ${i}` }));
    }
    setRegistry(rjs);
    setActiveLigaJugadores(activos);

    const pool = await loadOrganizadorLigaJugadoresPool(ORG);

    expect(pool).toHaveLength(N);
    // 1 sola llamada al registro (no una por jugador).
    expect(listRivieraJugadoresPrivate).toHaveBeenCalledTimes(1);
    // Ninguna resolución de jugador concedido ni link se disparó: no hubo
    // nada que crear/actualizar/enlazar para un roster ya sincronizado.
    expect(resolveJugadorIdForOrganizer).not.toHaveBeenCalled();
    expect(linkLegacyLigaJugadorId).not.toHaveBeenCalled();
    // supabase.from("liga_jugadores") solo para la lectura bulk de activos
    // (1 vez) — nunca 30 llamadas de verificación/alta por jugador.
    expect((supabase.from as jest.Mock).mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("sin cambios en el registro, hasWork es false y no se dispara ninguna escritura", async () => {
    setRegistry([riviera({ id: uid(10), nombre: "Ana", legacy_liga_jugador_id: uid(11) })]);
    setActiveLigaJugadores([activo({ id: uid(11), nombre: "Ana" })]);

    await loadOrganizadorLigaJugadoresPool(ORG);
    // Deja correr cualquier microtask de background (no debería haber ninguna).
    await Promise.resolve();
    await Promise.resolve();

    expect(table.getCalls()).toHaveLength(0);
    expect(linkLegacyLigaJugadorId).not.toHaveBeenCalled();
  });

  it("altas múltiples se hacen en un único insert bulk (no uno por jugador)", async () => {
    setRegistry([
      riviera({ id: uid(20), nombre: "Nuevo A" }),
      riviera({ id: uid(21), nombre: "Nuevo B" }),
      riviera({ id: uid(22), nombre: "Nuevo C" }),
    ]);
    setActiveLigaJugadores([]);

    const pool = await loadOrganizadorLigaJugadoresPool(ORG, { forceSync: true });

    const inserts = table.getCalls().filter((c) => c.op === "insert");
    expect(inserts).toHaveLength(1);
    expect(Array.isArray(inserts[0].payload)).toBe(true);
    expect((inserts[0].payload as unknown[]).length).toBe(3);

    expect(pool.map((j) => j.nombre).sort()).toEqual(["Nuevo A", "Nuevo B", "Nuevo C"]);
    expect(linkLegacyLigaJugadorId).toHaveBeenCalledTimes(3);
  });

  it("jugadores huérfanos (ya no en el registro) se desactivan", async () => {
    const sigueId = uid(30);
    const huerfanoId = uid(31);
    setRegistry([riviera({ id: uid(32), nombre: "Sigue", legacy_liga_jugador_id: sigueId })]);
    setActiveLigaJugadores([
      activo({ id: sigueId, nombre: "Sigue" }),
      activo({ id: huerfanoId, nombre: "Huerfano" }),
    ]);

    await loadOrganizadorLigaJugadoresPool(ORG, { forceSync: true });

    const huerfano = table.getRows().find((r) => r.id === huerfanoId);
    expect(huerfano?.estado).toBe("inactivo");
    const sigue = table.getRows().find((r) => r.id === sigueId);
    expect(sigue?.estado).toBe("activo");
  });

  it("cambio de nombre/contacto actualiza únicamente al jugador correspondiente", async () => {
    const ligaAna = uid(40);
    const ligaBeto = uid(41);
    setRegistry([
      riviera({ id: uid(42), nombre: "Ana Nueva", legacy_liga_jugador_id: ligaAna }),
      riviera({ id: uid(43), nombre: "Beto", legacy_liga_jugador_id: ligaBeto }),
    ]);
    setActiveLigaJugadores([
      activo({ id: ligaAna, nombre: "Ana Vieja" }),
      activo({ id: ligaBeto, nombre: "Beto" }),
    ]);

    await loadOrganizadorLigaJugadoresPool(ORG, { forceSync: true });

    const updates = table.getCalls().filter((c) => c.op === "update");
    expect(updates).toHaveLength(1);

    const ana = table.getRows().find((r) => r.id === ligaAna);
    const beto = table.getRows().find((r) => r.id === ligaBeto);
    expect(ana?.nombre).toBe("Ana Nueva");
    expect(beto?.nombre).toBe("Beto");
  });

  it("homónimos con IDs distintos no se fusionan", async () => {
    const liga1 = uid(50);
    const liga2 = uid(51);
    setRegistry([
      riviera({ id: uid(52), nombre: "Juan Pérez", legacy_liga_jugador_id: liga1 }),
      riviera({ id: uid(53), nombre: "Juan Pérez", legacy_liga_jugador_id: liga2 }),
    ]);
    setActiveLigaJugadores([
      activo({ id: liga1, nombre: "Juan Pérez" }),
      activo({ id: liga2, nombre: "Juan Pérez" }),
    ]);

    const pool = await loadOrganizadorLigaJugadoresPool(ORG);

    expect(pool).toHaveLength(2);
    expect(pool.map((j) => j.id).sort()).toEqual([liga1, liga2].sort());
  });

  it("cedidos cross-club (grant sin clon local) siguen creando su liga_jugadores", async () => {
    const sourceId = uid(60);
    const localCloneId = uid(61);
    setRegistry([
      riviera({
        id: sourceId,
        nombre: "Cedido",
        organizador_id: OTHER_ORG,
        concedidoPorAdmin: true,
      } as Partial<RivieraJugador> & { id: string; concedidoPorAdmin: boolean }),
    ]);
    setActiveLigaJugadores([]);
    (listActiveGrantedAccessForOrganizer as jest.Mock).mockResolvedValue([
      {
        id: uid(62),
        jugador_id: sourceId,
        owner_organizador_id: OTHER_ORG,
        local_jugador_id: null,
        local_display_name: null,
        local_category: null,
      },
    ] as OrganizerPlayerAccessRow[]);
    (resolveJugadorIdForOrganizer as jest.Mock).mockResolvedValue(localCloneId);
    (getRivieraJugadorPrivateById as jest.Mock).mockResolvedValue(
      riviera({ id: localCloneId, nombre: "Cedido", organizador_id: ORG })
    );

    await loadOrganizadorLigaJugadoresPool(ORG, { forceSync: true });

    // El registro de este test no simula que el grant "adopte" el
    // local_jugador_id recién creado en una relectura posterior (eso vive en
    // mergeGrantedJugadoresIntoList, fuera del motor bulk) — lo que sí debe
    // seguir siendo cierto es que la ruta rara de cedidos crea su fila y la
    // enlaza igual que antes, sin tocar al resto del roster.
    expect(resolveJugadorIdForOrganizer).toHaveBeenCalledWith(ORG, sourceId);
    const created = table.getRows().find((r) => r.nombre === "Cedido");
    expect(created).toBeDefined();
    expect(created?.organizador_id).toBe(ORG);
    expect(linkLegacyLigaJugadorId).toHaveBeenCalledWith(localCloneId, created!.id);
  });

  it("assertLigaJugadoresDelOrganizador espera la reconciliación completa (jugador nuevo queda validable)", async () => {
    setRegistry([riviera({ id: uid(70), nombre: "Recién Agregado" })]);
    setActiveLigaJugadores([]);

    const pool = await loadOrganizadorLigaJugadoresPool(ORG, { forceSync: true });
    const nuevoId = pool.find((j) => j.nombre === "Recién Agregado")!.id;

    await expect(
      assertLigaJugadoresDelOrganizador(ORG, [nuevoId])
    ).resolves.toBeUndefined();
  });

  it("assertLigaJugadoresDelOrganizador rechaza un id que no pertenece al registro activo", async () => {
    setRegistry([riviera({ id: uid(80), nombre: "Ana", legacy_liga_jugador_id: uid(81) })]);
    setActiveLigaJugadores([activo({ id: uid(81), nombre: "Ana" })]);

    await expect(
      assertLigaJugadoresDelOrganizador(ORG, [uid(999)])
    ).rejects.toThrow("no pertenece a tu registro activo");
  });

  it("dos invocaciones simultáneas con forceSync no duplican el alta del mismo jugador nuevo", async () => {
    setRegistry([riviera({ id: uid(90), nombre: "Único" })]);
    setActiveLigaJugadores([]);

    await Promise.all([
      loadOrganizadorLigaJugadoresPool(ORG, { forceSync: true }),
      loadOrganizadorLigaJugadoresPool(ORG, { forceSync: true }),
    ]);

    const creados = table.getRows().filter((r) => r.nombre === "Único");
    expect(creados).toHaveLength(1);
    const inserts = table.getCalls().filter((c) => c.op === "insert");
    expect(inserts).toHaveLength(1);
  });

  it("un error del sync en segundo plano no rompe la carga inicial ni queda como rechazo sin manejar", async () => {
    setRegistry([riviera({ id: uid(100), nombre: "Ana" })]);
    setActiveLigaJugadores([]);

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const unhandled = jest.fn();
    process.on("unhandledRejection", unhandled);

    // La relectura final dentro de applyLigaSyncPlan (tras aplicar el diff)
    // falla — simula un error real de red en la reconciliación en background.
    (listRivieraJugadoresPrivate as jest.Mock)
      .mockImplementationOnce(registry.list)
      .mockImplementationOnce(() => Promise.reject(new Error("network down")));

    const onBackgroundSync = jest.fn();
    const pool = await loadOrganizadorLigaJugadoresPool(ORG, { onBackgroundSync });

    // La carga inicial no debe rechazar ni bloquearse por el error de fondo.
    expect(pool).toEqual([]);

    // Deja asentar las microtasks del background.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();

    expect(onBackgroundSync).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(unhandled).not.toHaveBeenCalled();

    process.removeListener("unhandledRejection", unhandled);
    warnSpy.mockRestore();
  });
});
