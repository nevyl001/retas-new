import { navigateAppTo } from "../../lib/appRouting";
import type { RivieraJugadorGenero } from "../../lib/rivieraJugadores/genero";
import {
  parseRivieraGeneroFromPath,
  RIVIERA_GENERO_LABELS,
} from "../../lib/rivieraJugadores/genero";

const REGISTRY_SEGMENT: Record<RivieraJugadorGenero, string> = {
  M: "varonil",
  F: "femenil",
};

export function buildJugadoresListaPath(genero: RivieraJugadorGenero = "M"): string {
  if (genero === "M") return "/jugadores/varonil";
  return "/jugadores/femenil";
}

export function navigateJugadoresLista(genero: RivieraJugadorGenero = "M"): void {
  navigateAppTo(buildJugadoresListaPath(genero));
}

export function parseJugadoresListaGenero(pathname: string): RivieraJugadorGenero | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/jugadores") return "M";
  const m = path.match(/^\/jugadores\/(varonil|femenil|m|f)$/i);
  if (!m) return null;
  return parseRivieraGeneroFromPath(m[1]) ?? "M";
}

export function isJugadoresListaGeneroPath(pathname: string): boolean {
  return parseJugadoresListaGenero(pathname) !== null;
}

export { REGISTRY_SEGMENT, RIVIERA_GENERO_LABELS };
