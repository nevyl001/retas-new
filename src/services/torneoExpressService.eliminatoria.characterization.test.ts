/**
 * Tests de caracterización — saveEliminatoriaResultado (Torneo Express),
 * comportamiento PRE-atomicidad.
 *
 * HISTÓRICO / DESHABILITADO A PROPÓSITO (describe.skip): estos tests se
 * escribieron y se corrieron en verde contra el código de ANTES de
 * introducir la RPC atómica apply_torneo_express_eliminatoria_writes —
 * capturan payload exacto de cada UPDATE/INSERT por separado, tal como se
 * escribían entonces. Ya no aplican tal cual (el código ahora manda todo en
 * una sola llamada a supabase.rpc), pero se conservan como documentación
 * de qué se probó "antes". La demostración de equivalencia campo por campo
 * está en torneoExpressService.eliminatoria.rpcEquivalence.test.ts, que usa
 * los MISMOS fixtures y verifica que el payload agregado de la RPC coincide
 * exactamente con lo que aquí se capturaba como escrituras separadas.
 */

import { supabase } from "../lib/supabaseClient";
import { saveEliminatoriaResultado } from "./torneoExpressService";
import type { TorneoExpressEliminatoriaPartido } from "../lib/torneoExpress/types";

jest.mock("../lib/supabaseClient", () => ({
  supabase: {
    auth: { getUser: jest.fn(), getSession: jest.fn() },
    from: jest.fn(),
  },
  supabasePublicRead: {},
}));

function authOk() {
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: { user: { id: "org1" } } },
    error: null,
  });
}

// ── Fixtures: bracket de 4 (semifinal → final), fase_eliminacion="semifinal" ──
const TORNEO_ID = "t1";

const torneoFixture = {
  id: TORNEO_ID,
  nombre: "Torneo Test",
  organizador_id: "org1",
  estado: "en_curso",
  source_tournament_id: null,
  created_at: "2026-01-01T00:00:00Z",
  fase_torneo: "eliminatoria",
  fase_eliminacion: "semifinal" as const,
  bracket_slots: null,
};

