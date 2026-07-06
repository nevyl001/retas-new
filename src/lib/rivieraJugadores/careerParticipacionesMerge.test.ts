jest.mock("./publicCareerLinkage", () => ({
  listCareerParticipacionesPublic: jest.fn(),
}));

jest.mock("./rivieraJugadoresService", () => ({
  listParticipacionesPublic: jest.fn(),
}));

import { listCareerParticipacionesPublic } from "./publicCareerLinkage";
import { listParticipacionesPublic } from "./rivieraJugadoresService";
import { mergeCareerParticipacionesForIdentity } from "./careerParticipacionesMerge";
import type { JugadorParticipacion } from "./types";

const CLUB_TEST = "cd45cea7-a8ac-4596-b0ee-24959b4cbb5d";
const HACKPADEL = "e724de97-3552-4a01-a269-f621e6f1ed26";
const CANONICAL = "11111111-1111-4111-8111-111111111111";
const HACK_LOCAL = "22222222-2222-4222-8222-222222222222";

function part(
  id: string,
  jugadorId: string,
  org: string,
  pts: number
): JugadorParticipacion {
  return {
    id,
    jugador_id: jugadorId,
    tipo_evento: "duelo_2v2",
    evento_id: `event-${id}`,
    evento_nombre: "Test 2",
    resultado: "victoria",
    pareja_con: "Pareja",
    sets_favor: 2,
    sets_contra: 0,
    puntos_obtenidos: pts,
    fecha: "2026-07-06",
    created_at: "2026-07-06T12:00:00Z",
    metadata: { organizador_id: org, club_name: "HackPadel" },
  };
}

describe("mergeCareerParticipacionesForIdentity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("Caso A: carrera vacía en canónico pero scoped HackPadel trae 50 pts", async () => {
    const hackRow = part("hp-1", HACK_LOCAL, HACKPADEL, 50);
    (listCareerParticipacionesPublic as jest.Mock).mockResolvedValue([]);
    (listParticipacionesPublic as jest.Mock).mockImplementation(
      async (_id: string, _limit: number, org?: string | null) => {
        if (org === HACKPADEL) return [hackRow];
        return [];
      }
    );

    const rows = await mergeCareerParticipacionesForIdentity(
      {
        canonicalJugadorId: CANONICAL,
        anchorJugadorId: CANONICAL,
        linkedJugadorIds: [CANONICAL, HACK_LOCAL],
        viewingOrganizadorId: HACKPADEL,
      },
      100
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].metadata?.organizador_id).toBe(HACKPADEL);
    expect(rows[0].puntos_obtenidos).toBe(50);
  });

  it("Caso B: fusiona eventos Club Test + HackPadel sin duplicar", async () => {
    const rowsCanon = [part("ct-1", CANONICAL, CLUB_TEST, 30)];
    const rowsHack = [part("hp-1", HACK_LOCAL, HACKPADEL, 50)];
    (listCareerParticipacionesPublic as jest.Mock).mockImplementation(
      async (id: string) => (id === CANONICAL ? rowsCanon : [])
    );
    (listParticipacionesPublic as jest.Mock).mockImplementation(
      async (id: string, _limit: number, org?: string | null) => {
        if (id === HACK_LOCAL && !org) return rowsHack;
        if (id === CANONICAL && !org) return rowsCanon;
        return [];
      }
    );

    const merged = await mergeCareerParticipacionesForIdentity(
      {
        canonicalJugadorId: CANONICAL,
        anchorJugadorId: CANONICAL,
        linkedJugadorIds: [CANONICAL, HACK_LOCAL],
        viewingOrganizadorId: null,
      },
      100
    );

    expect(merged.map((r) => r.id).sort()).toEqual(["ct-1", "hp-1"]);
  });
});
