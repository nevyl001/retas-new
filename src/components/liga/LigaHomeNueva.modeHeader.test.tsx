/**
 * Confirma explícitamente que LigaHome y LigaNueva siguen usando ModeHeader
 * (no se tocaron en esta fase — docs/GAME-MODES-UI-ARCHITECTURE.md Fase 2A,
 * punto 2: "Mantén ModeHeader en: LigaHome; LigaNueva.").
 *
 * Ver nota sobre eslint-plugin-testing-library (falso positivo, no oculta
 * regresiones) en LigaGestionar.render.test.tsx.
 */
/* eslint-disable testing-library/no-unnecessary-act */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getLigas } from "../../services/ligaService";
import { LigaHome } from "./LigaHome";
import { LigaNueva } from "./LigaNueva";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

// jest.mock se hoistea automáticamente por encima de los imports (Jest +
// babel-plugin-jest-hoist), así que escribirlo después de los imports es
// equivalente en tiempo de ejecución y respeta la regla import/first.
jest.mock("../../club-experience", () => ({
  useClubModeEyebrow: () => "Club Test",
}));

jest.mock("../../services/ligaService", () => ({
  getLigas: jest.fn(),
  deleteLiga: jest.fn(),
  createLiga: jest.fn(),
}));

const mockGetLigas = getLigas as jest.Mock;

describe("LigaHome / LigaNueva — mantienen ModeHeader (sin cambios en esta fase)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetLigas.mockResolvedValue([]);
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it("LigaHome renderiza un ModeHeader (rv-mode-header) con título «Ligas»", async () => {
    root = createRoot(container);
    await act(async () => {
      root.render(<LigaHome />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const header = container.querySelector(".rv-mode-header");
    expect(header).not.toBeNull();
    expect(header?.querySelector(".rv-mode-header__title")?.textContent).toBe(
      "Ligas"
    );
    // LigaHome no usa el shell móvil de evento (eso es solo LigaGestionar/Jornada).
    expect(container.querySelector(".mode-event-header")).toBeNull();
  });

  it("LigaNueva renderiza un ModeHeader (rv-mode-header) con título «Nueva liga»", () => {
    root = createRoot(container);
    act(() => {
      root.render(<LigaNueva />);
    });

    const header = container.querySelector(".rv-mode-header");
    expect(header).not.toBeNull();
    expect(header?.querySelector(".rv-mode-header__title")?.textContent).toBe(
      "Nueva liga"
    );
    expect(container.querySelector(".mode-event-header")).toBeNull();
  });
});
