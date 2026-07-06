import {
  breakdownFromCareerResult,
  resolvePlayerPointsBreakdown,
} from "./playerPointsBreakdown";
import {
  buildJugadorPuntosBreakdown,
  breakdownToDisplayLines,
} from "./jugadorPuntosBreakdown";
import type { CareerPointsByClubResult } from "./careerPointsByClub";
import type { RivieraJugadorWithStats } from "./types";

const CLUB_TEST = "cd45cea7-a8ac-4596-b0ee-24959b4cbb5d";
const HACKPADEL = "e724de97-3552-4a01-a269-f621e6f1ed26";
const RIVIERA_OPEN = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function career(
  entries: Array<{ org: string; pts: number }>,
  total?: number
): CareerPointsByClubResult {
  const puntosByOrg = new Map(entries.map((e) => [e.org, e.pts]));
  const byClub = entries.map((e) => ({
    organizadorId: e.org,
    puntos: e.pts,
  }));
  return {
    byClub,
    puntosByOrg,
    total: total ?? entries.reduce((s, e) => s + e.pts, 0),
  };
}

function jugador(
  overrides: Partial<RivieraJugadorWithStats> = {}
): RivieraJugadorWithStats {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    nombre: "Test",
    slug: "test",
    organizador_id: CLUB_TEST,
    stats: { puntos_totales: 0 } as never,
    ...overrides,
  } as RivieraJugadorWithStats;
}

describe("resolvePlayerPointsBreakdown / breakdownFromCareerResult", () => {
  it("Caso A: importado HackPadel — 50 pts locales, total 50", () => {
    const c = career([{ org: HACKPADEL, pts: 50 }]);
    const b = breakdownFromCareerResult(c, HACKPADEL);
    expect(b.currentClubPoints).toBe(50);
    expect(b.globalTotalPoints).toBe(50);
    expect(b.pointsByClub).toHaveLength(1);
    expect(b.pointsByClub[0].points).toBe(50);
  });

  it("Caso B: HackPadel 50 + Club Test 25 — desglose multi-club", () => {
    const c = career([
      { org: HACKPADEL, pts: 50 },
      { org: CLUB_TEST, pts: 25 },
    ]);
    const bHack = breakdownFromCareerResult(c, HACKPADEL);
    expect(bHack.currentClubPoints).toBe(50);
    expect(bHack.globalTotalPoints).toBe(75);

    const bTest = breakdownFromCareerResult(c, CLUB_TEST);
    expect(bTest.currentClubPoints).toBe(25);
  });

  it("Caso C: Riviera Open origen, puntos en HackPadel — no atribuye a origen", () => {
    const c = career([
      { org: HACKPADEL, pts: 120 },
      { org: RIVIERA_OPEN, pts: 0 },
    ]);
    const b = breakdownFromCareerResult(c, HACKPADEL);
    expect(b.currentClubPoints).toBe(120);
    const openEntry = b.pointsByClub.find((x) => x.organizador_id === RIVIERA_OPEN);
    expect(openEntry).toBeUndefined();
  });

  it("Caso E: sin puntos — 0 sin NaN", () => {
    const c = career([], 0);
    const b = breakdownFromCareerResult(c, HACKPADEL);
    expect(b.currentClubPoints).toBe(0);
    expect(b.globalTotalPoints).toBe(0);
    expect(Number.isFinite(b.currentClubPoints)).toBe(true);
  });
});

describe("buildJugadorPuntosBreakdown (ranking card UI)", () => {
  it("muestra HackPadel: 50 pts (no oculta desglose mono-club)", () => {
    const j = jugador({
      careerPuntosByClub: [{ organizadorId: HACKPADEL, puntos: 50 }],
      careerPuntosTotal: 50,
      stats: { puntos_totales: 50 } as never,
    });
    const lines = buildJugadorPuntosBreakdown(j, HACKPADEL, {
      hasOrgContext: true,
    });
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines[0].puntos).toBe(50);
    expect(lines.some((l) => l.role === "total")).toBe(false);
  });

  it("multi-club muestra Total", () => {
    const j = jugador({
      careerPuntosByClub: [
        { organizadorId: HACKPADEL, puntos: 50 },
        { organizadorId: CLUB_TEST, puntos: 25 },
      ],
      careerPuntosTotal: 75,
    });
    const lines = buildJugadorPuntosBreakdown(j, HACKPADEL, {
      hasOrgContext: true,
    });
    expect(lines.some((l) => l.role === "total" && l.puntos === 75)).toBe(true);
  });

  it("currentClubPoints coherente con ranking local", () => {
    const c = career([{ org: HACKPADEL, pts: 50 }]);
    const b = breakdownFromCareerResult(c, HACKPADEL);
    const j = jugador({
      careerPuntosByClub: c.byClub,
      careerPuntosTotal: 50,
      stats: { puntos_totales: 50 } as never,
      pointsBreakdown: b,
    });
    const { rankingPuntosClubLocal } = require("./rankingPosition");
    expect(rankingPuntosClubLocal(j, HACKPADEL)).toBe(50);
  });
});

describe("breakdownToDisplayLines", () => {
  it("no inventa clubes con 0 pts ajenos", () => {
    const b = breakdownFromCareerResult(
      career([{ org: HACKPADEL, pts: 50 }]),
      HACKPADEL
    );
    const lines = breakdownToDisplayLines(b, HACKPADEL, { forceBreakdown: true });
    expect(lines.every((l) => l.role !== "other" || l.puntos > 0)).toBe(true);
  });
});
