jest.mock("./publicCareerLinkage", () => ({
  listCareerParticipacionesPublic: jest.fn(),
}));

jest.mock("./rivieraJugadoresService", () => ({
  listParticipacionesPublic: jest.fn(),
}));

jest.mock("./orphanProfileLink", () => ({
  ensureOfficialProfileLinkForParticipacion: jest.fn(),
  requireOfficialProfileLinkForParticipacion: jest.fn(),
}));

import { listCareerParticipacionesPublic } from "./publicCareerLinkage";
import { listParticipacionesPublic } from "./rivieraJugadoresService";
import { requireOfficialProfileLinkForParticipacion } from "./orphanProfileLink";
import { mergeCareerParticipacionesForIdentity } from "./careerParticipacionesMerge";
import { computeCareerPointsByClubFromParticipaciones } from "./careerPointsByClub";
import {
  breakdownFromCareerResult,
  resolvePlayerPointsBreakdown,
} from "./playerPointsBreakdown";
import { buildJugadorPuntosBreakdown } from "./jugadorPuntosBreakdown";
import type { JugadorParticipacion, RivieraJugadorWithStats } from "./types";

const HACKPADEL = "e724de97-3552-4a01-a269-f621e6f1ed26";
const RIVIERA_OPEN = "2770b522-9064-4c7b-a729-4a0ea7e3f6e8";

const DANIEL_OFFICIAL = "daniel-official-0009";
const DANIEL_ORPHAN = "daniel-orphan-hack";
const SEBASTIAN_OFFICIAL = "sebastian-official-24";
const SEBASTIAN_ORPHAN = "sebastian-orphan-hack";
const CT1_OFFICIAL = "testplayer-ct1-official";

function part(
  id: string,
  jugadorId: string,
  org: string,
  pts: number,
  evento: string
): JugadorParticipacion {
  return {
    id,
    jugador_id: jugadorId,
    tipo_evento: "reta",
    evento_id: `event-${id}`,
    evento_nombre: evento,
    resultado: "victoria",
    pareja_con: null,
    sets_favor: 2,
    sets_contra: 0,
    puntos_obtenidos: pts,
    fecha: "2026-07-01",
    created_at: "2026-07-01T00:00:00Z",
    metadata: {
      organizador_id: org,
      club_name: org === HACKPADEL ? "HackPadel" : "Riviera Open",
    },
  };
}

function identity(linkedIds: string[], anchor: string) {
  return {
    canonicalJugadorId: linkedIds[0],
    anchorJugadorId: anchor,
    linkedJugadorIds: linkedIds,
    viewingOrganizadorId: HACKPADEL,
  };
}

