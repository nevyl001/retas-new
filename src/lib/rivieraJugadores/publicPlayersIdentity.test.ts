import { supabasePublicRead } from "../supabaseClient";
import { resolvePlayerPublicProfiles } from "./publicPlayerAvatars";
import {
  getPublicPlayersIdentityMap,
  publicIdentityToResolvedRating,
  type PublicPlayerIdentity,
} from "./publicPlayersIdentity";

jest.mock("../supabaseClient", () => {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockResolvedValue({ data: [], error: null }),
  };
  return {
    supabase: { from: jest.fn(() => chain), rpc: jest.fn() },
    supabasePublicRead: {
      from: jest.fn(() => chain),
      rpc: jest.fn(),
    },
  };
});

jest.mock("./publicPlayerAvatars", () => ({
  resolvePlayerPublicProfiles: jest.fn(async () => ({})),
}));

describe("publicIdentityToResolvedRating", () => {
  const identity: PublicPlayerIdentity = {
    legacyPlayerId: "legacy-1",
    rivieraJugadorId: "rj-1",
    rivieraId: "RIV-00000067",
    nombre: "David Rus",
    slug: "david-rus",
    fotoUrl: "https://example.com/david.jpg",
    rating: 3.15,
    nivel: null,
    categoria: "4ta_fuerza",
    mano: null,
    lado: "drive",
    nacionalidad: "MX",
    edad: null,
  };

  it("prefiere rating real de identidad sobre default de evento", () => {
    expect(publicIdentityToResolvedRating(identity, 3)).toBe(3.15);
  });

  it("usa rating de evento si es real", () => {
    expect(publicIdentityToResolvedRating(identity, 3.02)).toBe(3.02);
  });

  it("devuelve 3 solo si no hay rating real", () => {
    expect(
      publicIdentityToResolvedRating({ ...identity, rating: null }, null)
    ).toBe(3);
  });
});

describe("getPublicPlayersIdentityMap public identity rpc", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (resolvePlayerPublicProfiles as jest.Mock).mockResolvedValue({});

    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({ data: [], error: null }),
    };
    (supabasePublicRead.from as jest.Mock).mockReturnValue(chain);
  });

  it("hidrata Drive/Revés y país vía RPC cuando RLS deja la tabla vacía", async () => {
    (supabasePublicRead.rpc as jest.Mock).mockImplementation(
      async (name: string) => {
        if (name === "riviera_public_event_legacy_player_identity") {
          return {
            data: [
              {
                legacy_player_id: "leg-chaparro",
                riviera_jugador_id: "rj-chaparro",
                nombre: "Chaparro",
                slug: "chaparro",
                foto_url: null,
                rating: 3.2,
                nivel: null,
                categoria: null,
                mano_dominante: "diestro",
                en_cancha: "drive",
                pais_codigo: "MX",
                edad: 28,
              },
            ],
            error: null,
          };
        }
        return { data: [], error: null };
      }
    );

    const map = await getPublicPlayersIdentityMap("org-1", [
      { legacyPlayerId: "leg-chaparro", displayName: "Chaparro" },
    ]);

    const identity = map.get("leg-chaparro");
    expect(identity?.lado).toBe("drive");
    expect(identity?.nacionalidad).toBe("MX");
    expect(identity?.mano).toBe("diestro");
    expect(identity?.edad).toBe(28);
    expect(supabasePublicRead.rpc).toHaveBeenCalledWith(
      "riviera_public_event_legacy_player_identity",
      {
        p_organizador_id: "org-1",
        p_legacy_player_ids: ["leg-chaparro"],
      }
    );
  });

  it("no rompe si el RPC de identidad aún no existe", async () => {
    (supabasePublicRead.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: {
        message:
          "Could not find the function riviera_public_event_legacy_player_identity",
      },
    });

    const map = await getPublicPlayersIdentityMap("org-1", [
      { legacyPlayerId: "leg-1", displayName: "Jugador" },
    ]);

    expect(map.get("leg-1")?.lado).toBeNull();
    expect(map.get("leg-1")?.nacionalidad).toBeNull();
  });
});
