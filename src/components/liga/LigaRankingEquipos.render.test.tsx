/**
 * Fase 2B — LigaRankingEquipos adopta cards móviles (solo presentación).
 * Verifica que el mismo `rows` (mismo cálculo/orden ya resuelto en el
 * servicio) se refleje idéntico en la card móvil y en la fila desktop —
 * sin reordenar ni recalcular nada. No usa @testing-library (no instalada);
 * usa react-dom/client + React.act, igual que LigaGestionar.render.test.tsx.
 */
/* eslint-disable testing-library/no-unnecessary-act */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { LigaEquipoRankingItem } from "../../lib/liga/types";
import { LigaRankingEquipos } from "./LigaRankingEquipos";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function equipo(
  overrides: Partial<LigaEquipoRankingItem>
): LigaEquipoRankingItem {
  return {
    posicion: 1,
    equipo_id: "eq-1",
    nombre: "Pérez / Gómez",
    puntos: 10,
    partidos_jugados: 4,
    partidos_ganados: 3,
    partidos_perdidos: 1,
    games_favor: 30,
    games_contra: 20,
    diferencia_games: 10,
    ...overrides,
  };
}

describe("LigaRankingEquipos — cards móviles reflejan el mismo orden y datos que la tabla", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it("renderiza el mismo orden de equipos en la card móvil y en la tabla desktop", () => {
    const rows: LigaEquipoRankingItem[] = [
      equipo({ posicion: 1, equipo_id: "eq-1", nombre: "Líderes A", puntos: 12 }),
      equipo({ posicion: 2, equipo_id: "eq-2", nombre: "Segundos B", puntos: 9 }),
      equipo({ posicion: 3, equipo_id: "eq-3", nombre: "Terceros C", puntos: 6 }),
    ];

    root = createRoot(container);
    act(() => {
      root.render(<LigaRankingEquipos rows={rows} />);
    });

    const cardNames = Array.from(
      container.querySelectorAll(".standings-mobile-card__name")
    ).map((el) => el.textContent);
    const tableNames = Array.from(
      container.querySelectorAll(".liga-ranking-table tbody tr td:nth-child(2)")
    ).map((el) => el.textContent);

    expect(cardNames).toEqual(["Líderes A", "Segundos B", "Terceros C"]);
    expect(tableNames).toEqual(["Líderes A", "Segundos B", "Terceros C"]);
    // Mismo orden entre ambas presentaciones del mismo `rows`.
    expect(cardNames).toEqual(tableNames);
  });

  it("la card móvil muestra las mismas estadísticas que la fila desktop (PJ/PG/PP/GF/GC/PTS)", () => {
    const rows: LigaEquipoRankingItem[] = [
      equipo({
        posicion: 1,
        equipo_id: "eq-1",
        nombre: "Fernández / López",
        puntos: 15,
        partidos_jugados: 5,
        partidos_ganados: 4,
        partidos_perdidos: 1,
        games_favor: 44,
        games_contra: 28,
        diferencia_games: 16,
      }),
    ];

    root = createRoot(container);
    act(() => {
      root.render(<LigaRankingEquipos rows={rows} />);
    });

    const card = container.querySelector(".standings-mobile-card");
    expect(card?.textContent).toContain("Fernández / López");
    // FAV/PG/PJ/PP/PTS son los campos mapeados 1:1 desde LigaEquipoRankingItem.
    const statValues = Array.from(
      card?.querySelectorAll(".standings-mobile-card__stat-value") ?? []
    ).map((el) => el.textContent);
    expect(statValues).toEqual(expect.arrayContaining(["44", "4", "5", "1", "15"]));

    const row = container.querySelector(".liga-ranking-table tbody tr");
    const cells = Array.from(row?.querySelectorAll("td") ?? []).map(
      (el) => el.textContent
    );
    expect(cells).toEqual(["1", "Fernández / López", "5", "4", "1", "44", "28", "16", "15"]);
  });

  it("conserva la tabla desktop (no la reemplaza) junto con las cards móviles", () => {
    const rows: LigaEquipoRankingItem[] = [equipo({})];

    root = createRoot(container);
    act(() => {
      root.render(<LigaRankingEquipos rows={rows} />);
    });

    expect(container.querySelector(".liga-ranking-table-desktop")).not.toBeNull();
    expect(container.querySelector(".liga-ranking-mobile-cards")).not.toBeNull();
    expect(container.querySelector("table.liga-ranking-table")).not.toBeNull();
  });

  it("con rows vacío sigue mostrando el mensaje de siempre, sin cards ni tabla", () => {
    root = createRoot(container);
    act(() => {
      root.render(<LigaRankingEquipos rows={[]} />);
    });

    expect(container.textContent).toContain("Sin puntos registrados aún.");
    expect(container.querySelector("table")).toBeNull();
  });
});
