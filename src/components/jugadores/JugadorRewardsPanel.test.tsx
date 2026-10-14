/**
 * @jest-environment jsdom
 */
/* eslint-disable testing-library/no-unnecessary-act */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JugadorRewardsPanel, isValidClubDisplayName } from "./JugadorRewardsPanel";
import * as rewardsApi from "../../lib/rewards/api";
import { rememberOrganizerDisplayName } from "../../lib/organizer/organizerDisplayName";

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
    playerPublicSummary: jest.fn(),
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
const mockPlayerSnapshot = rewardsApi.playerSnapshot as jest.Mock;
const mockPlayerRequestRedemption = rewardsApi.playerRequestRedemption as jest.Mock;
const mockPlayerPublicSummary = rewardsApi.playerPublicSummary as jest.Mock;

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
    mockPlayerPublicSummary.mockResolvedValue([]);
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

  test("2. Usuario con sesión pero no vinculado ve aviso institucional sin exponer puntos", async () => {
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
    expect(container.textContent).toContain("Puntos y Recompensas del Club");
    expect(container.textContent).toContain("Programa Oficial");
    expect(container.textContent).toContain("¿Eres el propietario de este perfil?");
    expect(container.textContent).toContain("otro@club.com");
    expect(container.textContent).not.toContain("Acceso restringido");
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

describe("JugadorRewardsPanel — Fidelización Multiclub y Resolución de Identidad", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    mockPlayerSnapshot.mockReset();
    mockPlayerRequestRedemption.mockReset();
    mockPlayerPublicSummary.mockResolvedValue([]);
    rememberOrganizerDisplayName("org-padelito", "Padelito Warehouse");
    rememberOrganizerDisplayName("org-hack", "Hack Padel");
  });

  afterEach(() => {
    act(() => {
      if (root) root.unmount();
    });
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

  test("1. Jugador registrado en Hack Padel que participa en Padelito consulta saldo de Padelito sin error", async () => {
    mockPlayerSnapshot.mockResolvedValue({
      organizador_id: "org-padelito",
      jugador_id: "padel-jug-id",
      saldos: [
        {
          campaign_id: "camp-padelito",
          nombre: "Padelito Rewards Octubre",
          acumula_desde: "2026-10-01T00:00:00-06:00",
          acumula_hasta: "2026-11-01T00:00:00-06:00",
          canje_desde: "2026-11-01T00:00:00-06:00",
          canje_hasta: "2026-12-01T00:00:00-06:00",
          fase: "acumulacion",
          acumulando: 85,
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
          jugadorId="hack-jug-id"
          organizadorId="org-padelito"
          clubName="Padelito Warehouse"
          currentUser={{ id: "auth-carlos-1" }}
          linkedProfiles={[
            { jugadorId: "hack-jug-id", organizadorId: "org-hack" },
            { jugadorId: "padel-jug-id", organizadorId: "org-padelito" },
          ]}
        />
      );
    });
    await flush();

    // Debe invocar snapshot con el jugador local de Padelito y el org de Padelito
    expect(mockPlayerSnapshot).toHaveBeenCalledWith("padel-jug-id", "org-padelito");
    expect(container.textContent).toContain("Padelito Rewards Octubre");
    expect(container.textContent).toContain("85");
    expect(container.textContent).not.toContain("Acceso restringido");
  });

  test("2. Fallback automático multiclub si el club de origen no tiene vinculación pero el club activo sí", async () => {
    // Primera llamada (hack-jug-id en org-hack): falla con cuenta no vinculada
    mockPlayerSnapshot.mockRejectedValueOnce(new Error("Esta cuenta no está vinculada a este jugador"));
    // Segunda llamada (fallback a padel-jug-id en org-padelito): éxito
    mockPlayerSnapshot.mockResolvedValueOnce({
      organizador_id: "org-padelito",
      jugador_id: "padel-jug-id",
      saldos: [
        {
          campaign_id: "camp-padelito",
          nombre: "Padelito Fidelidad",
          acumula_desde: "2026-10-01T00:00:00-06:00",
          acumula_hasta: "2026-11-01T00:00:00-06:00",
          canje_desde: "2026-11-01T00:00:00-06:00",
          canje_hasta: "2026-12-01T00:00:00-06:00",
          fase: "acumulacion",
          acumulando: 45,
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
          jugadorId="hack-jug-id"
          organizadorId="org-hack"
          clubName="Hack Padel"
          currentUser={{ id: "auth-carlos-1" }}
          linkedProfiles={[
            { jugadorId: "hack-jug-id", organizadorId: "org-hack" },
            { jugadorId: "padel-jug-id", organizadorId: "org-padelito" },
          ]}
        />
      );
    });
    await flush();

    // Comprobar que reintentó con Padelito y mostró los datos en vez de bloquear
    expect(mockPlayerSnapshot).toHaveBeenCalledTimes(2);
    expect(mockPlayerSnapshot).toHaveBeenLastCalledWith("padel-jug-id", "org-padelito");
    expect(container.textContent).toContain("Padelito Fidelidad");
    expect(container.textContent).not.toContain("Acceso restringido");
  });

  test("3. Jugador con participación en dos clubes puede alternar entre ellos mediante el selector de club", async () => {
    mockPlayerSnapshot.mockImplementation((jugId: string, orgId?: string) => {
      if (orgId === "org-hack") {
        return Promise.resolve({
          organizador_id: "org-hack",
          jugador_id: "hack-jug-id",
          saldos: [
            {
              campaign_id: "camp-hack",
              nombre: "Hack Padel Campaña",
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
          premios: [],
          canjes: [],
        });
      }
      return Promise.resolve({
        organizador_id: "org-padelito",
        jugador_id: "padel-jug-id",
        saldos: [
          {
            campaign_id: "camp-padelito",
            nombre: "Padelito Campaña",
            acumula_desde: "2026-10-01T00:00:00-06:00",
            acumula_hasta: "2026-11-01T00:00:00-06:00",
            canje_desde: "2026-11-01T00:00:00-06:00",
            canje_hasta: "2026-12-01T00:00:00-06:00",
            fase: "acumulacion",
            acumulando: 70,
            disponible: 0,
            reservado: 0,
            utilizado: 0,
            cerrado: 0,
          },
        ],
        premios: [],
        canjes: [],
      });
    });

    root = createRoot(container);
    await act(async () => {
      root.render(
        <JugadorRewardsPanel
          mode="player"
          jugadorId="hack-jug-id"
          organizadorId="org-hack"
          currentUser={{ id: "auth-carlos-1" }}
          linkedProfiles={[
            { jugadorId: "hack-jug-id", organizadorId: "org-hack" },
            { jugadorId: "padel-jug-id", organizadorId: "org-padelito" },
          ]}
        />
      );
    });
    await flush();

    // Inicialmente cargó Hack Padel (30 pts)
    expect(container.textContent).toContain("Hack Padel Campaña");
    expect(container.textContent).toContain("30");

    // Existe el selector multiclub
    const clubSelector = container.querySelector(".rrw-club-selector");
    expect(clubSelector).not.toBeNull();

    // Buscar botón del segundo club (Padelito)
    const clubBtns = Array.from(container.querySelectorAll<HTMLButtonElement>(".rrw-club-selector button"));
    expect(clubBtns.length).toBe(2);

    await act(async () => {
      clubBtns[1].click();
    });
    await flush();

    // Ahora muestra Padelito Campaña con 70 pts separados
    expect(mockPlayerSnapshot).toHaveBeenLastCalledWith("padel-jug-id", "org-padelito");
    expect(container.textContent).toContain("Padelito Campaña");
    expect(container.textContent).toContain("70");
  });

  test("4. Solicitud de premio se ejecuta estrictamente contra el club correspondiente y con su ID local", async () => {
    mockPlayerSnapshot.mockResolvedValue({
      organizador_id: "org-padelito",
      jugador_id: "padel-jug-id",
      saldos: [
        {
          campaign_id: "camp-padelito-canje",
          nombre: "Padelito Canje",
          acumula_desde: "2026-09-01T00:00:00-06:00",
          acumula_hasta: "2026-10-01T00:00:00-06:00",
          canje_desde: "2026-10-01T00:00:00-06:00",
          canje_hasta: "2026-11-01T00:00:00-06:00",
          fase: "canje",
          acumulando: 0,
          disponible: 100,
          reservado: 0,
          utilizado: 0,
          cerrado: 0,
        },
      ],
      premios: [
        {
          id: "rew-bote",
          nombre: "Tubo de Pelotas Bullpadel",
          descripcion: null,
          costo_puntos: 40,
          tipo: "fisico",
          condiciones: null,
          inventario_restante: 5,
          limite_por_jugador: 2,
          campaign_id: "camp-padelito-canje",
          campana: "Padelito Canje",
          canje_hasta: "2026-11-01T00:00:00-06:00",
        },
      ],
      canjes: [],
    });
    mockPlayerRequestRedemption.mockResolvedValue("red-777");
    window.confirm = jest.fn(() => true);

    root = createRoot(container);
    await act(async () => {
      root.render(
        <JugadorRewardsPanel
          mode="player"
          jugadorId="hack-jug-id"
          organizadorId="org-padelito"
          currentUser={{ id: "auth-carlos-1" }}
          linkedProfiles={[
            { jugadorId: "hack-jug-id", organizadorId: "org-hack" },
            { jugadorId: "padel-jug-id", organizadorId: "org-padelito" },
          ]}
        />
      );
    });
    await flush();

    const solicitBtn = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.textContent === "Solicitar" && !b.disabled
    );
    expect(solicitBtn).toBeDefined();

    await act(async () => {
      solicitBtn?.click();
    });
    await flush();

    // La solicitud se emite con org-padelito y padel-jug-id
    expect(mockPlayerRequestRedemption).toHaveBeenCalledWith(
      "org-padelito",
      "rew-bote",
      "padel-jug-id"
    );
  });

  test("5. Aislamiento estricto: participaciones de otro club no se cuentan en la campaña del club activo", async () => {
    mockPlayerSnapshot.mockResolvedValue({
      organizador_id: "org-padelito",
      jugador_id: "padel-jug-id",
      saldos: [
        {
          campaign_id: "camp-padelito",
          nombre: "Campaña Padelito",
          acumula_desde: "2026-10-01T00:00:00-06:00",
          acumula_hasta: "2026-11-01T00:00:00-06:00",
          canje_desde: "2026-11-01T00:00:00-06:00",
          canje_hasta: "2026-12-01T00:00:00-06:00",
          fase: "acumulacion",
          acumulando: 25,
          disponible: 0,
          reservado: 0,
          utilizado: 0,
          cerrado: 0,
        },
      ],
      premios: [],
      canjes: [],
    });

    const participacionesMixtas = [
      {
        id: "part-1",
        evento_id: "ev-1",
        tipo_evento: "reta",
        evento_nombre: "Reta Padelito",
        fecha: "2026-10-10T18:00:00Z",
        metadata: { organizador_id: "org-padelito" },
      },
      {
        id: "part-2",
        evento_id: "ev-2",
        tipo_evento: "reta",
        evento_nombre: "Reta Hack Padel",
        fecha: "2026-10-12T18:00:00Z",
        metadata: { organizador_id: "org-hack" }, // Pertenece a otro club
      },
    ];

    root = createRoot(container);
    await act(async () => {
      root.render(
        <JugadorRewardsPanel
          mode="player"
          jugadorId="padel-jug-id"
          organizadorId="org-padelito"
          currentUser={{ id: "auth-carlos-1" }}
          participaciones={participacionesMixtas}
        />
      );
    });
    await flush();

    // Solo debe listar la reta de Padelito
    expect(container.textContent).toContain("Reta Padelito");
    expect(container.textContent).not.toContain("Reta Hack Padel");
    expect(container.textContent).toContain("Retas en campaña");
  });

  test("6. Usuario que visita el perfil de otro jugador ve presentación institucional sin exponer saldos", async () => {
    mockPlayerSnapshot.mockRejectedValue(new Error("Esta cuenta no está vinculada a este jugador"));

    root = createRoot(container);
    await act(async () => {
      root.render(
        <JugadorRewardsPanel
          mode="player"
          jugadorId="maria-jug-id"
          organizadorId="org-padelito"
          currentUser={{ id: "auth-carlos-1", email: "carlos@test.com" }}
        />
      );
    });
    await flush();

    expect(container.textContent).toContain("Puntos y Recompensas del Club");
    expect(container.textContent).toContain("Programa Oficial");
    expect(container.textContent).not.toContain("Acceso restringido");
    expect(container.querySelector(".rrw-kpi-grid--player")).toBeNull();
  });

  test("7. Visitante sin sesión ve tarjeta de fidelización con botón de iniciar sesión", async () => {
    root = createRoot(container);
    await act(async () => {
      root.render(
        <JugadorRewardsPanel
          mode="player"
          jugadorId="jug-anon"
          currentUser={null}
        />
      );
    });
    await flush();

    expect(container.textContent).toContain("Programa de fidelización y recompensas");
    expect(container.textContent).toContain("Iniciar sesión");
    expect(mockPlayerSnapshot).not.toHaveBeenCalled();
  });
});

describe("Riviera Rewards — Verificaciones de seguridad y visibilidad multiclub (Requisito 6)", () => {
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
    rememberOrganizerDisplayName("org-padelito", "Padelito Warehouse");
    rememberOrganizerDisplayName("org-hack", "Hack Padel");
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

  test("1. Propietario autenticado y vinculado: consulta campaña, club, métricas, progreso y disclaimer", async () => {
    mockPlayerSnapshot.mockResolvedValue({
      organizador_id: "org-padelito",
      saldos: [
        {
          campaign_id: "camp-1",
          nombre: "Campaña Apertura",
          fase: "canje",
          acumulando: 80,
          disponible: 60,
          reservado: 20,
          utilizado: 0,
          cerrado: 0,
          acumula_desde: "2026-09-01T00:00:00Z",
          acumula_hasta: "2026-10-01T00:00:00Z",
          canje_desde: "2026-10-01T00:00:00Z",
          canje_hasta: "2026-11-01T00:00:00Z",
        },
      ],
      premios: [
        {
          id: "rew-1",
          nombre: "Gorra Oficial",
          descripcion: "Gorra del club",
          costo_puntos: 100,
          tipo: "producto",
          condiciones: null,
          inventario_restante: 5,
          limite_por_jugador: 1,
          campaign_id: "camp-1",
          campana: "Campaña Apertura",
          canje_hasta: "2026-11-01T00:00:00Z",
        },
      ],
      canjes: [],
    });

    root = createRoot(container);
    await act(async () => {
      root.render(
        <JugadorRewardsPanel
          mode="player"
          jugadorId="j-carlos"
          organizadorId="org-padelito"
          clubName="Padelito Warehouse"
          currentUser={{ id: "auth-carlos", email: "carlos@padelito.com" }}
        />
      );
    });
    await flush();

    expect(container.textContent).toContain("Campaña Apertura");
    expect(container.textContent).toContain("Padelito Warehouse");
    expect(container.textContent).toContain("Disponibles");
    expect(container.textContent).toContain("60");
    expect(container.textContent).toContain("Reservados");
    expect(container.textContent).toContain("20");
    expect(container.textContent).toContain("Gorra Oficial");
    expect(container.textContent).toContain("60 / 100 pts");
    expect(container.textContent).toContain("independiente al puntaje del ranking deportivo");
  });

  test("2. Propietario sin vinculación: muestra indicación clara del procedimiento autorizado con su correo", async () => {
    mockPlayerSnapshot.mockRejectedValue(new Error("Esta cuenta no está vinculada a este jugador"));

    root = createRoot(container);
    await act(async () => {
      root.render(
        <JugadorRewardsPanel
          mode="player"
          jugadorId="j-carlos"
          organizadorId="org-padelito"
          clubName="Padelito Warehouse"
          currentUser={{ id: "auth-carlos", email: "carlos@padelito.com" }}
        />
      );
    });
    await flush();

    expect(container.textContent).toContain("Programa Oficial");
    expect(container.textContent).toContain("¿Eres el propietario de este perfil?");
    expect(container.textContent).toContain("carlos@padelito.com");
    expect(container.textContent).toContain("solicita en la administración o recepción del club organizador que vinculen tu cuenta");
    expect(container.textContent).not.toContain("Acceso restringido");
  });

  test("3. Visitante anónimo: presentación institucional discreta con botón de login y sin llamar a RPC privada", async () => {
    root = createRoot(container);
    await act(async () => {
      root.render(
        <JugadorRewardsPanel
          mode="player"
          jugadorId="j-anon"
          organizadorId="org-padelito"
          currentUser={null}
        />
      );
    });
    await flush();

    expect(container.textContent).toContain("Programa de fidelización y recompensas");
    expect(container.textContent).toContain("Iniciar sesión para consultar tus puntos");
    expect(mockPlayerSnapshot).not.toHaveBeenCalled();
  });

  test("4. Usuario autenticado que consulta otro perfil: sustituye mensaje agresivo por presentación institucional", async () => {
    mockPlayerSnapshot.mockRejectedValue(new Error("Esta cuenta no está vinculada a este jugador"));

    root = createRoot(container);
    await act(async () => {
      root.render(
        <JugadorRewardsPanel
          mode="player"
          jugadorId="j-otro"
          organizadorId="org-padelito"
          currentUser={{ id: "auth-visitante", email: "visitante@externo.com" }}
        />
      );
    });
    await flush();

    expect(container.textContent).not.toContain("Acceso restringido");
    expect(container.textContent).not.toContain("Este perfil pertenece a otro jugador");
    expect(container.textContent).toContain("Puntos y Recompensas del Club");
    expect(container.querySelector(".rrw-kpi-grid--player")).toBeNull();
  });

  test("5. Jugador multiclub: conserva saldos separados por club y permite alternar entre clubes", async () => {
    mockPlayerSnapshot.mockImplementation((_jId: string, orgId?: string) => {
      if (orgId === "org-hack") {
        return Promise.resolve({
          organizador_id: "org-hack",
          saldos: [
            {
              campaign_id: "camp-hack",
              nombre: "Torneo Anual Hack",
              fase: "acumulacion",
              acumulando: 50,
              disponible: 0,
              reservado: 0,
              utilizado: 0,
              cerrado: 0,
              acumula_desde: "2026-09-01T00:00:00Z",
              acumula_hasta: "2026-12-01T00:00:00Z",
              canje_desde: "2026-12-01T00:00:00Z",
              canje_hasta: "2027-01-01T00:00:00Z",
            },
          ],
          premios: [],
          canjes: [],
          clubes_autorizados: [
            { organizador_id: "org-padelito", jugador_id: "j-pad" },
            { organizador_id: "org-hack", jugador_id: "j-hack" },
          ],
        });
      }
      return Promise.resolve({
        organizador_id: "org-padelito",
        saldos: [
          {
            campaign_id: "camp-pad",
            nombre: "Liga Padelito Rewards",
            fase: "canje",
            acumulando: 120,
            disponible: 120,
            reservado: 0,
            utilizado: 0,
            cerrado: 0,
            acumula_desde: "2026-08-01T00:00:00Z",
            acumula_hasta: "2026-10-01T00:00:00Z",
            canje_desde: "2026-10-01T00:00:00Z",
            canje_hasta: "2026-11-01T00:00:00Z",
          },
        ],
        premios: [],
        canjes: [],
        clubes_autorizados: [
          { organizador_id: "org-padelito", jugador_id: "j-pad" },
          { organizador_id: "org-hack", jugador_id: "j-hack" },
        ],
      });
    });

    root = createRoot(container);
    await act(async () => {
      root.render(
        <JugadorRewardsPanel
          mode="player"
          jugadorId="j-carlos"
          organizadorId="org-padelito"
          clubName="Padelito Warehouse"
          currentUser={{ id: "auth-carlos", email: "carlos@test.com" }}
          participatingClubIds={["org-padelito", "org-hack"]}
        />
      );
    });
    await flush();

    expect(container.textContent).toContain("Liga Padelito Rewards");
    expect(container.textContent).toContain("120");

    const buttons = container.querySelectorAll<HTMLButtonElement>(".rrw-club-selector button");
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    const hackBtn = Array.from(buttons).find((b) => b.textContent?.includes("Hack Padel"));
    expect(hackBtn).toBeDefined();
    await act(async () => {
      hackBtn?.click();
    });
    await flush();
    expect(container.textContent).toContain("Torneo Anual Hack");
    expect(container.textContent).toContain("50");
  });

  test("6. Campaña sin puntos acreditados: muestra estado en acumulación sin errores ni valores inválidos", async () => {
    mockPlayerSnapshot.mockResolvedValue({
      organizador_id: "org-padelito",
      saldos: [
        {
          campaign_id: "camp-vacia",
          nombre: "Campaña Nueva",
          fase: "acumulacion",
          acumulando: 0,
          disponible: 0,
          reservado: 0,
          utilizado: 0,
          cerrado: 0,
          acumula_desde: "2026-10-01T00:00:00Z",
          acumula_hasta: "2026-11-01T00:00:00Z",
          canje_desde: "2026-11-01T00:00:00Z",
          canje_hasta: "2026-12-01T00:00:00Z",
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
          jugadorId="j-nuevo"
          organizadorId="org-padelito"
          currentUser={{ id: "auth-nuevo", email: "nuevo@club.com" }}
        />
      );
    });
    await flush();

    expect(container.textContent).toContain("Campaña Nueva");
    expect(container.textContent).toContain("Acumulación activa");
    const kpiCards = container.querySelectorAll(".rrw-kpi-card");
    expect(kpiCards.length).toBe(4);
    expect(container.textContent).toContain("No hay retas registradas durante la ventana de esta campaña");
  });

  test("7. Separación estricta entre puntos deportivos y Rewards", async () => {
    mockPlayerSnapshot.mockResolvedValue({
      organizador_id: "org-padelito",
      saldos: [
        {
          campaign_id: "camp-pts",
          nombre: "Recompensas Otoño",
          fase: "canje",
          acumulando: 75,
          disponible: 75,
          reservado: 0,
          utilizado: 0,
          cerrado: 0,
          acumula_desde: "2026-09-01T00:00:00Z",
          acumula_hasta: "2026-10-01T00:00:00Z",
          canje_desde: "2026-10-01T00:00:00Z",
          canje_hasta: "2026-11-01T00:00:00Z",
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
          jugadorId="j-carlos"
          organizadorId="org-padelito"
          currentUser={{ id: "auth-carlos", email: "carlos@club.com" }}
        />
      );
    });
    await flush();

    const disclaimer = container.querySelector(".rrw-independence-disclaimer");
    expect(disclaimer).not.toBeNull();
    expect(disclaimer?.textContent).toContain("independiente al puntaje del ranking deportivo");
  });
});

describe("Riviera Rewards — Corrección Definitiva: Selector Limpio, Fallback y Experiencia Premium", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    mockPlayerSnapshot.mockReset();
    mockPlayerRequestRedemption.mockReset();
    mockListParticipaciones.mockResolvedValue([]);
    mockPlayerPublicSummary.mockResolvedValue([]);
  });

  afterEach(() => {
    act(() => {
      if (root) root.unmount();
    });
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

  test("1. Helper isValidClubDisplayName descarta opciones basura y valida nombres reales", () => {
    expect(isValidClubDisplayName("Club")).toBe(false);
    expect(isValidClubDisplayName("club")).toBe(false);
    expect(isValidClubDisplayName("")).toBe(false);
    expect(isValidClubDisplayName(null)).toBe(false);
    expect(isValidClubDisplayName(undefined)).toBe(false);
    expect(isValidClubDisplayName("pendiente")).toBe(false);
    expect(isValidClubDisplayName("organizador")).toBe(false);
    expect(isValidClubDisplayName("Padelito Warehouse")).toBe(true);
    expect(isValidClubDisplayName("Hack Padel")).toBe(true);
    expect(isValidClubDisplayName("Riviera Open")).toBe(true);
  });

  test("2. Si solo hay 1 club válido, NO se renderiza selector de clubes", async () => {
    rememberOrganizerDisplayName("org-padelito", "Padelito Warehouse");
    mockPlayerSnapshot.mockResolvedValue({
      organizador_id: "org-padelito",
      saldos: [
        {
          campaign_id: "camp-1",
          nombre: "Campaña Única",
          fase: "acumulacion",
          acumulando: 50,
          disponible: 0,
          reservado: 0,
          utilizado: 0,
          cerrado: 0,
          acumula_desde: "2026-10-01T00:00:00Z",
          acumula_hasta: "2026-11-01T00:00:00Z",
          canje_desde: "2026-11-01T00:00:00Z",
          canje_hasta: "2026-12-01T00:00:00Z",
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
          jugadorId="j-1"
          organizadorId="org-padelito"
          clubName="Padelito Warehouse"
          currentUser={{ id: "auth-1", email: "user@test.com" }}
        />
      );
    });
    await flush();

    // No debe haber selector de clubes cuando hay <= 1 club
    expect(container.querySelector(".rrw-club-selector")).toBeNull();
    // Pero sí muestra el club en la ficha
    expect(container.textContent).toContain("Padelito Warehouse");
  });

  test("3. Si un club candidato tiene fallback genérico 'Club', se descarta del selector", async () => {
    // Solo Padelito tiene nombre real recordado, 'org-desconocido' no tiene nombre y devolverá 'Club'
    rememberOrganizerDisplayName("org-padelito", "Padelito Warehouse");
    mockPlayerSnapshot.mockResolvedValue({
      organizador_id: "org-padelito",
      saldos: [
        {
          campaign_id: "camp-1",
          nombre: "Campaña Activa",
          fase: "acumulacion",
          acumulando: 25,
          disponible: 0,
          reservado: 0,
          utilizado: 0,
          cerrado: 0,
          acumula_desde: "2026-10-01T00:00:00Z",
          acumula_hasta: "2026-11-01T00:00:00Z",
          canje_desde: "2026-11-01T00:00:00Z",
          canje_hasta: "2026-12-01T00:00:00Z",
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
          jugadorId="j-1"
          organizadorId="org-padelito"
          clubName="Padelito Warehouse"
          currentUser={{ id: "auth-1", email: "user@test.com" }}
          participatingClubIds={["org-padelito", "org-desconocido"]}
        />
      );
    });
    await flush();

    // Como org-desconocido tiene nombre inválido ('Club'), solo queda Padelito -> no selector de clubes
    expect(container.querySelector(".rrw-club-selector")).toBeNull();
    // Y ningún botón dice 'Club'
    const allButtons = Array.from(container.querySelectorAll("button"));
    const clubGenericButtons = allButtons.filter((b) => b.textContent?.trim() === "Club");
    expect(clubGenericButtons.length).toBe(0);
  });

  test("4. NUNCA renderiza 'ACCESO RESTRINGIDO' ni 'Este perfil pertenece a otro jugador'", async () => {
    mockPlayerSnapshot.mockRejectedValue(new Error("Esta cuenta no está vinculada a este jugador"));

    root = createRoot(container);
    await act(async () => {
      root.render(
        <JugadorRewardsPanel
          mode="player"
          jugadorId="j-otro"
          organizadorId="org-padelito"
          currentUser={{ id: "auth-visitante", email: "visitante@externo.com" }}
        />
      );
    });
    await flush();

    expect(container.textContent).not.toContain("ACCESO RESTRINGIDO");
    expect(container.textContent).not.toContain("Acceso restringido");
    expect(container.textContent).not.toContain("Este perfil pertenece a otro jugador");
    expect(container.textContent).toContain("Puntos y Recompensas del Club");
  });

  test("5. Fallback automático multiclub via RPC snapshot sin organizador (0059)", async () => {
    // 1er intento con org-riviera falla porque el usuario solo tiene cuenta en Padelito
    mockPlayerSnapshot.mockImplementation((_jId: string, orgId?: string) => {
      if (orgId === "org-riviera") {
        return Promise.reject(new Error("Esta cuenta no está vinculada a este jugador"));
      }
      // Consulta sin orgId (fallback 0059) resuelve exitosamente Padelito
      return Promise.resolve({
        organizador_id: "org-padelito",
        saldos: [
          {
            campaign_id: "camp-pad",
            nombre: "Padelito Rewards 2026",
            fase: "acumulacion",
            acumulando: 90,
            disponible: 0,
            reservado: 0,
            utilizado: 0,
            cerrado: 0,
            acumula_desde: "2026-10-01T00:00:00Z",
            acumula_hasta: "2026-11-01T00:00:00Z",
            canje_desde: "2026-11-01T00:00:00Z",
            canje_hasta: "2026-12-01T00:00:00Z",
          },
        ],
        premios: [],
        canjes: [],
      });
    });

    rememberOrganizerDisplayName("org-padelito", "Padelito Warehouse");
    rememberOrganizerDisplayName("org-riviera", "Riviera Open");

    root = createRoot(container);
    await act(async () => {
      root.render(
        <JugadorRewardsPanel
          mode="player"
          jugadorId="j-carlos"
          organizadorId="org-riviera"
          currentUser={{ id: "auth-carlos", email: "carlos@test.com" }}
        />
      );
    });
    await flush();

    // Se ejecutó primero con org-riviera y luego con undefined (fallback)
    expect(mockPlayerSnapshot).toHaveBeenCalledWith("j-carlos", "org-riviera");
    expect(mockPlayerSnapshot).toHaveBeenCalledWith("j-carlos", undefined);
    // Muestra los puntos de Padelito sin marcar desvinculado
    expect(container.textContent).toContain("Padelito Rewards 2026");
    expect(container.textContent).toContain("90");
    expect(container.textContent).not.toContain("ACCESO RESTRINGIDO");
  });

  test("6. Los premios son únicamente donde estén habilitados: restringe el selector exclusivamente al club habilitado", async () => {
    rememberOrganizerDisplayName("org-padelito", "Padelito Warehouse");
    rememberOrganizerDisplayName("org-hackpadel", "Hackpadel");
    rememberOrganizerDisplayName("org-riviera", "Riviera Open");

    mockPlayerSnapshot.mockResolvedValue({
      organizador_id: "org-padelito",
      jugador_id: "j-carlos",
      clubes_autorizados: [
        { organizador_id: "org-padelito", jugador_id: "j-carlos" },
      ],
      saldos: [
        {
          campaign_id: "camp-pad",
          nombre: "Padelito Rewards 2026",
          fase: "canje",
          acumulando: 0,
          disponible: 120,
          reservado: 0,
          utilizado: 0,
          cerrado: 0,
          acumula_desde: "2026-10-01T00:00:00Z",
          acumula_hasta: "2026-11-01T00:00:00Z",
          canje_desde: "2026-11-01T00:00:00Z",
          canje_hasta: "2026-12-01T00:00:00Z",
        },
      ],
      premios: [
        {
          id: "rew-1",
          nombre: "Bolsa de Pelotas",
          descripcion: "Tubo de pelotas oficiales",
          costo_puntos: 100,
          tipo: "articulo",
          condiciones: null,
          inventario_restante: 5,
          limite_por_jugador: 1,
          campaign_id: "camp-pad",
          campana: "Padelito Rewards 2026",
          canje_hasta: "2026-12-01T00:00:00Z",
        },
      ],
      canjes: [],
    });

    root = createRoot(container);
    await act(async () => {
      root.render(
        <JugadorRewardsPanel
          mode="player"
          jugadorId="j-carlos"
          organizadorId="org-hackpadel"
          participatingClubIds={["org-hackpadel", "org-riviera", "org-padelito"]}
          currentUser={{ id: "auth-carlos", email: "carlos@test.com" }}
        />
      );
    });
    await flush();

    // Solo debe mostrar Padelito Warehouse donde tiene premios habilitados
    expect(container.textContent).toContain("Padelito Warehouse");
    expect(container.textContent).toContain("Bolsa de Pelotas");
    expect(container.textContent).toContain("100 pts");
    // No debe ofrecer selector ni opciones para Hackpadel o Riviera Open porque ahí no están habilitados
    expect(container.querySelector(".rrw-club-selector")).toBeNull();
    expect(container.textContent).not.toContain("Hackpadel");
  });

  test("7. Balance de Rewards en el perfil público (Lalo B RIV-00000119 en Padelito Warehouse): muestra resumen de puntos de solo lectura", async () => {
    rememberOrganizerDisplayName("org-padelito", "Padelito Warehouse");

    mockPlayerPublicSummary.mockResolvedValue([
      {
        organizador_id: "org-padelito",
        club_nombre: "Padelito Warehouse",
        campaign_id: "camp-octubre-loco",
        campaign_nombre: "Octubre Loco",
        puntos_acumulados: 10,
        puntos_disponibles: 10,
        puntos_reservados: 0,
        participaciones_count: 1,
        fase: "acumulacion",
        acumula_desde: "2026-10-01T00:00:00Z",
        acumula_hasta: "2026-10-31T23:59:59Z",
        canje_desde: "2026-11-01T00:00:00Z",
        canje_hasta: "2026-11-30T23:59:59Z",
        is_canje_open: false,
      },
    ]);

    // Simula perfil no vinculado en sesión de invitado
    mockPlayerSnapshot.mockRejectedValue(new Error("La cuenta no está vinculada a este jugador"));

    root = createRoot(container);
    await act(async () => {
      root.render(
        <JugadorRewardsPanel
          mode="player"
          jugadorId="jug-lalo"
          organizadorId="org-padelito"
          clubName="Padelito Warehouse"
          rivieraId="RIV-00000119"
          currentUser={null}
        />
      );
    });
    await flush();

    // Comprueba que se consultó el resumen público
    expect(mockPlayerPublicSummary).toHaveBeenCalledWith("jug-lalo", "org-padelito");

    // Muestra los puntos reales de Rewards de la campaña Octubre Loco
    expect(container.textContent).toContain("Octubre Loco");
    expect(container.textContent).toContain("10");
    expect(container.textContent).toContain("Puntos acumulados");
    expect(container.textContent).toContain("Padelito Warehouse");

    // Conserva las acciones de canje protegidas mediante aviso de solo lectura
    expect(container.textContent).toContain("Solo lectura: Aquí puedes ver cuántos puntos has acumulado en la campaña. Solicita a Padelito Warehouse cambiar tus puntos por las promociones vigentes.");
    expect(container.textContent).not.toContain("ACCESO RESTRINGIDO");
  });
});



