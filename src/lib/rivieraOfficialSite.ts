/**
 * URLs del ranking y perfiles oficiales — viven en appriviera, no en rivieraopen.com.
 * www.rivieraopen.com (marketing) enlaza o embebe estas rutas.
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

/** Ranking oficial global multi-club: appriviera /ranking */
export function buildOfficialRankingsUrl(
  genero: "M" | "F" = "M"
): string {
  return genero === "F" ? `${APP_BASE}/ranking/femenil` : `${APP_BASE}/ranking`;
}

/** Vista previa del ranking de un solo club (interno / compartir club). */
export function buildAppClubRankingUrl(organizadorId: string): string {
  const base =
    APP_BASE || (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/ranking/o/${encodeURIComponent(organizadorId.trim())}`;
}

/** @deprecated Usar buildOfficialPlayerUrl — el perfil oficial está en appriviera */
export function getRivieraOfficialSiteBase(): string {
  return MARKETING_BASE;
}
