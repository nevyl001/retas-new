import { navigateAppTo } from "../../lib/appRouting";
import { resolvePublicOrganizadorId } from "../../lib/rivieraJugadores/publicOrganizador";
import { buildMarketingOfficialRankingsUrl } from "../../lib/rivieraOfficialSite";
import type { RivieraJugadorGenero } from "../../lib/rivieraJugadores/genero";
import { parseRivieraGeneroFromPath } from "../../lib/rivieraJugadores/genero";
import {
  savePublicFichaHandoff,
  type PublicFichaHandoff,
} from "../../lib/rivieraJugadores/publicFichaHandoff";

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

/** Único host externo (y subdominios) al que esta app puede redirigir por completo. */
const TRUSTED_EXTERNAL_HOST_SUFFIX = "rivieraopen.com";
const SAFE_FALLBACK_PATH = "/ranking";

function isTrustedExternalUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  return (
    host === TRUSTED_EXTERNAL_HOST_SUFFIX ||
    host.endsWith(`.${TRUSTED_EXTERNAL_HOST_SUFFIX}`)
  );
}

/**
 * Cualquier valor con un esquema de URL explícito que no sea http(s)
 * (javascript:, data:, vbscript:, etc.) se rechaza sin intentar navegar.
 */
function hasNonHttpScheme(raw: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw);
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

  if (hasNonHttpScheme(url)) {
    navigateAppTo(SAFE_FALLBACK_PATH);
    return;
  }

  if (/^https?:\/\//i.test(url)) {
    if (!isTrustedExternalUrl(url)) {
      navigateAppTo(SAFE_FALLBACK_PATH);
      return;
    }
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

/** Ficha interna del club por UUID (ranking /ranking/o/{org}). */
export function buildInternalClubJugadorPath(
  jugadorId: string,
  orgId: string
): string {
  return buildPublicJugadorPath(jugadorId.trim(), orgId.trim());
}

export function navigatePublicJugadorFicha(
  slug: string,
  orgId?: string | null
): void {
  navigateAppTo(buildPublicJugadorPath(slug, orgId));
}

export function navigateInternalClubJugadorFicha(
  jugadorId: string,
  orgId: string,
  handoff?: Omit<PublicFichaHandoff, "savedAt">
): void {
  if (handoff) {
    savePublicFichaHandoff(handoff);
  }
  navigateAppTo(buildInternalClubJugadorPath(jugadorId, orgId));
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
