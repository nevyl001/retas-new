/* eslint-disable testing-library/no-unnecessary-act */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { LigaDetalle, RankingItem } from "../../lib/liga/types";
import { LigaDetallePublica } from "./LigaDetallePublica";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const mockGetLigaById = jest.fn();
const mockGetRanking = jest.fn();
const mockGetRankingEquipos = jest.fn();
const mockResolveProfiles = jest.fn();

jest.mock("../../services/ligaService", () => ({
  getLigaById: (...args: unknown[]) => mockGetLigaById(...args),
  getRanking: (...args: unknown[]) => mockGetRanking(...args),
  getRankingEquipos: (...args: unknown[]) => mockGetRankingEquipos(...args),
  publicLigaJornadaUrl: (ligaId: string, num: number) =>
    `/public/liga/${ligaId}/jornada/${num}`,
}));

jest.mock("../../lib/liga/publicParejaAvatars", () => ({
  resolveLigaJugadorPublicProfiles: (...args: unknown[]) =>
    mockResolveProfiles(...args),
}));

jest.mock("../../hooks/useLigaRealtime", () => ({
  useLigaRealtime: () => undefined,
}));

jest.mock("../../club-experience", () => ({
  ClubExperienceScope: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  PublicEventBrandIdentity: () => <div data-testid="club-identity" />,
  PublicEventNeutralLoading: ({ message }: { message: string }) => (
    <div>{message}</div>
  ),
  PublicScopedBrandGate: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useClubExperience: () => ({ isClubBranded: false }),
  useOrganizerDisplayName: () => "Riviera Open",
}));

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("LigaDetallePublica — identificador oficial RV/RIV en ranking acumulado", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it("muestra el código oficial debajo del nombre en podio (1-3) y filas (4+) sin etiquetas adicionales y omite si no existe", async () => {
    const detalle: LigaDetalle = {
      id: "liga-4ta",
      nombre: "Liga 4ta Advance",
      estado: "in_progress",
      modalidad: "individual_rotativo",
      vueltas: 1,
      organizador_id: "org-1",
      canchas_disponibles: 3,
      fecha_inicio: null,
      fecha_fin: null,
      created_at: "2026-11-01T00:00:00Z",
      inscripciones: [],
      equipos: [],
      jugadores: [],
      jornadas: [],
    };

    const ranking: RankingItem[] = [
      {
        posicion: 1,
        jugador_id: "j-1",
        nombre: "Lalo E",
        puntos: 58,
        jornadas_jugadas: 2,
      },
      {
        posicion: 2,
        jugador_id: "j-2",
        nombre: "Hector",
        puntos: 55,
        jornadas_jugadas: 2,
      },
      {
        posicion: 3,
        jugador_id: "j-3",
        nombre: "César G",
        puntos: 54,
        jornadas_jugadas: 2,
        ingreso_jornada_numero: 2,
      },
      {
        posicion: 4,
        jugador_id: "j-4",
        nombre: "Josue",
        puntos: 52,
        jornadas_jugadas: 2,
      },
      {
        posicion: 5,
        jugador_id: "j-5",
        nombre: "Alex Reyes",
        puntos: 49,
        jornadas_jugadas: 2,
      },
    ];

    mockGetLigaById.mockResolvedValue(detalle);
    mockGetRanking.mockResolvedValue(ranking);
    mockResolveProfiles.mockResolvedValue({
      "j-1": { fotoUrl: null, rating: 3.9, rivieraId: "RV-000284" },
      "j-2": { fotoUrl: null, rating: 3.7, rivieraId: "RIV-00000180" },
      "j-3": { fotoUrl: null, rating: 3.5, rivieraId: null },
      "j-4": { fotoUrl: null, rating: 3.4, rivieraId: "RV-000192" },
      "j-5": { fotoUrl: null, rating: 3.3, rivieraId: null },
    });

    root = createRoot(container);
    act(() => {
      root.render(<LigaDetallePublica ligaId="liga-4ta" />);
    });
    await flushAsync();

    const card1 = container.querySelector(".liga-ind-top3__card--1");
    const card2 = container.querySelector(".liga-ind-top3__card--2");
    const card3 = container.querySelector(".liga-ind-top3__card--3");

    expect(
      card1?.querySelector(".liga-ind-top3__riviera-id")?.textContent
    ).toBe("RV-000284");
    expect(
      card2?.querySelector(".liga-ind-top3__riviera-id")?.textContent
    ).toBe("RIV-00000180");
    // Jugador 3 sin código oficial se omite limpiamente
    expect(card3?.querySelector(".liga-ind-top3__riviera-id")).toBeNull();

    // El identificador debe ir inmediatamente debajo del nombre en el podio
    const card1BodyChildren = Array.from(
      card1?.querySelector(".liga-ind-top3__body")?.children ?? []
    );
    expect(card1BodyChildren[0]?.className).toContain("liga-ind-top3__name");
    expect(card1BodyChildren[1]?.className).toContain(
      "liga-ind-top3__riviera-id"
    );

    const restRows = Array.from(
      container.querySelectorAll(".liga-ind-rest__row")
    );
    expect(restRows).toHaveLength(2);

    const row4Identity = restRows[0]?.querySelector(".liga-ind-rest__identity");
    expect(
      row4Identity?.querySelector(".liga-ind-rest__riviera-id")?.textContent
    ).toBe("RV-000192");
    expect(row4Identity?.children[0]?.className).toContain(
      "liga-ind-rest__name"
    );
    expect(row4Identity?.children[1]?.className).toContain(
      "liga-ind-rest__riviera-id"
    );

    // Jugador 5 sin código oficial no renderiza el nodo
    expect(
      restRows[1]?.querySelector(".liga-ind-rest__riviera-id")
    ).toBeNull();

    // No incluye etiquetas como "Riviera ID" o "ID:"
    expect(container.textContent).not.toContain("Riviera ID");
  });
});
