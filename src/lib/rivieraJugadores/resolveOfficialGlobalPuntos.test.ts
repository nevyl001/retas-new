const mockRpc = jest.fn();

jest.mock("../supabaseClient", () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

import {
  resolveOfficialGlobalPuntos,
  resetRomcSuiteStateForTests,
  romcRpcSuiteUnavailable,
} from "./rivieraOfficialActivity";

const JUGADOR_ID = "c7440f26-3b4c-4c94-be55-3baef8e98820";

describe("resolveOfficialGlobalPuntos", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRomcSuiteStateForTests();
  });

  it("devuelve puntos del ledger cuando el RPC responde", async () => {
    mockRpc.mockResolvedValue({ data: 120, error: null });

    await expect(resolveOfficialGlobalPuntos(JUGADOR_ID)).resolves.toBe(120);
    expect(mockRpc).toHaveBeenCalledWith(
      "riviera_official_display_puntos_for_jugador",
      { p_riviera_jugador_id: JUGADOR_ID }
    );
  });

  it("devuelve 0 cuando el jugador tiene identidad pero sin puntos", async () => {
    mockRpc.mockResolvedValue({ data: 0, error: null });
    await expect(resolveOfficialGlobalPuntos(JUGADOR_ID)).resolves.toBe(0);
  });

  it("devuelve null cuando el RPC indica sin official_player_key", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await expect(resolveOfficialGlobalPuntos(JUGADOR_ID)).resolves.toBeNull();
  });

  it("devuelve null y marca suite rota ante error de función inexistente", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: "PGRST202",
        message: "Could not find the function riviera_official_display_puntos_for_jugador",
      },
    });

    await expect(resolveOfficialGlobalPuntos(JUGADOR_ID)).resolves.toBeNull();
    expect(romcRpcSuiteUnavailable()).toBe(true);
  });

  it("no llama al RPC si la suite ROMC ya está marcada como rota", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "riviera_official_display_puntos_for_jugador" },
    });
    await resolveOfficialGlobalPuntos(JUGADOR_ID);
    mockRpc.mockClear();

    await expect(resolveOfficialGlobalPuntos(JUGADOR_ID)).resolves.toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
