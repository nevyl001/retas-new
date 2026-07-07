jest.mock("./publicCareerLinkage", () => ({
  listCareerParticipacionesPublic: jest.fn(),
  listParticipacionesForJugadorIds: jest.fn(),
}));

import {
  listCareerParticipacionesPublic,
  listParticipacionesForJugadorIds,
} from "./publicCareerLinkage";
import { mergeCareerParticipacionesForIdentity } from "./careerParticipacionesMerge";
import type { JugadorParticipacion } from "./types";

const CLUB_TEST = "cd45cea7-a8ac-4596-b0ee-24959b4cbb5d";
const HACKPADEL = "e724de97-3552-4a01-a269-f621e6f1ed26";
const RIVIERA = "2770b522-9064-4c7b-a729-4a0ea7e3f6e8";
const CANONICAL = "11111111-1111-4111-8111-111111111111";
const HACK_LOCAL = "22222222-2222-4222-8222-222222222222";
const RO_LOCAL = "33333333-3333-4333-8333-333333333333";

function part(
  id: string,
  jugadorId: string,
  org: string,
  pts: number,
  nombre = "Test event"
): JugadorParticipacion {
  return {
    id,
    jugador_id: jugadorId,
    tipo_evento: "reta",
    evento_id: `event-${id}`,
    evento_nombre: nombre,
    resultado: "victoria",
    pareja_con: "Pareja",
    sets_favor: 2,
    sets_contra: 0,
    puntos_obtenidos: pts,
    fecha: "2026-07-06",
    created_at: "2026-07-06T12:00:00Z",
    metadata: { organizador_id: org },
  };
}

describe("mergeCareerParticipacionesForIdentity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (listCareerParticipacionesPublic as jest.Mock).mockResolvedValue([]);
    (listParticipacionesForJugadorIds as jest.Mock).mockResolvedValue([]);
  });

  it("fusiona eventos de todos los perfiles vinculados sin filtrar por org", async () => {
    const hackRow = part("hp-1", HACK_LOCAL, HACKPADEL, 75, "Reta Nocturna");
    const roRow = part("ro-1", RO_LOCAL, RIVIERA, 100, "Reta Nocturna RO");

    (listParticipacionesForJugadorIds as jest.Mock).mockResolvedValue([
      hackRow,
      roRow,
    ]);

    const fromHp = await mergeCareerParticipacionesForIdentity(
      {
        canonicalJugadorId: CANONICAL,
        anchorJugadorId: HACK_LOCAL,
        linkedJugadorIds: [CANONICAL, HACK_LOCAL, RO_LOCAL],
        viewingOrganizadorId: HACKPADEL,
      },
      100
    );
    const fromRo = await mergeCareerParticipacionesForIdentity(
      {
        canonicalJugadorId: CANONICAL,
        anchorJugadorId: RO_LOCAL,
        linkedJugadorIds: [CANONICAL, HACK_LOCAL, RO_LOCAL],
        viewingOrganizadorId: RIVIERA,
      },
      100
    );

    expect(fromHp.map((r) => r.id).sort()).toEqual(["hp-1", "ro-1"]);
    expect(fromRo.map((r) => r.id).sort()).toEqual(["hp-1", "ro-1"]);
    expect(listParticipacionesForJugadorIds).toHaveBeenCalledWith(
      expect.arrayContaining([CANONICAL, HACK_LOCAL, RO_LOCAL]),
      100
    );
  });

  it("Caso Victor L equivalente: Hackpadel 75 + Riviera Open 100 en ambas vistas", async () => {
    const hackRow = part("v-hp", HACK_LOCAL, HACKPADEL, 75, "Reta Nocturna");
    const roRow = part("v-ro", RO_LOCAL, RIVIERA, 100, "Reta Nocturna RO");

    (listParticipacionesForJugadorIds as jest.Mock).mockResolvedValue([
      hackRow,
      roRow,
    ]);

    const merged = await mergeCareerParticipacionesForIdentity(
      {
        canonicalJugadorId: HACK_LOCAL,
        anchorJugadorId: HACK_LOCAL,
        linkedJugadorIds: [HACK_LOCAL, RO_LOCAL],
        viewingOrganizadorId: HACKPADEL,
      },
      100
    );

    expect(merged).toHaveLength(2);
    expect(merged.map((r) => r.puntos_obtenidos).sort((a, b) => a - b)).toEqual([75, 100]);
  });

  it("fusiona Club Test + HackPadel sin duplicar", async () => {
    const rowsCanon = [part("ct-1", CANONICAL, CLUB_TEST, 30)];
    const rowsHack = [part("hp-1", HACK_LOCAL, HACKPADEL, 50)];

    (listParticipacionesForJugadorIds as jest.Mock).mockResolvedValue([
      ...rowsCanon,
      ...rowsHack,
    ]);

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

  it("fallback a career RPC cuando listParticipacionesForJugadorIds no está desplegado", async () => {
    const careerRow = part("c-1", CANONICAL, CLUB_TEST, 40);
    (listParticipacionesForJugadorIds as jest.Mock).mockResolvedValue(null);
    (listCareerParticipacionesPublic as jest.Mock).mockResolvedValue([careerRow]);

    const merged = await mergeCareerParticipacionesForIdentity(
      {
        canonicalJugadorId: CANONICAL,
        anchorJugadorId: CANONICAL,
        linkedJugadorIds: [CANONICAL],
        viewingOrganizadorId: HACKPADEL,
      },
      100
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("c-1");
  });

  it("guardrail: viewingOrganizadorId no limita el historial global", async () => {
    const allRows = [
      part("hp-1", HACK_LOCAL, HACKPADEL, 75),
      part("ro-1", RO_LOCAL, RIVIERA, 100),
    ];
    (listParticipacionesForJugadorIds as jest.Mock).mockResolvedValue(allRows);

    const merged = await mergeCareerParticipacionesForIdentity(
      {
        canonicalJugadorId: CANONICAL,
        anchorJugadorId: HACK_LOCAL,
        linkedJugadorIds: [HACK_LOCAL, RO_LOCAL],
        viewingOrganizadorId: HACKPADEL,
      },
      100
    );

    expect(merged).toHaveLength(2);
    expect(merged.some((r) => r.metadata?.organizador_id === RIVIERA)).toBe(true);
  });
});
