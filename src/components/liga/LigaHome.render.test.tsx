/* eslint-disable testing-library/no-unnecessary-act */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { deleteLiga, getLigas } from "../../services/ligaService";
import type { Liga } from "../../lib/liga/types";
import { LigaHome } from "./LigaHome";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

jest.mock("../../club-experience", () => ({
  useClubModeEyebrow: () => "Club Test",
}));

jest.mock("../../services/ligaService", () => ({
  getLigas: jest.fn(),
  deleteLiga: jest.fn(),
}));

jest.mock("./ligaNav", () => ({
  navigateLiga: jest.fn(),
}));

const mockGetLigas = getLigas as jest.Mock;
const mockDeleteLiga = deleteLiga as jest.Mock;

function sampleLiga(overrides: Partial<Liga> = {}): Liga {
  return {
    id: "liga-1",
    nombre: "Liga 5ta Advance",
    estado: "in_progress",
    modalidad: "individual_rotativo",
    vueltas: 1,
    organizador_id: "org",
    canchas_disponibles: 3,
    fecha_inicio: null,
    fecha_fin: null,
    created_at: "2026-01-01",
    inscripciones_count: 12,
    equipos_count: 0,
    jornadas_count: 6,
    jornada_actual_numero: 2,
    ...overrides,
  };
}

describe("LigaHome — dashboard de tarjetas", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetLigas.mockResolvedValue([
      sampleLiga(),
      sampleLiga({
        id: "liga-2",
        nombre: "Liga 4ta Advance",
        estado: "completed",
        jornada_actual_numero: 6,
      }),
    ]);
    mockDeleteLiga.mockResolvedValue(undefined);
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  async function renderHome() {
    root = createRoot(container);
    await act(async () => {
      root.render(<LigaHome />);
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("muestra dos tarjetas lado a lado con Gestionar y sin Eliminar permanente", async () => {
    await renderHome();
    const cards = container.querySelectorAll(".liga-home-card");
    expect(cards.length).toBe(2);
    expect(container.querySelector(".liga-home__grid")).not.toBeNull();
    expect(container.textContent).toContain("Liga 5ta Advance");
    expect(container.textContent).toContain("Liga 4ta Advance");
    expect(container.textContent).toContain("Liga individual · Parejas rotativas");
    expect(container.textContent).toContain("Gestionar liga");
    expect(container.textContent).toContain("Jornada 2 de 6");
    expect(container.textContent).toContain("Jornada 6 de 6");
    expect(
      Array.from(container.querySelectorAll("button")).some(
        (b) => b.textContent?.trim() === "Eliminar"
      )
    ).toBe(false);
  });

  it("filtra por En curso y Finalizadas con contadores reales", async () => {
    await renderHome();
    const chips = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".liga-home__chip")
    );
    expect(chips).toHaveLength(3);
    expect(chips[0].textContent).toContain("Todas");
    expect(chips[0].textContent).toContain("2");
    expect(chips[1].textContent).toContain("1");
    expect(chips[2].textContent).toContain("1");

    await act(async () => {
      chips[1].click();
      await Promise.resolve();
    });
    expect(container.querySelectorAll(".liga-home-card")).toHaveLength(1);
    expect(container.textContent).toContain("Liga 5ta Advance");
    expect(container.textContent).not.toContain("Liga 4ta Advance");

    await act(async () => {
      chips[2].click();
      await Promise.resolve();
    });
    expect(container.querySelectorAll(".liga-home-card")).toHaveLength(1);
    expect(container.textContent).toContain("Liga 4ta Advance");
  });
});
