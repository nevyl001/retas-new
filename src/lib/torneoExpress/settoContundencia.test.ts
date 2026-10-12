import { buildStandingsGeneral } from "./standings";
import type {
  PartidoSetScore,
  StandingRowExpress,
  TorneoExpressGrupo,
  TorneoExpressGrupoPareja,
  TorneoExpressPartido,
} from "./types";

function grupo(id: string, nombre: string, orden: number): TorneoExpressGrupo {
  return { id, torneo_id: "t", nombre, orden, created_at: "" };
}

function pareja(grupoId: string, id: string, label: string): TorneoExpressGrupoPareja {
  return {
    id: `gp-${id}`,
    grupo_id: grupoId,
    pareja_id: id,
    pareja_display: label,
    created_at: "",
  };
}

function jugado(
  grupoId: string,
  id: string,
  local: string,
  visit: string,
  sets: PartidoSetScore[],
  ganador: string
): TorneoExpressPartido {
  return {
    id,
    grupo_id: grupoId,
    pareja_local_id: local,
    pareja_visitante_id: visit,
    puntos_local: null,
    puntos_visitante: null,
    sets_resultado: sets,
    ganador_id: ganador,
    estado: "jugado",
    orden: 1,
    created_at: "",
  };
}

const grupos = [
  grupo("ga", "Grupo A", 0),
  grupo("gb", "Grupo B", 1),
  grupo("gc", "Grupo C", 2),
  grupo("gd", "Grupo D", 3),
];

const parejasPorGrupo: Record<string, TorneoExpressGrupoPareja[]> = {
  ga: [
    pareja("ga", "alan", "Alan Villa / Ivan Olivares"),
    pareja("ga", "poncho", "Poncho G / David Rus"),
    pareja("ga", "mario", "Mario A / Alejandro Heredia"),
  ],
  gb: [
    pareja("gb", "israel", "Israel Plata / Hector Cano"),
    pareja("gb", "juan", "Juan C Avendaño / Eric Blanco Pony"),
    pareja("gb", "said", "Said C / César G"),
  ],
  gc: [
    pareja("gc", "sergio", "Sergio Villa / Victor Gutierrez"),
    pareja("gc", "diegoch", "Diegoch / Santiago F"),
    pareja("gc", "josue", "Josue / Alex R"),
  ],
  gd: [
    pareja("gd", "jacinto", "Jacinto / Rodrigo HP"),
    pareja("gd", "lalo", "Lalo E / Ivan Vicente"),
    pareja("gd", "isra", "Isra / Aldo Vargas"),
  ],
};

const partidosPorGrupo: Record<string, TorneoExpressPartido[]> = {
  ga: [
    jugado("ga", "a1", "poncho", "alan", [
      { local: 5, visitante: 7 },
      { local: 2, visitante: 6 },
    ], "alan"),
    jugado("ga", "a2", "poncho", "mario", [
      { local: 6, visitante: 4 },
      { local: 6, visitante: 0 },
    ], "poncho"),
    jugado("ga", "a3", "mario", "alan", [
      { local: 4, visitante: 6 },
      { local: 2, visitante: 6 },
    ], "alan"),
  ],
  gb: [
    jugado("gb", "b1", "said", "juan", [
      { local: 2, visitante: 6 },
      { local: 3, visitante: 6 },
    ], "juan"),
    jugado("gb", "b2", "said", "israel", [
      { local: 2, visitante: 6 },
      { local: 3, visitante: 6 },
    ], "israel"),
    jugado("gb", "b3", "israel", "juan", [
      { local: 6, visitante: 3 },
      { local: 6, visitante: 4 },
    ], "israel"),
  ],
  gc: [
    jugado("gc", "c1", "diegoch", "sergio", [
      { local: 6, visitante: 4 },
      { local: 3, visitante: 6 },
      { local: 6, visitante: 7 },
    ], "sergio"),
    jugado("gc", "c2", "josue", "diegoch", [
      { local: 6, visitante: 2 },
      { local: 3, visitante: 6 },
      { local: 6, visitante: 7 },
    ], "diegoch"),
    jugado("gc", "c3", "josue", "sergio", [
      { local: 7, visitante: 6 },
      { local: 3, visitante: 6 },
      { local: 6, visitante: 7 },
    ], "sergio"),
  ],
  gd: [
    jugado("gd", "d1", "isra", "lalo", [
      { local: 7, visitante: 5 },
      { local: 3, visitante: 6 },
      { local: 6, visitante: 7 },
    ], "lalo"),
    jugado("gd", "d2", "isra", "jacinto", [
      { local: 4, visitante: 6 },
      { local: 3, visitante: 6 },
    ], "jacinto"),
    jugado("gd", "d3", "lalo", "jacinto", [
      { local: 3, visitante: 6 },
      { local: 2, visitante: 6 },
    ], "jacinto"),
  ],
};

