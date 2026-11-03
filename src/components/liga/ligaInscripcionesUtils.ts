import type { LigaJugadorPoolItem } from "../../lib/liga/types";

export type LigaInscripcionFilter = "todos" | "inscritos" | "sin_inscribir";

export const LIGA_INSCRIPCIONES_PAGE_SIZE = 24;

export function normalizeLigaPlayerSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function filterLigaInscripcionesPool(params: {
  jugadores: LigaJugadorPoolItem[];
  inscritosIds: ReadonlySet<string>;
  query: string;
  filter: LigaInscripcionFilter;
}): LigaJugadorPoolItem[] {
  const q = normalizeLigaPlayerSearch(params.query);
  return params.jugadores.filter((j) => {
    const inscrito = params.inscritosIds.has(j.id);
    if (params.filter === "inscritos" && !inscrito) return false;
    if (params.filter === "sin_inscribir" && inscrito) return false;
    if (!q) return true;
    const haystack = normalizeLigaPlayerSearch(
      `${j.nombre} ${j.riviera_id ?? ""}`
    );
    return haystack.includes(q);
  });
}

export function paginateLigaInscripciones<T>(
  items: T[],
  page: number,
  pageSize: number = LIGA_INSCRIPCIONES_PAGE_SIZE
): { pageItems: T[]; page: number; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    pageItems: items.slice(start, start + pageSize),
    page: safePage,
    totalPages,
  };
}
