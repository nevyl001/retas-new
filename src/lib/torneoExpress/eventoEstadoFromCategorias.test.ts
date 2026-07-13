import {
  isCategoriaTorneoFinalizada,
  resolveEventoEstadoFromCategorias,
} from "./eventoEstadoFromCategorias";

describe("eventoEstadoFromCategorias", () => {
  it("marca completed solo si todas las categorías están finalizadas", () => {
    expect(
      resolveEventoEstadoFromCategorias("published", [
        { estado: "finalizado", fase_torneo: "cerrado" },
        { estado: "finalizado", fase_torneo: "cerrado" },
      ])
    ).toBe("completed");
  });

  it("permanece abierto si hay alguna categoría abierta", () => {
    expect(
      resolveEventoEstadoFromCategorias("published", [
        { estado: "finalizado", fase_torneo: "cerrado" },
        { estado: "en_curso", fase_torneo: "eliminatoria" },
      ])
    ).toBe("published");
  });

  it("reabre un evento completed si alguna categoría vuelve a abrirse", () => {
    expect(
      resolveEventoEstadoFromCategorias("completed", [
        { estado: "finalizado", fase_torneo: "cerrado" },
        { estado: "en_curso", fase_torneo: "eliminatoria" },
      ])
    ).toBe("published");
  });

  it("no altera draft ni archived", () => {
    expect(
      resolveEventoEstadoFromCategorias("draft", [
        { estado: "finalizado", fase_torneo: "cerrado" },
      ])
    ).toBe("draft");
    expect(
      resolveEventoEstadoFromCategorias("archived", [
        { estado: "finalizado", fase_torneo: "cerrado" },
      ])
    ).toBe("archived");
  });

  it("isCategoriaTorneoFinalizada cubre estado y fase", () => {
    expect(
      isCategoriaTorneoFinalizada({
        estado: "en_curso",
        fase_torneo: "cerrado",
      })
    ).toBe(true);
    expect(
      isCategoriaTorneoFinalizada({
        estado: "en_curso",
        fase_torneo: "grupos",
      })
    ).toBe(false);
  });
});
