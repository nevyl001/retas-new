import fs from "fs";
import path from "path";
import { buildStandingsForGrupo } from "./standings";
import { calculateMiniRanking, resolveTwoWayTie } from "./groupRanking";
import type {
  StandingRowExpress,
  TorneoExpressGrupo,
  TorneoExpressGrupoPareja,
  TorneoExpressPartido,
} from "./types";

const grupo: TorneoExpressGrupo = {
  id: "g1",
  torneo_id: "t1",
  nombre: "Grupo 1",
  orden: 1,
  created_at: "",
};

function pareja(id: string, label = id): TorneoExpressGrupoPareja {
  return {
    id: `gp-${id}`,
    grupo_id: "g1",
    pareja_id: id,
    pareja_display: label,
    created_at: "",
  };
}

function jugado(input: {
  id: string;
  local: string;
  visit: string;
  gamesLocal: number;
  gamesVisit: number;
  ganador?: string | null;
  sets?: Array<{ local: number; visitante: number }>;
}): TorneoExpressPartido {
  const ganador =
    input.ganador === undefined
      ? input.gamesLocal === input.gamesVisit
        ? null
        : input.gamesLocal > input.gamesVisit
          ? input.local
          : input.visit
      : input.ganador;
  return {
    id: input.id,
    grupo_id: "g1",
    pareja_local_id: input.local,
    pareja_visitante_id: input.visit,
    puntos_local: input.sets ? null : input.gamesLocal,
    puntos_visitante: input.sets ? null : input.gamesVisit,
    sets_resultado: input.sets ?? null,
    ganador_id: ganador,
    estado: "jugado",
    orden: 1,
    created_at: "",
  };
}

function pendiente(
  id: string,
  local: string,
  visit: string
): TorneoExpressPartido {
  return {
    id,
    grupo_id: "g1",
    pareja_local_id: local,
    pareja_visitante_id: visit,
    puntos_local: 99,
    puntos_visitante: 0,
    ganador_id: local,
    estado: "pendiente",
    orden: 1,
    created_at: "",
  };
}

function table(
  ids: string[],
  partidos: TorneoExpressPartido[],
  modo: "dif_puntos" | "setto_pg" = "dif_puntos"
): StandingRowExpress[] {
  return buildStandingsForGrupo(
    grupo,
    ids.map((id) => pareja(id)),
    partidos,
    modo
  );
}

function byId(rows: StandingRowExpress[], id: string): StandingRowExpress {
  const row = rows.find((item) => item.parejaId === id);
  if (!row) throw new Error(`falta ${id}`);
  return row;
}

