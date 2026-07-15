/**
 * Tests de composición con render real (Fase 2A). No usa @testing-library
 * (no está instalada y esta tarea prohíbe instalar dependencias) — usa
 * react-dom/client + react-dom/test-utils, que ya vienen con react-dom.
 * No hace snapshots grandes ni compara píxeles: solo verifica estructura
 * (tabs, header, una sola CTA primaria, acciones destructivas agrupadas).
 *
 * eslint-plugin-testing-library viene incluido en el preset react-app/jest
 * de CRA y se aplica a todo *.test.* aunque @testing-library/react no esté
 * instalada. Su regla no-unnecessary-act asume que act() envuelve utilidades
 * de RTL (que auto-envuelven en act) — acá no es el caso: root.render() es
 * react-dom puro y sí necesita act() explícito. Falso positivo confirmado,
 * no oculta ninguna regresión.
 */
/* eslint-disable testing-library/no-unnecessary-act */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { LigaDetalle } from "../../lib/liga/types";
import {
  getJugadoresOrganizador,
  getLigaById,
  publicLigaUrl,
} from "../../services/ligaService";
import { LigaGestionar } from "./LigaGestionar";

// React 18 + createRoot requiere esta bandera para que act() no advierta
// "not configured to support act()" (no aplica @testing-library, que la
// configura sola vía su entorno de setup).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

// jest.mock se hoistea automáticamente por encima de los imports (Jest +
// babel-plugin-jest-hoist), así que escribirlo después de los imports es
// equivalente en tiempo de ejecución y respeta la regla import/first.
jest.mock("../../club-experience", () => ({
  useClubModeEyebrow: () => "Club Test",
}));

jest.mock("../jugadores/jugadoresGeneroNav", () => ({
  navigateJugadoresLista: jest.fn(),
}));

jest.mock("../../services/ligaService", () => ({
  createEquipoLiga: jest.fn(),
  deleteEquipoLiga: jest.fn(),
  deleteLiga: jest.fn(),
  desinscribirJugador: jest.fn(),
  finishLiga: jest.fn(),
  getJugadoresOrganizador: jest.fn().mockResolvedValue([]),
  getLigaById: jest.fn(),
  inscribirJugador: jest.fn(),
  publicLigaUrl: jest.fn().mockReturnValue("https://example.com/public/liga/liga-1"),
  regenerarCalendarioLiga: jest.fn(),
  resetLiga: jest.fn(),
  startLiga: jest.fn(),
}));

const mockGetLigaById = getLigaById as jest.Mock;
const mockGetJugadoresOrganizador = getJugadoresOrganizador as jest.Mock;
const mockPublicLigaUrl = publicLigaUrl as jest.Mock;

function baseDetalle(overrides: Partial<LigaDetalle> = {}): LigaDetalle {
  return {
    id: "liga-1",
    nombre: "Liga Riviera Primavera",
    estado: "upcoming",
    modalidad: "individual_rotativo",
    vueltas: 1,
    organizador_id: "org-1",
    canchas_disponibles: 3,
    fecha_inicio: null,
    fecha_fin: null,
    created_at: "2026-01-01T00:00:00Z",
    inscripciones: [],
    equipos: [],
    jugadores: [],
    jornadas: [],
    ...overrides,
  } as LigaDetalle;
}

