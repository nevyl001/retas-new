import { navigateAppTo } from "../../lib/appRouting";
import { buildJugadoresListaPath } from "./jugadoresGeneroNav";

export function navigateJugadores(path?: string): void {
  navigateAppTo(path ?? buildJugadoresListaPath("M"));
}

export function buildJugadorPath(slug: string): string {
  return `/jugadores/${encodeURIComponent(slug)}`;
}

export function navigateJugadorFicha(
  slug: string,
  opts?: { edit?: boolean }
): void {
  const path = buildJugadorPath(slug);
  navigateAppTo(opts?.edit ? `${path}?edit=1` : path);
}
