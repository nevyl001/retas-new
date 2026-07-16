import {
  JUGADOR_CATEGORIAS_ORDER,
} from "../../lib/rivieraJugadores/constants";
import type { RivieraJugadorCategoria } from "../../lib/rivieraJugadores/types";
import type { RivieraJugadorGenero } from "../../lib/rivieraJugadores/genero";

const CATEGORIA_SET = new Set<string>(JUGADOR_CATEGORIAS_ORDER);

export const PUBLIC_RANKING_CATEGORIA_STORAGE_PREFIX =
  "rjp_public_ranking_categoria:";

export function publicRankingCategoriaStorageKey(
  orgId: string,
  genero: RivieraJugadorGenero
): string {
  return `${PUBLIC_RANKING_CATEGORIA_STORAGE_PREFIX}${orgId.trim()}:${genero}`;
}

export function isRivieraJugadorCategoria(
  value: string | null | undefined
): value is RivieraJugadorCategoria {
  return !!value && CATEGORIA_SET.has(value);
}

/** Restaura la categoría elegida al volver ranking → ficha → ranking (misma pestaña). */
export function readStoredPublicRankingCategoria(
  orgId: string | null | undefined,
  genero: RivieraJugadorGenero
): RivieraJugadorCategoria | null {
  if (!orgId?.trim() || typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(
      publicRankingCategoriaStorageKey(orgId, genero)
    );
    return isRivieraJugadorCategoria(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeStoredPublicRankingCategoria(
  orgId: string | null | undefined,
  genero: RivieraJugadorGenero,
  categoria: RivieraJugadorCategoria
): void {
  if (!orgId?.trim() || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(
      publicRankingCategoriaStorageKey(orgId, genero),
      categoria
    );
  } catch {
    /* ignore quota / private mode */
  }
}

export function matchesRankingSearch(
  jugador: { nombre?: string | null; riviera_id?: string | null },
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const name = (jugador.nombre ?? "").toLowerCase();
  const rivId = (jugador.riviera_id ?? "").toLowerCase();
  const rivCompact = rivId.replace(/[\s-]/g, "");
  const qCompact = q.replace(/[\s-]/g, "");
  return (
    name.includes(q) ||
    rivId.includes(q) ||
    (qCompact.length > 0 && rivCompact.includes(qCompact))
  );
}

/** Deriva top 3 + lista desde el mismo arreglo (sin consultas extra). */
export function splitRankingPresentation<T>(
  jugadores: T[],
  opts?: { searching?: boolean }
): { showPodio: boolean; podio: T[]; list: T[]; listOffset: number } {
  const searching = opts?.searching === true;
  const showPodio = !searching && jugadores.length >= 3;
  if (showPodio) {
    return {
      showPodio: true,
      podio: jugadores.slice(0, 3),
      list: jugadores.slice(3),
      listOffset: 3,
    };
  }
  return {
    showPodio: false,
    podio: [],
    list: jugadores,
    listOffset: 0,
  };
}
