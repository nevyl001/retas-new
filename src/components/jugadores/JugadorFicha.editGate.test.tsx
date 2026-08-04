/**
 * Fase B: el panel de edición debía respetar el mismo permiso (`canDelete`)
 * que el botón que lo abre. Antes del fix, `?edit=1` en la URL inicializaba
 * `editOpen=true` directamente y el panel solo chequeaba `isGrantedReadOnly`,
 * exponiendo el formulario editable para jugadores que el usuario actual no
 * puede editar (p. ej. un jugador "concedido" por el Admin Principal).
 *
 * Ver mismo patrón de render real que LigaGestionar.render.test.tsx: no hay
 * @testing-library/react instalada, se usa react-dom/client + act(). jest.mock
 * se hoistea automáticamente por encima de los imports (Jest +
 * babel-plugin-jest-hoist), así que escribirlo después de los imports es
 * equivalente en tiempo de ejecución y respeta la regla import/first.
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

jest.mock("../../contexts/UserContext", () => ({
  useUser: () => ({ user: { id: "org-1" } }),
}));

jest.mock("../../club-experience", () => ({
  useClubExperience: () => ({ organizadorId: "org-1" }),
}));

jest.mock("../../lib/supabaseClient", () => ({
  supabase: { auth: { getUser: jest.fn() } },
}));

const mockCanDeleteGlobalPlayer = jest.fn();
const mockCanRemovePlayerFromCurrentClub = jest.fn();

jest.mock("../../lib/rivieraJugadores/playerMembership", () => ({
  canDeleteGlobalPlayer: (...args: unknown[]) =>
    mockCanDeleteGlobalPlayer(...args),
  canRemovePlayerFromCurrentClub: (...args: unknown[]) =>
    mockCanRemovePlayerFromCurrentClub(...args),
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
    nombre: "Jugador Concedido",
    slug: "jugador-concedido",
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
    concedidoPorAdmin: true,
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

describe("JugadorFicha — gate del panel de edición", () => {
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

  test("ATAQUE: ?edit=1 en la URL NO expone el panel de edición si el usuario no tiene permiso (canDelete=false)", async () => {
    window.history.pushState({}, "", "/jugadores/jugador-concedido?edit=1");
    mockCanDeleteGlobalPlayer.mockReturnValue(false);
    mockCanRemovePlayerFromCurrentClub.mockReturnValue(false);

    root = createRoot(container);
    await act(async () => {
      root.render(<JugadorFicha slug="jugador-concedido" />);
    });
    await flushUntilLoaded(container);

    expect(container.textContent).toContain("Jugador Concedido");
    expect(container.textContent).not.toContain("Datos del jugador");
    expect(container.querySelector("#rj-nombre")).toBeNull();
  });

  test("con permiso (canDelete=true), ?edit=1 sí muestra el panel", async () => {
    window.history.pushState({}, "", "/jugadores/jugador-concedido?edit=1");
    mockCanDeleteGlobalPlayer.mockReturnValue(true);
    mockCanRemovePlayerFromCurrentClub.mockReturnValue(false);

    root = createRoot(container);
    await act(async () => {
      root.render(<JugadorFicha slug="jugador-concedido" />);
    });
    await flushUntilLoaded(container);

    expect(container.textContent).toContain("Jugador Concedido");
    expect(container.textContent).toContain("Datos del jugador");
    expect(container.querySelector("#rj-nombre")).not.toBeNull();
  });
});
