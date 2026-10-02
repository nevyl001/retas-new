import { buildEliminatoriaLabelMap } from "./eliminatoriaLabels";
import { buildPublicBracketViewModel } from "./publicBracketModel";
import { buildStandingsForGrupo } from "./standings";
import type {
  TorneoExpress,
  TorneoExpressEliminatoriaPartido,
  TorneoExpressGrupo,
  TorneoExpressGrupoPareja,
} from "./types";

const PAIR_V = "ffff0000-0000-4000-8000-000000000099";
const PAIR_R = "aaaa0000-0000-4000-8000-000000000001";

const grupo: TorneoExpressGrupo = {
  id: "g1",
  torneo_id: "t1",
  nombre: "Grupo A",
  orden: 1,
  created_at: "",
};

function pareja(
  id: string,
  display: string,
  virtual: boolean
): TorneoExpressGrupoPareja {
  return {
    id: `row-${id}`,
    grupo_id: "g1",
    pareja_id: id,
    pareja_display: display,
    player1_id: virtual ? null : "p1",
    player2_id: virtual ? null : "p2",
    is_virtual: virtual,
    virtual_label: virtual ? display : null,
    created_at: "",
  };
}

describe("standings y bracket con pareja virtual", () => {
  it("la tabla usa el display virtual y los puntos siguen saliendo del marcador", () => {
    const rows = buildStandingsForGrupo(
      grupo,
      [
        pareja(PAIR_V, "Pareja por definir 1", true),
        pareja(PAIR_R, "Juan / Pedro", false),
      ],
      [
        {
          id: "m1",
          grupo_id: "g1",
          pareja_local_id: PAIR_V,
          pareja_visitante_id: PAIR_R,
          puntos_local: 6,
          puntos_visitante: 4,
          ganador_id: PAIR_V,
          estado: "jugado",
          created_at: "",
        },
      ]
    );
    const virtual = rows.find((row) => row.parejaId === PAIR_V);
    const real = rows.find((row) => row.parejaId === PAIR_R);
    expect(virtual?.parejaLabel).toBe("Pareja por definir 1");
    expect(virtual?.parejaLabel).not.toContain(PAIR_V);
    expect(virtual?.pg).toBe(1);
    expect(virtual?.ptsFav).toBe(6);
    expect(real?.parejaLabel).toBe("Juan / Pedro");
    expect(real?.pp).toBe(1);
  });

  it("el bracket resuelve por pair.id y cambia el texto al resolver, sin mover la plaza", () => {
    const virtual = pareja(PAIR_V, "Pareja por definir 1", true);
    const rival = pareja(PAIR_R, "Juan / Pedro", false);
    const partido: TorneoExpressEliminatoriaPartido = {
      id: "elim-1",
      torneo_id: "t1",
      ronda: 1,
      orden: 1,
      cruce_index: 0,
      pareja_local_id: PAIR_V,
      pareja_visitante_id: PAIR_R,
      puntos_local: null,
      puntos_visitante: null,
      ganador_id: null,
      estado: "pendiente",
      es_bye: false,
      created_at: "",
    };
    const torneo = {
      id: "t1",
      nombre: "Express",
      organizador_id: "org",
      estado: "en_curso",
      source_tournament_id: null,
      created_at: "",
      fase_torneo: "eliminatoria",
      fase_eliminacion: "semifinal",
      bracket_slots: null,
    } as TorneoExpress;

    const beforeMap = buildEliminatoriaLabelMap({
      torneo,
      grupos: [grupo],
      parejasPorGrupo: { g1: [virtual, rival] },
      partidosPorGrupo: {},
      eliminatoriaPartidos: [partido],
    });
    const before = buildPublicBracketViewModel(
      {
        torneo,
        grupos: [grupo],
        parejasPorGrupo: { g1: [virtual, rival] },
        partidosPorGrupo: {},
        eliminatoriaPartidos: [partido],
      },
      beforeMap
    );
    const card = before.allBracketCards.find((item) => item.id === "elim-1");
    expect(card?.local.parejaId).toBe(PAIR_V);
    expect(card?.local.label).toBe("Pareja por definir 1");
    expect(card?.local.label).not.toContain(PAIR_V);

    const resolved = pareja(PAIR_V, "Mara / Fernanda", false);
    const afterMap = buildEliminatoriaLabelMap({
      torneo,
      grupos: [grupo],
      parejasPorGrupo: { g1: [resolved, rival] },
      partidosPorGrupo: {},
      eliminatoriaPartidos: [partido],
    });
    const after = buildPublicBracketViewModel(
      {
        torneo,
        grupos: [grupo],
        parejasPorGrupo: { g1: [resolved, rival] },
        partidosPorGrupo: {},
        eliminatoriaPartidos: [partido],
      },
      afterMap
    );
    const next = after.allBracketCards.find((item) => item.id === "elim-1");
    expect(next?.local.parejaId).toBe(PAIR_V);
    expect(next?.local.label).toBe("Mara / Fernanda");
    expect(next?.id).toBe(card?.id);
  });
});
