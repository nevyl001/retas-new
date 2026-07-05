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
    rpc: jest.fn(),
  },
}));

import { supabase, supabasePublicRead } from "../supabaseClient";
import {
  fetchRivieraJugadorProfilesByIds,
  resolvePlayerPublicProfiles,
} from "./publicPlayerAvatars";

function mockRivieraJugadoresQuery(
  client: jest.Mock,
  data: unknown,
  error: unknown = null
) {
  client.mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data, error }),
        in: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data, error }),
        }),
      }),
      in: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data, error }),
      }),
    }),
  });
}

describe("resolvePlayerPublicProfiles", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: null },
    });
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: [], error: null });
    (supabasePublicRead.rpc as jest.Mock).mockResolvedValue({
      data: [],
      error: null,
    });
  });

  it("en publicOnly usa rating del perfil origen por legacy_player_id sin depender del RPC", async () => {
    const legacyId = "4624bac2-2b9f-4a55-a032-146f482121b4";
    const hackOrg = "e724de97-3552-4a01-a269-f621e6f1ed26";
    const rivieraOrg = "2770b522-9064-4c7b-a729-4a0ea7e3f6e8";

    (supabasePublicRead.from as jest.Mock).mockImplementation(() => ({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockImplementation((col: string, val: unknown) => {
          if (col === "organizador_id") {
            return {
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
            };
          }
          if (col === "estado" && val === "activo") {
            return Promise.resolve({
              data: [
                {
                  legacy_player_id: legacyId,
                  organizador_id: hackOrg,
                  foto_url: "https://example.com/daniel.jpg",
                  rating: 3.0,
                  rating_partidos: 0,
                },
                {
                  legacy_player_id: legacyId,
                  organizador_id: rivieraOrg,
                  foto_url: "https://example.com/daniel-origen.jpg",
                  rating: 2.82,
                  rating_partidos: 5,
                },
              ],
              error: null,
            });
          }
          return {
            eq: jest.fn().mockResolvedValue({ data: [], error: null }),
          };
        }),
        in: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [
              {
                legacy_player_id: legacyId,
                organizador_id: hackOrg,
                foto_url: "https://example.com/daniel.jpg",
                rating: 3.0,
                rating_partidos: 0,
              },
              {
                legacy_player_id: legacyId,
                organizador_id: rivieraOrg,
                foto_url: "https://example.com/daniel-origen.jpg",
                rating: 2.82,
                rating_partidos: 5,
              },
            ],
            error: null,
          }),
        }),
      }),
    }));

    const profiles = await resolvePlayerPublicProfiles(
      hackOrg,
      [{ id: legacyId, name: "Daniel N" }],
      { publicOnly: true }
    );

    expect(profiles[legacyId].rating).toBe(2.82);
    expect(profiles[legacyId].fotoUrl).toBe("https://example.com/daniel.jpg");
  });

  it("en publicOnly resuelve cedido con rating origen vía RPC público (anon móvil)", async () => {
    const legacyId = "said-legacy-player-id";
    const hackOrg = "e724de97-3552-4a01-a269-f621e6f1ed26";

    mockRivieraJugadoresQuery(supabasePublicRead.from as jest.Mock, [
      {
        id: "said-local-clone",
        legacy_player_id: legacyId,
        nombre: "Said C",
        foto_url: null,
        rating: 3.0,
      },
    ]);

    (supabasePublicRead.from as jest.Mock).mockImplementation(() => ({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [
              {
                id: "said-local-clone",
                legacy_player_id: legacyId,
                nombre: "Said C",
                foto_url: null,
                rating: 3.0,
              },
            ],
            error: null,
          }),
        }),
        in: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    }));

    (supabasePublicRead.rpc as jest.Mock).mockResolvedValue({
      data: [
        {
          legacy_player_id: legacyId,
          foto_url: null,
          rating: 2.87,
        },
      ],
      error: null,
    });

    const profiles = await resolvePlayerPublicProfiles(
      hackOrg,
      [{ id: legacyId, name: "Said C" }],
      { publicOnly: true }
    );

    expect(profiles[legacyId].rating).toBe(2.87);
    expect(supabasePublicRead.rpc).toHaveBeenCalled();
  });

  it("cuando el RPC no existe, el fallback legacy sigue resolviendo el rating", async () => {
    const legacyId = "c7440f26-3b4c-4c94-be55-3baef8e98820";
    const hackOrg = "e724de97-3552-4a01-a269-f621e6f1ed26";

    mockRivieraJugadoresQuery(supabasePublicRead.from as jest.Mock, [
      {
        id: "clone-seb",
        legacy_player_id: legacyId,
        nombre: "Sebastian",
        foto_url: "https://example.com/seb.jpg",
        rating: 3.0,
      },
    ]);

    (supabasePublicRead.from as jest.Mock).mockImplementation(() => ({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [
              {
                id: "clone-seb",
                legacy_player_id: legacyId,
                nombre: "Sebastian",
                foto_url: "https://example.com/seb.jpg",
                rating: 3.0,
              },
            ],
            error: null,
          }),
        }),
        in: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [
              {
                legacy_player_id: legacyId,
                organizador_id: hackOrg,
                foto_url: "https://example.com/seb.jpg",
                rating: 3.0,
                rating_partidos: 0,
              },
              {
                legacy_player_id: legacyId,
                organizador_id: "2770b522-9064-4c7b-a729-4a0ea7e3f6e8",
                foto_url: "https://example.com/seb-origen.jpg",
                rating: 2.93,
                rating_partidos: 4,
              },
            ],
            error: null,
          }),
        }),
      }),
    }));

    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: "Could not find the function riviera_event_legacy_player_avatars" },
    });

    const profiles = await resolvePlayerPublicProfiles(
      hackOrg,
      [{ id: legacyId, name: "Sebastian" }],
      { publicOnly: true }
    );

    expect(profiles[legacyId].rating).toBe(2.93);
  });

  it("con legacy id de David Rus no sustituye por David R aunque el nombre venga abreviado", async () => {
    const davidRLegacyId = "aaaa1111-1111-1111-1111-111111111111";
    const davidRusLegacyId = "bbbb2222-2222-2222-2222-222222222222";
    const hackOrg = "e724de97-3552-4a01-a269-f621e6f1ed26";

    (supabasePublicRead.from as jest.Mock).mockImplementation(() => ({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [
              {
                id: "rj-david-r",
                legacy_player_id: davidRLegacyId,
                nombre: "David R",
                foto_url: "https://example.com/david-r.jpg",
                rating: 3.05,
              },
              {
                id: "rj-david-rus",
                legacy_player_id: davidRusLegacyId,
                nombre: "David Rus",
                foto_url: null,
                rating: 3.15,
              },
            ],
            error: null,
          }),
        }),
        in: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    }));

    const profiles = await resolvePlayerPublicProfiles(
      hackOrg,
      [{ id: davidRusLegacyId, name: "David R" }],
      { publicOnly: true }
    );

    expect(profiles[davidRusLegacyId].rating).toBe(3.15);
    expect(profiles[davidRusLegacyId].fotoUrl).toBeNull();
    expect(supabasePublicRead.rpc).not.toHaveBeenCalled();
  });

  it("si el legacy id no enlaza, resuelve por nombre único del evento", async () => {
    const davidRLegacyId = "aaaa1111-1111-1111-1111-111111111111";
    const davidRusLegacyId = "bbbb2222-2222-2222-2222-222222222222";
    const hackOrg = "e724de97-3552-4a01-a269-f621e6f1ed26";

    (supabasePublicRead.from as jest.Mock).mockImplementation(() => ({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [
              {
                id: "rj-david-r",
                legacy_player_id: davidRLegacyId,
                nombre: "David R",
                foto_url: "https://example.com/david-r.jpg",
                rating: 3.05,
              },
              {
                id: "rj-david-rus",
                legacy_player_id: davidRusLegacyId,
                nombre: "David Rus",
                foto_url: null,
                rating: 3.15,
              },
            ],
            error: null,
          }),
        }),
        in: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    }));

    const profiles = await resolvePlayerPublicProfiles(
      hackOrg,
      [{ id: davidRLegacyId, name: "David Rus" }],
      { publicOnly: true }
    );

    expect(profiles[davidRLegacyId].rating).toBe(3.05);
    expect(profiles[davidRLegacyId].fotoUrl).toBe(
      "https://example.com/david-r.jpg"
    );
    expect(supabasePublicRead.rpc).not.toHaveBeenCalled();
  });

  it("no mezcla dos David R distintos: solo resuelve por legacy_player_id, no por nombre", async () => {
    const hackDavidId = "aaaa1111-1111-1111-1111-111111111111";
    const rivieraDavidId = "bbbb2222-2222-2222-2222-222222222222";
    const hackOrg = "e724de97-3552-4a01-a269-f621e6f1ed26";

    (supabasePublicRead.from as jest.Mock).mockImplementation(() => ({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [
              {
                id: "hack-david-riviera",
                legacy_player_id: hackDavidId,
                nombre: "David R",
                foto_url: "https://example.com/hack-david.jpg",
                rating: 3.15,
              },
              {
                id: "riviera-david-clone",
                legacy_player_id: rivieraDavidId,
                nombre: "David R",
                foto_url: "https://example.com/riviera-david.jpg",
                rating: 3.0,
              },
            ],
            error: null,
          }),
        }),
        in: jest.fn().mockImplementation((_col: string, ids: string[]) => ({
          eq: jest.fn().mockResolvedValue({
            data: (ids as string[]).flatMap((legacyId) => {
              if (legacyId === hackDavidId) {
                return [
                  {
                    legacy_player_id: hackDavidId,
                    organizador_id: hackOrg,
                    foto_url: "https://example.com/hack-david.jpg",
                    rating: 3.15,
                    rating_partidos: 4,
                  },
                ];
              }
              if (legacyId === rivieraDavidId) {
                return [
                  {
                    legacy_player_id: rivieraDavidId,
                    organizador_id: hackOrg,
                    foto_url: "https://example.com/riviera-david.jpg",
                    rating: 3.0,
                    rating_partidos: 0,
                  },
                  {
                    legacy_player_id: rivieraDavidId,
                    organizador_id: "2770b522-9064-4c7b-a729-4a0ea7e3f6e8",
                    foto_url: "https://example.com/riviera-david-origen.jpg",
                    rating: 3.05,
                    rating_partidos: 3,
                  },
                ];
              }
              return [];
            }),
            error: null,
          }),
        })),
      }),
    }));

    const profiles = await resolvePlayerPublicProfiles(
      hackOrg,
      [
        { id: hackDavidId, name: "David R" },
        { id: rivieraDavidId, name: "David R" },
      ],
      { publicOnly: true }
    );

    expect(profiles[hackDavidId].rating).toBe(3.15);
    expect(profiles[hackDavidId].fotoUrl).toBe(
      "https://example.com/hack-david.jpg"
    );
    expect(profiles[rivieraDavidId].rating).toBe(3.05);
    expect(profiles[rivieraDavidId].fotoUrl).toBe(
      "https://example.com/riviera-david.jpg"
    );
  });

  it("jugador propio del club con rating real no busca perfil en otros clubes", async () => {
    const hackDavidId = "aaaa1111-1111-1111-1111-111111111111";
    const hackOrg = "e724de97-3552-4a01-a269-f621e6f1ed26";
    let canonicalQueryCount = 0;

    (supabasePublicRead.from as jest.Mock).mockImplementation(() => ({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [
              {
                id: "hack-david-riviera",
                legacy_player_id: hackDavidId,
                nombre: "David R",
                foto_url: "https://example.com/hack-david.jpg",
                rating: 3.15,
              },
            ],
            error: null,
          }),
        }),
        in: jest.fn().mockImplementation(() => {
          canonicalQueryCount += 1;
          return {
            eq: jest.fn().mockResolvedValue({
              data: [
                {
                  legacy_player_id: hackDavidId,
                  organizador_id: "2770b522-9064-4c7b-a729-4a0ea7e3f6e8",
                  foto_url: "https://example.com/riviera-david-origen.jpg",
                  rating: 3.05,
                  rating_partidos: 3,
                },
              ],
              error: null,
            }),
          };
        }),
      }),
    }));

    const profiles = await resolvePlayerPublicProfiles(
      hackOrg,
      [{ id: hackDavidId, name: "David R" }],
      { publicOnly: true }
    );

    expect(profiles[hackDavidId].rating).toBe(3.15);
    expect(canonicalQueryCount).toBe(0);
  });

  it("cedido sin clon local enlazado por legacy id resuelve rating origen vía RPC", async () => {
    const originLegacyId = "origin-daniel-legacy";
    const hackOrg = "e724de97-3552-4a01-a269-f621e6f1ed26";

    mockRivieraJugadoresQuery(supabasePublicRead.from as jest.Mock, []);

    (supabasePublicRead.rpc as jest.Mock).mockResolvedValue({
      data: [
        {
          legacy_player_id: originLegacyId,
          foto_url: "https://example.com/daniel.jpg",
          rating: 2.82,
        },
      ],
      error: null,
    });

    const profiles = await resolvePlayerPublicProfiles(
      hackOrg,
      [{ id: originLegacyId, name: "Daniel N" }],
      { publicOnly: true }
    );

    expect(profiles[originLegacyId].rating).toBe(2.82);
    expect(profiles[originLegacyId].fotoUrl).toBe("https://example.com/daniel.jpg");
    expect(supabasePublicRead.rpc).toHaveBeenCalled();
  });
});

