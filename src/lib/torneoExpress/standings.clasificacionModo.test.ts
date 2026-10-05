import { buildStandingsForGrupo } from "./standings";
import type {
  TorneoExpressGrupo,
  TorneoExpressGrupoPareja,
  TorneoExpressPartido,
} from "./types";

const grupo: TorneoExpressGrupo = {
  id: "g1",
  torneo_id: "t1",
  nombre: "A",
  orden: 0,
  created_at: "",
};

function pareja(id: string, label: string): TorneoExpressGrupoPareja {
  return {
    id: `gp-${id}`,
    grupo_id: "g1",
    pareja_id: id,
    pareja_display: label,
    created_at: "",
  };
}

function partido(
  id: string,
  local: string,
  visit: string,
  sets: Array<{ local: number; visitante: number }>,
  ganador: string
): TorneoExpressPartido {
  return {
    id,
    grupo_id: "g1",
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

describe("buildStandingsForGrupo clasificacion modes", () => {
  const parejas = [
    pareja("a", "A"),
    pareja("b", "B"),
    pareja("c", "C"),
  ];

  it("dif_puntos ordena por FAV, luego DIF", () => {
    // Mismo FAV (6): B gana por mejor DIF (+10 vs +2).
    const partidos = [
      partido("m1", "a", "c", [{ local: 6, visitante: 4 }], "a"),
      partido("m2", "b", "c", [{ local: 6, visitante: 0 }], "b"),
    ];
    const rows = buildStandingsForGrupo(grupo, parejas, partidos, "dif_puntos");
    expect(rows.map((r) => r.parejaId)).toEqual(["b", "a", "c"]);
  });

  it("dif_puntos prioriza FAV sobre DIF", () => {
    // A: FAV 10 DIF +2; B: FAV 8 DIF +6 → manda FAV (A arriba de B).
    const partidos = [
      partido("m1", "a", "c", [{ local: 10, visitante: 8 }], "a"),
      partido("m2", "b", "c", [{ local: 8, visitante: 2 }], "b"),
    ];
    const rows = buildStandingsForGrupo(grupo, parejas, partidos, "dif_puntos");
    expect(rows[0].parejaId).toBe("a");
    expect(rows[0].ptsFav).toBe(10);
    const rankB = rows.findIndex((r) => r.parejaId === "b");
    const rankA = rows.findIndex((r) => r.parejaId === "a");
    expect(rankA).toBeLessThan(rankB);
  });

  it("setto_pg ordena por puntos y luego por diferencia de games", () => {
    // Round-robin: cada uno 1 victoria. Empate a 3 en PG.
    // Sets: A vs B 6-4; B vs C 6-3; C vs A 6-2 → DIF sets/games favorece B.
    const partidos = [
      partido("m1", "a", "b", [{ local: 6, visitante: 4 }], "a"),
      partido("m2", "b", "c", [{ local: 6, visitante: 3 }], "b"),
      partido("m3", "c", "a", [{ local: 6, visitante: 2 }], "c"),
    ];
    const rows = buildStandingsForGrupo(grupo, parejas, partidos, "setto_pg");
    expect(rows.every((r) => r.puntos === 2)).toBe(true);
    // Mismos puntos. DIF: B +1, C +1, A -2. B y C empatan y el cara a cara lo gana B.
    expect(rows.map((r) => r.parejaId)).toEqual(["b", "c", "a"]);
  });

  it("setto_pg usa H2H cuando empatan en puntos y en diferencia de games", () => {
    // A beat B; both beat C. A and B tied on PG=1? Wait A and B each have 1 win if only those?
    // A vs B: A wins; A vs C: A wins; B vs C: B wins → A 2-0, B 1-1, C 0-2
    // Need A and B both with 1 PG: only A vs B + both lose to someone? Better:
    // A vs B: B wins (H2H to B); A vs C: A wins; B vs C: B wins → A 1, B 2, C 0
    // For two tied: A and D... use 2 pairs only with one match? Or:
    // A vs B: A wins; A vs C unfinished; B vs C: B wins → A 1, B 1, C 0 — H2H A over B
    const partidos = [
      partido("m1", "a", "b", [{ local: 6, visitante: 4 }], "a"),
      partido("m2", "b", "c", [{ local: 6, visitante: 2 }], "b"),
    ];
    const rows = buildStandingsForGrupo(grupo, parejas, partidos, "setto_pg");
    // A and B both PG=1; H2H says A above B
    expect(rows[0].parejaId).toBe("a");
    expect(rows[1].parejaId).toBe("b");
    expect(rows[2].parejaId).toBe("c");
  });
});
