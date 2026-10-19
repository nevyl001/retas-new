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
    requestRedemption: jest.fn(),
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
const mockRequestRedemption = rewardsApi.requestRedemption as jest.Mock;
const mockListAdminPlayersRewards = rewardsApi.listAdminPlayersRewards as jest.Mock;
const mockListAdminIncidents = rewardsApi.listAdminIncidents as jest.Mock;
const mockRecoverParticipations = rewardsApi.recoverParticipations as jest.Mock;

const OCTUBRE_LOCO_REWARDS = [
  {
    id: "rew-50",
    organizador_id: "org-1",
    campaign_id: "camp-oct",
    nombre: "Reta Gratis",
    descripcion: null,
    costo_puntos: 50,
    tipo: "reta_gratis",
    condiciones: null,
    inventario_total: 20,
    inventario_restante: 20,
    limite_por_jugador: 1,
    disponible_desde: null,
    disponible_hasta: null,
    estado: "activo" as const,
  },
  {
    id: "rew-80",
    organizador_id: "org-1",
    campaign_id: "camp-oct",
    nombre: "1 hora de cancha + Bebida",
    descripcion: null,
    costo_puntos: 80,
    tipo: "cancha",
    condiciones: null,
    inventario_total: 10,
    inventario_restante: 10,
    limite_por_jugador: 1,
    disponible_desde: null,
    disponible_hasta: null,
    estado: "activo" as const,
  },
  {
    id: "rew-120",
    organizador_id: "org-1",
    campaign_id: "camp-oct",
    nombre: "1 Clase Individual",
    descripcion: null,
    costo_puntos: 120,
    tipo: "clase",
    condiciones: null,
    inventario_total: 10,
    inventario_restante: 10,
    limite_por_jugador: 1,
    disponible_desde: null,
    disponible_hasta: null,
    estado: "activo" as const,
  },
  {
    id: "rew-150",
    organizador_id: "org-1",
    campaign_id: "camp-oct",
    nombre: "Paquete 4 Clases Ind. 50%",
    descripcion: null,
    costo_puntos: 150,
    tipo: "descuento",
    condiciones: null,
    inventario_total: 5,
    inventario_restante: 5,
    limite_por_jugador: 1,
    disponible_desde: null,
    disponible_hasta: null,
    estado: "activo" as const,
  },
];

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
    mockRequestRedemption.mockResolvedValue("red-new");
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

  test("1. Jugador con 20 puntos (Aldo Quintero en Octubre Loco): muestra los 4 premios visibles y bloqueados, ninguno canjeable", async () => {
    mockListCampaigns.mockResolvedValue([
      {
        id: "camp-oct",
        organizador_id: "org-1",
        nombre: "Octubre Loco",
        estado: "activa",
        modalidades: ["americano"],
        acumula_desde: "2026-10-01T00:00:00-06:00",
        acumula_hasta: "2026-11-01T00:00:00-06:00",
        canje_desde: "2029-11-01T00:00:00-06:00",
        canje_hasta: "2029-12-01T00:00:00-06:00",
      },
    ]);
    mockListRewards.mockResolvedValue(OCTUBRE_LOCO_REWARDS);
    mockListAdminPlayersRewards.mockResolvedValue({
      players: [
        {
          jugador_id: "jug-aldo",
          nombre: "Aldo Quintero",
          codigo_riviera: "RIV-00000181",
          puntos_acumulados: 20,
          puntos_disponibles: 0,
          puntos_reservados: 0,
          participaciones_acreditadas: 2,
          ultima_participacion: "2026-10-15T12:00:00Z",
          campaign_id: "camp-oct",
          campaign_nombre: "Octubre Loco",
          campaign_fase: "acumulacion",
        },
      ],
      total_count: 1,
      page: 1,
      pageSize: 25,
      total_pages: 1,
    });
    mockPlayerBalance.mockResolvedValue([
      {
        campaign_id: "camp-oct",
        nombre: "Octubre Loco",
        acumula_desde: "2026-10-01T00:00:00-06:00",
        acumula_hasta: "2026-11-01T00:00:00-06:00",
        canje_desde: "2029-11-01T00:00:00-06:00",
        canje_hasta: "2029-12-01T00:00:00-06:00",
        fase: "acumulacion",
        acumulando: 20,
        disponible: 0,
        reservado: 0,
        utilizado: 0,
        cerrado: 0,
      },
    ]);

    root = createRoot(container);
    await act(async () => {
      root.render(<RewardsPage pathname="/rewards/jugadores" />);
    });
    await flush();

    const row = Array.from(container.querySelectorAll("tr")).find((tr) =>
      tr.textContent?.includes("Aldo Quintero")
    );
    await act(async () => {
      row?.click();
    });
    await flush();

    const catalogItems = container.querySelectorAll(".rrw-catalog-item");
    expect(catalogItems.length).toBe(4);
    expect(container.textContent).toContain("Reta Gratis");
    expect(container.textContent).toContain("Faltan 30 pts");
    expect(container.textContent).toContain("1 hora de cancha + Bebida");
    expect(container.textContent).toContain("Faltan 60 pts");
    expect(container.textContent).toContain("1 Clase Individual");
    expect(container.textContent).toContain("Faltan 100 pts");
    expect(container.textContent).toContain("Paquete 4 Clases Ind. 50%");
    expect(container.textContent).toContain("Faltan 130 pts");

    const select = container.querySelector<HTMLSelectElement>("#play-prem-disp")!;
    const rewardOptions = Array.from(select.querySelectorAll("option")).filter((opt) => opt.value !== "");
    expect(rewardOptions.length).toBe(4);
    expect(rewardOptions.every((opt) => opt.disabled)).toBe(true);

    const requestBtn = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((btn) =>
      btn.textContent?.includes("Solicitar beneficio")
    )!;
    expect(requestBtn.disabled).toBe(true);
  });

  test("2. Jugador con 0 puntos: mantiene el catálogo de la campaña visible y bloqueado", async () => {
    mockListCampaigns.mockResolvedValue([
      {
        id: "camp-oct",
        organizador_id: "org-1",
        nombre: "Octubre Loco",
        estado: "activa",
        modalidades: ["americano"],
        acumula_desde: "2026-10-01T00:00:00-06:00",
        acumula_hasta: "2026-11-01T00:00:00-06:00",
        canje_desde: "2029-11-01T00:00:00-06:00",
        canje_hasta: "2029-12-01T00:00:00-06:00",
      },
    ]);
    mockListRewards.mockResolvedValue(OCTUBRE_LOCO_REWARDS);
    mockListAdminPlayersRewards.mockResolvedValue({
      players: [
        {
          jugador_id: "jug-zero",
          nombre: "Jugador Sin Puntos",
          codigo_riviera: "RIV-00000200",
          puntos_acumulados: 0,
          puntos_disponibles: 0,
          puntos_reservados: 0,
          participaciones_acreditadas: 0,
          ultima_participacion: null,
          campaign_id: "camp-oct",
          campaign_nombre: "Octubre Loco",
          campaign_fase: "acumulacion",
        },
      ],
      total_count: 1,
      page: 1,
      pageSize: 25,
      total_pages: 1,
    });
    mockPlayerBalance.mockResolvedValue([]);

    root = createRoot(container);
    await act(async () => {
      root.render(<RewardsPage pathname="/rewards/jugadores" />);
    });
    await flush();

    const row = Array.from(container.querySelectorAll("tr")).find((tr) =>
      tr.textContent?.includes("Jugador Sin Puntos")
    );
    await act(async () => {
      row?.click();
    });
    await flush();

    const catalogItems = container.querySelectorAll(".rrw-catalog-item");
    expect(catalogItems.length).toBe(4);
    expect(container.textContent).toContain("0 / 50 pts acumulados");
    expect(container.textContent).toContain("Faltan 50 pts");
  });

  test("3. Jugador con 50 puntos acumulados y ventana de canje cerrada: alcanza costo del premio de 50 pts pero no puede solicitarlo", async () => {
    mockListCampaigns.mockResolvedValue([
      {
        id: "camp-oct",
        organizador_id: "org-1",
        nombre: "Octubre Loco",
        estado: "activa",
        modalidades: ["americano"],
        acumula_desde: "2026-10-01T00:00:00-06:00",
        acumula_hasta: "2026-11-01T00:00:00-06:00",
        canje_desde: "2029-11-01T00:00:00-06:00",
        canje_hasta: "2029-12-01T00:00:00-06:00",
      },
    ]);
    mockListRewards.mockResolvedValue(OCTUBRE_LOCO_REWARDS);
    mockPlayerBalance.mockResolvedValue([
      {
        campaign_id: "camp-oct",
        nombre: "Octubre Loco",
        acumula_desde: "2026-10-01T00:00:00-06:00",
        acumula_hasta: "2026-11-01T00:00:00-06:00",
        canje_desde: "2029-11-01T00:00:00-06:00",
        canje_hasta: "2029-12-01T00:00:00-06:00",
        fase: "acumulacion",
        acumulando: 50,
        disponible: 0,
        reservado: 0,
        utilizado: 0,
        cerrado: 0,
      },
    ]);

    root = createRoot(container);
    await act(async () => {
      root.render(<RewardsPage pathname="/rewards/jugadores" />);
    });
    await flush();

    const row = Array.from(container.querySelectorAll("tr")).find((tr) =>
      tr.textContent?.includes("Carlos Alcaraz")
    );
    await act(async () => {
      row?.click();
    });
    await flush();

    expect(container.textContent).toContain("50 / 50 pts acumulados");
    expect(container.textContent).toContain("Pendiente de apertura de canje");
    expect(container.textContent).toContain("Puntos cubiertos · Canje aún no abierto");

    const select = container.querySelector<HTMLSelectElement>("#play-prem-disp")!;
    const opt50 = select.querySelector<HTMLOptionElement>('option[value="rew-50"]')!;
    expect(opt50).not.toBeNull();
    expect(opt50.disabled).toBe(true);

    const requestBtn = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((btn) =>
      btn.textContent?.includes("Solicitar beneficio")
    )!;
    expect(requestBtn.disabled).toBe(true);
  });

  test("4. Jugador con 60 puntos disponibles y ventana de canje abierta: habilita solo el premio de 50 pts y mantiene bloqueados los demás", async () => {
    mockListCampaigns.mockResolvedValue([
      {
        id: "camp-oct",
        organizador_id: "org-1",
        nombre: "Octubre Loco",
        estado: "activa",
        modalidades: ["americano"],
        acumula_desde: "2025-10-01T00:00:00-06:00",
        acumula_hasta: "2025-11-01T00:00:00-06:00",
        canje_desde: "2025-11-01T00:00:00-06:00",
        canje_hasta: "2029-12-01T00:00:00-06:00",
      },
    ]);
    mockListRewards.mockResolvedValue(OCTUBRE_LOCO_REWARDS);
    mockPlayerBalance.mockResolvedValue([
      {
        campaign_id: "camp-oct",
        nombre: "Octubre Loco",
        acumula_desde: "2025-10-01T00:00:00-06:00",
        acumula_hasta: "2025-11-01T00:00:00-06:00",
        canje_desde: "2025-11-01T00:00:00-06:00",
        canje_hasta: "2029-12-01T00:00:00-06:00",
        fase: "canje",
        acumulando: 0,
        disponible: 60,
        reservado: 0,
        utilizado: 0,
        cerrado: 0,
      },
    ]);

    root = createRoot(container);
    await act(async () => {
      root.render(<RewardsPage pathname="/rewards/jugadores" />);
    });
    await flush();

    const row = Array.from(container.querySelectorAll("tr")).find((tr) =>
      tr.textContent?.includes("Carlos Alcaraz")
    );
    await act(async () => {
      row?.click();
    });
    await flush();

    const select = container.querySelector<HTMLSelectElement>("#play-prem-disp")!;
    const opt50 = select.querySelector<HTMLOptionElement>('option[value="rew-50"]')!;
    const opt80 = select.querySelector<HTMLOptionElement>('option[value="rew-80"]')!;
    const opt120 = select.querySelector<HTMLOptionElement>('option[value="rew-120"]')!;
    const opt150 = select.querySelector<HTMLOptionElement>('option[value="rew-150"]')!;

    expect(opt50.disabled).toBe(false);
    expect(opt80.disabled).toBe(true);
    expect(opt120.disabled).toBe(true);
    expect(opt150.disabled).toBe(true);

    await act(async () => {
      select.value = "rew-50";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const requestBtn = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((btn) =>
      btn.textContent?.includes("Solicitar beneficio")
    )!;
    expect(requestBtn.disabled).toBe(false);

    await act(async () => {
      requestBtn.click();
    });
    await flush();

    expect(mockRequestRedemption).toHaveBeenCalledWith("org-1", "rew-50", "jug-1");
  });

  test("5. Premio agotado: permanece visible en el catálogo pero deshabilitado para canje", async () => {
    mockListCampaigns.mockResolvedValue([
      {
        id: "camp-oct",
        organizador_id: "org-1",
        nombre: "Octubre Loco",
        estado: "activa",
        modalidades: ["americano"],
        acumula_desde: "2025-10-01T00:00:00-06:00",
        acumula_hasta: "2025-11-01T00:00:00-06:00",
        canje_desde: "2025-11-01T00:00:00-06:00",
        canje_hasta: "2029-12-01T00:00:00-06:00",
      },
    ]);
    mockListRewards.mockResolvedValue([
      {
        ...OCTUBRE_LOCO_REWARDS[0],
        inventario_restante: 0,
      },
    ]);
    mockPlayerBalance.mockResolvedValue([
      {
        campaign_id: "camp-oct",
        nombre: "Octubre Loco",
        acumula_desde: "2025-10-01T00:00:00-06:00",
        acumula_hasta: "2025-11-01T00:00:00-06:00",
        canje_desde: "2025-11-01T00:00:00-06:00",
        canje_hasta: "2029-12-01T00:00:00-06:00",
        fase: "canje",
        acumulando: 0,
        disponible: 100,
        reservado: 0,
        utilizado: 0,
        cerrado: 0,
      },
    ]);

    root = createRoot(container);
    await act(async () => {
      root.render(<RewardsPage pathname="/rewards/jugadores" />);
    });
    await flush();

    const row = Array.from(container.querySelectorAll("tr")).find((tr) =>
      tr.textContent?.includes("Carlos Alcaraz")
    );
    await act(async () => {
      row?.click();
    });
    await flush();

    expect(container.textContent).toContain("Reta Gratis");
    expect(container.textContent).toContain("Agotado");
    expect(container.textContent).toContain("Sin inventario disponible");

    const select = container.querySelector<HTMLSelectElement>("#play-prem-disp")!;
    const opt50 = select.querySelector<HTMLOptionElement>('option[value="rew-50"]')!;
    expect(opt50.disabled).toBe(true);
  });

  test("6. Premios pausados, de otra campaña o de otro club no se ofrecen en el catálogo", async () => {
    mockListCampaigns.mockResolvedValue([
      {
        id: "camp-oct",
        organizador_id: "org-1",
        nombre: "Octubre Loco",
        estado: "activa",
        modalidades: ["americano"],
        acumula_desde: "2026-10-01T00:00:00-06:00",
        acumula_hasta: "2026-11-01T00:00:00-06:00",
        canje_desde: "2029-11-01T00:00:00-06:00",
        canje_hasta: "2029-12-01T00:00:00-06:00",
      },
    ]);
    mockListRewards.mockResolvedValue([
      OCTUBRE_LOCO_REWARDS[0],
      {
        ...OCTUBRE_LOCO_REWARDS[1],
        id: "rew-pausado",
        nombre: "Premio Pausado Secreto",
        estado: "pausado",
      },
      {
        ...OCTUBRE_LOCO_REWARDS[2],
        id: "rew-otra-camp",
        campaign_id: "camp-ajena",
        nombre: "Premio Campaña Ajena",
      },
      {
        ...OCTUBRE_LOCO_REWARDS[3],
        id: "rew-otro-club",
        organizador_id: "org-otro-club",
        nombre: "Premio Club Ajeno",
      },
    ]);

    root = createRoot(container);
    await act(async () => {
      root.render(<RewardsPage pathname="/rewards/jugadores" />);
    });
    await flush();

    const row = Array.from(container.querySelectorAll("tr")).find((tr) =>
      tr.textContent?.includes("Carlos Alcaraz")
    );
    await act(async () => {
      row?.click();
    });
    await flush();

    expect(container.textContent).toContain("Reta Gratis");
    expect(container.textContent).not.toContain("Premio Pausado Secreto");
    expect(container.textContent).not.toContain("Premio Campaña Ajena");
    expect(container.textContent).not.toContain("Premio Club Ajeno");
  });

  test("7. Cambiar de campaña o de jugador limpia cualquier selección previa de premio", async () => {
    mockListCampaigns.mockResolvedValue([
      {
        id: "camp-canje",
        organizador_id: "org-1",
        nombre: "Septiembre Canje",
        estado: "activa",
        modalidades: ["americano"],
        acumula_desde: "2025-09-01T00:00:00-06:00",
        acumula_hasta: "2025-10-01T00:00:00-06:00",
        canje_desde: "2025-10-01T00:00:00-06:00",
        canje_hasta: "2029-11-01T00:00:00-06:00",
      },
      {
        id: "camp-oct",
        organizador_id: "org-1",
        nombre: "Octubre Loco",
        estado: "activa",
        modalidades: ["americano"],
        acumula_desde: "2026-10-01T00:00:00-06:00",
        acumula_hasta: "2026-11-01T00:00:00-06:00",
        canje_desde: "2029-11-01T00:00:00-06:00",
        canje_hasta: "2029-12-01T00:00:00-06:00",
      },
    ]);
    mockListRewards.mockResolvedValue([
      {
        ...OCTUBRE_LOCO_REWARDS[0],
        id: "rew-sep-50",
        campaign_id: "camp-canje",
        nombre: "Premio Septiembre",
      },
      ...OCTUBRE_LOCO_REWARDS,
    ]);
    mockPlayerBalance.mockResolvedValue([
      {
        campaign_id: "camp-canje",
        nombre: "Septiembre Canje",
        acumula_desde: "2025-09-01T00:00:00-06:00",
        acumula_hasta: "2025-10-01T00:00:00-06:00",
        canje_desde: "2025-10-01T00:00:00-06:00",
        canje_hasta: "2029-11-01T00:00:00-06:00",
        fase: "canje",
        acumulando: 0,
        disponible: 60,
        reservado: 0,
        utilizado: 0,
        cerrado: 0,
      },
      {
        campaign_id: "camp-oct",
        nombre: "Octubre Loco",
        acumula_desde: "2026-10-01T00:00:00-06:00",
        acumula_hasta: "2026-11-01T00:00:00-06:00",
        canje_desde: "2029-11-01T00:00:00-06:00",
        canje_hasta: "2029-12-01T00:00:00-06:00",
        fase: "acumulacion",
        acumulando: 20,
        disponible: 0,
        reservado: 0,
        utilizado: 0,
        cerrado: 0,
      },
    ]);

    root = createRoot(container);
    await act(async () => {
      root.render(<RewardsPage pathname="/rewards/jugadores" />);
    });
    await flush();

    const row = Array.from(container.querySelectorAll("tr")).find((tr) =>
      tr.textContent?.includes("Carlos Alcaraz")
    );
    await act(async () => {
      row?.click();
    });
    await flush();

    // Seleccionar Septiembre Canje y elegir el premio disponible
    const sepPill = Array.from(container.querySelectorAll<HTMLButtonElement>(".rrw-campaign-pill")).find((btn) =>
      btn.textContent?.includes("Septiembre Canje")
    )!;
    await act(async () => {
      sepPill.click();
    });
    await flush();

    const select = container.querySelector<HTMLSelectElement>("#play-prem-disp")!;
    await act(async () => {
      select.value = "rew-sep-50";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(select.value).toBe("rew-sep-50");

    // Cambiar a Octubre Loco limpia el premio seleccionado
    const octPill = Array.from(container.querySelectorAll<HTMLButtonElement>(".rrw-campaign-pill")).find((btn) =>
      btn.textContent?.includes("Octubre Loco")
    )!;
    await act(async () => {
      octPill.click();
    });
    await flush();

    expect(select.value).toBe("");
    const requestBtn = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((btn) =>
      btn.textContent?.includes("Solicitar beneficio")
    )!;
    expect(requestBtn.disabled).toBe(true);
  });

  test("8. Intento de solicitud no autorizada o bloqueada manipulando el DOM: no invoca requestRedemption", async () => {
    mockListCampaigns.mockResolvedValue([
      {
        id: "camp-oct",
        organizador_id: "org-1",
        nombre: "Octubre Loco",
        estado: "activa",
        modalidades: ["americano"],
        acumula_desde: "2026-10-01T00:00:00-06:00",
        acumula_hasta: "2026-11-01T00:00:00-06:00",
        canje_desde: "2029-11-01T00:00:00-06:00",
        canje_hasta: "2029-12-01T00:00:00-06:00",
      },
    ]);
    mockListRewards.mockResolvedValue(OCTUBRE_LOCO_REWARDS);
    mockPlayerBalance.mockResolvedValue([
      {
        campaign_id: "camp-oct",
        nombre: "Octubre Loco",
        acumula_desde: "2026-10-01T00:00:00-06:00",
        acumula_hasta: "2026-11-01T00:00:00-06:00",
        canje_desde: "2029-11-01T00:00:00-06:00",
        canje_hasta: "2029-12-01T00:00:00-06:00",
        fase: "acumulacion",
        acumulando: 20,
        disponible: 0,
        reservado: 0,
        utilizado: 0,
        cerrado: 0,
      },
    ]);

    root = createRoot(container);
    await act(async () => {
      root.render(<RewardsPage pathname="/rewards/jugadores" />);
    });
    await flush();

    const row = Array.from(container.querySelectorAll("tr")).find((tr) =>
      tr.textContent?.includes("Carlos Alcaraz")
    );
    await act(async () => {
      row?.click();
    });
    await flush();

    const select = container.querySelector<HTMLSelectElement>("#play-prem-disp")!;
    const opt50 = select.querySelector<HTMLOptionElement>('option[value="rew-50"]')!;
    opt50.disabled = false;

    await act(async () => {
      select.value = "rew-50";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const requestBtn = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((btn) =>
      btn.textContent?.includes("Solicitar beneficio")
    )!;
    requestBtn.disabled = false;

    await act(async () => {
      requestBtn.click();
    });
    await flush();

    expect(mockRequestRedemption).not.toHaveBeenCalled();
  });
});
