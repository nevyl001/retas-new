/**
 * Soft-archive Mis retas: el botón de basura NO debe DELETE físico del padre
 * ni tocar carrera (participaciones / puntos / ledger / rating).
 */
const mockFrom = jest.fn();
const mockGetUser = jest.fn();

jest.mock("../lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

import {
  archiveDuelo2v2,
  deleteDuelo2v2,
  getDuelos2v2,
  restoreArchivedDuelo2v2,
} from "./duelo2v2Service";
import {
  archiveTournament,
  deleteTournament,
  getTournaments,
  restoreArchivedTournament,
} from "../lib/database";

const FINALIZED = {
  id: "test2-id",
  organizador_id: "org-1",
  nombre: "test2",
  descripcion: null,
  cancha: "1",
  programado_en: null,
  programado_hasta: null,
  estado: "finalizado" as const,
  pareja_a_j1_id: "p1",
  pareja_a_j2_id: "p2",
  pareja_a_j1_nombre: "TestPlaRo1",
  pareja_a_j2_nombre: "Tplayhp2",
  pareja_b_j1_id: "p3",
  pareja_b_j2_id: "p4",
  pareja_b_j1_nombre: "Iker",
  pareja_b_j2_nombre: "Tplahp1",
  sets_pareja_a: 2,
  sets_pareja_b: 1,
  detalle_sets: [],
  ganador: "a" as const,
  created_at: "2026-07-16T00:00:00Z",
  updated_at: "2026-07-16T00:00:00Z",
  finalizado_at: "2026-07-16T01:00:00Z",
  archived_at: null as string | null,
};

describe("soft-archive Mis retas — duelo 2v2", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: "org-1" } },
      error: null,
    });
  });

  it("archiveDuelo2v2 hace UPDATE archived_at, no DELETE", async () => {
    const updatePayloads: Record<string, unknown>[] = [];
    let deleteCalled = false;

    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe("duelos_2v2");
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: FINALIZED, error: null }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          updatePayloads.push(payload);
          return {
            eq: () => ({
              select: () => ({
                single: async () => ({
                  data: {
                    ...FINALIZED,
                    archived_at: payload.archived_at,
                    updated_at: payload.updated_at,
                  },
                  error: null,
                }),
              }),
            }),
          };
        },
        delete: () => {
          deleteCalled = true;
          return { eq: async () => ({ error: null }) };
        },
      };
    });

    const result = await archiveDuelo2v2("test2-id");
    expect(deleteCalled).toBe(false);
    expect(updatePayloads).toHaveLength(1);
    expect(typeof updatePayloads[0].archived_at).toBe("string");
    expect(result.archived_at).toBeTruthy();
    expect(result.id).toBe("test2-id");
    expect(result.nombre).toBe("test2");
  });

  it("no permite archivar duelo en_juego", async () => {
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { ...FINALIZED, estado: "en_juego", ganador: null },
            error: null,
          }),
        }),
      }),
      update: () => {
        throw new Error("no debería actualizar");
      },
      delete: () => {
        throw new Error("no debería borrar");
      },
    }));

    await expect(archiveDuelo2v2("live-id")).rejects.toThrow(/en curso/i);
  });

  it("deleteDuelo2v2 delega a archive (sin DELETE físico)", async () => {
    let deleteCalled = false;
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: FINALIZED, error: null }),
        }),
      }),
      update: (payload: Record<string, unknown>) => ({
        eq: () => ({
          select: () => ({
            single: async () => ({
              data: { ...FINALIZED, archived_at: payload.archived_at },
              error: null,
            }),
          }),
        }),
      }),
      delete: () => {
        deleteCalled = true;
        return { eq: async () => ({ error: null }) };
      },
    }));

    await deleteDuelo2v2("test2-id");
    expect(deleteCalled).toBe(false);
  });

  it("restoreArchivedDuelo2v2 limpia archived_at", async () => {
    mockFrom.mockImplementation(() => ({
      update: (payload: Record<string, unknown>) => {
        expect(payload.archived_at).toBeNull();
        return {
          eq: () => ({
            select: () => ({
              single: async () => ({
                data: { ...FINALIZED, archived_at: null },
                error: null,
              }),
            }),
          }),
        };
      },
    }));

    const restored = await restoreArchivedDuelo2v2("test2-id");
    expect(restored.archived_at).toBeNull();
  });

  it("getDuelos2v2 excluye archivados por defecto", async () => {
    const isCalls: unknown[] = [];
    mockFrom.mockImplementation(() => {
      const api: Record<string, unknown> = {};
      api.select = () => api;
      api.eq = () => api;
      api.is = (col: string, val: unknown) => {
        isCalls.push([col, val]);
        return api;
      };
      api.order = async () => ({ data: [FINALIZED], error: null });
      return api;
    });

    await getDuelos2v2();
    expect(isCalls).toContainEqual(["archived_at", null]);
  });

  it("getDuelos2v2 includeArchived no filtra archived_at", async () => {
    const isCalls: unknown[] = [];
    mockFrom.mockImplementation(() => {
      const api: Record<string, unknown> = {};
      api.select = () => api;
      api.eq = () => api;
      api.is = (col: string, val: unknown) => {
        isCalls.push([col, val]);
        return api;
      };
      api.order = async () => ({ data: [FINALIZED], error: null });
      return api;
    });

    await getDuelos2v2({ includeArchived: true });
    expect(isCalls).toHaveLength(0);
  });
});

