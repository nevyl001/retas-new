import { dedupeLigaJugadoresByName } from "./dedupeJugadores";
import type { LigaJugador } from "./types";

function j(id: string, nombre: string, extra?: Partial<LigaJugador>): LigaJugador {
  return {
    id,
    nombre,
    email: null,
    telefono: null,
    genero: null,
    nivel: null,
    estado: "activo",
    organizador_id: "org",
    created_at: "2026-01-01",
    ...extra,
  };
}

describe("dedupeLigaJugadoresByName", () => {
  it("deja un jugador por nombre normalizado", () => {
    const out = dedupeLigaJugadoresByName([
      j("a", "Isra"),
      j("b", "isra"),
      j("c", "Luis B"),
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((x) => x.nombre).sort()).toEqual(["Isra", "Luis B"]);
  });

  it("prioriza fila enlazada a Riviera", () => {
    const out = dedupeLigaJugadoresByName(
      [j("dup", "Aaron Duran"), j("canon", "Aaron Duran", { email: "a@x.com" })],
      { rivieraLinkedIds: ["canon"] }
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("canon");
  });
});
