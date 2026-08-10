/**
 * Regresión P0: finalizarDuelo2v2 no debe mentir careerSyncOk cuando el
 * duelo ya está finalizado pero la carrera no se sincronizó.
 */
import { finalizeCareerEvent } from "../lib/rivieraJugadores/careerEventPipeline";
import { finalizarDuelo2v2 } from "./duelo2v2Service";

jest.mock("../lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getUser: jest.fn(),
      getSession: jest.fn(),
    },
    from: jest.fn(),
    rpc: jest.fn(),
  },
  supabasePublicRead: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

jest.mock("../lib/rivieraJugadores/careerEventPipeline", () => ({
  finalizeCareerEvent: jest.fn(),
}));

const { supabase } = jest.requireMock("../lib/supabaseClient") as {
  supabase: {
    auth: { getUser: jest.Mock; getSession: jest.Mock };
    from: jest.Mock;
  };
};

const finalizeMock = finalizeCareerEvent as jest.Mock;

function mockDueloRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "duelo-1",
    organizador_id: "org-owner",
    nombre: "Duelo test",
    estado: "en_juego",
    ganador: "a",
    sets_pareja_a: 2,
    sets_pareja_b: 0,
    pareja_a_j1_id: "j1",
    pareja_a_j2_id: "j2",
    pareja_b_j1_id: "j3",
    pareja_b_j2_id: "j4",
    pareja_a_j1_nombre: "A1",
    pareja_a_j2_nombre: "A2",
    pareja_b_j1_nombre: "B1",
    pareja_b_j2_nombre: "B2",
    detalle_sets: [],
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    finalizado_at: null,
    ...overrides,
  };
}

function duelosFromMock(row: Record<string, unknown>, onUpdate?: (p: Record<string, unknown>) => void) {
  return {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({ data: row, error: null }),
        single: jest.fn().mockResolvedValue({ data: row, error: null }),
      }),
    }),
    update: jest.fn((payload: Record<string, unknown>) => {
      onUpdate?.(payload);
      const next = { ...row, ...payload };
      return {
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: next, error: null }),
          }),
        }),
      };
    }),
  };
}

describe("finalizarDuelo2v2 — career sync / retry", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "org-owner" } },
      error: null,
    });
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "org-owner" } } },
      error: null,
    });
  });

  it("si ya está finalizado NO inventa careerSyncOk:true — reintenta pipeline", async () => {
    const finalized = mockDueloRow({
      estado: "finalizado",
      finalizado_at: "2026-08-01T01:00:00.000Z",
    });
    supabase.from.mockImplementation((table: string) => {
      if (table === "duelos_2v2") return duelosFromMock(finalized);
      return { select: jest.fn(), update: jest.fn() };
    });

    finalizeMock.mockResolvedValue({
      ok: false,
      resultSaved: true,
      careerSynced: false,
      warnings: [],
      criticalFailures: [{ code: "missing_historial", message: "sin historial" }],
      failures: [{ code: "missing_historial", message: "sin historial" }],
    });

    const result = await finalizarDuelo2v2("duelo-1");

    expect(finalizeMock).toHaveBeenCalledTimes(1);
    expect(finalizeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "duelo_2v2",
        organizadorId: "org-owner",
      })
    );
    expect(result.careerSyncOk).toBe(false);
    expect(result.careerSynced).toBe(false);
  });

  it("retry idempotente: segundo finalize con pipeline ok → careerSyncOk true sin re-marcar estado", async () => {
    const finalized = mockDueloRow({
      estado: "finalizado",
      finalizado_at: "2026-08-01T01:00:00.000Z",
    });
    let updateCalls = 0;
    supabase.from.mockImplementation((table: string) => {
      if (table === "duelos_2v2") {
        return duelosFromMock(finalized, () => {
          updateCalls += 1;
        });
      }
      return { select: jest.fn(), update: jest.fn() };
    });

    finalizeMock.mockResolvedValue({
      ok: true,
      resultSaved: true,
      careerSynced: true,
      warnings: [],
      criticalFailures: [],
      failures: [],
    });

    const result = await finalizarDuelo2v2("duelo-1");
    expect(result.careerSyncOk).toBe(true);
    expect(updateCalls).toBe(0);
  });

  it("primer cierre: pipeline ANTES de marcar finalizado; si falla no deja finalizado", async () => {
    const enJuego = mockDueloRow({ estado: "en_juego" });
    let updatePayload: Record<string, unknown> | null = null;

    supabase.from.mockImplementation((table: string) => {
      if (table === "duelos_2v2") {
        return duelosFromMock(enJuego, (payload) => {
          updatePayload = payload;
        });
      }
      return { select: jest.fn(), update: jest.fn() };
    });

    finalizeMock.mockResolvedValue({
      ok: false,
      resultSaved: false,
      careerSynced: false,
      warnings: [],
      criticalFailures: [{ code: "sync_failed", message: "falló sync" }],
      failures: [{ code: "sync_failed", message: "falló sync" }],
    });

    const result = await finalizarDuelo2v2("duelo-1");

    expect(finalizeMock).toHaveBeenCalled();
    expect(updatePayload).toBeNull();
    expect(result.careerSyncOk).toBe(false);
    expect(result.duelo.estado).not.toBe("finalizado");
  });
});
