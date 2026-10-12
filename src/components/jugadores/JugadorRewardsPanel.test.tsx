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
const mockPlayerSnapshot = rewardsApi.playerSnapshot as jest.Mock;
const mockPlayerRequestRedemption = rewardsApi.playerRequestRedemption as jest.Mock;

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

describe("JugadorRewardsPanel — Fidelización Multiclub y Resolución de Identidad", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    mockPlayerSnapshot.mockReset();
    mockPlayerRequestRedemption.mockReset();
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

  test("6. Usuario que visita el perfil de otro jugador ve Acceso Restringido", async () => {
    mockPlayerSnapshot.mockRejectedValue(new Error("Esta cuenta no está vinculada a este jugador"));

    root = createRoot(container);
    await act(async () => {
      root.render(
        <JugadorRewardsPanel
          mode="player"
          jugadorId="maria-jug-id"
          organizadorId="org-padelito"
          currentUser={{ id: "auth-carlos-1" }}
        />
      );
    });
    await flush();

    expect(container.textContent).toContain("Acceso restringido");
    expect(container.textContent).toContain("Este perfil pertenece a otro jugador");
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
