jest.mock("../supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
    },
    from: jest.fn(),
    rpc: jest.fn(),
  },
  supabasePublicRead: {
    from: jest.fn(),
  },
}));

import { supabase, supabasePublicRead } from "../supabaseClient";
import { resolvePlayerPublicProfiles } from "./publicPlayerAvatars";

describe("resolvePlayerPublicProfiles", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: null },
    });
  });

  it("en publicOnly usa rating canónico del RPC aunque el clon local tenga foto y 3.0", async () => {
    const legacyId = "4624bac2-2b9f-4a55-a032-146f482121b4";

    (supabasePublicRead.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [
              {
                id: "clone-local",
                legacy_player_id: legacyId,
                nombre: "Daniel N",
                foto_url: "https://example.com/daniel.jpg",
                rating: 3.0,
              },
            ],
            error: null,
          }),
        }),
      }),
    });

    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: [
        {
          legacy_player_id: legacyId,
          foto_url: "https://example.com/daniel.jpg",
          rating: 2.82,
        },
      ],
      error: null,
    });

    const profiles = await resolvePlayerPublicProfiles(
      "hack-org-id",
      [{ id: legacyId, name: "Daniel N" }],
      { publicOnly: true }
    );

    expect(profiles[legacyId].rating).toBe(2.82);
    expect(profiles[legacyId].fotoUrl).toBe("https://example.com/daniel.jpg");
    expect(supabase.rpc).toHaveBeenCalledWith(
      "riviera_event_legacy_player_avatars",
      expect.objectContaining({
        p_organizador_id: "hack-org-id",
        p_legacy_player_ids: [legacyId],
      })
    );
  });
});
