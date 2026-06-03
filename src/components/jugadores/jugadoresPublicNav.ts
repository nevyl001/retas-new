import { navigateAppTo } from "../../lib/appRouting";
import { resolvePublicOrganizadorId } from "../../lib/rivieraJugadores/publicOrganizador";

export function navigatePublicJugadores(path?: string): void {
  navigateAppTo(path ?? buildPublicRankingUrl(resolvePublicOrganizadorId()));
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

/** Ranking público: /ranking (alias histórico: /public/jugadores). */
export function buildPublicRankingUrl(orgId?: string | null): string {
  const base = "/ranking";
  if (typeof window === "undefined") {
    return orgId ? `${base}?org=${encodeURIComponent(orgId)}` : base;
  }
  const url = new URL(base, window.location.origin);
  if (orgId) url.searchParams.set("org", orgId);
  return url.pathname + url.search;
}