function sportingSignature(rows: StandingRowExpress[]) {
  return rows
    .map((row) => ({
      id: row.parejaId,
      posicion: row.posicion,
      tie: row.tie.status,
      with: row.tie.status === "unresolved" ? [...row.tie.pairIds] : [],
      fav: row.ptsFav,
      dif: row.dif,
      pg: row.pg,
      pj: row.pj,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

describe("standings dif_puntos", () => {
  const ids = ["a", "b", "c"];

  it("ignora pendiente aunque traiga marcador", () => {
    const rows = table(ids, [
      jugado({ id: "m1", local: "a", visit: "b", gamesLocal: 6, gamesVisit: 4 }),
      pendiente("m2", "c", "a"),
    ]);
    expect(byId(rows, "c").pj).toBe(0);
    expect(byId(rows, "c").ptsFav).toBe(0);
    expect(byId(rows, "c").pg).toBe(0);
    expect(byId(rows, "a").pj).toBe(1);
    expect(byId(rows, "a").ptsFav).toBe(6);
  });

  it("ordena por FAV", () => {
    const rows = table(ids, [
      jugado({ id: "m1", local: "a", visit: "c", gamesLocal: 10, gamesVisit: 2 }),
      jugado({ id: "m2", local: "b", visit: "c", gamesLocal: 6, gamesVisit: 4 }),
    ]);
    expect(byId(rows, "a").posicion).toBe(1);
    expect(byId(rows, "a").ptsFav).toBe(10);
    expect(byId(rows, "b").posicion).toBe(2);
  });

  it("DIF rompe empate de FAV", () => {
    const rows = table(ids, [
      jugado({ id: "m1", local: "a", visit: "c", gamesLocal: 6, gamesVisit: 4 }),
      jugado({ id: "m2", local: "b", visit: "c", gamesLocal: 6, gamesVisit: 0 }),
    ]);
    expect(byId(rows, "a").ptsFav).toBe(byId(rows, "b").ptsFav);
    expect(byId(rows, "b").posicion).toBe(1);
    expect(byId(rows, "a").posicion).toBe(2);
  });

  it("PG rompe empate de FAV y DIF", () => {
    const rows = table(["a", "b"], [
      jugado({
        id: "m1",
        local: "a",
        visit: "b",
        gamesLocal: 6,
        gamesVisit: 6,
        ganador: "a",
      }),
    ]);
    expect(byId(rows, "a").ptsFav).toBe(byId(rows, "b").ptsFav);
    expect(byId(rows, "a").dif).toBe(byId(rows, "b").dif);
    expect(byId(rows, "a").pg).toBe(1);
    expect(byId(rows, "b").pg).toBe(0);
    expect(byId(rows, "a").posicion).toBe(1);
    expect(byId(rows, "b").posicion).toBe(2);
  });

  it("deriva la tabla de los partidos y repetir el cálculo no la cambia", () => {
    const partidos = [
      jugado({ id: "m1", local: "a", visit: "b", gamesLocal: 6, gamesVisit: 4 }),
      jugado({ id: "m2", local: "b", visit: "c", gamesLocal: 6, gamesVisit: 3 }),
    ];
    const first = table(ids, partidos);
    const second = table(ids, partidos);
    expect(sportingSignature(first)).toEqual(sportingSignature(second));
    expect(first.reduce((sum, row) => sum + row.ptsFav, 0)).toBe(6 + 4 + 6 + 3);
  });

  it("el orden de partidos y de parejas no cambia la posición deportiva", () => {
    const partidos = [
      jugado({ id: "m1", local: "z", visit: "m", gamesLocal: 6, gamesVisit: 4 }),
      jugado({ id: "m2", local: "a", visit: "z", gamesLocal: 6, gamesVisit: 1 }),
      jugado({ id: "m3", local: "m", visit: "a", gamesLocal: 6, gamesVisit: 2 }),
    ];
    const base = sportingSignature(table(["z", "m", "a"], partidos));
    const flippedPairs = sportingSignature(table(["a", "z", "m"], [...partidos].reverse()));
    expect(flippedPairs).toEqual(base);
    for (let i = 0; i < 20; i += 1) {
      const shuffled = [...partidos].sort(() => (i % 2 === 0 ? 1 : -1));
      expect(sportingSignature(table(["a", "m", "z"], shuffled))).toEqual(base);
    }
  });

  it("H2H pone arriba a quien ganó el cruce cuando FAV, DIF y PG empatan", () => {
    const matches = [
      jugado({ id: "ab", local: "a", visit: "b", gamesLocal: 6, gamesVisit: 4 }),
      jugado({ id: "ac", local: "a", visit: "c", gamesLocal: 2, gamesVisit: 3 }),
      jugado({ id: "bc", local: "b", visit: "c", gamesLocal: 4, gamesVisit: 1 }),
    ];
    const aWins = table(["b", "c", "a"], matches);
    expect(byId(aWins, "a").posicion).toBe(1);
    expect(byId(aWins, "b").posicion).toBe(2);
    expect(byId(aWins, "a").tie.status).toBe("resolved");
    expect(byId(aWins, "c").posicion).toBe(3);

    const bWins = table(["a", "b", "c"], [
      jugado({ id: "ab", local: "b", visit: "a", gamesLocal: 6, gamesVisit: 4 }),
      jugado({ id: "bc", local: "b", visit: "c", gamesLocal: 2, gamesVisit: 3 }),
      jugado({ id: "ac", local: "a", visit: "c", gamesLocal: 4, gamesVisit: 1 }),
    ]);
    expect(byId(bWins, "b").posicion).toBe(1);
    expect(byId(bWins, "a").posicion).toBe(2);
  });

  it("sin cruce jugado, dos empatadas quedan unresolved en la misma posición", () => {
    const rows = table(["b", "a", "c"], [
      jugado({ id: "ac", local: "a", visit: "c", gamesLocal: 6, gamesVisit: 1 }),
      jugado({ id: "bc", local: "b", visit: "c", gamesLocal: 6, gamesVisit: 1 }),
      pendiente("ab", "a", "b"),
    ]);
    expect(byId(rows, "a").posicion).toBe(1);
    expect(byId(rows, "b").posicion).toBe(1);
    expect(byId(rows, "c").posicion).toBe(3);
    expect(byId(rows, "a").tie).toEqual({ status: "unresolved", pairIds: ["a", "b"] });
    expect(byId(rows, "b").tie).toEqual(byId(rows, "a").tie);
  });

  it("mini-ranking ordena un triple empate solo con los partidos internos", () => {
    const rows = table(["c", "d", "b", "a"], [
      jugado({ id: "ab", local: "a", visit: "b", gamesLocal: 8, gamesVisit: 2 }),
      jugado({ id: "bc", local: "b", visit: "c", gamesLocal: 8, gamesVisit: 2 }),
      jugado({ id: "ca", local: "c", visit: "a", gamesLocal: 6, gamesVisit: 4 }),
      jugado({ id: "ad", local: "a", visit: "d", gamesLocal: 6, gamesVisit: 4 }),
      jugado({ id: "bd", local: "b", visit: "d", gamesLocal: 8, gamesVisit: 2 }),
      jugado({ id: "cd", local: "c", visit: "d", gamesLocal: 10, gamesVisit: 0 }),
    ]);
    expect(byId(rows, "a").ptsFav).toBe(byId(rows, "b").ptsFav);
    expect(byId(rows, "b").ptsFav).toBe(byId(rows, "c").ptsFav);
    expect(byId(rows, "a").dif).toBe(byId(rows, "b").dif);
    expect(byId(rows, "a").pg).toBe(byId(rows, "c").pg);
    expect(rows.map((row) => row.parejaId)).toEqual(["a", "b", "c", "d"]);
    expect(rows.map((row) => row.posicion)).toEqual([1, 2, 3, 4]);
    expect(rows.every((row) => row.tie.status === "resolved")).toBe(true);

    const mini = calculateMiniRanking(
      ["a", "b", "c"],
      [
        { pairAId: "a", pairBId: "b", gamesA: 8, gamesB: 2, winnerId: "a" },
        { pairAId: "b", pairBId: "c", gamesA: 8, gamesB: 2, winnerId: "b" },
        { pairAId: "c", pairBId: "a", gamesA: 6, gamesB: 4, winnerId: "c" },
        { pairAId: "c", pairBId: "d", gamesA: 10, gamesB: 0, winnerId: "c" },
      ]
    );
    expect(mini.map((row) => row.pairId)).toEqual(["a", "b", "c"]);
    expect(mini.map((row) => row.fav)).toEqual([12, 10, 8]);
    expect(mini.find((row) => row.pairId === "c")?.fav).toBe(8);
  });

  it("el mini-ranking no usa los partidos contra quien está fuera del bloque", () => {
    const internal = calculateMiniRanking(["a", "b", "c"], [
      { pairAId: "a", pairBId: "b", gamesA: 8, gamesB: 2, winnerId: "a" },
      { pairAId: "b", pairBId: "c", gamesA: 8, gamesB: 2, winnerId: "b" },
      { pairAId: "c", pairBId: "a", gamesA: 6, gamesB: 4, winnerId: "c" },
      { pairAId: "a", pairBId: "d", gamesA: 0, gamesB: 20, winnerId: "d" },
      { pairAId: "d", pairBId: "c", gamesA: 0, gamesB: 20, winnerId: "c" },
    ]);
    expect(internal.map((row) => [row.pairId, row.fav])).toEqual([
      ["a", 12],
      ["b", 10],
      ["c", 8],
    ]);
  });

  it("resuelve a A y deja a B y C en la misma posición", () => {
    const rows = table(["c", "e", "b", "d", "a"], [
      jugado({ id: "ab", local: "a", visit: "b", gamesLocal: 6, gamesVisit: 4 }),
      jugado({ id: "ac", local: "a", visit: "c", gamesLocal: 6, gamesVisit: 4 }),
      jugado({ id: "bc", local: "b", visit: "c", gamesLocal: 5, gamesVisit: 5, ganador: null }),
      jugado({ id: "ad", local: "a", visit: "d", gamesLocal: 3, gamesVisit: 5 }),
      jugado({ id: "ae", local: "a", visit: "e", gamesLocal: 5, gamesVisit: 7 }),
      jugado({ id: "bd", local: "b", visit: "d", gamesLocal: 6, gamesVisit: 5 }),
      jugado({ id: "be", local: "b", visit: "e", gamesLocal: 5, gamesVisit: 4 }),
      jugado({ id: "cd", local: "c", visit: "d", gamesLocal: 6, gamesVisit: 5 }),
      jugado({ id: "ce", local: "c", visit: "e", gamesLocal: 5, gamesVisit: 4 }),
    ]);
    expect(byId(rows, "a").posicion).toBe(1);
    expect(byId(rows, "a").tie.status).toBe("resolved");
    expect(byId(rows, "b").posicion).toBe(2);
    expect(byId(rows, "c").posicion).toBe(2);
    expect(byId(rows, "b").tie).toEqual({ status: "unresolved", pairIds: ["b", "c"] });
    expect(byId(rows, "d").posicion).toBe(4);
    expect(byId(rows, "e").posicion).toBe(4);
  });

  it("un triple empate que el mini-ranking no separa queda unresolved, sin usar el id", () => {
    const partidos = [
      jugado({ id: "ab", local: "a", visit: "b", gamesLocal: 6, gamesVisit: 4 }),
      jugado({ id: "bc", local: "b", visit: "c", gamesLocal: 6, gamesVisit: 4 }),
      jugado({ id: "ca", local: "c", visit: "a", gamesLocal: 6, gamesVisit: 4 }),
    ];
    const forward = table(["a", "b", "c"], partidos);
    const backward = table(["c", "b", "a"], [...partidos].reverse());
    expect(forward.map((row) => row.posicion)).toEqual([1, 1, 1]);
    expect(sportingSignature(forward)).toEqual(sportingSignature(backward));
    expect(byId(forward, "a").tie).toEqual({
      status: "unresolved",
      pairIds: ["a", "b", "c"],
    });
    expect(new Set(forward.map((row) => row.posicion)).size).toBe(1);
  });

  it("games salen de sets_resultado y, si no hay sets, de puntos", () => {
    const fromSets = table(["a", "b"], [
      jugado({
        id: "m1",
        local: "a",
        visit: "b",
        gamesLocal: 0,
        gamesVisit: 0,
        sets: [
          { local: 6, visitante: 4 },
          { local: 6, visitante: 3 },
        ],
        ganador: "a",
      }),
    ]);
    expect(byId(fromSets, "a").ptsFav).toBe(12);
    expect(byId(fromSets, "b").ptsFav).toBe(7);

    const fromPuntos = table(["a", "b"], [
      jugado({ id: "m1", local: "a", visit: "b", gamesLocal: 6, gamesVisit: 4 }),
    ]);
    expect(byId(fromPuntos, "a").ptsFav).toBe(6);
    expect(byId(fromPuntos, "b").ptsCon).toBe(6);
  });
});

describe("resolveTwoWayTie", () => {
  it("no resuelve si faltan, sobran o se contradicen los partidos", () => {
    expect(resolveTwoWayTie("a", "b", []).status).toBe("unresolved");
    expect(
      resolveTwoWayTie("a", "b", [
        { pairAId: "a", pairBId: "b", gamesA: 6, gamesB: 6, winnerId: null },
      ]).status
    ).toBe("unresolved");
    expect(
      resolveTwoWayTie("a", "b", [
        { pairAId: "a", pairBId: "b", gamesA: 6, gamesB: 4, winnerId: "a" },
        { pairAId: "b", pairBId: "a", gamesA: 6, gamesB: 4, winnerId: "b" },
      ]).status
    ).toBe("unresolved");
    expect(
      resolveTwoWayTie("a", "b", [
        { pairAId: "a", pairBId: "b", gamesA: 4, gamesB: 6, winnerId: "a" },
      ]).status
    ).toBe("unresolved");
  });
});

describe("standings setto_pg", () => {
  it("ordena por puntos, diferencia de games y cara a cara", () => {
    const three = table(
      ["a", "b", "c"],
      [
        jugado({
          id: "m1",
          local: "a",
          visit: "b",
          gamesLocal: 6,
          gamesVisit: 4,
          sets: [{ local: 6, visitante: 4 }],
          ganador: "a",
        }),
        jugado({
          id: "m2",
          local: "b",
          visit: "c",
          gamesLocal: 6,
          gamesVisit: 3,
          sets: [{ local: 6, visitante: 3 }],
          ganador: "b",
        }),
        jugado({
          id: "m3",
          local: "c",
          visit: "a",
          gamesLocal: 6,
          gamesVisit: 2,
          sets: [{ local: 6, visitante: 2 }],
          ganador: "c",
        }),
      ],
      "setto_pg"
    );
    expect(three.every((row) => row.puntos === 2)).toBe(true);
    expect(three.map((row) => row.parejaId)).toEqual(["b", "c", "a"]);
    expect(three.map((row) => row.posicion)).toEqual([1, 2, 3]);

    const two = table(
      ["c", "b", "a"],
      [
        jugado({
          id: "m1",
          local: "a",
          visit: "b",
          gamesLocal: 6,
          gamesVisit: 4,
          sets: [{ local: 6, visitante: 4 }],
          ganador: "a",
        }),
        jugado({
          id: "m2",
          local: "b",
          visit: "c",
          gamesLocal: 6,
          gamesVisit: 2,
          sets: [{ local: 6, visitante: 2 }],
          ganador: "b",
        }),
      ],
      "setto_pg"
    );
    expect(two.map((row) => row.parejaId)).toEqual(["a", "b", "c"]);
  });

  it("si los criterios deportivos se agotan, el bloque queda unresolved", () => {
    const rows = table(["c", "a", "b"], [], "setto_pg");
    expect(rows.map((row) => row.posicion)).toEqual([1, 1, 1]);
    expect(byId(rows, "a").tie).toEqual({
      status: "unresolved",
      pairIds: ["a", "b", "c"],
    });
    expect(sportingSignature(rows)).toEqual(
      sportingSignature(table(["b", "c", "a"], [], "setto_pg"))
    );
  });

  it("la diferencia de games manda antes que el cara a cara", () => {
    const rows = table(
      ["a", "b", "c"],
      [
        jugado({
          id: "m1",
          local: "b",
          visit: "a",
          gamesLocal: 6,
          gamesVisit: 4,
          sets: [{ local: 6, visitante: 4 }],
          ganador: "b",
        }),
        jugado({
          id: "m2",
          local: "a",
          visit: "c",
          gamesLocal: 6,
          gamesVisit: 0,
          sets: [{ local: 6, visitante: 0 }],
          ganador: "a",
        }),
      ],
      "setto_pg"
    );
    expect(rows.map((row) => row.parejaId)).toEqual(["a", "b", "c"]);
    expect(byId(rows, "a").puntos).toBe(2);
    expect(byId(rows, "a").dif).toBe(4);
    expect(byId(rows, "b").dif).toBe(2);
  });

  it("la diferencia de sets desempata cuando los games empatan", () => {
    const rows = table(
      ["a", "b"],
      [
        jugado({
          id: "m1",
          local: "a",
          visit: "b",
          gamesLocal: 12,
          gamesVisit: 8,
          sets: [
            { local: 6, visitante: 4 },
            { local: 6, visitante: 4 },
          ],
          ganador: "a",
        }),
        jugado({
          id: "m2",
          local: "b",
          visit: "a",
          gamesLocal: 13,
          gamesVisit: 9,
          sets: [
            { local: 6, visitante: 1 },
            { local: 1, visitante: 6 },
            { local: 6, visitante: 2 },
          ],
          ganador: "b",
        }),
      ],
      "setto_pg"
    );
    expect(byId(rows, "a").dif).toBe(byId(rows, "b").dif);
    expect((byId(rows, "a").setsFav ?? 0) - (byId(rows, "a").setsCon ?? 0)).toBe(1);
    expect((byId(rows, "b").setsFav ?? 0) - (byId(rows, "b").setsCon ?? 0)).toBe(-1);
    expect(rows.map((row) => row.parejaId)).toEqual(["a", "b"]);
    expect(rows.map((row) => row.posicion)).toEqual([1, 2]);
  });

  it("dos empatadas en puntos y games sin cara a cara quedan unresolved", () => {
    const rows = table(
      ["b", "a"],
      [
        jugado({
          id: "m1",
          local: "a",
          visit: "b",
          gamesLocal: 6,
          gamesVisit: 6,
          ganador: null,
          sets: [{ local: 6, visitante: 6 }],
        }),
      ],
      "setto_pg"
    );
    expect(byId(rows, "a").posicion).toBe(1);
    expect(byId(rows, "b").posicion).toBe(1);
    expect(byId(rows, "a").tie.status).toBe("unresolved");
  });
});

describe("la clasificación no usa azar ni seed", () => {
  it("no llama a Math.random", () => {
    const ranking = fs.readFileSync(
      path.join(process.cwd(), "src/lib/torneoExpress/groupRanking.ts"),
      "utf8"
    );
    const standings = fs.readFileSync(
      path.join(process.cwd(), "src/lib/torneoExpress/standings.ts"),
      "utf8"
    );
    expect(ranking).not.toMatch(/Math\.random/);
    expect(standings).not.toMatch(/Math\.random/);
    expect(standings).not.toMatch(/\.seed\b/);
  });

  it("veinte cálculos seguidos dan la misma firma deportiva", () => {
    const partidos = [
      jugado({ id: "ab", local: "a", visit: "b", gamesLocal: 6, gamesVisit: 4 }),
      jugado({ id: "bc", local: "b", visit: "c", gamesLocal: 6, gamesVisit: 4 }),
      jugado({ id: "ca", local: "c", visit: "a", gamesLocal: 6, gamesVisit: 4 }),
    ];
    const first = sportingSignature(table(["a", "b", "c"], partidos));
    for (let i = 0; i < 20; i += 1) {
      expect(sportingSignature(table(["c", "a", "b"], partidos))).toEqual(first);
    }
  });
});
