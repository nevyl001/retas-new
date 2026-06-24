/**
 * URLs de ranking y perfiles.
 *
 * - Ranking interno por club (app): /ranking/o/{organizador_id}
 * - Sitio oficial (solo jugadores «Público»): www.rivieraopen.com/rankings
 */
const APP_BASE =
  process.env.REACT_APP_PUBLIC_URL?.replace(/\/+$/, "") ||
  "https://appriviera.rivieraopen.com";

const MARKETING_BASE =
  process.env.REACT_APP_RIVIERA_OFFICIAL_URL?.replace(/\/+$/, "") ||
  "https://www.rivieraopen.com";

export function getRivieraAppPublicBase(): string {
  return APP_BASE;
}

export function getRivieraMarketingSiteBase(): string {
  return MARKETING_BASE;
}

/** Perfil público canónico: appriviera /players/{riviera_jugadores.id} */
export function buildOfficialPlayerUrl(jugadorId: string): string {
  return `${APP_BASE}/players/${encodeURIComponent(jugadorId.trim())}`;
}

/**
 * Sitio oficial (rivieraopen.com) — solo jugadores con «Público» + club publicado.
 * https://www.rivieraopen.com/rankings?org={organizador_id}
 */
export function buildMarketingOfficialRankingsUrl(
  organizadorId?: string | null,
  genero: "M" | "F" = "M"
): string {
  const params = new URLSearchParams();
  const org = organizadorId?.trim();
  if (org) params.set("org", org);
  if (genero === "F") params.set("genero", "femenil");
  const qs = params.toString();
  return qs ? `${MARKETING_BASE}/rankings?${qs}` : `${MARKETING_BASE}/rankings`;
}

/** Ranking interno del club en appriviera: /ranking/o/{organizador_id}/varonil */
export function buildAppClubRankingUrl(
  organizadorId: string,
  genero: "M" | "F" = "M"
): string {
  const base =
    APP_BASE || (typeof window !== "undefined" ? window.location.origin : "");
  const segment = genero === "F" ? "femenil" : "varonil";
  return `${base}/ranking/o/${encodeURIComponent(organizadorId.trim())}/${segment}`;
}

/** @deprecated Usar buildMarketingOfficialRankingsUrl */
export function buildOfficialRankingsUrl(genero: "M" | "F" = "M"): string {
  return buildMarketingOfficialRankingsUrl(null, genero);
}

/** @deprecated Usar buildMarketingOfficialRankingsUrl(organizadorId) */
export function buildOfficialClubRankingUrl(
  organizadorId: string,
  genero: "M" | "F" = "M"
): string {
  return buildMarketingOfficialRankingsUrl(organizadorId, genero);
}

/** @deprecated Usar getRivieraMarketingSiteBase */
export function getRivieraOfficialSiteBase(): string {
  return MARKETING_BASE;
}