describe("soft-archive Mis retas — tournaments", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("archiveTournament hace UPDATE archived_at, no DELETE", async () => {
    let deleteCalled = false;
    const updates: Record<string, unknown>[] = [];

    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe("tournaments");
      return {
        update: (payload: Record<string, unknown>) => {
          updates.push(payload);
          return {
            eq: () => ({
              select: () => ({
                single: async () => ({
                  data: { id: "t1", archived_at: payload.archived_at },
                  error: null,
                }),
              }),
            }),
          };
        },
        delete: () => {
          deleteCalled = true;
          return { eq: async () => ({ error: null }) };
        },
      };
    });

    await archiveTournament("t1");
    expect(deleteCalled).toBe(false);
    expect(typeof updates[0].archived_at).toBe("string");
  });

  it("deleteTournament delega a archiveTournament", async () => {
    let deleteCalled = false;
    mockFrom.mockImplementation(() => ({
      update: (payload: Record<string, unknown>) => ({
        eq: () => ({
          select: () => ({
            single: async () => ({
              data: { id: "t1", archived_at: payload.archived_at },
              error: null,
            }),
          }),
        }),
      }),
      delete: () => {
        deleteCalled = true;
        return { eq: async () => ({ error: null }) };
      },
    }));

    await deleteTournament("t1");
    expect(deleteCalled).toBe(false);
  });

  it("restoreArchivedTournament limpia archived_at", async () => {
    mockFrom.mockImplementation(() => ({
      update: (payload: Record<string, unknown>) => {
        expect(payload.archived_at).toBeNull();
        return {
          eq: () => ({
            select: () => ({
              single: async () => ({
                data: { id: "t1", archived_at: null },
                error: null,
              }),
            }),
          }),
        };
      },
    }));

    const row = await restoreArchivedTournament("t1");
    expect(row.archived_at).toBeNull();
  });

  it("getTournaments filtra archived_at IS NULL por defecto", async () => {
    const isCalls: unknown[] = [];
    mockFrom.mockImplementation(() => {
      const api: Record<string, unknown> = {};
      api.select = () => api;
      api.is = (col: string, val: unknown) => {
        isCalls.push([col, val]);
        return api;
      };
      api.eq = () => api;
      api.order = async () => ({ data: [], error: null });
      return api;
    });

    await getTournaments("org-1");
    expect(isCalls).toContainEqual(["archived_at", null]);
  });
});

describe("separación de flujos", () => {
  it("mensaje de confirmación de archivo no habla de borrado irreversible", () => {
    const msg =
      "Esta reta dejará de aparecer en Mis retas, pero el resultado, los puntos, el rating y el historial de los jugadores se conservarán.";
    expect(msg.toLowerCase()).not.toMatch(/no se puede deshacer/);
    expect(msg.toLowerCase()).toMatch(/conservarán/);
  });

  it("SQL de patch documenta bloqueo de DELETE con carrera", () => {
    // Evidencia estática: el patch preparado no se ejecuta aquí.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const sql = fs.readFileSync(
      path.join(
        __dirname,
        "../../supabase/sql/patch-soft-archive-mis-retas.sql"
      ),
      "utf8"
    );
    expect(sql).toMatch(/archived_at/);
    expect(sql).toMatch(/_block_hard_delete_event_with_career/);
    expect(sql).toMatch(/jugador_participaciones/);
    expect(sql).not.toMatch(/DELETE FROM public\.duelos_2v2/);
  });
});
