jest.mock("../supabaseClient", () => ({
  supabase: {
    rpc: jest.fn(),
  },
}));

import { supabase } from "../supabaseClient";
import {
  isJugadorImportBlocked,
  isNombreBlockedLocally,
  registerJugadorImportBlocklist,
} from "./jugadorImportBlocklist";

describe("jugadorImportBlocklist", () => {
  beforeEach(() => {
    (supabase.rpc as jest.Mock).mockReset();
  });

  it("registerJugadorImportBlocklist llama al RPC con ids legacy", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ error: null });

    await registerJugadorImportBlocklist("org-hack", {
      nombre: "Daniel N",
      legacyPlayerId: "player-1",
      legacyLigaJugadorId: "liga-1",
    });

    expect(supabase.rpc).toHaveBeenCalledWith(
      "register_riviera_jugador_import_blocklist",
      {
        p_organizador_id: "org-hack",
        p_nombre: "Daniel N",
        p_legacy_player_id: "player-1",
        p_legacy_liga_jugador_id: "liga-1",
      }
    );
  });

  it("isJugadorImportBlocked devuelve true cuando el RPC responde true", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: true, error: null });

    await expect(
      isJugadorImportBlocked("org-hack", { nombre: "Sebastian" })
    ).resolves.toBe(true);
  });

  it("isNombreBlockedLocally compara por clave normalizada", () => {
    const blocked = new Set(["daniel n", "sebastian"]);
    expect(isNombreBlockedLocally("  Daniel   N ", blocked)).toBe(true);
    expect(isNombreBlockedLocally("Joel Hener", blocked)).toBe(false);
  });
});
