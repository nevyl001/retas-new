import {
  publicIdentityToResolvedRating,
  type PublicPlayerIdentity,
} from "./publicPlayersIdentity";

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
    lado: null,
    nacionalidad: "MX",
  };

  it("prefiere rating real de identidad sobre default de evento", () => {
    expect(publicIdentityToResolvedRating(identity, 3)).toBe(3.15);
  });

  it("usa rating de evento si es real", () => {
    expect(publicIdentityToResolvedRating(identity, 3.02)).toBe(3.02);
  });

  it("devuelve 3 solo si no hay rating real", () => {
    expect(
      publicIdentityToResolvedRating(
        { ...identity, rating: null },
        null
      )
    ).toBe(3);
  });
});
