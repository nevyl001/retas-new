jest.mock("../supabaseClient", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { supabase } from "../supabaseClient";
import { repairRetaPairLegacyPlayerIds } from "./repairRetaPairLegacyIds";

describe("repairRetaPairLegacyPlayerIds", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("actualiza pairs cuando el legacy id del slot no coincide con el jugador resuelto", async () => {
    const updateP1 = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
    });
    const updateP2 = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
    });

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === "riviera_jugadores") {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  legacy_player_id: "legacy-david-rus",
                  nombre: "David Rus",
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "pairs") {
        return {
          update: jest.fn().mockImplementation((payload: Record<string, string>) => {
            if ("player1_id" in payload) return { eq: updateP1.mock.calls.length ? updateP1 : updateP1 };
            return { eq: updateP2 };
          }),
        };
      }
      return {};
    });

    let pairsUpdateCount = 0;
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === "riviera_jugadores") {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  legacy_player_id: "legacy-david-rus",
                  nombre: "David Rus",
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "pairs") {
        return {
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockImplementation(() => {
                pairsUpdateCount += 1;
                return Promise.resolve({ error: null });
              }),
            }),
          }),
        };
      }
      return {};
    });

    await repairRetaPairLegacyPlayerIds(
      "reta-1",
      "legacy-david-r",
      "rj-david-rus"
    );

    expect(pairsUpdateCount).toBe(2);
  });
});
