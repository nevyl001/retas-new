import {
  contarPerfilesPorCorreo,
  correoEfectivoDestinatario,
  mapContactoInscritoRow,
} from "./resolveInscritoContacto";

describe("resolveInscritoContacto", () => {
  it("el correo global gana sobre un local vacío", () => {
    expect(
      correoEfectivoDestinatario({
        emailLocal: null,
        emailGlobal: "saul@example.com",
      })
    ).toBe("saul@example.com");
  });

  it("no inventa correo si ambos faltan", () => {
    expect(
      correoEfectivoDestinatario({
        emailLocal: "  ",
        emailGlobal: null,
      })
    ).toBeNull();
  });

  it("no trata roster + ficha del mismo jugador como ambiguo", () => {
    const counts = contarPerfilesPorCorreo([
      {
        email: "saul@example.com",
        identidadGlobalId: "global-1",
        jugadorId: "liga-a",
      },
      {
        email: "saul@example.com",
        identidadGlobalId: "global-1",
        jugadorId: "liga-a",
      },
    ]);
    expect(counts.get("saul@example.com")).toBe(1);
  });

  it("sí marca ambiguo cuando dos Riviera ID comparten correo", () => {
    const counts = contarPerfilesPorCorreo([
      {
        email: "shared@example.com",
        identidadGlobalId: "global-1",
        jugadorId: "liga-1",
      },
      {
        email: "shared@example.com",
        identidadGlobalId: "global-2",
        jugadorId: "liga-2",
      },
    ]);
    expect(counts.get("shared@example.com")).toBe(2);
  });

  it("mapea filas RPC sin exponer campos extra", () => {
    expect(
      mapContactoInscritoRow({
        liga_jugador_id: "jug-1",
        email: "Ana@Example.com",
        telefono: "555",
        riviera_jugador_id: "rj-1",
        identidad_global_id: "rj-source",
        origen: "global_source",
      })
    ).toEqual({
      ligaJugadorId: "jug-1",
      email: "ana@example.com",
      telefono: "555",
      rivieraJugadorId: "rj-1",
      identidadGlobalId: "rj-source",
      origen: "global_source",
    });
  });
});
