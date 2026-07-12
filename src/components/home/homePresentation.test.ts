import { partitionHomeRetas } from "./RecentRetasSection";
import type { HomeRetaItem } from "../../lib/retasList";
import type { Tournament } from "../../lib/database";
import type { Duelo2v2 } from "../../lib/duelo2v2/types";

jest.mock("../../contexts/UserContext", () => ({
  useUser: () => ({
    user: { id: "user-1", email: "test@example.com" },
    userProfile: { name: "Test User", email: "test@example.com" },
    signOut: jest.fn(),
  }),
}));

jest.mock("../../contexts/AccountFeaturesContext", () => ({
  useAccountFeatures: () => ({
    isModeEnabled: () => true,
  }),
}));

jest.mock("../../club-experience", () => ({
  useBranding: () => ({ nombre: "Club Test" }),
  getAccountModeDisabledMessage: () => "Modo deshabilitado",
  getOrganizerRegistryCardSubtitle: () => "Gestiona el registro de jugadores",
  useClubExperience: () => ({
    manifest: {
      home: {
        welcomeTitle: "Título",
        welcomeSubtitle: "Subtítulo",
      },
    },
    isClubBranded: false,
    organizadorId: null,
  }),
  useOrganizerDisplayName: () => "Club Test",
  getHomeEyebrow: () => "Club Test",
  getHomeWelcomeTitle: () => "Título",
  getHomeWelcomeSubtitle: () => "Subtítulo",
  getDuelo2v2ModeDescription: () => "Duelo 2 vs 2",
  useClubModeEyebrow: () => "Club Test",
}));

function mockTournament(
  partial: Partial<Tournament> & Pick<Tournament, "id" | "name">
): HomeRetaItem {
  return {
    kind: "tournament",
    tournament: {
      courts: 2,
      created_at: "2026-01-01T10:00:00Z",
      is_started: false,
      is_finished: false,
      ...partial,
    } as Tournament,
  };
}

function mockDuelo(
  partial: Partial<Duelo2v2> & Pick<Duelo2v2, "id" | "nombre">
): HomeRetaItem {
  return {
    kind: "duelo-2v2",
    duelo: {
      estado: "en_juego",
      created_at: "2026-01-02T10:00:00Z",
      ...partial,
    } as Duelo2v2,
  };
}

describe("home presentation", () => {
  describe("partitionHomeRetas", () => {
    it("limita a 3 activos y 3 finalizados", () => {
      const retas: HomeRetaItem[] = [
        ...Array.from({ length: 4 }, (_, i) =>
          mockTournament({
            id: `active-${i}`,
            name: `Activa ${i}`,
            is_started: true,
            is_finished: false,
            created_at: `2026-01-${10 + i}T10:00:00Z`,
          })
        ),
        ...Array.from({ length: 5 }, (_, i) =>
          mockTournament({
            id: `done-${i}`,
            name: `Finalizada ${i}`,
            is_finished: true,
            created_at: `2026-01-${20 + i}T10:00:00Z`,
          })
        ),
      ];

      const { active, recent, hasMore } = partitionHomeRetas(retas);
      expect(active).toHaveLength(3);
      expect(recent).toHaveLength(3);
      expect(hasMore).toBe(true);
    });

    it("prioriza eventos no finalizados en activos", () => {
      const retas = [
        mockTournament({
          id: "pending",
          name: "Pendiente",
          is_started: false,
          is_finished: false,
        }),
        mockDuelo({ id: "duelo", nombre: "Duelo", estado: "en_juego" }),
      ];

      const { active, recent } = partitionHomeRetas(retas);
      expect(active).toHaveLength(2);
      expect(recent).toHaveLength(0);
    });
  });

  describe("HomeCreateEventCta", () => {
    it("no usa role option en modalidades", () => {
      const React = require("react");
      const { renderToStaticMarkup } = require("react-dom/server");
      const { HomeCreateEventCta } = require("./HomeCreateEventCta");

      const html = renderToStaticMarkup(
        React.createElement(HomeCreateEventCta, {
          onModeSelect: jest.fn(),
        })
      );

      expect(html).toContain("Crear evento");
      expect(html).not.toContain('role="option"');
      expect(html).not.toContain('role="listbox"');
    });
  });

  describe("MobileAppNavigation", () => {
    it("no declara role list redundante en ul", () => {
      const React = require("react");
      const { renderToStaticMarkup } = require("react-dom/server");
      const { MobileAppNavigation } = require("../navigation/MobileAppNavigation");

      const html = renderToStaticMarkup(
        React.createElement(MobileAppNavigation, { pathname: "/" })
      );

      expect(html).not.toContain('role="list"');
    });
  });

  describe("HomeDashboard", () => {
    it("muestra un solo CTA Crear evento y oculta secciones repetidas", () => {
      const React = require("react");
      const { renderToStaticMarkup } = require("react-dom/server");
      const { HomeDashboard } = require("./HomeDashboard");

      const html = renderToStaticMarkup(
        React.createElement(HomeDashboard, {
          userId: "user-1",
          onTournamentSelect: jest.fn(),
          onShowAllRetas: jest.fn(),
        })
      );

      expect(html).toContain("home-create-event__cta");
      expect(html).toContain("Nuevo evento");
      expect((html.match(/home-create-event__cta/g) || []).length).toBe(1);
      expect(html).toContain("home-hero");
      expect(html).not.toContain("Retas rápidas");
      expect(html).not.toContain("Competencias organizadas");
      expect(html).not.toContain("Gestionar mis retas");
      expect(html).toContain("Registro de jugadores");
      expect(html).toContain("Accesos rápidos");
      expect(html).toContain("Cómo funciona el ranking");
      expect(html).not.toContain("Aviso legal");
      expect(html).toContain("Aviso de Privacidad y Términos y Condiciones");
    });
  });
});
