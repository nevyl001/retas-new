import { navigateAppTo } from "../../lib/appRouting";

export function navigateJugadores(path = "/jugadores"): void {
  navigateAppTo(path);
}

export function buildJugadorPath(slug: string): string {
  return `/jugadores/${encodeURIComponent(slug)}`;
}

export function navigateJugadorFicha(slug: string): void {
  navigateAppTo(buildJugadorPath(slug));
}
