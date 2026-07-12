import {
  buildMisEventosPath,
  isActiveEventManagementScreen,
  isMisEventosSearch,
  isOrganizerInternalRankingPath,
  navigateMobileNavTab,
  resolveMobileNavTab,
  shouldShowMobileAppNavigation,
} from "./mobileAppNavigation";
import { navigateAppTo } from "./appRouting";

jest.mock("./appRouting", () => {
  const actual = jest.requireActual("./appRouting");
  return {
    ...actual,
    navigateAppTo: jest.fn(),
    navigateToAppHome: jest.fn(),
  };
});

jest.mock("../components/jugadores/jugadoresNav", () => ({
  navigateJugadores: jest.fn(),
}));

const navigateAppToMock = navigateAppTo as jest.MockedFunction<typeof navigateAppTo>;

describe("mobileAppNavigation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("resolveMobileNavTab", () => {
    it("marca Inicio en / sin query de eventos", () => {
      expect(resolveMobileNavTab("/", "")).toBe("inicio");
    });

    it("marca Eventos con ?mis-eventos=1", () => {
      expect(resolveMobileNavTab("/", "?mis-eventos=1")).toBe("eventos");
    });

    it("marca Eventos en /reta/:id", () => {
      expect(resolveMobileNavTab("/reta/abc-123", "")).toBe("eventos");
    });

    it("marca Jugadores en /jugadores/M", () => {
      expect(resolveMobileNavTab("/jugadores/M", "")).toBe("jugadores");
    });

    it("marca Ranking en ranking interno del club", () => {
      expect(resolveMobileNavTab("/ranking/o/org-1/varonil", "")).toBe("ranking");
    });

    it("marca Eventos en torneo express privado", () => {
      expect(resolveMobileNavTab("/torneo-express", "")).toBe("eventos");
    });

    it("no marca Inicio por defecto en rutas no mapeadas", () => {
      expect(resolveMobileNavTab("/privacidad-terminos", "")).toBeNull();
    });
  });

  describe("shouldShowMobileAppNavigation", () => {
    it("no aparece sin usuario", () => {
      expect(
        shouldShowMobileAppNavigation({
          pathname: "/",
          currentView: "main",
          hasUser: false,
          isPublicSpectatorView: false,
        })
      ).toBe(false);
    });

    it("no aparece en rutas públicas espectador", () => {
      expect(
        shouldShowMobileAppNavigation({
          pathname: "/public/abc",
          currentView: "public",
          hasUser: true,
          isPublicSpectatorView: true,
        })
      ).toBe(false);
    });

    it("aparece en home privado autenticado", () => {
      expect(
        shouldShowMobileAppNavigation({
          pathname: "/",
          currentView: "main",
          hasUser: true,
          isPublicSpectatorView: false,
        })
      ).toBe(true);
    });

    it("aparece en ranking interno del organizador aunque sea vista pública", () => {
      expect(
        shouldShowMobileAppNavigation({
          pathname: "/ranking/o/org-1/varonil",
          currentView: "jugadores",
          hasUser: true,
          isPublicSpectatorView: true,
          userOrganizadorId: "org-1",
        })
      ).toBe(true);
    });

    it("no aparece en auth callback", () => {
      expect(
        shouldShowMobileAppNavigation({
          pathname: "/auth/callback",
          currentView: "auth-callback",
          hasUser: true,
          isPublicSpectatorView: false,
        })
      ).toBe(false);
    });

    it("no aparece en gestión activa de un evento", () => {
      expect(
        shouldShowMobileAppNavigation({
          pathname: "/reta/abc-123",
          currentView: "main",
          hasUser: true,
          isPublicSpectatorView: false,
        })
      ).toBe(false);
    });
  });

  describe("navigateMobileNavTab", () => {
    it("navega a mis eventos con query existente", () => {
      navigateMobileNavTab("eventos");
      expect(navigateAppToMock).toHaveBeenCalledWith(buildMisEventosPath());
    });

    it("navega al ranking interno del organizador", () => {
      navigateMobileNavTab("ranking", "org-99");
      expect(navigateAppToMock).toHaveBeenCalledWith("/ranking/o/org-99/varonil");
    });
  });

  describe("helpers", () => {
    it("detecta query mis-eventos", () => {
      expect(isMisEventosSearch("?mis-eventos=1&foo=bar")).toBe(true);
      expect(isMisEventosSearch("")).toBe(false);
    });

    it("detecta ranking interno del organizador", () => {
      expect(isOrganizerInternalRankingPath("/ranking/o/my-org/varonil", "my-org")).toBe(
        true
      );
      expect(isOrganizerInternalRankingPath("/ranking/o/other/varonil", "my-org")).toBe(
        false
      );
    });

    it("detecta pantallas de gestión activa", () => {
      expect(isActiveEventManagementScreen("/torneo-express/id/gestionar")).toBe(
        true
      );
      expect(isActiveEventManagementScreen("/public/torneo-express/id")).toBe(
        false
      );
    });
  });
});

jest.mock("../contexts/UserContext", () => ({
  useUser: () => ({
    user: { id: "user-1", email: "test@example.com" },
    userProfile: { name: "Test User", email: "test@example.com" },
    signOut: jest.fn(),
  }),
}));

describe("MobileAppNavigation component", () => {
  it("renderiza cinco tabs", () => {
    const React = require("react");
    const { renderToStaticMarkup } = require("react-dom/server");
    const { MobileAppNavigation } = require("../components/navigation/MobileAppNavigation");

    const html = renderToStaticMarkup(
      React.createElement(MobileAppNavigation, { pathname: "/" })
    );

    expect(html).toContain("Inicio");
    expect(html).toContain("Eventos");
    expect(html).toContain("Jugadores");
    expect(html).toContain("Ranking");
    expect(html).toContain("Más");
    expect((html.match(/mobile-app-navigation__item/g) || []).length).toBe(5);
  });

  it("marca aria-current solo en tab activo", () => {
    const React = require("react");
    const { renderToStaticMarkup } = require("react-dom/server");
    const { MobileAppNavigation } = require("../components/navigation/MobileAppNavigation");

    const html = renderToStaticMarkup(
      React.createElement(MobileAppNavigation, { pathname: "/jugadores/M" })
    );

    expect(html).toContain('aria-current="page"');
    expect((html.match(/aria-current="page"/g) || []).length).toBe(1);
    expect(html).toContain("Jugadores");
  });
});
