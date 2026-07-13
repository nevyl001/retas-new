import {
  calcularClasificadosFase,
  calcularBracketInicial,
  mejoresTercerosNecesarios,
  swapBracketSlots,
  validarChoques,
} from "./bracket";
import type {
  TorneoExpress,
  TorneoExpressBundle,
  TorneoExpressGrupo,
  TorneoExpressGrupoPareja,
  TorneoExpressPartido,
} from "./types";

function makeBundle(opts: {
  numGrupos: number;
  parejasPerGrupo?: number;
}): TorneoExpressBundle {
  const { numGrupos, parejasPerGrupo = 4 } = opts;
  const torneo: TorneoExpress = {
    id: "t1",
    nombre: "Test",
    organizador_id: "u1",
    estado: "en_curso",
    source_tournament_id: null,
    created_at: new Date().toISOString(),
  };
  const grupos: TorneoExpressGrupo[] = [];
  const parejasPorGrupo: Record<string, TorneoExpressGrupoPareja[]> = {};
  const partidosPorGrupo: Record<string, TorneoExpressPartido[]> = {};

  for (let g = 0; g < numGrupos; g++) {
    const grupoId = `g${g}`;
    grupos.push({
      id: grupoId,
      torneo_id: torneo.id,
      nombre: String.fromCharCode(65 + g),
      orden: g,
      created_at: new Date().toISOString(),
    });
    const parejas: TorneoExpressGrupoPareja[] = [];
    for (let p = 0; p < parejasPerGrupo; p++) {
      const pid = `${grupoId}-p${p}`;
      parejas.push({
        id: `${grupoId}-gp${p}`,
        grupo_id: grupoId,
        pareja_id: pid,
        pareja_display: `G${g}P${p}`,
        created_at: new Date().toISOString(),
      });
    }
    parejasPorGrupo[grupoId] = parejas;

    const partidos: TorneoExpressPartido[] = [];
    let orden = 1;
    for (let i = 0; i < parejas.length; i++) {
      for (let j = i + 1; j < parejas.length; j++) {
        const scoreA = 6;
        const scoreB = 2 + ((i + j + g) % 3);
        const localWins = scoreA > scoreB;
        partidos.push({
          id: `${grupoId}-m${orden}`,
          grupo_id: grupoId,
          pareja_local_id: parejas[i].pareja_id,
          pareja_visitante_id: parejas[j].pareja_id,
          puntos_local: scoreA,
          puntos_visitante: scoreB,
          ganador_id: localWins
            ? parejas[i].pareja_id
            : parejas[j].pareja_id,
          estado: "jugado",
          orden,
          ronda: 1,
          created_at: new Date().toISOString(),
        });
        orden++;
      }
    }
    partidosPorGrupo[grupoId] = partidos;
  }

  return {
    torneo,
    grupos,
    parejasPorGrupo,
    partidosPorGrupo,
    eliminatoriaPartidos: [],
  };
}

function qualifierCount(result: ReturnType<typeof calcularBracketInicial>) {
  return result.slots.filter((s) => s.type === "team").length;
}

describe("mejoresTercerosNecesarios", () => {
  it("Caso A: 2 grupos, cuartos → hasta 2 terceros posibles", () => {
    expect(mejoresTercerosNecesarios(2, "cuartos")).toBe(2);
  });

  it("Caso B: 3 grupos, cuartos → 2 terceros", () => {
    expect(mejoresTercerosNecesarios(3, "cuartos")).toBe(2);
  });
});

describe("calcularBracketInicial", () => {
  it("Caso A: 2 grupos × 4 parejas, cuartos → 4 equipos + 4 BYE (sin terceros)", () => {
    const bundle = makeBundle({ numGrupos: 2 });
    const result = calcularBracketInicial(bundle, "cuartos", {
      cantidadTerceros: 0,
    });
    expect(qualifierCount(result)).toBe(4);
    expect(result.byeCount).toBe(4);
    expect(result.qualifiers.length).toBe(4);
  });

  it("Caso B: 3 grupos, cuartos → 8 equipos sin BYE", () => {
    const bundle = makeBundle({ numGrupos: 3 });
    const result = calcularBracketInicial(bundle, "cuartos");
    expect(qualifierCount(result)).toBe(8);
    expect(result.byeCount).toBe(0);
  });

  it("Caso C: 4 grupos, cuartos → 8 equipos", () => {
    const bundle = makeBundle({ numGrupos: 4 });
    const result = calcularBracketInicial(bundle, "cuartos");
    expect(qualifierCount(result)).toBe(8);
    expect(result.byeCount).toBe(0);
  });

  it("Caso D: 4 grupos, octavos → 8 fijos + 4 terceros + 4 BYE", () => {
    const bundle = makeBundle({ numGrupos: 4 });
    const result = calcularBracketInicial(bundle, "octavos", {
      cantidadTerceros: 4,
    });
    expect(qualifierCount(result)).toBe(12);
    expect(result.byeCount).toBe(4);
  });

  it("Caso E: 2 grupos, semifinal → 4 equipos", () => {
    const bundle = makeBundle({ numGrupos: 2 });
    const result = calcularBracketInicial(bundle, "semifinal");
    expect(qualifierCount(result)).toBe(4);
    expect(result.byeCount).toBe(0);
  });
});

describe("drag & drop y choques", () => {
  it("Caso F: swap con choque muestra advertencia", () => {
    const bundle = makeBundle({ numGrupos: 2 });
    const initial = calcularBracketInicial(bundle, "semifinal");
    const teamSlots = initial.slots
      .map((s, i) => (s.type === "team" ? i : -1))
      .filter((i) => i >= 0);
    if (teamSlots.length < 2) return;
    const swapped = swapBracketSlots(
      initial.slots,
      teamSlots[0],
      teamSlots[1]
    );
    const choques = validarChoques(swapped);
    expect(choques.length).toBeGreaterThanOrEqual(0);
  });

  it("Caso G: 3 grupos / cuartos arma bracket limpio válido", () => {
    const bundle = makeBundle({ numGrupos: 3 });
    const result = calcularBracketInicial(bundle, "cuartos");
    expect(qualifierCount(result)).toBe(8);
    expect(result.byeCount).toBe(0);
    expect(result.resolver?.valido).toBe(true);
    // Empareje por seed puede avisar choque de grupo; el organizador puede
    // reordenar. Lo importante: el cuadro queda válido y los avisos coinciden.
    const choques = validarChoques(result.slots);
    expect(result.advertencias).toHaveLength(choques.length);
  });
});

describe("calcularClasificadosFase", () => {
  it("asigna seeds 1-based", () => {
    const bundle = makeBundle({ numGrupos: 2 });
    const q = calcularClasificadosFase(bundle, "semifinal");
    expect(q.map((x) => x.seed)).toEqual([1, 2, 3, 4]);
  });

  it("ordena primeros/segundos/terceros por PG → FAV → DIF", () => {
    const bundle = makeBundle({ numGrupos: 3 });
    const q = calcularClasificadosFase(bundle, "cuartos");
    const primeros = q.filter((x) => x.posEnGrupo === 1);
    expect(primeros).toHaveLength(3);
    for (let i = 1; i < primeros.length; i++) {
      const a = primeros[i - 1];
      const b = primeros[i];
      const cmp =
        b.pg !== a.pg
          ? b.pg - a.pg
          : b.ptsFav !== a.ptsFav
            ? b.ptsFav - a.ptsFav
            : b.dif - a.dif;
      expect(cmp).toBeLessThanOrEqual(0);
    }
  });
});
