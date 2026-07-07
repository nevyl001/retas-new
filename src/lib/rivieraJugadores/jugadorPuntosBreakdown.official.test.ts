import {
  resolveCareerTotalAllClubsDisplay,
  resolveOfficialPuntosDisplay,
} from "./jugadorPuntosBreakdown";
import { breakdownFromCareerResult } from "./playerPointsBreakdown";
import type { CareerPointsByClubResult } from "./careerPointsByClub";
import type { RivieraJugadorWithStats } from "./types";

const HACKPADEL = "e724de97-3552-4a01-a269-f621e6f1ed26";

function career(entries: Array<{ org: string; pts: number }>): CareerPointsByClubResult {
  const puntosByOrg = new Map(entries.map((e) => [e.org, e.pts]));
  return {
    byClub: entries.map((e) => ({ organizadorId: e.org, puntos: e.pts })),
    puntosByOrg,
    total: entries.reduce((s, e) => s + e.pts, 0),
  };
}

function jugador(
  partial: Partial<RivieraJugadorWithStats> = {}
): RivieraJugadorWithStats {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    nombre: "Test",
    slug: "test",
    organizador_id: HACKPADEL,
    stats: { puntos_totales: 25 } as never,
    ...partial,
  } as RivieraJugadorWithStats;
}

describe("resolveOfficialPuntosDisplay vs carrera local", () => {
  it("sin identidad oficial: carrera local visible, ROMC no disponible", () => {
    const j = jugador({
      careerPuntosByClub: [{ organizadorId: HACKPADEL, puntos: 50 }],
      careerPuntosTotal: 50,
      pointsBreakdown: {
        ...breakdownFromCareerResult(career([{ org: HACKPADEL, pts: 50 }]), null),
        officialGlobalPoints: null,
      },
    });

    expect(resolveCareerTotalAllClubsDisplay(j, false)).toBe(50);
    expect(resolveOfficialPuntosDisplay(j)).toEqual({ kind: "unavailable" });
  });

  it("con identidad oficial y 0 pts reales: muestra 0 disponible", () => {
    const j = jugador({
      officialPuntosGlobal: 0,
      careerPuntosTotal: 50,
      careerPuntosByClub: [{ organizadorId: HACKPADEL, puntos: 50 }],
      pointsBreakdown: {
        ...breakdownFromCareerResult(career([{ org: HACKPADEL, pts: 50 }]), null),
        officialGlobalPoints: 0,
      },
    });

    expect(resolveOfficialPuntosDisplay(j)).toEqual({
      kind: "available",
      puntos: 0,
    });
    expect(resolveCareerTotalAllClubsDisplay(j, false)).toBe(50);
  });

  it("con ROMC disponible: carrera y oficial son distintos", () => {
    const j = jugador({
      officialPuntosGlobal: 120,
      careerPuntosTotal: 50,
      careerPuntosByClub: [{ organizadorId: HACKPADEL, puntos: 50 }],
      pointsBreakdown: {
        ...breakdownFromCareerResult(career([{ org: HACKPADEL, pts: 50 }]), null),
        officialGlobalPoints: 120,
      },
    });

    expect(resolveCareerTotalAllClubsDisplay(j, false)).toBe(50);
    expect(resolveOfficialPuntosDisplay(j)).toEqual({
      kind: "available",
      puntos: 120,
    });
  });
});
