import { resolveLigaJugadorPublicFotos } from "./publicParejaAvatars";

const mockRpc = jest.fn();
const mockFrom = jest.fn();

jest.mock("../supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
    },
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
  supabasePublicRead: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

function mockFromChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
  };
  chain.neq.mockResolvedValue(result);
  mockFrom.mockReturnValue(chain);
  return chain;
}

describe("resolveLigaJugadorPublicFotos", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRpc.mockResolvedValue({ data: [], error: null });
    mockFromChain({ data: [], error: null });
  });

  it("usa RPC público por legacy_liga_jugador_id", async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          liga_jugador_id: "liga-1",
          foto_url: "https://cdn.example/a.jpg",
        },
      ],
      error: null,
    });

    const fotos = await resolveLigaJugadorPublicFotos("org-1", [
      { id: "liga-1", name: "Aaron Duran" },
    ]);

    expect(mockRpc).toHaveBeenCalledWith("riviera_public_liga_jugador_profiles", {
      p_organizador_id: "org-1",
      p_liga_jugador_ids: ["liga-1"],
    });
    expect(fotos["liga-1"]).toBe("https://cdn.example/a.jpg");
  });

  it("toma el rating del RPC, no el valor inicial del chip", async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          liga_jugador_id: "liga-cesar",
          foto_url: "https://cdn.example/cesar.jpg",
          rating: 3.31,
        },
      ],
      error: null,
    });

    const { resolveLigaJugadorPublicProfiles } = await import(
      "./publicParejaAvatars"
    );
    const profiles = await resolveLigaJugadorPublicProfiles("org-1", [
      { id: "liga-cesar", name: "César G" },
    ]);

    expect(profiles["liga-cesar"]?.rating).toBe(3.31);
    expect(profiles["liga-cesar"]?.fotoUrl).toBe(
      "https://cdn.example/cesar.jpg"
    );
  });

  it("si el RPC de liga no trae rating, usa el del roster del club", async () => {
    mockRpc
      .mockResolvedValueOnce({
        data: [
          {
            liga_jugador_id: "liga-cesar",
            foto_url: "https://cdn.example/cesar.jpg",
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ nombre: "César G", rating: 3.31 }],
        error: null,
      });

    const { resolveLigaJugadorPublicProfiles } = await import(
      "./publicParejaAvatars"
    );
    const profiles = await resolveLigaJugadorPublicProfiles("org-1", [
      { id: "liga-cesar", name: "César G" },
    ]);

    expect(profiles["liga-cesar"]?.rating).toBe(3.31);
  });

  it("hace fallback directo por legacy_liga cuando el RPC no devuelve nada", async () => {
    mockFromChain({
      data: [
        {
          id: "rj-1",
          legacy_liga_jugador_id: "liga-2",
          nombre: "Devyl",
          foto_url: "https://cdn.example/b.jpg",
        },
      ],
      error: null,
    });

    const fotos = await resolveLigaJugadorPublicFotos(
      "org-1",
      [{ id: "liga-2", name: "Devyl" }],
      { publicOnly: false }
    );

    expect(fotos["liga-2"]).toBe("https://cdn.example/b.jpg");
  });
});
