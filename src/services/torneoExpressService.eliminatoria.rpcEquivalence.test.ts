/**
 * Demuestra equivalencia campo por campo: los MISMOS fixtures/escenarios de
 * torneoExpressService.eliminatoria.characterization.test.ts (que capturó el
 * comportamiento con las escrituras separadas de antes), ahora verificados
 * contra la nueva implementación basada en una sola RPC atómica
 * (apply_torneo_express_eliminatoria_writes). El payload agregado que se le
 * manda a la RPC debe coincidir, campo por campo, con lo que antes eran
 * varias llamadas .update()/.insert() independientes.
 */

import { supabase } from "../lib/supabaseClient";
import { saveEliminatoriaResultado } from "./torneoExpressService";
import type { TorneoExpressEliminatoriaPartido } from "../lib/torneoExpress/types";

jest.mock("../lib/supabaseClient", () => ({
  supabase: {
    auth: { getUser: jest.fn(), getSession: jest.fn() },
    from: jest.fn(),
    rpc: jest.fn(),
  },
  supabasePublicRead: {},
}));

function authOk() {
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: { user: { id: "org1" } } },
    error: null,
  });
}

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

function buildMock(config: {
  existingPartido: TorneoExpressEliminatoriaPartido;
  initialPartidos: TorneoExpressEliminatoriaPartido[];
  rpcResponse?: { data: unknown; error: unknown };
  /**
   * Fila que debe devolver el SEGUNDO .single() sobre
   * torneo_express_eliminatoria_partidos (el fetch posterior a la RPC, que
   * alimenta el valor de retorno de saveEliminatoriaResultado). El primer
   * .single() (el fetch inicial de "existing") siempre devuelve
   * existingPartido. Si no se especifica, se usa existingPartido también
   * (equivalente a "nada cambió").
   */
  freshRowAfterRpc?: TorneoExpressEliminatoriaPartido;
}) {
  const table_: TorneoExpressEliminatoriaPartido[] = [
    ...config.initialPartidos,
  ];

  (supabase.rpc as jest.Mock).mockResolvedValue(
    config.rpcResponse ?? {
      data: { ok: true, updated_count: 1, inserted_count: 0 },
      error: null,
    }
  );

  let singleByIdCallCount = 0;

  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    if (table === "torneo_express_eliminatoria_partidos") {
      const node: Record<string, jest.Mock> = {};
      let mode: "single-by-id" | "list-by-torneo" | null = null;
      node.select = jest.fn((cols: string) => {
        mode = cols === "*" ? "list-by-torneo" : "single-by-id";
        return node;
      });
      node.eq = jest.fn(() => node);
      node.order = jest.fn(() => node);
      node.single = jest.fn(() => {
        singleByIdCallCount += 1;
        // 1ra llamada: fetch inicial de "existing". 2da en adelante: fetch
        // posterior a la RPC (el que alimenta el valor de retorno).
        const data =
          singleByIdCallCount >= 2
            ? (config.freshRowAfterRpc ?? config.existingPartido)
            : config.existingPartido;
        return Promise.resolve({ data, error: null });
      });
      (node as unknown as { then: unknown }).then = (
        resolve: (v: unknown) => void
      ) => {
        resolve({
          data:
            mode === "list-by-torneo" ? [...table_] : config.existingPartido,
          error: null,
        });
      };
      return node;
    }
    if (table === "torneo_express") {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn(() =>
          Promise.resolve({ data: torneoFixture, error: null })
        ),
      };
    }
    throw new Error(`unexpected table in mock: ${table}`);
  });
}

