import { gruposBloqueados, motivoBloqueoGrupo } from "./gruposBloqueados";

const jugado = { estado: "jugado", puntos_local: 6, puntos_visitante: 3 };
const pendiente = { estado: "pendiente" };

describe("motivoBloqueoGrupo", () => {
  it("bloquea un grupo con resultados", () => {
    expect(motivoBloqueoGrupo([pendiente, jugado], [{ activa: true }])).toBe(
      "iniciado"
    );
  });

  it("bloquea un grupo con pareja retirada", () => {
    expect(motivoBloqueoGrupo([pendiente], [{ activa: false }])).toBe("retirada");
  });

  it("deja libre un grupo sin resultados", () => {
    expect(motivoBloqueoGrupo([pendiente], [{ activa: true }])).toBeNull();
  });
});

describe("gruposBloqueados", () => {
  it("solo marca los grupos iniciados", () => {
    const result = gruposBloqueados(
      [{ id: "a" }, { id: "b" }, { id: "c" }],
      { a: [{ activa: true }], b: [{ activa: true }], c: [{ activa: true }] },
      { a: [jugado], b: [pendiente], c: [] }
    );
    expect(Array.from(result.keys())).toEqual(["a"]);
  });
});