function mockMatchMedia(matchesMaxWidth767: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: query.includes("767px") ? matchesMaxWidth767 : false,
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe("LigaGestionar — composición (render real, sin snapshots)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetJugadoresOrganizador.mockResolvedValue([]);
    mockPublicLigaUrl.mockReturnValue("https://example.com/public/liga/liga-1");
    mockMatchMedia(false); // desktop por default
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  async function renderLiga(detalle: LigaDetalle) {
    mockGetLigaById.mockResolvedValue(detalle);
    root = createRoot(container);
    await act(async () => {
      root.render(<LigaGestionar ligaId={detalle.id} />);
      // deja resolver la promesa de load() encadenada en useEffect
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("muestra las mismas 2 tabs (Jugadores → Jornadas) en el mismo orden, sin duplicados", async () => {
    await renderLiga(baseDetalle());

    const tabButtons = Array.from(
      container.querySelectorAll(".mode-section-tabs__btn")
    ).map((el) => el.textContent);

    expect(tabButtons).toEqual(["Jugadores", "Jornadas"]);
  });

  it("parejas_fijas muestra Parejas → Jornadas, no Jugadores", async () => {
    await renderLiga(baseDetalle({ modalidad: "parejas_fijas" }));

    const tabButtons = Array.from(
      container.querySelectorAll(".mode-section-tabs__btn")
    ).map((el) => el.textContent);

    expect(tabButtons).toEqual(["Parejas", "Jornadas"]);
  });

  it("el header conserva nombre, estado y modalidad", async () => {
    await renderLiga(baseDetalle({ nombre: "Liga Otoño", estado: "in_progress" }));

    const header = container.querySelector(".mode-event-header");
    expect(header).not.toBeNull();
    expect(header?.textContent).toContain("Liga Otoño");
    expect(header?.textContent).toContain("En curso");
    expect(header?.textContent).toContain(
      "Liga individual con parejas rotativas"
    );
  });

  it("solo hay una CTA primaria «Iniciar liga» visible en desktop (no se duplica con el sticky footer)", async () => {
    mockMatchMedia(false);
    await renderLiga(baseDetalle());

    const iniciarButtons = Array.from(
      container.querySelectorAll("button")
    ).filter((b) => b.textContent === "Iniciar liga");

    expect(iniciarButtons).toHaveLength(1);
    expect(container.querySelector(".mobile-sticky-action-footer")).toBeNull();
  });

  it("en móvil, «Iniciar liga» se relocaliza al sticky footer y no queda duplicada", async () => {
    mockMatchMedia(true);
    await renderLiga(baseDetalle());

    const iniciarButtons = Array.from(
      container.querySelectorAll("button")
    ).filter((b) => b.textContent === "Iniciar liga");

    expect(iniciarButtons).toHaveLength(1);
    expect(
      container.querySelector(".mobile-sticky-action-footer")
    ).not.toBeNull();
    expect(
      container
        .querySelector(".mobile-sticky-action-footer")
        ?.textContent
    ).toBe("Iniciar liga");
  });

  it("Reiniciar liga y Eliminar liga están dentro de ModeDangerZone; Iniciar liga nunca lo está", async () => {
    await renderLiga(baseDetalle());

    const dangerZone = container.querySelector(".mode-danger-zone");
    expect(dangerZone).not.toBeNull();
    expect(dangerZone?.textContent).toContain("Reiniciar liga");
    expect(dangerZone?.textContent).toContain("Eliminar liga");
    expect(dangerZone?.textContent).not.toContain("Iniciar liga");
  });

  it("los callbacks destructivos siguen siendo los mismos (llaman al servicio real)", async () => {
    window.confirm = jest.fn().mockReturnValue(true);
    const { deleteLiga } = jest.requireMock("../../services/ligaService") as {
      deleteLiga: jest.Mock;
    };
    deleteLiga.mockResolvedValue(undefined);

    await renderLiga(baseDetalle());

    const eliminarBtn = Array.from(
      container.querySelectorAll(".mode-danger-zone button")
    ).find((b) => b.textContent === "Eliminar liga") as HTMLButtonElement;
    expect(eliminarBtn).toBeDefined();

    await act(async () => {
      eliminarBtn.click();
      await Promise.resolve();
    });

    expect(deleteLiga).toHaveBeenCalledWith("liga-1");
  });

  it("una liga finalizada no ofrece «Iniciar liga» ni «Reiniciar liga» (misma lógica de siempre)", async () => {
    await renderLiga(
      baseDetalle({
        estado: "completed",
        jornadas: [
          {
            id: "j1",
            liga_id: "liga-1",
            numero: 1,
            estado: "completed",
            fecha: null,
            puntos_aplicados: true,
          } as LigaDetalle["jornadas"][number],
        ],
      })
    );

    const buttons = Array.from(container.querySelectorAll("button")).map(
      (b) => b.textContent
    );
    expect(buttons).not.toContain("Iniciar liga");
    expect(buttons).not.toContain("Reiniciar liga");
    // Eliminar liga sigue disponible incluso finalizada (misma lógica previa).
    expect(buttons).toContain("Eliminar liga");
  });
});
