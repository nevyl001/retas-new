/**
 * @jest-environment jsdom
 */
/* eslint-disable testing-library/no-unnecessary-act */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { RivieraJugadorWithStats } from "../../lib/rivieraJugadores/types";
import { JugadorFicha } from "./JugadorFicha";
import { getRivieraJugadorBySlug } from "../../lib/rivieraJugadores/rivieraJugadoresService";
import { getAdminPlayerProfileData } from "../../lib/rivieraJugadores/getAdminPlayerProfileData";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const mockRewardsPanelProps = jest.fn();

jest.mock("./JugadorRewardsPanel", () => ({
  JugadorRewardsPanel: (props: unknown) => {
    mockRewardsPanelProps(props);
    return <div data-testid="rewards-panel-stub">Rewards Desk Stub</div>;
  },
}));

jest.mock("../../contexts/UserContext", () => ({
  useUser: () => ({ user: { id: "org-1" } }),
}));

jest.mock("../../club-experience", () => ({
  useClubExperience: () => ({ organizadorId: "org-1" }),
}));

jest.mock("../../lib/supabaseClient", () => ({
  supabase: { auth: { getUser: jest.fn() } },
}));

jest.mock("../../lib/rivieraJugadores/playerMembership", () => ({
  canDeleteGlobalPlayer: jest.fn().mockReturnValue(true),
  canRemovePlayerFromCurrentClub: jest.fn().mockReturnValue(false),
  mapPlayerMembershipUiError: (e: unknown) =>
    e instanceof Error ? e.message : "error",
  removePlayerFromCurrentClub: jest.fn(),
}));

jest.mock("../../lib/rivieraJugadores/playerPoolSync", () => ({
  syncLegacyPlayersFromRivieraRegistry: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../lib/rivieraJugadores/rivieraJugadoresService", () => ({
  getRivieraJugadorBySlug: jest.fn(),
  updateRivieraJugador: jest.fn(),
  deleteRivieraJugador: jest.fn(),
  deleteParticipacionJugador: jest.fn(),
}));

jest.mock("../../lib/rivieraJugadores/getAdminPlayerProfileData", () => ({
  getAdminPlayerProfileData: jest.fn(),
}));

const mockGetRivieraJugadorBySlug = getRivieraJugadorBySlug as jest.Mock;
const mockGetAdminPlayerProfileData = getAdminPlayerProfileData as jest.Mock;

function mockBuildJugador(): RivieraJugadorWithStats {
  return {
    id: "jugador-1",
    nombre: "Daniel Garcia",
    slug: "daniel-garcia",
    foto_url: null,
    email: null,
    telefono: null,
    whatsapp: null,
    nivel: "intermedio",
    categoria: "open",
    edad: null,
    mano_dominante: null,
    en_cancha: null,
    pais_codigo: null,
    instagram_url: null,
    facebook_url: null,
    tiktok_url: null,
    visible_publico: true,
    suma_ranking: true,
    genero: "M",
    fecha_nacimiento: null,
    club: null,
    organizador_id: "org-1",
    estado: "activo",
    legacy_player_id: null,
    legacy_liga_jugador_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    rating: 3,
    rating_partidos: 0,
    rating_fiabilidad: 0,
    concedidoPorAdmin: false,
    stats: null,
  };
}

async function flushUntilLoaded(container: HTMLDivElement) {
  for (let i = 0; i < 20; i++) {
    if (!container.textContent?.includes("Cargando ficha")) return;
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

describe("JugadorFicha — integración de Riviera Rewards", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    mockGetRivieraJugadorBySlug.mockResolvedValue(mockBuildJugador());
    mockGetAdminPlayerProfileData.mockResolvedValue(null);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.clearAllMocks();
  });

  test("renderiza JugadorRewardsPanel con mode='admin', organizadorId y jugadorId correctos", async () => {
    root = createRoot(container);
    await act(async () => {
      root.render(<JugadorFicha slug="daniel-garcia" />);
    });
    await flushUntilLoaded(container);

    expect(container.textContent).toContain("Daniel Garcia");
    expect(container.querySelector('[data-testid="rewards-panel-stub"]')).not.toBeNull();
    expect(mockRewardsPanelProps).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "admin",
        organizadorId: "org-1",
        jugadorId: "jugador-1",
      })
    );
  });
});
