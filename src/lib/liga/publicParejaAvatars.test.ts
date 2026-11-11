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
        data: [{ id: "rj-cesar", nombre: "César G", rating: 3.04 }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ jugador_id: "rj-cesar", rating: 3.31 }],
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

  it("resuelve el identificador oficial Riviera en lote sin exponer UUIDs", async () => {
    mockRpc.mockImplementation((fn: string) => {
      if (fn === "riviera_public_liga_jugador_profiles") {
        return Promise.resolve({
          data: [
            {
              liga_jugador_id: "liga-lalo",
              foto_url: "https://cdn.example/lalo.jpg",
              rating: 3.85,
            },
            {
              liga_jugador_id: "liga-josue",
              foto_url: "https://cdn.example/josue.jpg",
              rating: 3.4,
            },
            {
              liga_jugador_id: "liga-sin-id",
              foto_url: "https://cdn.example/otro.jpg",
              rating: 3.1,
            },
          ],
          error: null,
        });
      }
      if (fn === "riviera_ranking_interno_por_organizador") {
        return Promise.resolve({
          data: [
            { id: "rj-lalo", nombre: "Lalo E", rating: 3.85 },
            { id: "rj-josue", nombre: "Josue", rating: 3.4 },
            { id: "rj-otro", nombre: "Sin ID", rating: 3.1 },
          ],
          error: null,
        });
      }
      if (fn === "get_public_riviera_ids_for_jugadores") {
        return Promise.resolve({
          data: [
            { jugador_id: "rj-lalo", riviera_id: "RIV-00000284" },
            { jugador_id: "rj-josue", riviera_id: "RV-000192" },
            {
              jugador_id: "rj-otro",
              riviera_id: "550e8400-e29b-41d4-a716-446655440000",
            },
          ],
          error: null,
        });
      }
      return Promise.resolve({ data: [], error: null });
    });

    const { resolveLigaJugadorPublicProfiles } = await import(
      "./publicParejaAvatars"
    );
    const profiles = await resolveLigaJugadorPublicProfiles("org-1", [
      { id: "liga-lalo", name: "Lalo E" },
      { id: "liga-josue", name: "Josue" },
      { id: "liga-sin-id", name: "Sin ID" },
    ]);

    expect(profiles["liga-lalo"]?.rivieraId).toBe("RIV-00000284");
    expect(profiles["liga-josue"]?.rivieraId).toBe("RV-000192");
    expect(profiles["liga-sin-id"]?.rivieraId).toBeNull();
  });
});