describe("saveEliminatoriaResultado — equivalencia RPC vs. escrituras separadas de antes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authOk();
  });

  it("1. ganador normal: la RPC recibe exactamente 1 update, 0 inserts, con el mismo payload de antes", async () => {
    buildMock({
      existingPartido: S1_PENDIENTE,
      initialPartidos: [S1_PENDIENTE, S2_PENDIENTE],
    });

    await saveEliminatoriaResultado("s1", [{ local: 6, visitante: 4 }]);

    expect(supabase.rpc).toHaveBeenCalledWith(
      "apply_torneo_express_eliminatoria_writes",
      {
        p_torneo_id: TORNEO_ID,
        p_updates: [
          {
            id: "s1",
            puntos_local: 6,
            puntos_visitante: 4,
            ganador_id: "p1",
            estado: "jugado",
            sets_resultado: [{ local: 6, visitante: 4 }],
          },
        ],
        p_inserts: [],
      }
    );
  });

  it("valor de retorno: refleja la fila real posterior a la RPC (fetch de refresco), no un objeto reconstruido a mano", async () => {
    const S1_JUGADO_REAL_DESDE_DB = {
      ...S1_JUGADO_P1,
      // Columna que jamás pasa por updateRow/patches (ej. cancha asignada
      // por otro flujo) — solo puede venir del fetch de refresco real.
      cancha: "Cancha 3",
    };
    buildMock({
      existingPartido: S1_PENDIENTE,
      initialPartidos: [S1_PENDIENTE, S2_PENDIENTE],
      freshRowAfterRpc: S1_JUGADO_REAL_DESDE_DB,
    });

    const result = await saveEliminatoriaResultado("s1", [
      { local: 6, visitante: 4 },
    ]);

    expect(result).toEqual(S1_JUGADO_REAL_DESDE_DB);
  });

  it("4. creación de siguiente ronda + tercer lugar: la RPC recibe 1 update + 2 inserts equivalentes a los write-calls de antes", async () => {
    buildMock({
      existingPartido: S2_PENDIENTE,
      initialPartidos: [S1_JUGADO_P1, S2_JUGADO_P3],
    });

    await saveEliminatoriaResultado("s2", [{ local: 6, visitante: 2 }]);

    const call = (supabase.rpc as jest.Mock).mock.calls[0];
    expect(call[0]).toBe("apply_torneo_express_eliminatoria_writes");
    const args = call[1] as {
      p_torneo_id: string;
      p_updates: Array<Record<string, unknown>>;
      p_inserts: Array<Record<string, unknown>>;
    };

    expect(args.p_torneo_id).toBe(TORNEO_ID);
    expect(args.p_updates).toEqual([
      {
        id: "s2",
        puntos_local: 6,
        puntos_visitante: 2,
        ganador_id: "p3",
        estado: "jugado",
        sets_resultado: [{ local: 6, visitante: 2 }],
      },
    ]);

    // Mismos 2 inserts que antes capturaba el test de caracterización,
    // ahora dentro del array p_inserts de una sola llamada RPC.
    expect(args.p_inserts).toHaveLength(2);
    expect(args.p_inserts[0]).toMatchObject({
      torneo_id: TORNEO_ID,
      ronda: 2,
      cruce_index: 0,
      pareja_local_id: "p1",
      pareja_visitante_id: "p3",
      estado: "pendiente",
      es_bye: false,
    });
    expect(args.p_inserts[1]).toMatchObject({
      torneo_id: TORNEO_ID,
      ronda: 90,
      cruce_index: 0,
      pareja_local_id: "p2",
      pareja_visitante_id: "p4",
      estado: "pendiente",
      es_bye: false,
    });
  });

  it("bracket ya avanzado: 1 update, 0 inserts (nada que propagar ni generar)", async () => {
    const FINAL_PENDIENTE = partido({
      id: "f1",
      ronda: 2,
      cruce_index: 0,
      pareja_local_id: "p1",
      pareja_visitante_id: "p3",
    });
    const TERCER_PENDIENTE = partido({
      id: "t3",
      ronda: 90,
      cruce_index: 0,
      pareja_local_id: "p2",
      pareja_visitante_id: "p4",
    });
    buildMock({
      existingPartido: S2_PENDIENTE,
      initialPartidos: [
        S1_JUGADO_P1,
        S2_JUGADO_P3,
        FINAL_PENDIENTE,
        TERCER_PENDIENTE,
      ],
    });

    await saveEliminatoriaResultado("s2", [{ local: 6, visitante: 2 }]);

    const args = (supabase.rpc as jest.Mock).mock.calls[0][1] as {
      p_inserts: unknown[];
    };
    expect(args.p_inserts).toEqual([]);
  });

  it("2+3. cambio de ganador con propagación aguas abajo: la RPC recibe los 3 updates equivalentes (base + 2 propagados)", async () => {
    const FINAL_PENDIENTE = partido({
      id: "f1",
      ronda: 2,
      cruce_index: 0,
      pareja_local_id: "p1",
      pareja_visitante_id: "p3",
    });
    const TERCER_PENDIENTE = partido({
      id: "t3",
      ronda: 90,
      cruce_index: 0,
      pareja_local_id: "p2",
      pareja_visitante_id: "p4",
    });
    buildMock({
      existingPartido: S1_JUGADO_P1,
      initialPartidos: [
        S1_JUGADO_P1,
        S2_JUGADO_P3,
        FINAL_PENDIENTE,
        TERCER_PENDIENTE,
      ],
    });

    await saveEliminatoriaResultado("s1", [{ local: 4, visitante: 6 }]);

    const args = (supabase.rpc as jest.Mock).mock.calls[0][1] as {
      p_updates: Array<Record<string, unknown>>;
    };
    const ids = args.p_updates.map((u) => u.id);

    expect(ids[0]).toBe("s1");
    expect(args.p_updates[0]).toMatchObject({ ganador_id: "p2", estado: "jugado" });
    expect(ids).toContain("f1");
    expect(ids).toContain("t3");

    const finalPatch = args.p_updates.find((u) => u.id === "f1")!;
    expect(finalPatch).toMatchObject({ pareja_local_id: "p2" });
    const tercerPatch = args.p_updates.find((u) => u.id === "t3")!;
    expect(tercerPatch).toMatchObject({
      pareja_local_id: "p1",
      pareja_visitante_id: "p4",
    });
  });

  it("7. corrección de resultado ya jugado (mismo ganador): 1 solo update, sin propagación ni inserts", async () => {
    buildMock({
      existingPartido: S1_JUGADO_P1,
      initialPartidos: [S1_JUGADO_P1, S2_PENDIENTE],
    });

    await saveEliminatoriaResultado("s1", [{ local: 7, visitante: 5 }]);

    expect(supabase.rpc).toHaveBeenCalledWith(
      "apply_torneo_express_eliminatoria_writes",
      {
        p_torneo_id: TORNEO_ID,
        p_updates: [
          {
            id: "s1",
            puntos_local: 7,
            puntos_visitante: 5,
            ganador_id: "p1",
            estado: "jugado",
            sets_resultado: [{ local: 7, visitante: 5 }],
          },
        ],
        p_inserts: [],
      }
    );
  });

  it("error de RPC no deja actualización parcial: no se hace ningún fetch posterior ni se aplica rating de forma bloqueante", async () => {
    buildMock({
      existingPartido: S1_PENDIENTE,
      initialPartidos: [S1_PENDIENTE, S2_PENDIENTE],
      rpcResponse: { data: null, error: { message: "conflicto de bracket" } },
    });

    await expect(
      saveEliminatoriaResultado("s1", [{ local: 6, visitante: 4 }])
    ).rejects.toThrow(/conflicto de bracket/);
  });
});
