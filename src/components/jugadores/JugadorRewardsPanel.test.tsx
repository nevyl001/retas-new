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

describe("JugadorRewardsPanel — Experiencia de Fidelización del Jugador (Player Mode)", () => {
  let container: HTMLDivElement;
  let root: Root;

  const mockPlayerSnapshot = rewardsApi.playerSnapshot as jest.Mock;
  const mockPlayerRequestRedemption = rewardsApi.playerRequestRedemption as jest.Mock;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    mockPlayerSnapshot.mockReset();
    mockPlayerRequestRedemption.mockReset();
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

  test("1. Visitante sin sesión ve tarjeta de fidelización e invitación sin exponer datos", async () => {
    root = createRoot(container);
    await act(async () => {
      root.render(
        <JugadorRewardsPanel
          mode="player"
          jugadorId="jug-1"
          currentUser={null}
        />
      );
    });
    await flush();

    expect(container.textContent).toContain("Riviera Rewards");
    expect(container.textContent).toContain("Programa de fidelización y recompensas");
    expect(container.textContent).toContain("Acumula puntos en cada reta con Riviera Rewards");
    expect(container.textContent).toContain("Iniciar sesión");
    // No debe llamar a playerSnapshot
    expect(mockPlayerSnapshot).not.toHaveBeenCalled();
  });

  test("2. Usuario con sesión pero no vinculado ve aviso de privacidad sin exponer puntos", async () => {
    mockPlayerSnapshot.mockRejectedValue(new Error("Esta cuenta no está vinculada a este jugador"));

    root = createRoot(container);
    await act(async () => {
      root.render(
        <JugadorRewardsPanel
          mode="player"
          jugadorId="jug-1"
          currentUser={{ id: "user-otro", email: "otro@club.com" }}
        />
      );
    });
    await flush();

    expect(container.textContent).toContain("Riviera Rewards");
    expect(container.textContent).toContain("Acceso restringido");
    expect(container.textContent).toContain("Este perfil pertenece a otro jugador");
    expect(container.textContent).not.toContain("Disponibles");
    expect(container.textContent).not.toContain("Próxima recompensa");
  });

  test("3. Jugador vinculado en fase de acumulación muestra narrativa, métricas y barra de progreso dinámica", async () => {
    mockPlayerSnapshot.mockResolvedValue({
      organizador_id: "org-padelito",
      saldos: [
        {
          campaign_id: "camp-oct",
          nombre: "Octubre Loco",
          acumula_desde: "2026-10-01T00:00:00-06:00",
          acumula_hasta: "2026-11-01T00:00:00-06:00",
          canje_desde: "2026-11-01T00:00:00-06:00",
          canje_hasta: "2026-12-01T00:00:00-06:00",
          fase: "acumulacion",
          acumulando: 30,
          disponible: 0,
          reservado: 0,
          utilizado: 0,
          cerrado: 0,
        },
      ],
      premios: [
        {
          id: "rew-reta",
          nombre: "Reta Gratuita",
          descripcion: "Una reta sin costo",
          costo_puntos: 50,
          tipo: "reta_gratis",
          condiciones: "Cancha central",
          inventario_restante: 10,
          limite_por_jugador: 1,
          campaign_id: "camp-oct",
          campana: "Octubre Loco",
          canje_hasta: "2026-12-01T00:00:00-06:00",
        },
      ],
      canjes: [],
    });

    const mockParts = [
      {
        id: "p1",
        evento_id: "e1",
        tipo_evento: "reta_equipos",
        evento_nombre: "Reta Sabatina",
        fecha: "2026-10-10",
      },
      {
        id: "p2",
        evento_id: "e2",
        tipo_evento: "round_robin",
        evento_nombre: "Reta Dominical",
        fecha: "2026-10-11",
      },
      {
        id: "p3",
        evento_id: "e3",
        tipo_evento: "americano",
        evento_nombre: "Americano Nocturno",
        fecha: "2026-10-15",
      },
    ];

    root = createRoot(container);
    await act(async () => {
      root.render(
        <JugadorRewardsPanel
          mode="player"
          jugadorId="jug-1"
          clubName="Padelito Warehouse"
          currentUser={{ id: "auth-jug-1", email: "jugador@club.com" }}
          participaciones={mockParts}
        />
      );
    });
    await flush();

    // Encabezado
    expect(container.textContent).toContain("Octubre Loco");
    expect(container.textContent).toContain("Padelito Warehouse");
    expect(container.textContent).toContain("Acumulación activa");
    expect(container.textContent).toContain("Acumula en octubre · Canjea en noviembre");

    // 4 Métricas
    expect(container.textContent).toContain("Participaciones");
    expect(container.textContent).toContain("3"); // 3 retas elegibles
    expect(container.textContent).toContain("Acumulando");
    expect(container.textContent).toContain("30"); // 30 pts

    // Próxima recompensa
    expect(container.textContent).toContain("Reta Gratuita");
    expect(container.textContent).toContain("30 / 50 pts");
    expect(container.textContent).toContain("Te faltan 20 puntos");
    // 30 pts entre 3 retas = 10 pts/reta -> 20 pts restantes = 2 retas válidas
    expect(container.textContent).toContain("2 retas válidas de 10 puntos");

    // Historial con modalidades legibles
    expect(container.textContent).toContain("Reta por equipos");
    expect(container.textContent).toContain("Round robin");
    expect(container.textContent).toContain("Americano");
  });

  test("4. Jugador en fase de canje con saldo suficiente puede solicitar premio", async () => {
    mockPlayerSnapshot.mockResolvedValue({
      organizador_id: "org-padelito",
      saldos: [
        {
          campaign_id: "camp-sep",
          nombre: "Septiembre Élite",
          acumula_desde: "2026-09-01T00:00:00-06:00",
          acumula_hasta: "2026-10-01T00:00:00-06:00",
          canje_desde: "2026-10-01T00:00:00-06:00",
          canje_hasta: "2026-11-01T00:00:00-06:00",
          fase: "canje",
          acumulando: 0,
          disponible: 60,
          reservado: 0,
          utilizado: 0,
          cerrado: 0,
        },
      ],
      premios: [
        {
          id: "rew-1",
          nombre: "Tubo de Pelotas",
          descripcion: "Tubo presurizado",
          costo_puntos: 40,
          tipo: "producto",
          condiciones: "En recepción",
          inventario_restante: 3,
          limite_por_jugador: 1,
          campaign_id: "camp-sep",
          campana: "Septiembre Élite",
          canje_hasta: "2026-11-01T00:00:00-06:00",
        },
      ],
      canjes: [],
    });
    mockPlayerRequestRedemption.mockResolvedValue("red-99");
    window.confirm = jest.fn(() => true);

    root = createRoot(container);
    await act(async () => {
      root.render(
        <JugadorRewardsPanel
          mode="player"
          jugadorId="jug-1"
          clubName="Padelito Warehouse"
          currentUser={{ id: "auth-jug-1" }}
        />
      );
    });
    await flush();

    expect(container.textContent).toContain("Ventana de canje activa");
    expect(container.textContent).toContain("60"); // 60 pts disponibles

    const requestBtn = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (btn) => btn.textContent === "Solicitar" && !btn.disabled
    );
    expect(requestBtn).toBeDefined();

    await act(async () => {
      requestBtn?.click();
    });
    await flush();

    expect(mockPlayerRequestRedemption).toHaveBeenCalledWith(
      "org-padelito",
      "rew-1",
      "jug-1"
    );
  });

  test("5. Permite alternar entre múltiples campañas activas mediante el selector", async () => {
    mockPlayerSnapshot.mockResolvedValue({
      organizador_id: "org-padelito",
      saldos: [
        {
          campaign_id: "camp-canje",
          nombre: "Septiembre Canje",
          acumula_desde: "2026-09-01T00:00:00-06:00",
          acumula_hasta: "2026-10-01T00:00:00-06:00",
          canje_desde: "2026-10-01T00:00:00-06:00",
          canje_hasta: "2026-11-01T00:00:00-06:00",
          fase: "canje",
          acumulando: 0,
          disponible: 50,
          reservado: 0,
          utilizado: 0,
          cerrado: 0,
        },
        {
          campaign_id: "camp-acum",
          nombre: "Octubre Acumulación",
          acumula_desde: "2026-10-01T00:00:00-06:00",
          acumula_hasta: "2026-11-01T00:00:00-06:00",
          canje_desde: "2026-11-01T00:00:00-06:00",
          canje_hasta: "2026-12-01T00:00:00-06:00",
          fase: "acumulacion",
          acumulando: 20,
          disponible: 0,
          reservado: 0,
          utilizado: 0,
          cerrado: 0,
        },
      ],
      premios: [],
      canjes: [],
    });

    root = createRoot(container);
    await act(async () => {
      root.render(
        <JugadorRewardsPanel
          mode="player"
          jugadorId="jug-1"
          currentUser={{ id: "auth-jug-1" }}
        />
      );
    });
    await flush();

    // Por defecto preselecciona la campaña en fase de canje
    expect(container.textContent).toContain("Septiembre Canje");
    expect(container.textContent).toContain("Ventana de canje activa");

    // Buscar la píldora de Octubre Acumulación
    const octPill = Array.from(container.querySelectorAll<HTMLButtonElement>(".rrw-campaign-pill")).find(
      (btn) => btn.textContent?.includes("Octubre Acumulación")
    );
    expect(octPill).toBeDefined();

    await act(async () => {
      octPill?.click();
    });
    await flush();

    expect(container.textContent).toContain("Octubre Acumulación");
    expect(container.textContent).toContain("Acumulación activa");
    expect(container.textContent).toContain("20");
  });
});
