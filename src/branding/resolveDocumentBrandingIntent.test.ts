import { resolveDocumentBrandingIntent } from "./resolveDocumentBrandingIntent";

describe("resolveDocumentBrandingIntent", () => {
  const PCS = "35e31ab8-2a2f-4526-9e84-e130c85f8ca9";
  const OTHER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  it("Ranking del propio PCS: mantiene organizer-sync (no madre)", () => {
    expect(
      resolveDocumentBrandingIntent({
        pathname: `/ranking/o/${PCS}`,
        userId: PCS,
        isPublicSpectatorView: true,
        isJugadoresPublic: true,
        shouldKeepMotherPath: false,
        pathOrganizadorId: PCS,
      })
    ).toEqual({ action: "organizer-sync", organizadorId: PCS });
  });

  it("Home tras Ranking: organizer-sync inmediato", () => {
    expect(
      resolveDocumentBrandingIntent({
        pathname: "/",
        userId: PCS,
        isPublicSpectatorView: false,
        isJugadoresPublic: false,
        shouldKeepMotherPath: false,
        pathOrganizadorId: null,
      })
    ).toEqual({ action: "organizer-sync", organizadorId: PCS });
  });

  it("Ranking ajeno con sesión: madre preservando caché", () => {
    expect(
      resolveDocumentBrandingIntent({
        pathname: `/ranking/o/${OTHER}`,
        userId: PCS,
        isPublicSpectatorView: true,
        isJugadoresPublic: true,
        shouldKeepMotherPath: false,
        pathOrganizadorId: OTHER,
      })
    ).toEqual({ action: "mother-preserve-cache" });
  });

  it("Invitación pública: madre preservando caché", () => {
    expect(
      resolveDocumentBrandingIntent({
        pathname: "/jugar/abc",
        userId: PCS,
        isPublicSpectatorView: true,
        isJugadoresPublic: false,
        shouldKeepMotherPath: true,
        pathOrganizadorId: null,
      })
    ).toEqual({ action: "mother-preserve-cache" });
  });

  it("Anónimo en Home: noop", () => {
    expect(
      resolveDocumentBrandingIntent({
        pathname: "/",
        userId: null,
        isPublicSpectatorView: false,
        isJugadoresPublic: false,
        shouldKeepMotherPath: false,
        pathOrganizadorId: null,
      })
    ).toEqual({ action: "noop" });
  });
});
