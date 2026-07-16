import {
  defaultCapacityForMode,
  buildDueloConvocatoriaContext,
  buildTournamentConvocatoriaContext,
} from "./adapters";
import {
  OPEN_REG_CAPACITY_MAX,
  OPEN_REG_CAPACITY_MIN,
} from "./retaAbiertaService";

describe("cupo convocatoria", () => {
  it("límites backend/UI alineados con CHECK de tabla (1–64)", () => {
    expect(OPEN_REG_CAPACITY_MIN).toBe(1);
    expect(OPEN_REG_CAPACITY_MAX).toBe(64);
  });

  it("duelo fija lockCapacity y cupo 4", () => {
    const ctx = buildDueloConvocatoriaContext({
      dueloId: "d1",
      name: "Duelo",
    });
    expect(ctx.lockCapacity).toBe(true);
    expect(ctx.defaultCapacity).toBe(4);
    expect(defaultCapacityForMode("duelo_2v2")).toBe(4);
  });

  it("reta/americano no bloquean cupo", () => {
    const reta = buildTournamentConvocatoriaContext({
      mode: "reta",
      tournamentId: "t1",
      name: "Reta",
    });
    const americano = buildTournamentConvocatoriaContext({
      mode: "americano",
      tournamentId: "t2",
      name: "Americano",
    });
    expect(reta.lockCapacity).toBeFalsy();
    expect(americano.lockCapacity).toBeFalsy();
    expect(defaultCapacityForMode("reta")).toBe(8);
    expect(defaultCapacityForMode("americano")).toBe(16);
  });
});
