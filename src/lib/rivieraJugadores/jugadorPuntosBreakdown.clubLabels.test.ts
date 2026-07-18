import {
  clearOrganizerDisplayNameCache,
  rememberOrganizerDisplayName,
} from "../organizer/organizerDisplayName";
import { breakdownFromCareerResult } from "./playerPointsBreakdown";
import {
  breakdownToDisplayLines,
  buildClubPointsDisplayRows,
  buildJugadorPuntosBreakdown,
} from "./jugadorPuntosBreakdown";
import { RivieraJugadorWithStats } from "./types";

const HACKPADEL = "e724de97-3552-4a01-a269-f621e6f1ed26";
const RIVIERA_OPEN = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function career(entries: Array<{ org: string; pts: number }>) {
  const puntosByOrg = new Map(entries.map((e) => [e.org, e.pts]));
  return {
    byClub: entries.map((e) => ({ organizadorId: e.org, puntos: e.pts })),
    puntosByOrg,
    total: entries.reduce((s, e) => s + e.pts, 0),
  };
}

function jugadorNevyl(viewingBreakdownOrg: string): RivieraJugadorWithStats {
  const c = career([
    { org: HACKPADEL, pts: 220 },
    { org: RIVIERA_OPEN, pts: 225 },
  ]);
  const b = breakdownFromCareerResult(c, viewingBreakdownOrg);
  return {
    id: "11111111-1111-4111-8111-111111111111",
    nombre: "Nevyl",
    slug: "nevyl",
    organizador_id: RIVIERA_OPEN,
    riviera_id: "RIV-00000011",
    careerPuntosByClub: c.byClub,
    careerPuntosTotal: 445,
    pointsBreakdown: { ...b, officialGlobalPoints: null },
    stats: { puntos_totales: 220 } as never,
  } as unknown as RivieraJugadorWithStats;
}

describe("PUNTOS EN ESTE CLUB — labels por organizerId", () => {
  beforeEach(() => {
    clearOrganizerDisplayNameCache();
    rememberOrganizerDisplayName(HACKPADEL, "Hack Pádel");
    rememberOrganizerDisplayName(RIVIERA_OPEN, "Riviera Open");
  });

  afterEach(() => {
    clearOrganizerDisplayNameCache();
  });

  it("contexto Hack: Hack Pádel 220, Riviera Open 225, Total 445", () => {
    const j = jugadorNevyl(HACKPADEL);
    const lines = buildJugadorPuntosBreakdown(j, HACKPADEL, {
      hasOrgContext: true,
      profileCard: true,
      registrationOrganizerId: RIVIERA_OPEN,
    });

    expect(lines[0]).toMatchObject({
      clubLabel: "Hack Pádel",
      puntos: 220,
      role: "home",
    });
    expect(lines[1]).toMatchObject({
      clubLabel: "Riviera Open",
      puntos: 225,
      role: "other",
    });
    expect(lines[2]).toMatchObject({
      clubLabel: "Total carrera",
      puntos: 445,
      role: "career-total",
    });
    expect(
      lines.filter((l) => l.clubLabel === "Riviera Open" && l.puntos === 220)
    ).toHaveLength(0);
    expect(lines.filter((l) => l.clubLabel === "Hack Pádel")).toHaveLength(1);
  });

  it("contexto Riviera: Riviera Open 225, Hack Pádel 220, Total 445", () => {
    const j = jugadorNevyl(RIVIERA_OPEN);
    const lines = buildJugadorPuntosBreakdown(j, RIVIERA_OPEN, {
      hasOrgContext: true,
      profileCard: true,
      registrationOrganizerId: RIVIERA_OPEN,
    });

    expect(lines[0]).toMatchObject({
      clubLabel: "Riviera Open",
      puntos: 225,
      role: "home",
    });
    expect(lines[1]).toMatchObject({
      clubLabel: "Hack Pádel",
      puntos: 220,
      role: "other",
    });
    expect(lines[2]).toMatchObject({
      clubLabel: "Total carrera",
      puntos: 445,
      role: "career-total",
    });
  });

  it("no duplica cuando context y registration son el mismo organizerId", () => {
    const c = career([{ org: HACKPADEL, pts: 220 }]);
    const b = breakdownFromCareerResult(c, HACKPADEL);
    const rows = buildClubPointsDisplayRows(b.pointsByClub, {
      contextualOrganizerId: HACKPADEL,
      registrationOrganizerId: HACKPADEL,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].organizerId).toBe(HACKPADEL);
    expect(rows[0].isContextClub).toBe(true);
    expect(rows[0].isRegistrationClub).toBe(true);
  });

  it("no hardcodea Riviera Open para el club contextual Hack", () => {
    clearOrganizerDisplayNameCache();
    rememberOrganizerDisplayName(HACKPADEL, "Hack Pádel");
    rememberOrganizerDisplayName(RIVIERA_OPEN, "Riviera Open");
    const c = career([
      { org: HACKPADEL, pts: 220 },
      { org: RIVIERA_OPEN, pts: 225 },
    ]);
    // club_name horneado incorrectamente (bug histórico)
    const poisoned = {
      ...breakdownFromCareerResult(c, HACKPADEL),
      pointsByClub: [
        { organizador_id: HACKPADEL, club_name: "Riviera Open", points: 220 },
        { organizador_id: RIVIERA_OPEN, club_name: "Riviera Open", points: 225 },
      ],
    };

    const lines = breakdownToDisplayLines(poisoned, HACKPADEL, {
      forceBreakdown: true,
      registrationOrganizerId: RIVIERA_OPEN,
    });

    expect(lines[0].clubLabel).toBe("Hack Pádel");
    expect(lines[0].puntos).toBe(220);
    expect(lines[1].clubLabel).toBe("Riviera Open");
    expect(lines[1].puntos).toBe(225);
    expect(
      lines.filter((l) => l.clubLabel === "Riviera Open" && l.puntos === 220)
    ).toHaveLength(0);
  });

  it("no altera valores de puntos ni el total de carrera", () => {
    const j = jugadorNevyl(HACKPADEL);
    const lines = buildJugadorPuntosBreakdown(j, HACKPADEL, {
      hasOrgContext: true,
      profileCard: true,
    });
    const clubPts = lines
      .filter((l) => l.role === "home" || l.role === "other")
      .reduce((s, l) => s + l.puntos, 0);
    const total = lines.find((l) => l.role === "career-total");
    expect(clubPts).toBe(445);
    expect(total?.puntos).toBe(445);
    expect(j.pointsBreakdown?.careerTotalAllClubs).toBe(445);
    expect(j.pointsBreakdown?.currentClubPoints).toBe(220);
  });

  it("labels salen del organizerId correcto (filas explícitas)", () => {
    const c = career([
      { org: HACKPADEL, pts: 220 },
      { org: RIVIERA_OPEN, pts: 225 },
    ]);
    const b = breakdownFromCareerResult(c, HACKPADEL);
    const rows = buildClubPointsDisplayRows(b.pointsByClub, {
      contextualOrganizerId: HACKPADEL,
      registrationOrganizerId: RIVIERA_OPEN,
    });
    expect(rows[0]).toMatchObject({
      organizerId: HACKPADEL,
      clubName: "Hack Pádel",
      points: 220,
      isContextClub: true,
      isRegistrationClub: false,
    });
    expect(rows[1]).toMatchObject({
      organizerId: RIVIERA_OPEN,
      clubName: "Riviera Open",
      points: 225,
      isContextClub: false,
      isRegistrationClub: true,
    });
  });
});