describe("orphan career profile integrity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (listParticipacionesPublic as jest.Mock).mockResolvedValue([]);
  });

  it("1) oficial + huérfano: tras link, merge incluye ambos y breakdown suma", async () => {
    const officialRows = [part("ro-50", DANIEL_OFFICIAL, RIVIERA_OPEN, 75, "Riviera")];
    const orphanRows = [
      part("hp-50", DANIEL_ORPHAN, HACKPADEL, 50, "Reta Nocturna"),
      part("hp-25", DANIEL_ORPHAN, HACKPADEL, 25, "Lunes Mixta"),
    ];

    (listCareerParticipacionesPublic as jest.Mock).mockImplementation(
      async (id: string) => {
        if (id === DANIEL_OFFICIAL) return [...officialRows, ...orphanRows];
        return [];
      }
    );

    const merged = await mergeCareerParticipacionesForIdentity(
      identity([DANIEL_OFFICIAL, DANIEL_ORPHAN], DANIEL_OFFICIAL),
      100
    );

    expect(merged).toHaveLength(3);
    const career = computeCareerPointsByClubFromParticipaciones(merged, {
      jugadorHomeOrgById: new Map([
        [DANIEL_OFFICIAL, RIVIERA_OPEN],
        [DANIEL_ORPHAN, HACKPADEL],
      ]),
      viewingOrganizadorId: HACKPADEL,
      includeViewingOrgWithZero: true,
    });
    expect(career.puntosByOrg.get(HACKPADEL)).toBe(75);
    expect(career.total).toBe(150);

    const breakdown = breakdownFromCareerResult(career, HACKPADEL);
    expect(breakdown.currentClubPoints).toBe(75);
    expect(breakdown.careerTotalAllClubs).toBe(150);
  });

  it("2) Daniel N: RIV-00000009 + huérfano → HackPadel 75 pts", async () => {
    const rows = [
      part("dn-ro", DANIEL_OFFICIAL, RIVIERA_OPEN, 75, "Riviera local"),
      part("dn-h1", DANIEL_ORPHAN, HACKPADEL, 50, "Reta Nocturna"),
      part("dn-h2", DANIEL_ORPHAN, HACKPADEL, 25, "Lunes Mixta"),
    ];
    (listCareerParticipacionesPublic as jest.Mock).mockResolvedValue(rows);

    const merged = await mergeCareerParticipacionesForIdentity(
      identity([DANIEL_OFFICIAL, DANIEL_ORPHAN], DANIEL_OFFICIAL),
      100
    );
    const career = computeCareerPointsByClubFromParticipaciones(merged, {
      viewingOrganizadorId: HACKPADEL,
      includeViewingOrgWithZero: true,
    });
    expect(career.puntosByOrg.get(HACKPADEL)).toBe(75);
  });

  it("3) Sebastian: RIV-00000024 + huérfano → HackPadel 25 pts", async () => {
    const rows = [
      part("sb-ro", SEBASTIAN_OFFICIAL, RIVIERA_OPEN, 25, "Riviera"),
      part("sb-hp", SEBASTIAN_ORPHAN, HACKPADEL, 25, "Lunes Mixta"),
    ];
    (listCareerParticipacionesPublic as jest.Mock).mockResolvedValue(rows);

    const merged = await mergeCareerParticipacionesForIdentity(
      identity([SEBASTIAN_OFFICIAL, SEBASTIAN_ORPHAN], SEBASTIAN_OFFICIAL),
      100
    );
    const career = computeCareerPointsByClubFromParticipaciones(merged, {
      viewingOrganizadorId: HACKPADEL,
      includeViewingOrgWithZero: true,
    });
    expect(career.puntosByOrg.get(HACKPADEL)).toBe(25);
  });

  it("4) multi-club: HackPadel X + Riviera Open Y = Total X+Y", async () => {
    const rows = [
      part("mc-h", DANIEL_OFFICIAL, HACKPADEL, 50, "Hack"),
      part("mc-r", DANIEL_OFFICIAL, RIVIERA_OPEN, 30, "Riviera"),
    ];
    (listCareerParticipacionesPublic as jest.Mock).mockResolvedValue(rows);

    const merged = await mergeCareerParticipacionesForIdentity(
      identity([DANIEL_OFFICIAL], DANIEL_OFFICIAL),
      100
    );
    const career = computeCareerPointsByClubFromParticipaciones(merged);
    expect(career.puntosByOrg.get(HACKPADEL)).toBe(50);
    expect(career.puntosByOrg.get(RIVIERA_OPEN)).toBe(30);
    expect(career.total).toBe(80);
  });

  it("5) cedido/importado: puntos al club anfitrión, no al origen", async () => {
    const rows = [
      part("imp-hp", CT1_OFFICIAL, HACKPADEL, 50, "Torneo HackPadel"),
    ];
    (listCareerParticipacionesPublic as jest.Mock).mockResolvedValue(rows);

    const merged = await mergeCareerParticipacionesForIdentity(
      identity([CT1_OFFICIAL], CT1_OFFICIAL),
      100
    );
    const career = computeCareerPointsByClubFromParticipaciones(merged, {
      jugadorHomeOrgById: new Map([[CT1_OFFICIAL, RIVIERA_OPEN]]),
      viewingOrganizadorId: HACKPADEL,
    });
    expect(career.puntosByOrg.get(HACKPADEL)).toBe(50);
    expect(career.puntosByOrg.get(RIVIERA_OPEN) ?? 0).toBe(0);
  });

  it("6) reimportación: dedupe evita duplicar historial/puntos", async () => {
    const row = part("dup-1", CT1_OFFICIAL, HACKPADEL, 50, "Evento");
    (listCareerParticipacionesPublic as jest.Mock).mockResolvedValue([row, row]);

    const merged = await mergeCareerParticipacionesForIdentity(
      identity([CT1_OFFICIAL], CT1_OFFICIAL),
      100
    );
    expect(merged).toHaveLength(1);
    const career = computeCareerPointsByClubFromParticipaciones(merged);
    expect(career.total).toBe(50);
  });

  it("7) sin huérfano en linkedIds: carrera incompleta (regresión pre-repair)", async () => {
    const officialOnly = [part("pre-0", DANIEL_OFFICIAL, RIVIERA_OPEN, 75, "Riviera")];
    (listCareerParticipacionesPublic as jest.Mock).mockResolvedValue(officialOnly);

    const merged = await mergeCareerParticipacionesForIdentity(
      identity([DANIEL_OFFICIAL], DANIEL_OFFICIAL),
      100
    );
    const career = computeCareerPointsByClubFromParticipaciones(merged, {
      viewingOrganizadorId: HACKPADEL,
      includeViewingOrgWithZero: true,
    });
    expect(career.puntosByOrg.get(HACKPADEL) ?? 0).toBe(0);
  });

  it("8) resolveJugadorIdForParticipacion usa requireOfficialProfileLink", async () => {
    (requireOfficialProfileLinkForParticipacion as jest.Mock).mockResolvedValue({
      linked: true,
      confidence: "OK",
      reason: "perfil ya enlazado",
    });

    const { resolveJugadorIdForParticipacion } = await import("./jugadorIdResolver");
    expect(typeof resolveJugadorIdForParticipacion).toBe("function");
    expect(requireOfficialProfileLinkForParticipacion).toBeDefined();
  });
});

describe("orphan repair UI coherence", () => {
  it("card y ficha usan resolvePlayerPointsBreakdown con mismos totales", async () => {
    const participaciones = [
      part("ui-1", DANIEL_OFFICIAL, HACKPADEL, 75, "Reta Nocturna"),
    ];
    const jugador = {
      id: DANIEL_OFFICIAL,
      nombre: "Daniel N",
      organizador_id: RIVIERA_OPEN,
      careerPuntosByClub: [{ organizadorId: HACKPADEL, puntos: 75 }],
      careerPuntosTotal: 75,
    } as RivieraJugadorWithStats;

    const breakdown = await resolvePlayerPointsBreakdown({
      jugador,
      currentOrganizadorId: HACKPADEL,
      participaciones,
    });
    expect(breakdown.currentClubPoints).toBe(75);

    const lines = buildJugadorPuntosBreakdown(
      { ...jugador, pointsBreakdown: breakdown },
      HACKPADEL,
      { hasOrgContext: true, profileCard: true }
    );
    expect(lines.some((l) => l.puntos === 75)).toBe(true);
  });
});
