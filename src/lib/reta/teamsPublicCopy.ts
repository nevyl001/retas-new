/**
 * Copy público de Reta por Equipos (antes “Dual meet”).
 * Solo presentación; no cambia scoring ni estructura.
 */

export const TEAMS_PUBLIC_FORMAT_LABEL = "Duelo";
export const TEAMS_PUBLIC_TAGLINE = "Que gane el mejor";

/** "Equipo 1 vs Equipo 2" (usa nombres reales si existen). */
export function formatTeamsPublicFaceoff(
  teamNames: string[] | null | undefined
): string {
  const a = teamNames?.[0]?.trim() || "Equipo 1";
  const b = teamNames?.[1]?.trim() || "Equipo 2";
  return `${a} vs ${b}`;
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
