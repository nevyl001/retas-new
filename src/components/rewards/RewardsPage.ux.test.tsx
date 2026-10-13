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
    listAdminPlayersRewards: jest.fn(),
    listAdminIncidents: jest.fn(),
    recoverParticipations: jest.fn(),
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
const mockListAdminPlayersRewards = rewardsApi.listAdminPlayersRewards as jest.Mock;
const mockListAdminIncidents = rewardsApi.listAdminIncidents as jest.Mock;
const mockRecoverParticipations = rewardsApi.recoverParticipations as jest.Mock;

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
    mockListAdminPlayersRewards.mockResolvedValue({
      players: [
        {
          jugador_id: "jug-1",
          nombre: "Carlos Alcaraz",
          codigo_riviera: "RIV-00000001",
          puntos_acumulados: 20,
          puntos_disponibles: 20,
          puntos_reservados: 0,
          participaciones_acreditadas: 2,
          ultima_participacion: "2026-10-10T12:00:00Z",
          campaign_id: "camp-1",
          campaign_nombre: "Campaña Única",
          campaign_fase: "acumulacion",
        },
      ],
      total_count: 1,
      page: 1,
      pageSize: 25,
      total_pages: 1,
    });
    mockListAdminIncidents.mockResolvedValue({
      incidents: [],
      total_count: 0,
      page: 1,
      limit: 25,
    });
    mockRecoverParticipations.mockResolvedValue({
      recovered_count: 0,
      recovered_points: 0,
    });
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
    const row = Array.from(container.querySelectorAll("tr")).find(
      (tr) => tr.textContent?.includes("Carlos Alcaraz")
    );
    expect(row).toBeDefined();
    const playerBtn = row?.querySelector<HTMLButtonElement>("button");
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

  test("Carga automáticamente el directorio de jugadores con puntos en vista predeterminada 'Con puntos'", async () => {
    root = createRoot(container);
    await act(async () => {
      root.render(<RewardsPage pathname="/rewards/jugadores" />);
    });
    await flush();

    // Comprueba que listAdminPlayersRewards se llamó con el club organizador y paginación
    expect(mockListAdminPlayersRewards).toHaveBeenCalledWith(
      expect.objectContaining({
        organizadorId: "org-1",
        page: 1,
        pageSize: 25,
      })
    );

    // Muestra los puntos vigentes y saldo disponible en la tabla
    expect(container.textContent).toContain("Carlos Alcaraz");
    expect(container.textContent).toContain("RIV-00000001");
    expect(container.textContent).toContain("20 pts");
    expect(container.textContent).toContain("Campaña Única");
  });

  test("Permite alternar a la pestaña 'Con incidencias' y muestra las incidencias del club", async () => {
    mockListAdminIncidents.mockResolvedValue({
      incidents: [
        {
          id: "part-inc-1",
          evento_id: "ev-1",
          tipo_evento: "americano",
          campaign_id: "camp-1",
          campaign_nombre: "Octubre Loco",
          jugador_id: "jug-2",
          jugador_nombre: "Jesús Fernando",
          codigo_riviera: "RIV-00000099",
          puntos_esperados: 10,
          created_at: "2026-10-12T10:00:00Z",
          tipo_incidencia: "acreditacion_error",
          error_mensaje: "null value in column expires_at",
          attempts: 1,
        },
      ],
      total_count: 1,
      error_count: 1,
      pending_count: 0,
      page: 1,
      page_size: 50,
      total_pages: 1,
    });

    root = createRoot(container);
    await act(async () => {
      root.render(<RewardsPage pathname="/rewards/jugadores" />);
    });
    await flush();

    // Clic en la pestaña 'Con incidencias'
    const incidentsTab = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (btn) => btn.textContent?.includes("Con incidencias")
    );
    expect(incidentsTab).toBeDefined();

    await act(async () => {
      incidentsTab?.click();
    });
    await flush();

    expect(mockListAdminIncidents).toHaveBeenCalledWith(
      expect.objectContaining({
        organizadorId: "org-1",
        page: 1,
        pageSize: 50,
      })
    );

    // Debe mostrar la incidencia de Jesús Fernando con su causa
    expect(container.textContent).toContain("Jesús Fernando");
    expect(container.textContent).toContain("null value in column expires_at");
    expect(container.textContent).toContain("Octubre Loco");
  });
});