function byId(rows: StandingRowExpress[], id: string): StandingRowExpress {
  const row = rows.find((item) => item.parejaId === id);
  if (!row) throw new Error(`falta ${id}`);
  return row;
}

function places(rows: StandingRowExpress[]): Record<string, number> {
  return Object.fromEntries(rows.map((row) => [row.parejaId, row.posicion]));
}

describe("setto_pg contundencia en 4ta Fuerza", () => {
  const rows = buildStandingsGeneral(
    grupos,
    parejasPorGrupo,
    partidosPorGrupo,
    "setto_pg"
  );

  it("Israel y Jacinto comparten el 1 y Alan queda 3", () => {
    expect(byId(rows, "israel").posicion).toBe(1);
    expect(byId(rows, "jacinto").posicion).toBe(1);
    expect(byId(rows, "alan").posicion).toBe(3);
    expect(byId(rows, "israel").tie).toEqual({
      status: "unresolved",
      pairIds: ["israel", "jacinto"].sort(),
    });
    expect(byId(rows, "jacinto").tie.status).toBe("unresolved");
    expect(byId(rows, "alan").tie.status).toBe("resolved");
    expect(byId(rows, "israel").dif).toBe(12);
    expect(byId(rows, "jacinto").dif).toBe(12);
    expect(byId(rows, "alan").dif).toBe(12);
    expect(byId(rows, "israel").ptsCon).toBe(12);
    expect(byId(rows, "jacinto").ptsCon).toBe(12);
    expect(byId(rows, "alan").ptsFav).toBe(25);
    expect(byId(rows, "alan").ptsCon).toBe(13);
  });

  it("el resto de la tabla usa el puesto competitivo, no el índice", () => {
    expect(places(rows)).toEqual({
      israel: 1,
      jacinto: 1,
      alan: 3,
      sergio: 4,
      juan: 5,
      poncho: 6,
      diegoch: 7,
      lalo: 8,
      josue: 9,
      isra: 10,
      mario: 11,
      said: 11,
    });
    expect(byId(rows, "mario").tie.status).toBe("unresolved");
    expect(byId(rows, "said").tie.status).toBe("unresolved");
    expect(byId(rows, "juan").tie.status).toBe("resolved");
    expect(byId(rows, "poncho").tie.status).toBe("resolved");
  });

  it("el puesto no depende del orden de grupos ni del nombre", () => {
    const reversed = buildStandingsGeneral(
      [...grupos].reverse(),
      {
        gd: [...parejasPorGrupo.gd].reverse().map((row) => ({
          ...row,
          pareja_display: `Z ${row.pareja_display}`,
        })),
        gc: [...parejasPorGrupo.gc].reverse(),
        gb: [...parejasPorGrupo.gb].reverse(),
        ga: [...parejasPorGrupo.ga].reverse().map((row) => ({
          ...row,
          pareja_display: `A ${row.pareja_display}`,
        })),
      },
      partidosPorGrupo,
      "setto_pg"
    );
    expect(places(reversed)).toEqual(places(rows));
  });

  it("Games a favor no usa sets cerrados: Alan sigue arriba de Israel por FAV", () => {
    const games = buildStandingsGeneral(
      grupos,
      parejasPorGrupo,
      partidosPorGrupo,
      "dif_puntos"
    );
    expect(byId(games, "sergio").posicion).toBe(1);
    expect(byId(games, "alan").posicion).toBeLessThan(byId(games, "israel").posicion);
    expect(byId(games, "israel").posicion).toBe(byId(games, "jacinto").posicion);
    expect(byId(games, "israel").tie.status).toBe("unresolved");
  });
});

describe("setto_pg 6-2 contra 7-5", () => {
  it("prioriza el set limpio cuando puntos, sets y diferencia de games empatan", () => {
    const rows = buildStandingsGeneral(
      [grupo("g1", "A", 0), grupo("g2", "B", 1)],
      {
        g1: [pareja("g1", "cerrado", "Cerrado"), pareja("g1", "rival-a", "Rival A")],
        g2: [pareja("g2", "limpio", "Limpio"), pareja("g2", "rival-b", "Rival B")],
      },
      {
        g1: [
          jugado("g1", "m1", "cerrado", "rival-a", [
            { local: 7, visitante: 5 },
            { local: 6, visitante: 2 },
          ], "cerrado"),
        ],
        g2: [
          jugado("g2", "m2", "limpio", "rival-b", [
            { local: 6, visitante: 3 },
            { local: 6, visitante: 3 },
          ], "limpio"),
        ],
      },
      "setto_pg"
    );
    expect(byId(rows, "limpio").dif).toBe(byId(rows, "cerrado").dif);
    expect(byId(rows, "limpio").setsFav).toBe(2);
    expect(byId(rows, "cerrado").setsFav).toBe(2);
    expect(byId(rows, "limpio").posicion).toBe(1);
    expect(byId(rows, "cerrado").posicion).toBe(2);
    expect(byId(rows, "limpio").tie.status).toBe("resolved");
  });
});
