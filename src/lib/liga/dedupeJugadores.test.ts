import { dedupeLigaJugadoresById } from "./dedupeJugadores";
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

describe("dedupeLigaJugadoresById", () => {
  it("conserva homónimos con IDs distintos", () => {
    const out = dedupeLigaJugadoresById([
      j("a", "Isra"),
      j("b", "isra"),
      j("c", "Luis B"),
    ]);
    expect(out).toHaveLength(3);
  });

  it("deduplica el mismo id", () => {
    const out = dedupeLigaJugadoresById(
      [
        j("canon", "Aaron Duran"),
        j("canon", "Aaron Duran", { email: "a@x.com" }),
      ],
      { rivieraLinkedIds: ["canon"] }
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("canon");
    expect(out[0]!.email).toBe("a@x.com");
  });
});
