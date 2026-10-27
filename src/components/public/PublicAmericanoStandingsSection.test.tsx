/**
 * Fase 1 — clasificación pública Americano compacta.
 * Sin @testing-library; mismo patrón que LigaRankingEquipos.render.test.tsx.
 */
/* eslint-disable testing-library/no-unnecessary-act */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PublicAmericanoStandingsSection } from "./PublicAmericanoStandingsSection";
import type { AmericanoSnapshotPlayer } from "../../lib/americanoDinamicoStorage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function player(
  id: string,
  name: string,
  pointsFor: number,
  pointsAgainst: number,
  gamesPlayed: number
): AmericanoSnapshotPlayer {
  return {
    id,
    name,
    stats: {
      pointsFor,
      pointsAgainst,
      gamesPlayed,
      roundsOnBench: 0,
    },
  };
}

const rows: AmericanoSnapshotPlayer[] = [
  player("a", "Eduardo L", 24, 12, 4),
  player("b", "Carlos R", 21, 15, 4),
];

describe("PublicAmericanoStandingsSection", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("muestra clasificación en vivo cuando el torneo sigue activo", () => {
    act(() => {
      root.render(
        <PublicAmericanoStandingsSection rows={rows} isFinished={false} />
      );
    });
    const title = container.querySelector(".te-public-section__title");
    expect(title?.textContent).toBe("Clasificación en vivo");
    expect(container.textContent).not.toMatch(/Ganador/);
  });

  it("marca al #1 como ganador solo si el torneo terminó", () => {
    act(() => {
      root.render(<PublicAmericanoStandingsSection rows={rows} isFinished />);
    });
    const title = container.querySelector(".te-public-section__title");
    expect(title?.textContent).toBe("Clasificación");
    expect(
      container.querySelector(".am-pub-standings__winner-badge")?.textContent
    ).toBe("Ganador");
  });

  it("conserva orden, PJ, PG, FAV, CON, DIF y filas accionables", () => {
    const onPlayerSelect = jest.fn();
    const liveStatsMap = new Map([
      [
        "a",
        {
          pj: 4,
          pg: 3,
          pe: 0,
          pp: 1,
          ptsFav: 24,
          ptsCon: 12,
          puntos: 6,
        },
      ],
      [
        "b",
        {
          pj: 4,
          pg: 1,
          pe: 0,
          pp: 3,
          ptsFav: 21,
          ptsCon: 15,
          puntos: 2,
        },
      ],
    ]);
    act(() => {
      root.render(
        <PublicAmericanoStandingsSection
          rows={rows}
          isFinished={false}
          liveStatsMap={liveStatsMap}
          onPlayerSelect={onPlayerSelect}
        />
      );
    });

    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".am-pub-standings__row")
    );
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute("aria-label")).toMatch(/Eduardo L/);
    expect(buttons[1].getAttribute("aria-label")).toMatch(/Carlos R/);
    expect(buttons[0].textContent).toContain("PJ");
    expect(buttons[0].textContent).toContain("PG");
    expect(buttons[0].textContent).toContain("3");
    expect(buttons[0].textContent).toContain("4");
    expect(buttons[0].textContent).toContain("24");
    expect(buttons[0].textContent).toContain("12");
    expect(buttons[0].textContent).toContain("+12");

    act(() => {
      buttons[0].click();
    });
    expect(onPlayerSelect).toHaveBeenCalledWith("a");

    act(() => {
      buttons[0].dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
    });
    // Native <button> activates on click; keyboard Enter is handled by the browser.
    // Ensure the control remains focusable for a11y.
    expect(buttons[0].tabIndex).toBeGreaterThanOrEqual(0);
    expect(buttons[0].type).toBe("button");
  });
});
