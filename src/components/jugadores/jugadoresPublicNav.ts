import { navigateAppTo } from "../../lib/appRouting";
import { resolvePublicOrganizadorId } from "../../lib/rivieraJugadores/publicOrganizador";

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

/** Ranking público por organizador: /ranking/o/{organizadorId}. */
export function buildPublicRankingUrl(orgId?: string | null): string {
  const trimmed = orgId?.trim();
  if (trimmed) {
    return `/ranking/o/${encodeURIComponent(trimmed)}`;
  }
  return "/ranking";
}
