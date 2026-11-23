import { FLEX_POSITION_POINTS } from "./constants";
import {
  flexFocusRound,
  flexPointsSeries,
  flexPublicJornadaEstado,
  flexPublicMovement,
} from "./publicView";
import type { FlexAward } from "./season";

function award(jornadaNumero: number, jugadorId: string, posicion: number): FlexAward {
  return {
    jornadaNumero,
    jugadorId,
    posicion,
    puntos: FLEX_POSITION_POINTS[posicion - 1]!,
  };
}

describe("flex public view", () => {
  it("no marca finalizada una jornada que el backend no cerró", () => {
    expect(
      flexPublicJornadaEstado({ estado: "upcoming", fecha: null, confirmada: false }).label
    ).toBe("Por programar");
    expect(
      flexPublicJornadaEstado({ estado: "upcoming", fecha: "2026-11-20", confirmada: false })
        .label
    ).toBe("Programada");
    expect(
      flexPublicJornadaEstado({ estado: "in_progress", fecha: "2026-11-20", confirmada: true })
        .key
    ).toBe("en_curso");
    expect(
      flexPublicJornadaEstado({ estado: "completed", fecha: null, confirmada: true }).key
    ).toBe("finalizada");
  });

  it("mide la subida contra la jornada cerrada anterior", () => {
    const awards = [
      award(1, "ana", 1),
      award(1, "beto", 2),
      award(1, "caro", 3),
      award(2, "beto", 1),
      award(2, "caro", 2),
      award(2, "ana", 3),
    ];
    const movement = flexPublicMovement(awards, [1, 2]);
    expect(movement.get("beto")).toBe(1);
    expect(movement.get("ana")).toBe(-1);
  });

  it("no inventa evolución si solo hay una jornada cerrada", () => {
    const movement = flexPublicMovement([award(1, "ana", 1)], [1]);
    expect(movement.get("ana")).toBeNull();
  });

  it("acumula puntos solo de las jornadas que el jugador disputó", () => {
    const awards = [award(1, "ana", 1), award(2, "beto", 1), award(3, "ana", 2)];
    const series = flexPointsSeries(awards, "ana", [1, 2, 3]);
    expect(series.map((point) => point.jornadaNumero)).toEqual([1, 3]);
    expect(series[1]?.acumulado).toBe(
      FLEX_POSITION_POINTS[0]! + FLEX_POSITION_POINTS[1]!
    );
  });

  it("enfoca la primera ronda que aún no tiene marcador", () => {
    expect(
      flexFocusRound([
        { ronda: 1, scoreA: 6, scoreB: 4 },
        { ronda: 2, scoreA: null, scoreB: null },
      ])
    ).toBe(2);
    expect(
      flexFocusRound([
        { ronda: 1, scoreA: 6, scoreB: 4 },
        { ronda: 2, scoreA: 3, scoreB: 6 },
      ])
    ).toBe(2);
    expect(flexFocusRound([])).toBeNull();
  });
});
