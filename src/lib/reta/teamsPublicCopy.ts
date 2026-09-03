/**
 * Copy público de Reta por Equipos (antes “Dual meet”).
 * Solo presentación; no cambia scoring ni estructura.
 */

export const TEAMS_PUBLIC_FORMAT_LABEL = "Duelo";
/** Título de previa cuando el evento no trae nombre propio. */
export const TEAMS_PUBLIC_EVENT_FALLBACK = "Reta de equipos";
export const TEAMS_PUBLIC_TAGLINE = "Que gane el mejor";
/** Título de la sección live (canchas / enfrentamientos). */
export const TEAMS_PUBLIC_LIVE_TITLE = "Duelo en vivo";
/** Mensaje motivacional bajo la sede (previa pública). */
export const TEAMS_PUBLIC_MOTIVATIONAL = "Que gane el mejor";
/** Firma de marca bajo el duelo. */
export const TEAMS_PUBLIC_BRAND_LINE = "Vive Riviera Open";
/** Subtítulo de club por defecto. */
export const TEAMS_PUBLIC_CLUB_FALLBACK = "Riviera Open";

/** "Equipo 1 vs Equipo 2" (usa nombres reales si existen). */
export function formatTeamsPublicFaceoff(
  teamNames: string[] | null | undefined
): string {
  const a = teamNames?.[0]?.trim() || "Equipo 1";
  const b = teamNames?.[1]?.trim() || "Equipo 2";
  return `${a} vs ${b}`;
}

function normalizeFaceoffToken(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^team\s+/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Comparación sin espacios: "Break Point" ≈ "Breakpoint". */
function compactFaceoffToken(value: string): string {
  return normalizeFaceoffToken(value).replace(/\s+/g, "");
}

/**
 * True cuando el nombre del evento solo repite el faceoff
 * (p. ej. "Team A vs Team B") y no aporta un título propio.
 */
export function isRedundantTeamsFaceoffTitle(
  eventName: string | null | undefined,
  teamNames: string[] | null | undefined
): boolean {
  const title = eventName?.trim();
  if (!title) return false;

  const a = teamNames?.[0]?.trim();
  const b = teamNames?.[1]?.trim();
  if (!a || !b) return false;

  const nTitle = normalizeFaceoffToken(title);
  if (!/\bvs\b/.test(nTitle)) return false;

  const cTitle = compactFaceoffToken(title);
  const cA = compactFaceoffToken(a);
  const cB = compactFaceoffToken(b);
  if (!cA || !cB) return false;

  return cTitle.includes(cA) && cTitle.includes(cB);
}

/**
 * Título de marquesina broadcast en un renglón.
 * Si el evento solo repite el VS, usa "Equipo A vs Equipo B" (sin "Team").
 */
export function formatBroadcastBattleTitle(
  eventName: string | null | undefined,
  teamNames: string[] | null | undefined
): string {
  const aRaw = teamNames?.[0]?.trim() || "Equipo 1";
  const bRaw = teamNames?.[1]?.trim() || "Equipo 2";
  const a = aRaw.replace(/^team\s+/i, "").trim() || aRaw;
  const b = bRaw.replace(/^team\s+/i, "").trim() || bRaw;
  const faceoff = `${a} vs ${b}`;

  const title = eventName?.trim();
  if (!title) return faceoff;
  if (isRedundantTeamsFaceoffTitle(title, [aRaw, bRaw])) return faceoff;
  return title;
}

/**
 * Línea de hero / kicker público:
 * "Duelo · Equipo 1 vs Equipo 2 · Que gane el mejor"
 */
export function formatTeamsPublicHeroMeta(
  teamNames?: string[] | null
): string {
  return `${TEAMS_PUBLIC_FORMAT_LABEL} · ${formatTeamsPublicFaceoff(
    teamNames
  )} · ${TEAMS_PUBLIC_TAGLINE}`;
}
