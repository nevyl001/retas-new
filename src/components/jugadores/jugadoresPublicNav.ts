import { navigateAppTo } from "../../lib/appRouting";
import { resolvePublicOrganizadorId } from "../../lib/rivieraJugadores/publicOrganizador";
import { buildMarketingOfficialRankingsUrl } from "../../lib/rivieraOfficialSite";
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

/** Ranking interno del club en appriviera (todos los jugadores con «Ranking»). */
export function buildInternalClubRankingUrl(
  orgId: string,
  genero: RivieraJugadorGenero = "M"
): string {
  const segment = RANKING_SEGMENT[genero];
  return `/ranking/o/${encodeURIComponent(orgId.trim())}/${segment}`;
}

/** Ranking interno; sin org redirige a /ranking (sitio oficial). */
export function buildPublicRankingUrl(
  orgId?: string | null,
  genero: RivieraJugadorGenero = "M"
): string {
  const trimmed = orgId?.trim();
  if (trimmed) return buildInternalClubRankingUrl(trimmed, genero);
  return genero === "F" ? "/ranking/femenil" : "/ranking";
}

/** Sitio oficial rivieraopen.com (solo jugadores «Público»). */
export function buildOfficialSiteRankingUrl(
  orgId?: string | null,
  genero: RivieraJugadorGenero = "M"
): string {
  return buildMarketingOfficialRankingsUrl(orgId, genero);
}

export function navigatePublicJugadores(path?: string): void {
  const url =
    path ??
    buildPublicRankingUrl(
      resolvePublicOrganizadorId(
        undefined,
        typeof window !== "undefined" ? window.location.pathname : undefined
      )
    );
  if (url.startsWith("http")) {
    window.location.href = url;
    return;
  }
  navigateAppTo(url);
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

export function buildPublicRankingGeneroPath(genero: RivieraJugadorGenero): string {
  return genero === "F" ? "/ranking/femenil" : "/ranking";
}

/** Perfil oficial en appriviera (UUID). */
export function buildOfficialPlayerPath(jugadorId: string): string {
  return `/players/${encodeURIComponent(jugadorId.trim())}`;
}

export function navigateOfficialPlayerFicha(jugadorId: string): void {
  navigateAppTo(buildOfficialPlayerPath(jugadorId));
}
