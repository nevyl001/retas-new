/**
 * @jest-environment jsdom
 *
 * Regresiones del incidente de rendimiento 2026-08-05 (ficha pública de
 * jugador tardando 15s+):
 *  1. Una carga colgada debe terminar en un error con reintento, nunca en
 *     el skeleton para siempre (withTimeout).
 *  2. Una falla en la derivación de datos secundarios (últimos resultados /
 *     stats) no debe dejar la ficha completa en blanco -- el nombre,
 *     ranking y puntos ya cargados deben seguir visibles.
 */
import React from "react";
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getPublicPlayerProfileData } from "../../lib/rivieraJugadores/getPublicPlayerProfileData";
import { prefetchOrganizerDisplayNames } from "../../lib/rivieraJugadores/grantedRankingDisplay";
import { JugadorPublicFicha } from "./JugadorPublicFicha";
import type { RivieraJugadorWithStats } from "../../lib/rivieraJugadores/types";

jest.mock("../../lib/rivieraJugadores/getPublicPlayerProfileData", () => ({
  getPublicPlayerProfileData: jest.fn(),
}));

jest.mock("../../lib/rivieraJugadores/grantedRankingDisplay", () => ({
  ...jest.requireActual("../../lib/rivieraJugadores/grantedRankingDisplay"),
  prefetchOrganizerDisplayNames: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../club-experience", () => ({
  ClubExperienceScope: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  getOrganizerCelebrateTagline: () => "¡Gracias por jugar!",
}));

// Componentes pesados de la sección de éxito: stubs mínimos -- esta suite
// prueba resiliencia de carga/errores de JugadorPublicFicha, no el detalle
// visual de cada hijo (ya cubierto por sus propias pruebas).
jest.mock("./JugadorPuntosBreakdown", () => ({
  JugadorPuntosBreakdown: () => <div data-testid="puntos-breakdown" />,
}));
jest.mock("./JugadorOfficialRomcPuntos", () => ({
  JugadorOfficialRomcPuntos: () => <div data-testid="romc-puntos" />,
}));
jest.mock("./JugadorPublicHistorial", () => ({
  JugadorPublicHistorial: () => <div data-testid="historial" />,
}));
jest.mock("./RatingNivel", () => ({
  RatingNivel: () => <div data-testid="rating-nivel" />,
}));
jest.mock("./JugadorPublicFichaAside", () => ({
  JugadorPublicFichaAside: () => <div data-testid="ficha-aside" />,
  JugadorPublicRecentResults: ({
    recent,
  }: {
    recent: unknown[];
  }) => <div data-testid="recent-results">{recent.length}</div>,
}));
jest.mock("./JugadorRedesPublicas", () => ({
  JugadorRedesPublicas: () => null,
}));

const mockGetProfile = getPublicPlayerProfileData as jest.Mock;

function jugador(
  overrides: Partial<RivieraJugadorWithStats> = {}
): RivieraJugadorWithStats {
  return {
    id: "j1",
    nombre: "Luis Miguel",
    slug: "luis-miguel",
    categoria: "5ta_fuerza",
    genero: "M",
    organizador_id: "org-1",
    estado: "activo",
    visible_publico: true,
    rating: 3,
    rating_partidos: 10,
    rating_fiabilidad: 0.4,
    ...overrides,
  } as RivieraJugadorWithStats;
}

function profileFixture(
  overrides: Partial<ReturnType<typeof buildProfile>> = {}
) {
  return { ...buildProfile(), ...overrides };
}

function buildProfile() {
  return {
    jugador: jugador(),
    identity: { homeOrganizadorId: "org-1" } as never,
    viewingOrgId: "org-1",
    hasOrgContext: true,
    localRankingPos: 5,
    historialGlobal: [],
    historialMain: [],
    historialOtrosClubes: [],
    historialRating: [],
    career: {} as never,
  };
}

const mockPrefetchNames = prefetchOrganizerDisplayNames as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  // CRA jest config trae resetMocks:true -- hay que volver a fijar el valor
  // resuelto en cada test (mismo motivo que en concedidoClubView.test.ts).
  mockPrefetchNames.mockResolvedValue(undefined);
});

describe("JugadorPublicFicha — resiliencia de carga (incidente 2026-08-05)", () => {
  it("muestra el skeleton mientras la carga está en vuelo (nunca pantalla en blanco sin aviso)", async () => {
    mockGetProfile.mockImplementation(() => new Promise(() => {})); // nunca resuelve en este test

    render(<JugadorPublicFicha slug="luis-miguel" />);

    expect(screen.getByLabelText("Cargando perfil")).toBeInTheDocument();
    // El techo real de espera (withTimeout, 20s) ya se prueba de forma
    // aislada y rápida (con fake timers) en src/lib/async/withTimeout.test.ts
    // -- no se re-espera acá para no volver esta suite lenta.
  });

  it("reintentar tras un error vuelve a llamar a getPublicPlayerProfileData", async () => {
    mockGetProfile.mockRejectedValueOnce({
      code: "PGRST301",
      message: "JWT expired",
    });
    mockGetProfile.mockResolvedValueOnce(profileFixture());

    render(<JugadorPublicFicha slug="luis-miguel" />);

    const retry = await screen.findByRole("button", { name: "Reintentar" });
    expect(screen.getByText(/JWT expired/)).toBeInTheDocument();
    expect(screen.queryByText("[object Object]")).not.toBeInTheDocument();

    await userEvent.click(retry);

    await waitFor(() => {
      expect(screen.getByText("Luis Miguel")).toBeInTheDocument();
    });
    expect(mockGetProfile).toHaveBeenCalledTimes(2);
  });

  it("falla al derivar datos secundarios no deja la ficha en blanco: nombre y ranking se ven igual", async () => {
    // historialMain con una fila que rompe la derivación de historialItems
    // (participacionToHistorialItem espera .fecha string válido) --
    // confirma que el try/catch de la derivación degrada esa sección sola.
    mockGetProfile.mockResolvedValueOnce(
      profileFixture({
        historialMain: [
          { fecha: undefined } as never,
        ],
      })
    );

    render(<JugadorPublicFicha slug="luis-miguel" />);

    await waitFor(() => {
      expect(screen.getByText("Luis Miguel")).toBeInTheDocument();
    });
    // Ranking y aside (datos "críticos") se ven aunque el historial secundario
    // haya tenido un dato corrupto.
    expect(screen.getByText("#5")).toBeInTheDocument();
    expect(screen.getByTestId("ficha-aside")).toBeInTheDocument();
  });

  it("no llama a getPublicPlayerProfileData más de una vez por carga (sin duplicados)", async () => {
    mockGetProfile.mockResolvedValueOnce(profileFixture());
    render(<JugadorPublicFicha slug="luis-miguel" />);
    await waitFor(() => {
      expect(screen.getByText("Luis Miguel")).toBeInTheDocument();
    });
    expect(mockGetProfile).toHaveBeenCalledTimes(1);
    expect(prefetchOrganizerDisplayNames).toHaveBeenCalledTimes(1);
  });
});
