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

export function buildPublicRankingUrl(orgId?: string | null): string {
  if (typeof window === "undefined") {
    return orgId ? `/public/jugadores?org=${orgId}` : "/public/jugadores";
  }
  const url = new URL("/public/jugadores", window.location.origin);
  if (orgId) url.searchParams.set("org", orgId);
  return url.pathname + url.search;
}
