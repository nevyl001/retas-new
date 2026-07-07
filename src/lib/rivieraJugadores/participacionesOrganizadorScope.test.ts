import {
  filterParticipacionesForOrganizador,
  sumPuntosFromParticipaciones,
} from "./participacionesOrganizadorScope";
import { computeJugadorStatsFromParticipaciones } from "./rebuildJugadorStats";
import type { JugadorParticipacion } from "./types";

describe("participacionesOrganizadorScope", () => {
  const clubTest = "club-test-id";
  const hackpadel = "hackpadel-id";

  const rows: JugadorParticipacion[] = [
    {
      id: "p1",
      jugador_id: "ossy",
      tipo_evento: "torneo_express",
      evento_id: "e1",
      evento_nombre: "Rush Padelito",
      fecha: "2026-06-12",
      puntos_obtenidos: 50,
      resultado: "participación",
      pareja_con: null,
      sets_favor: 0,
      sets_contra: 0,
      metadata: { organizador_id: clubTest },
      created_at: "2026-06-12T10:00:00Z",
    },
    {
      id: "p2",
      jugador_id: "ossy",
      tipo_evento: "duelo_2v2",
      evento_id: "e2",
      evento_nombre: "Reta test Hackpadel",
      fecha: "2026-07-05",
      puntos_obtenidos: 50,
      resultado: "victoria",
      pareja_con: null,
      sets_favor: 0,
      sets_contra: 0,
      metadata: { organizador_id: hackpadel },
      created_at: "2026-07-05T10:00:00Z",
    },
  ];

  it("filtra participaciones por organizador_id en metadata", () => {
    const clubTestOnly = filterParticipacionesForOrganizador(rows, clubTest);
    expect(clubTestOnly).toHaveLength(1);
    expect(clubTestOnly[0].id).toBe("p1");
    expect(sumPuntosFromParticipaciones(clubTestOnly)).toBe(50);
  });

  it("rebuild stats excluye eventos de otro club", () => {
    const stats = computeJugadorStatsFromParticipaciones("ossy", rows, clubTest);
    expect(stats.puntos_totales).toBe(50);
    expect(stats.total_torneos_express).toBe(1);
    expect(stats.total_retas).toBe(0);
  });

  it("participación sin metadata.organizador_id no cuenta para ningún club (ni home)", () => {
    const orphanRow: JugadorParticipacion = {
      id: "p-orphan",
      jugador_id: "ossy",
      tipo_evento: "torneo_express",
      evento_id: "e1",
      evento_nombre: "Riviera Open Rush Padelito",
      fecha: "2026-06-12",
      puntos_obtenidos: 50,
      resultado: "participación",
      pareja_con: null,
      sets_favor: 0,
      sets_contra: 0,
      metadata: {},
      created_at: "2026-06-12T10:00:00Z",
    };

    const clubTestOnly = filterParticipacionesForOrganizador([orphanRow], clubTest, {
      jugadorHomeOrganizadorId: clubTest,
    });
    expect(clubTestOnly).toHaveLength(0);
  });
});
