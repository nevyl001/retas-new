/**
 * @jest-environment jsdom
 */
/* eslint-disable testing-library/no-unnecessary-act */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RewardsPage } from "./RewardsPage";
import * as rewardsApi from "../../lib/rewards/api";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../contexts/UserContext", () => ({
  useUser: () => ({ user: { id: "org-1" } }),
}));

jest.mock("../../lib/appRouting", () => ({
  navigateToAppHome: jest.fn(),
}));

jest.mock("./rewardsNav", () => ({
  parseRewardsArea: () => "jugadores",
  rewardsAreaPath: (area: string) => `/rewards/${area}`,
  navigateRewards: jest.fn(),
}));

jest.mock("../../lib/rewards/api", () => {
  const actual = jest.requireActual("../../lib/rewards/api");
  return {
    ...actual,
    listCampaigns: jest.fn(),
    listRewards: jest.fn(),
    listQueue: jest.fn(),
    listPlayers: jest.fn(),
    playerBalance: jest.fn(),
    listReviews: jest.fn(),
    listRedemptions: jest.fn(),
    listBenefits: jest.fn(),
    listParticipaciones: jest.fn(),
    assignBenefit: jest.fn(),
    reviewParticipations: jest.fn(),
  };
});

const mockListCampaigns = rewardsApi.listCampaigns as jest.Mock;
const mockListRewards = rewardsApi.listRewards as jest.Mock;
const mockListQueue = rewardsApi.listQueue as jest.Mock;
const mockListPlayers = rewardsApi.listPlayers as jest.Mock;
const mockPlayerBalance = rewardsApi.playerBalance as jest.Mock;
const mockListReviews = rewardsApi.listReviews as jest.Mock;
const mockListRedemptions = rewardsApi.listRedemptions as jest.Mock;
const mockListBenefits = rewardsApi.listBenefits as jest.Mock;
const mockListParticipaciones = rewardsApi.listParticipaciones as jest.Mock;

describe("RewardsPage — Mejoras de UX en Jugadores y Canjes", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);

    mockListCampaigns.mockResolvedValue([
      { id: "camp-1", nombre: "Campaña Única", estado: "activa", modalidades: ["reta_equipos"], acumula_desde: "2026-10-01", acumula_hasta: "2026-10-31", canje_desde: "2026-11-01", canje_hasta: "2026-11-30" },
    ]);
    mockListRewards.mockResolvedValue([]);
    mockListQueue.mockResolvedValue([]);
    mockListPlayers.mockResolvedValue([{ id: "jug-1", nombre: "Carlos Alcaraz" }]);
    mockPlayerBalance.mockResolvedValue([]);
    mockListReviews.mockResolvedValue([
      { id: "rev-1", participacion_id: "part-1", jugador_id: "jug-1", modalidad: "reta_equipos", estado: "pendiente", closed_at: "2026-10-10T12:00:00Z" },
    ]);
    mockListRedemptions.mockResolvedValue([]);
    mockListBenefits.mockResolvedValue([]);
    mockListParticipaciones.mockResolvedValue([]);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.clearAllMocks();
  });

  async function flush() {
    for (let i = 0; i < 5; i++) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  }

  test("Muestra etiquetas legibles de modalidad en participaciones pendientes y preselecciona la única campaña activa", async () => {
    root = createRoot(container);
    await act(async () => {
      root.render(<RewardsPage pathname="/rewards/jugadores" />);
    });
    await flush();

    // Seleccionar al jugador en la lista
    const playerBtn = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (btn) => btn.textContent?.includes("Carlos Alcaraz")
    );
    expect(playerBtn).toBeDefined();

    await act(async () => {
      playerBtn?.click();
    });
    await flush();

    // Verifica que en vez de "reta_equipos" aparezca "Reta por equipos"
    expect(container.textContent).toContain("Reta por equipos");
    expect(container.textContent).not.toMatch(/\breta_equipos\b/);

    // Verifica que el select de acreditación tenga preseleccionada "camp-1"
    const campSelect = container.querySelector<HTMLSelectElement>("#play-camp-acred");
    expect(campSelect).not.toBeNull();
    expect(campSelect?.value).toBe("camp-1");
  });
});

