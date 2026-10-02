import { canOfferPwaInstall, isPublicWebPath } from "./publicWebPath";

describe("isPublicWebPath", () => {
  const publicPaths = [
    "/public/abc",
    "/public/liga/08d658c9-ebf5-411f-bfff-c764f3226858",
    "/public/liga/abc/jornada/1",
    "/public/americano/abc",
    "/public/vista-publica/americano/abc",
    "/public/duelo-2v2/abc",
    "/public/jugadores",
    "/public/jugadores/cuadra",
    "/public/ranking-puntos",
    "/ranking",
    "/ranking/femenil",
    "/ranking/o/org-1",
    "/ranking/o/org-1/varonil",
    "/ranking/o/org-1/femenil",
    "/players/11111111-1111-4111-8111-111111111111",
    "/eventos/pre-liga-40",
    "/torneo-express/te1/general",
    "/torneo-express/te1/grupos",
    "/torneo-express/te1/grupo/g1",
    "/torneo-express/te1/eliminatoria",
    "/jugar/ra-abc123",
    "/reta-abierta/ra-abc123",
    "/privacidad-terminos",
    "/auth/callback",
    "/auth/reset-password",
    "/admin-login",
  ];

  const privatePaths = [
    "/",
    "/liga",
    "/liga/abc/gestionar",
    "/liga/abc/jornada/1",
    "/torneo-express",
    "/torneo-express/te1/gestionar",
    "/duelo-2v2",
    "/duelo-2v2/abc/gestionar",
    "/jugadores",
    "/coaching",
    "/reta/abc",
    "/americano-dinamico",
    "/admin-dashboard",
    "/admin-dashboard/usuario/user-1",
  ];

  it.each(publicPaths)("trata %s como web pública", (path) => {
    expect(isPublicWebPath(path)).toBe(true);
  });

  it.each(privatePaths)("trata %s como sistema", (path) => {
    expect(isPublicWebPath(path)).toBe(false);
  });

  it("no ofrece instalar en una vista pública aunque haya sesión", () => {
    expect(
      canOfferPwaInstall({
        pathname: "/public/liga/abc",
        hasUserSession: true,
        isAdminLoggedIn: true,
      })
    ).toBe(false);
  });

  it("ofrece instalar en el sistema con sesión de club o de admin", () => {
    expect(
      canOfferPwaInstall({
        pathname: "/liga/abc/gestionar",
        hasUserSession: true,
        isAdminLoggedIn: false,
      })
    ).toBe(true);
    expect(
      canOfferPwaInstall({
        pathname: "/admin-dashboard",
        hasUserSession: false,
        isAdminLoggedIn: true,
      })
    ).toBe(true);
  });

  it("exige sesión válida y ruta no pública a la vez", () => {
    const publicoConSesion = [
      "/public/liga/abc",
      "/ranking",
      "/ranking/femenil",
      "/eventos/pre-liga",
      "/torneo-express/te1/general",
    ];
    for (const pathname of publicoConSesion) {
      expect(
        canOfferPwaInstall({
          pathname,
          hasUserSession: true,
          isAdminLoggedIn: false,
        })
      ).toBe(false);
    }
    expect(
      canOfferPwaInstall({
        pathname: "/liga/abc/gestionar",
        hasUserSession: false,
        isAdminLoggedIn: false,
      })
    ).toBe(false);
    expect(
      canOfferPwaInstall({
        pathname: "/",
        hasUserSession: true,
        isAdminLoggedIn: false,
      })
    ).toBe(true);
  });
});
