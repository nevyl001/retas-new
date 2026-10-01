import { generateBalancedRoundRobin } from "./roundRobin";
import {
  reorgMatchupsMatchEngine,
  validateReorganizacionGrupos,
} from "./reorganizarGrupos";

const parejas = ["A", "B", "C", "D"];

describe("validateReorganizacionGrupos", () => {
  it("acepta una distribución completa", () => {
    expect(
      validateReorganizacionGrupos({
        parejaIds: parejas,
        grupos: [
          { nombre: "Grupo 1", orden: 1, parejaIds: ["A", "B"] },
          { nombre: "Grupo 2", orden: 2, parejaIds: ["C", "D"] },
        ],
      }).ok
    ).toBe(true);
  });

  it("rechaza pareja duplicada, huérfana, ajena y grupo inválido", () => {
    expect(
      validateReorganizacionGrupos({
        parejaIds: parejas,
        grupos: [
          { nombre: "Grupo 1", orden: 1, parejaIds: ["A", "B", "A"] },
          { nombre: "Grupo 2", orden: 2, parejaIds: ["C", "D"] },
        ],
      })
    ).toEqual({ ok: false, code: "PAIR_DUPLICATED" });

    expect(
      validateReorganizacionGrupos({
        parejaIds: parejas,
        grupos: [{ nombre: "Grupo 1", orden: 1, parejaIds: ["A", "B"] }],
      })
    ).toEqual({ ok: false, code: "PAIR_WITHOUT_GROUP" });

    expect(
      validateReorganizacionGrupos({
        parejaIds: ["A", "B"],
        grupos: [{ nombre: "Grupo 1", orden: 1, parejaIds: ["A", "Z"] }],
      })
    ).toEqual({ ok: false, code: "UNKNOWN_PAIR" });

    expect(
      validateReorganizacionGrupos({
        parejaIds: ["A"],
        grupos: [{ nombre: "Grupo 1", orden: 1, parejaIds: ["A"] }],
      })
    ).toEqual({ ok: false, code: "INVALID_GROUP" });
  });
});

describe("reorgMatchupsMatchEngine", () => {
  it("acepta el round robin del motor actual, incluso invertido", () => {
    const grupos = [{ nombre: "Grupo 1", orden: 1, parejaIds: parejas }];
    const generated = generateBalancedRoundRobin(parejas).map((match) => ({
      groupKey: 1,
      localId: match.visitanteId,
      visitanteId: match.localId,
    }));
    expect(reorgMatchupsMatchEngine(grupos, generated)).toBe(true);
  });

  it("rechaza un cruce de menos o uno repetido", () => {
    const grupos = [{ nombre: "Grupo 1", orden: 1, parejaIds: parejas }];
    const generated = generateBalancedRoundRobin(parejas).map((match) => ({
      groupKey: 1,
      localId: match.localId,
      visitanteId: match.visitanteId,
    }));
    expect(reorgMatchupsMatchEngine(grupos, generated.slice(1))).toBe(false);
    expect(
      reorgMatchupsMatchEngine(grupos, [...generated, generated[0]!])
    ).toBe(false);
  });
});
