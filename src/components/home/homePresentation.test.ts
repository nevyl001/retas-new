import { partitionHomeRetas } from "../../lib/retasList";
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
  useClubExperience: () => ({
    manifest: {
      home: {
        welcomeTitle: "Título",
        welcomeSubtitle: "Elige un modo y lanza tu reta en menos de un minuto.",
      },
    },
    isClubBranded: false,
    organizadorId: null,
  }),
  getAccountModeDisabledMessage: () => "Modo deshabilitado",
  getOrganizerRegistryCardSubtitle: () => "Gestiona el registro de jugadores",
  getHomeEyebrow: () => "Club Test",
  getHomeWelcomeTitle: () => "Título",
  getHomeWelcomeSubtitle: (_manifest: unknown, userName?: string) =>
    userName
      ? `Hola, ${userName}. Elige un modo y lanza tu reta en menos de un minuto.`
      : "Elige un modo y lanza tu reta en menos de un minuto.",
  getDuelo2v2ModeDescription: () => "Duelo 2 vs 2",
  useClubModeEyebrow: () => "Club Test",
  useOrganizerDisplayName: () => "Club Test",
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

  describe("MobileAppNavigation", () => {
    it("no declara role list redundante en ul", () => {
      const React = require("react");
      const { renderToStaticMarkup } = require("react-dom/server");
      const { MobileAppNavigation } = require("../navigation/MobileAppNavigation");

      const view = renderToStaticMarkup(
        React.createElement(MobileAppNavigation, { pathname: "/" })
      );

      expect(view).not.toContain('role="list"');
    });
  });

  describe("HomeDashboard", () => {
    it("la pregunta y el grid de modos son lo único protagonista, sin ruido visual", () => {
      const React = require("react");
      const { renderToStaticMarkup } = require("react-dom/server");
      const { HomeDashboard } = require("./HomeDashboard");

      const view = renderToStaticMarkup(
        React.createElement(HomeDashboard, {
          userId: "user-1",
          onTournamentSelect: jest.fn(),
          onShowAllRetas: jest.fn(),
        })
      );

      expect(view).toContain("home-question");
      expect(view).toContain("¿Qué quieres organizar hoy?");
      expect(view).toContain("home-greeting");
      expect(view).toContain("Hola, Test User.");
      expect(view).toContain("Retas rápidas");
      expect(view).toContain("Competencias organizadas");
      // Sin elementos decorativos ni CTA visible: toda la tarjeta es el botón.
      expect(view).not.toContain("Próximamente");
      expect(view).not.toContain("rv-mode-card__cta");
      expect(view).not.toContain("home-create-event__cta");
      expect(view).not.toContain("home-quick-card");
      expect(view).not.toContain("Gestionar mis retas");
      // Accesos rápidos: sección propia y visible, no franja de enlaces.
      expect(view).toContain("home-access");
      expect(view).toContain("Accesos rápidos");
      expect(view).toContain("Registro de jugadores");
      expect(view).toContain("Cómo funciona el ranking");
      expect(view).toContain("Historial");
      expect(view).not.toContain("Aviso legal");
      expect(view).toContain("Aviso de Privacidad y Términos y Condiciones");
    });
  });
});
