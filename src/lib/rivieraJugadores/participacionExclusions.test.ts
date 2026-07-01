jest.mock("../supabaseClient", () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(),
  },
}));

import { supabase } from "../supabaseClient";
import { isParticipacionExcluded } from "./participacionExclusions";

describe("isParticipacionExcluded", () => {
  beforeEach(() => {
    (supabase.rpc as jest.Mock).mockReset();
    (supabase.from as jest.Mock).mockReset();
  });

  it("usa fallback local si el RPC falla en transacción read-only", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: {
        code: "25006",
        message: "cannot execute INSERT in a read-only transaction",
      },
    });

    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ count: 0, error: null }),
          }),
        }),
      }),
    });

    await expect(
      isParticipacionExcluded("jugador-1", "reta", "evento-1")
    ).resolves.toBe(false);
    expect(supabase.from).toHaveBeenCalledWith("jugador_participacion_exclusiones");
  });

  it("devuelve true cuando el RPC responde true", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: true, error: null });

    await expect(
      isParticipacionExcluded("jugador-1", "duelo_2v2", "evento-2")
    ).resolves.toBe(true);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
