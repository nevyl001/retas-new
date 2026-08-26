/**
 * Iniciales de equipo para fallback de logo (sin imagen).
 * Ej.: "Team BreakPoint" → "TB", "Oasis" → "OA".
 */
export function getTeamLogoInitials(teamName: string | null | undefined): string {
  const raw = (teamName ?? "").trim();
  if (!raw) return "?";

  const parts = raw
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);

  if (parts.length >= 2) {
    const a = parts[0]![0] ?? "";
    const b = parts[parts.length - 1]![0] ?? "";
    return `${a}${b}`.toUpperCase() || "?";
  }

  const token = parts[0] ?? raw;
  if (token.length >= 2) return token.slice(0, 2).toUpperCase();
  return (token[0] ?? "?").toUpperCase();
}

export function resolveTeamLogoUrl(
  teamLogos: (string | null)[] | null | undefined,
  teamIndex: number
): string | null {
  if (!Array.isArray(teamLogos) || teamIndex < 0) return null;
  const url = teamLogos[teamIndex];
  if (typeof url !== "string") return null;
  const trimmed = url.trim();
  return trimmed || null;
}
