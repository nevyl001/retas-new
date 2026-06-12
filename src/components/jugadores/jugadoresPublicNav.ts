import { navigateAppTo } from "../../lib/appRouting";
import { resolvePublicOrganizadorId } from "../../lib/rivieraJugadores/publicOrganizador";
import type { RivieraJugadorGenero } from "../../lib/rivieraJugadores/genero";
import { parseRivieraGeneroFromPath } from "../../lib/rivieraJugadores/genero";

const RANKING_SEGMENT: Record<RivieraJugadorGenero, string> = {
  M: "varonil",
  F: "femenil",
};

export function parsePublicRankingGenero(pathname: string): RivieraJugadorGenero {
  const path = pathname.replace(/\/+$/, "") || "/";
  const m = path.match(/^\/ranking\/o\/[^/]+\/(varonil|femenil|m|f)$/i);
  if (!m) return "M";
  return parseRivieraGeneroFromPath(m[1]) ?? "M";
}

export function navigatePublicJugadores(path?: string): void {
  navigateAppTo(
    path ??
      buildPublicRankingUrl(
        resolvePublicOrganizadorId(
          undefined,
          typeof window !== "undefined" ? window.location.pathname : undefined
        )
      )
  );
}

export function buildPublicJugadorPath(slug: string, orgId?: string | null): string {
  const base = `/public/jugadores/${encodeURIComponent(slug)}`;
  if (!orgId) return base;
  return `${base}?org=${encodeURIComponent(orgId)}`;
}

export function navigatePublicJugadorFicha(
  slug: string,
  orgId?: string | null
): void {
  navigateAppTo(buildPublicJugadorPath(slug, orgId));
}

export function buildRankingComoFuncionaPath(): string {
  return "/ranking/como-funciona";
}

/** Ranking público por organizador y género: /ranking/o/{organizadorId}/varonil|femenil. */
export function buildPublicRankingUrl(
  orgId?: string | null,
  genero: RivieraJugadorGenero = "M"
): string {
  const trimmed = orgId?.trim();
  const segment = RANKING_SEGMENT[genero];
  if (trimmed) {
    return `/ranking/o/${encodeURIComponent(trimmed)}/${segment}`;
  }
  return genero === "F" ? `/ranking/femenil` : "/ranking";
}

export function buildPublicRankingGeneroPath(genero: RivieraJugadorGenero): string {
  return genero === "F" ? "/ranking/femenil" : "/ranking";
}