describe("fetchRivieraJugadorProfilesByIds", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: null },
    });
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: [], error: null });
    (supabasePublicRead.rpc as jest.Mock).mockResolvedValue({
      data: [],
      error: null,
    });
  });

  it("en publicOnly resuelve rating canónico vía RPC público por riviera_jugador id", async () => {
    const rivieraCloneId = "devyl-riviera-clone-id";
    const legacyId = "devyl-legacy-player-id";
    const rivieraOrg = "2770b522-9064-4c7b-a729-4a0ea7e3f6e8";

    (supabasePublicRead.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        in: jest.fn().mockResolvedValue({
          data: [
            {
              id: rivieraCloneId,
              legacy_player_id: legacyId,
              foto_url: "https://example.com/devyl.jpg",
              rating: 3.0,
              rating_partidos: 0,
            },
          ],
          error: null,
        }),
      }),
    });

    (supabasePublicRead.rpc as jest.Mock).mockResolvedValue({
      data: [
        {
          jugador_id: rivieraCloneId,
          foto_url: "https://example.com/devyl.jpg",
          rating: 3.14,
        },
      ],
      error: null,
    });

    const map = await fetchRivieraJugadorProfilesByIds([rivieraCloneId], {
      publicOnly: true,
      organizadorId: rivieraOrg,
    });

    expect(map.get(rivieraCloneId)?.rating).toBe(3.14);
    expect(supabasePublicRead.rpc).toHaveBeenCalledWith(
      "riviera_public_riviera_jugador_profiles",
      expect.objectContaining({
        p_organizador_id: rivieraOrg,
        p_jugador_ids: [rivieraCloneId],
      })
    );
  });

  it("en publicOnly con riviera id sin legacy resuelve vía RPC cuando el id coincide", async () => {
    const rivieraId = "terry-riviera-id";
    const rivieraOrg = "2770b522-9064-4c7b-a729-4a0ea7e3f6e8";

    (supabasePublicRead.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        in: jest.fn().mockResolvedValue({
          data: [
            {
              id: rivieraId,
              legacy_player_id: null,
              foto_url: null,
              rating: 3.0,
              rating_partidos: 0,
            },
          ],
          error: null,
        }),
      }),
    });

    (supabasePublicRead.rpc as jest.Mock).mockResolvedValue({
      data: [
        {
          jugador_id: rivieraId,
          foto_url: null,
          rating: 2.97,
        },
      ],
      error: null,
    });

    const map = await fetchRivieraJugadorProfilesByIds([rivieraId], {
      publicOnly: true,
      organizadorId: rivieraOrg,
    });

    expect(map.get(rivieraId)?.rating).toBe(2.97);
  });
});