function partido(
  overrides: Partial<TorneoExpressEliminatoriaPartido>
): TorneoExpressEliminatoriaPartido {
  return {
    id: "id",
    torneo_id: TORNEO_ID,
    ronda: 1,
    orden: 1,
    cruce_index: 0,
    pareja_local_id: null,
    pareja_visitante_id: null,
    puntos_local: null,
    puntos_visitante: null,
    sets_resultado: null,
    ganador_id: null,
    estado: "pendiente",
    es_bye: false,
    cancha: null,
    programado_en: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const S1_PENDIENTE = partido({
  id: "s1",
  ronda: 1,
  cruce_index: 0,
  orden: 1,
  pareja_local_id: "p1",
  pareja_visitante_id: "p2",
});
const S2_PENDIENTE = partido({
  id: "s2",
  ronda: 1,
  cruce_index: 1,
  orden: 2,
  pareja_local_id: "p3",
  pareja_visitante_id: "p4",
});
const S1_JUGADO_P1 = {
  ...S1_PENDIENTE,
  estado: "jugado" as const,
  ganador_id: "p1",
  puntos_local: 6,
  puntos_visitante: 4,
  sets_resultado: [{ local: 6, visitante: 4 }],
};
const S2_JUGADO_P3 = {
  ...S2_PENDIENTE,
  estado: "jugado" as const,
  ganador_id: "p3",
  puntos_local: 6,
  puntos_visitante: 2,
  sets_resultado: [{ local: 6, visitante: 2 }],
};

// ── Mock de supabase.from: distingue por tabla + forma de la cadena ──

interface Write {
  table: string;
  op: "update" | "insert";
  payload: unknown;
  eqId?: string;
}

/**
 * Simula la tabla torneo_express_eliminatoria_partidos en memoria: los
 * INSERT/UPDATE mutan el estado real, y toda lectura posterior (incluida
 * fetchEliminatoriaPartidos) refleja esos cambios — igual que Postgres.
 * Sin esto, no se puede caracterizar correctamente el segundo llamado a
 * ensureTercerLugarPartidoSiAplica (depende de leer lo que el INSERT
 * anterior ya escribió).
 */
function buildSupabaseFromMock(config: {
  /** .select(...).eq("id", X).single() sobre torneo_express_eliminatoria_partidos */
  existingPartido: TorneoExpressEliminatoriaPartido;
  /** estado inicial de la tabla (antes de cualquier write de este test) */
  initialPartidos: TorneoExpressEliminatoriaPartido[];
  /** .select("*").eq("id", X).maybeSingle() sobre torneo_express */
  torneo: () => typeof torneoFixture;
  writes: Write[];
}) {
  const table_: TorneoExpressEliminatoriaPartido[] = [
    ...config.initialPartidos,
  ];
  let insertSeq = 0;

  return (table: string) => {
    if (table === "torneo_express_eliminatoria_partidos") {
      const node: Record<string, jest.Mock> = {};
      let mode: "single-by-id" | "list-by-torneo" | null = null;
      node.select = jest.fn((cols: string) => {
        mode = cols === "*" ? "list-by-torneo" : "single-by-id";
        return node;
      });
      node.eq = jest.fn(() => node);
      node.order = jest.fn(() => node);
      node.single = jest.fn(() =>
        Promise.resolve({ data: config.existingPartido, error: null })
      );
      node.update = jest.fn((payload: Record<string, unknown>) => {
        const w: Write = { table, op: "update", payload };
        config.writes.push(w);
        const afterUpdate: Record<string, unknown> = {};
        afterUpdate.eq = jest.fn((_field: string, id: string) => {
          w.eqId = id;
          const idx = table_.findIndex((p) => p.id === id);
          if (idx >= 0) {
            table_[idx] = { ...table_[idx], ...payload };
          }
          return {
            select: jest.fn(() => ({
              single: jest.fn(() =>
                Promise.resolve({ data: table_[idx], error: null })
              ),
            })),
            then: (resolve: (v: unknown) => void) =>
              resolve({ error: null }),
          };
        });
        return afterUpdate;
      });
      node.insert = jest.fn(
        (payload: Record<string, unknown> | Record<string, unknown>[]) => {
          config.writes.push({ table, op: "insert", payload });
          // ensureTercerLugarPartidoSiAplica manda un objeto suelto, no un
          // array; el bloque de avance de ronda sí manda un array.
          const rows = Array.isArray(payload) ? payload : [payload];
          for (const row of rows) {
            insertSeq += 1;
            table_.push({
              ...(row as unknown as TorneoExpressEliminatoriaPartido),
              id: `inserted-${insertSeq}`,
              created_at: "2026-01-01T00:00:00Z",
            });
          }
          return Promise.resolve({ error: null });
        }
      );
      // awaitable en cualquier punto de la cadena (list-by-torneo no llama .single())
      (node as unknown as { then: unknown }).then = (
        resolve: (v: unknown) => void
      ) => {
        if (mode === "list-by-torneo") {
          resolve({ data: [...table_], error: null });
        } else {
          resolve({ data: config.existingPartido, error: null });
        }
      };
      return node;
    }

    if (table === "torneo_express") {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn(() =>
          Promise.resolve({ data: config.torneo(), error: null })
        ),
      };
    }

    throw new Error(`unexpected table in mock: ${table}`);
  };
}

describe.skip("saveEliminatoriaResultado — caracterización del comportamiento PRE-atomicidad (histórico)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authOk();
  });

  it("1. ganador normal (primera vez, ronda incompleta) — solo el UPDATE base, sin propagación ni avance", async () => {
    const writes: Write[] = [];
    (supabase.from as jest.Mock).mockImplementation(
      buildSupabaseFromMock({
        existingPartido: S1_PENDIENTE,
        initialPartidos: [S1_PENDIENTE, S2_PENDIENTE],
        torneo: () => torneoFixture,
        writes,
      })
    );

    await saveEliminatoriaResultado("s1", [{ local: 6, visitante: 4 }]);

    expect(writes).toEqual([
      {
        table: "torneo_express_eliminatoria_partidos",
        op: "update",
        eqId: "s1",
        payload: {
          puntos_local: 6,
          puntos_visitante: 4,
          ganador_id: "p1",
          estado: "jugado",
          sets_resultado: [{ local: 6, visitante: 4 }],
        },
      },
    ]);
  });

  it("4. creación de siguiente ronda + tercer lugar (ronda 1 se completa)", async () => {
    const writes: Write[] = [];
    (supabase.from as jest.Mock).mockImplementation(
      buildSupabaseFromMock({
        existingPartido: S2_PENDIENTE,
        initialPartidos: [S1_JUGADO_P1, S2_JUGADO_P3],
        torneo: () => torneoFixture,
        writes,
      })
    );

    await saveEliminatoriaResultado("s2", [{ local: 6, visitante: 2 }]);

    const updates = writes.filter((w) => w.op === "update");
    const inserts = writes.filter((w) => w.op === "insert");

    expect(updates).toEqual([
      {
        table: "torneo_express_eliminatoria_partidos",
        op: "update",
        eqId: "s2",
        payload: {
          puntos_local: 6,
          puntos_visitante: 2,
          ganador_id: "p3",
          estado: "jugado",
          sets_resultado: [{ local: 6, visitante: 2 }],
        },
      },
    ]);

    // Un solo INSERT con 2 filas: final (ronda 2) + tercer lugar (bundled).
    expect(inserts.length).toBe(1);
    const insertedRows = inserts[0].payload as Array<Record<string, unknown>>;
    expect(insertedRows).toHaveLength(2);
    expect(insertedRows[0]).toMatchObject({
      torneo_id: TORNEO_ID,
      ronda: 2,
      cruce_index: 0,
      pareja_local_id: "p1",
      pareja_visitante_id: "p3",
      estado: "pendiente",
      es_bye: false,
    });
    expect(insertedRows[1]).toMatchObject({
      torneo_id: TORNEO_ID,
      ronda: 90, // RONDA_TERCER_LUGAR
      cruce_index: 0,
      pareja_local_id: "p2",
      pareja_visitante_id: "p4",
      estado: "pendiente",
      es_bye: false,
    });
  });

  it("bracket ya avanzado: ronda 2 y tercer lugar ya existen — no reinserta nada", async () => {
    const FINAL_PENDIENTE = partido({
      id: "f1",
      ronda: 2,
      cruce_index: 0,
      orden: 1,
      pareja_local_id: "p1",
      pareja_visitante_id: "p3",
    });
    const TERCER_PENDIENTE = partido({
      id: "t3",
      ronda: 90,
      cruce_index: 0,
      orden: 1,
      pareja_local_id: "p2",
      pareja_visitante_id: "p4",
    });
    const writes: Write[] = [];
    (supabase.from as jest.Mock).mockImplementation(
      buildSupabaseFromMock({
        existingPartido: S2_PENDIENTE,
        initialPartidos: [
          S1_JUGADO_P1,
          S2_JUGADO_P3,
          FINAL_PENDIENTE,
          TERCER_PENDIENTE,
        ],
        torneo: () => torneoFixture,
        writes,
      })
    );

    await saveEliminatoriaResultado("s2", [{ local: 6, visitante: 2 }]);

    const inserts = writes.filter((w) => w.op === "insert");
    expect(inserts).toHaveLength(0);
  });

  it("bracket parcialmente avanzado: ronda 2 ya existe pero falta tercer lugar — crea SOLO el tercer lugar, no duplica la ronda 2", async () => {
    const FINAL_PENDIENTE = partido({
      id: "f1",
      ronda: 2,
      cruce_index: 0,
      orden: 1,
      pareja_local_id: "p1",
      pareja_visitante_id: "p3",
    });
    const writes: Write[] = [];
    (supabase.from as jest.Mock).mockImplementation(
      buildSupabaseFromMock({
        existingPartido: S2_PENDIENTE,
        initialPartidos: [S1_JUGADO_P1, S2_JUGADO_P3, FINAL_PENDIENTE],
        torneo: () => torneoFixture,
        writes,
      })
    );

    await saveEliminatoriaResultado("s2", [{ local: 6, visitante: 2 }]);

    const inserts = writes.filter((w) => w.op === "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload).toMatchObject({
      ronda: 90,
      pareja_local_id: "p2",
      pareja_visitante_id: "p4",
    });
    // No debe reinsertar la ronda 2, que ya existía.
    const rondaDosInsertado = inserts.some((w) => {
      const rows = Array.isArray(w.payload) ? w.payload : [w.payload];
      return rows.some((r) => (r as Record<string, unknown>).ronda === 2);
    });
    expect(rondaDosInsertado).toBe(false);
  });

  it("2+3. cambio de ganador con propagación aguas abajo (final aún pendiente)", async () => {
    const FINAL_PENDIENTE = partido({
      id: "f1",
      ronda: 2,
      cruce_index: 0,
      orden: 1,
      pareja_local_id: "p1",
      pareja_visitante_id: "p3",
    });
    const TERCER_PENDIENTE = partido({
      id: "t3",
      ronda: 90,
      cruce_index: 0,
      orden: 1,
      pareja_local_id: "p2",
      pareja_visitante_id: "p4",
    });
    const allPartidos = [
      S1_JUGADO_P1,
      S2_JUGADO_P3,
      FINAL_PENDIENTE,
      TERCER_PENDIENTE,
    ];

    const writes: Write[] = [];
    (supabase.from as jest.Mock).mockImplementation(
      buildSupabaseFromMock({
        existingPartido: S1_JUGADO_P1, // ganador previo: p1
        initialPartidos: allPartidos,
        torneo: () => torneoFixture,
        writes,
      })
    );

    // Corrige S1: ahora gana p2 (antes p1).
    await saveEliminatoriaResultado("s1", [{ local: 4, visitante: 6 }]);

    const updates = writes.filter((w) => w.op === "update");
    const updateIds = updates.map((u) => u.eqId);

    expect(updateIds[0]).toBe("s1");
    expect(updates[0].payload).toMatchObject({
      ganador_id: "p2",
      estado: "jugado",
    });

    // Debe propagar: la final (f1) pasa a tener p2 como local (era p1), y el
    // tercer lugar (t3) pasa a tener p1 en vez de p2 como uno de los perdedores.
    expect(updateIds).toContain("f1");
    expect(updateIds).toContain("t3");

    const finalPatch = updates.find((u) => u.eqId === "f1")!;
    expect(finalPatch.payload).toMatchObject({ pareja_local_id: "p2" });

    const tercerPatch = updates.find((u) => u.eqId === "t3")!;
    expect(tercerPatch.payload).toMatchObject({
      pareja_local_id: "p1",
      pareja_visitante_id: "p4",
    });

    // No debe reinsertar nada (ronda 2 ya existe, ronda 1 sigue completa).
    expect(writes.filter((w) => w.op === "insert")).toHaveLength(0);
  });

  it("7. corrección de un resultado ya jugado (mismo ganador, cambia el marcador) — sin propagación", async () => {
    const writes: Write[] = [];
    (supabase.from as jest.Mock).mockImplementation(
      buildSupabaseFromMock({
        existingPartido: S1_JUGADO_P1, // ganador previo: p1
        initialPartidos: [S1_JUGADO_P1, S2_PENDIENTE],
        torneo: () => torneoFixture,
        writes,
      })
    );

    // Mismo ganador (p1), marcador corregido de 6-4 a 7-5.
    await saveEliminatoriaResultado("s1", [{ local: 7, visitante: 5 }]);

    expect(writes).toEqual([
      {
        table: "torneo_express_eliminatoria_partidos",
        op: "update",
        eqId: "s1",
        payload: {
          puntos_local: 7,
          puntos_visitante: 5,
          ganador_id: "p1",
          estado: "jugado",
          sets_resultado: [{ local: 7, visitante: 5 }],
        },
      },
    ]);
  });
});
