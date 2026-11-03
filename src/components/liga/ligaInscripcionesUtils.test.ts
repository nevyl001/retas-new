import {
  filterLigaInscripcionesPool,
  normalizeLigaPlayerSearch,
  paginateLigaInscripciones,
} from "./ligaInscripcionesUtils";
import type { LigaJugadorPoolItem } from "../../lib/liga/types";

function player(
  id: string,
  nombre: string,
  extras: Partial<LigaJugadorPoolItem> = {}
): LigaJugadorPoolItem {
  return {
    id,
    nombre,
    email: null,
    telefono: null,
    genero: "M",
    nivel: null,
    estado: "activo",
    organizador_id: "org",
    created_at: "",
    categoria: null,
    ...extras,
  };
}

describe("ligaInscripcionesUtils", () => {
  test("normaliza acentos y mayúsculas", () => {
    expect(normalizeLigaPlayerSearch("José Ávila")).toBe("jose avila");
  });

  test("filtra por nombre parcial sin acentos y por estado", () => {
    const pool = [
      player("1", "José Ávila"),
      player("2", "Maria Lopez"),
      player("3", "Ana Durán"),
    ];
    const inscritos = new Set(["2"]);

    const byName = filterLigaInscripcionesPool({
      jugadores: pool,
      inscritosIds: inscritos,
      query: "jose a",
      filter: "todos",
    });
    expect(byName.map((j) => j.id)).toEqual(["1"]);

    const inscritosOnly = filterLigaInscripcionesPool({
      jugadores: pool,
      inscritosIds: inscritos,
      query: "",
      filter: "inscritos",
    });
    expect(inscritosOnly.map((j) => j.id)).toEqual(["2"]);

    const sinInscribir = filterLigaInscripcionesPool({
      jugadores: pool,
      inscritosIds: inscritos,
      query: "duran",
      filter: "sin_inscribir",
    });
    expect(sinInscribir.map((j) => j.id)).toEqual(["3"]);
  });

  test("pagina después de filtrar", () => {
    const items = Array.from({ length: 50 }, (_, i) => i + 1);
    const page1 = paginateLigaInscripciones(items, 1, 24);
    expect(page1.pageItems).toHaveLength(24);
    expect(page1.totalPages).toBe(3);
    const page3 = paginateLigaInscripciones(items, 3, 24);
    expect(page3.pageItems).toEqual([49, 50]);
    expect(page3.page).toBe(3);
  });
});
