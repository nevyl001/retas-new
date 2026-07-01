jest.mock("../supabaseClient", () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

import { supabase } from "../supabaseClient";
import { isOrganizadorRankingPublico } from "./accountControls";

describe("isOrganizadorRankingPublico", () => {
  beforeEach(() => {
    (supabase.from as jest.Mock).mockReset();
  });

  it("devuelve true si el club tiene jugadores con visible_publico", async () => {
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ count: 2, error: null }),
          }),
        }),
      }),
    });

    await expect(isOrganizadorRankingPublico("club-hack")).resolves.toBe(true);
  });

  it("devuelve false si ningún jugador está publicado", async () => {
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ count: 0, error: null }),
          }),
        }),
      }),
    });

    await expect(isOrganizadorRankingPublico("club-hack")).resolves.toBe(false);
  });
});
