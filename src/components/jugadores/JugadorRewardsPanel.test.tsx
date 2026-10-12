/**
 * @jest-environment jsdom
 */
/* eslint-disable testing-library/no-unnecessary-act */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JugadorRewardsPanel } from "./JugadorRewardsPanel";
import * as rewardsApi from "../../lib/rewards/api";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../lib/rewards/api", () => {
  const actual = jest.requireActual("../../lib/rewards/api");
  return {
    ...actual,
    playerBalance: jest.fn(),
    listCampaigns: jest.fn(),
    listRewards: jest.fn(),
    listRedemptions: jest.fn(),
    listReviews: jest.fn(),
    listBenefits: jest.fn(),
    listParticipaciones: jest.fn(),
    assignBenefit: jest.fn(),
    reviewParticipations: jest.fn(),
    requestRedemption: jest.fn(),
    reserveRedemption: jest.fn(),
    confirmRedemption: jest.fn(),
    cancelRedemption: jest.fn(),
    playerSnapshot: jest.fn(),
    playerRequestRedemption: jest.fn(),
  };
});

const mockPlayerBalance = rewardsApi.playerBalance as jest.Mock;
const mockListCampaigns = rewardsApi.listCampaigns as jest.Mock;
const mockListRewards = rewardsApi.listRewards as jest.Mock;
const mockListRedemptions = rewardsApi.listRedemptions as jest.Mock;
const mockListReviews = rewardsApi.listReviews as jest.Mock;
const mockListBenefits = rewardsApi.listBenefits as jest.Mock;
const mockListParticipaciones = rewardsApi.listParticipaciones as jest.Mock;
const mockAssignBenefit = rewardsApi.assignBenefit as jest.Mock;

describe("JugadorRewardsPanel — Mejoras de UX en modo admin", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);

    mockPlayerBalance.mockResolvedValue([]);
    mockListCampaigns.mockResolvedValue([]);
    mockListRewards.mockResolvedValue([]);
    mockListRedemptions.mockResolvedValue([]);
    mockListReviews.mockResolvedValue([]);
    mockListBenefits.mockResolvedValue([]);
    mockListParticipaciones.mockResolvedValue([]);
    mockAssignBenefit.mockResolvedValue(undefined);
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

  test("1. Preselecciona automáticamente la campaña activa cuando existe solo una", async () => {
    mockListCampaigns.mockResolvedValue([
      { id: "camp-octubre", nombre: "Octubre 2026", estado: "activa" },
      { id: "camp-septiembre", nombre: "Septiembre 2026", estado: "finalizada" },
    ]);
    mockListReviews.mockResolvedValue([
      { id: "rev-1", participacion_id: "part-1", estado: "pendiente", modalidad: "reta_equipos" },
    ]);

    root = createRoot(container);
    await act(async () => {
      root.render(<JugadorRewardsPanel mode="admin" organizadorId="org-1" jugadorId="jug-1" />);
    });
    await flush();

    const select = container.querySelector<HTMLSelectElement>('select[aria-label="Campaña"]');
    expect(select).not.toBeNull();
    expect(select?.value).toBe("camp-octubre");
  });

  test("2. NO preselecciona automáticamente cuando existen múltiples campañas activas", async () => {
    mockListCampaigns.mockResolvedValue([
      { id: "camp-1", nombre: "Campaña A", estado: "activa" },
      { id: "camp-2", nombre: "Campaña B", estado: "activa" },
    ]);

    root = createRoot(container);
    await act(async () => {
      root.render(<JugadorRewardsPanel mode="admin" organizadorId="org-1" jugadorId="jug-1" />);
    });
    await flush();

    const select = container.querySelector<HTMLSelectElement>('select[aria-label="Campaña"]');
    expect(select).not.toBeNull();
    expect(select?.value).toBe("");
  });

  test("3. Respeta la selección manual del administrador sin sobrescribirla", async () => {
    mockListCampaigns.mockResolvedValue([
      { id: "camp-1", nombre: "Campaña A", estado: "activa" },
      { id: "camp-2", nombre: "Campaña B", estado: "activa" },
    ]);

    root = createRoot(container);
    await act(async () => {
      root.render(<JugadorRewardsPanel mode="admin" organizadorId="org-1" jugadorId="jug-1" />);
    });
    await flush();

    const select = container.querySelector<HTMLSelectElement>('select[aria-label="Campaña"]')!;
    await act(async () => {
      select.value = "camp-2";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(select.value).toBe("camp-2");
  });

  test("4. Muestra reta gratuita pendiente y permite asignarla con assignBenefit", async () => {
    mockListBenefits.mockResolvedValue([
      {
        id: "ben-1",
        redemption_id: "red-1",
        jugador_id: "jug-1",
        tipo_beneficio: "reta_gratis",
        estado: "pendiente_asignacion",
        participacion_id: null,
      },
    ]);
    mockListParticipaciones.mockResolvedValue([
      {
        id: "part-1",
        evento_id: "ev-1",
        tipo_evento: "reta",
        evento_nombre: "Reta Sábado Tarde",
        fecha: "2026-10-10",
      },
    ]);

    root = createRoot(container);
    await act(async () => {
      root.render(<JugadorRewardsPanel mode="admin" organizadorId="org-1" jugadorId="jug-1" />);
    });
    await flush();

    expect(container.textContent).toContain("Reta Gratuita Pendiente de Asignar");
    const partSelect = container.querySelector<HTMLSelectElement>('select[aria-label="Participación para reta gratuita"]');
    expect(partSelect).not.toBeNull();
    expect(partSelect?.textContent).toContain("Reta Sábado Tarde");

    const assignBtn = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (btn) => btn.textContent?.includes("Marcar como gratuita")
    );
    expect(assignBtn).toBeDefined();
    expect(assignBtn?.disabled).toBe(true);

    // Seleccionar la participación y presionar botón
    await act(async () => {
      partSelect!.value = "part-1";
      partSelect!.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const activeAssignBtn = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (btn) => btn.textContent?.includes("Marcar como gratuita") && !btn.disabled
    );
    expect(activeAssignBtn).toBeDefined();

    await act(async () => {
      activeAssignBtn?.click();
    });
    await flush();

    expect(mockAssignBenefit).toHaveBeenCalledWith({
      benefitId: "ben-1",
      eventoId: "ev-1",
      tipoEvento: "reta",
      participacionId: "part-1",
    });
  });
});
