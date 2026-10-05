import { supabase } from "../lib/supabaseClient";
import { applyGroupSchedule, changePairPlayer, resetGroup, TorneoExpressGrupoOpError } from "./torneoExpressGrupoOps";

jest.mock("../lib/supabaseClient", () => ({
  supabase: {
    auth: { getSession: jest.fn(), getUser: jest.fn() },
    rpc: jest.fn(),
  },
}));

const auth = supabase.auth as unknown as {
  getSession: jest.Mock;
  getUser: jest.Mock;
};
const rpc = supabase.rpc as unknown as jest.Mock;

describe("torneoExpressGrupoOps", () => {
  beforeEach(() => {
    auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "org" } } },
      error: null,
    });
    rpc.mockReset();
  });

  it("envía la versión esperada y traduce STALE_GROUP_VERSION", async () => {
    rpc.mockResolvedValue({
      data: { ok: false, error: "STALE_GROUP_VERSION", version: 4 },
      error: null,
    });
    await expect(
      changePairPlayer({
        grupoId: "g",
        parejaId: "p",
        outgoingPlayerId: "a",
        incomingPlayerId: "b",
        expectedVersion: 3,
      })
    ).rejects.toMatchObject({ code: "STALE_GROUP_VERSION", version: 4 });
    expect(rpc).toHaveBeenCalledWith("cambiar_torneo_express_jugador_grupo", {
      p_grupo_id: "g",
      p_pareja_id: "p",
      p_jugador_saliente_id: "a",
      p_jugador_nuevo_id: "b",
      p_expected_version: 3,
    });
    await expect(
      changePairPlayer({
        grupoId: "g",
        parejaId: "p",
        outgoingPlayerId: "a",
        incomingPlayerId: "b",
        expectedVersion: 3,
      })
    ).rejects.toBeInstanceOf(TorneoExpressGrupoOpError);
  });

  it("manda la propuesta completa y no programa partido por partido", async () => {
    rpc.mockResolvedValue({ data: { ok: true, version: 3, changed: 1 }, error: null });
    await expect(applyGroupSchedule({
      grupoId: "g",
      expectedVersion: 2,
      mode: "faltantes",
      nowIso: "2026-08-01T15:00:00Z",
      courts: ["1"],
      slots: [{ cancha: "1", programadoEn: "2026-08-01T16:00:00Z" }],
      assignments: [{ matchId: "m", cancha: "1", programadoEn: "2026-08-01T16:00:00Z", orden: 2 }],
    })).resolves.toEqual({ version: 3, changed: 1 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("aplicar_programacion_torneo_express_grupo", expect.objectContaining({
      p_grupo_id: "g",
      p_expected_version: 2,
      p_mode: "faltantes",
    }));
  });

  it("reinicia un grupo con la versión esperada", async () => {
    rpc.mockResolvedValue({
      data: { ok: true, group_id: "g", matches_reset: 2, ratings_reverted: 1, version: 5 },
      error: null,
    });
    await expect(resetGroup({ grupoId: "g", expectedVersion: 4 })).resolves.toEqual({
      matchesReset: 2,
      ratingsReverted: 1,
      version: 5,
    });
    expect(rpc).toHaveBeenCalledWith("reset_torneo_express_grupo", {
      p_grupo_id: "g",
      p_expected_version: 4,
    });
  });
});
