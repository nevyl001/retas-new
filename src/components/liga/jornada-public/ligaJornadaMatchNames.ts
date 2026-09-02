/** Formato compacto de nombres para tarjetas finales (solo presentación). */

export function compactPlayerName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "?") return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return trimmed;
  const first = parts[0];
  const last = parts[parts.length - 1];
  if (last.length <= 2) return `${first} ${last}`;
  return `${first} ${last.charAt(0).toUpperCase()}.`;
}

export function formatPairCompactLine(name1: string, name2: string): string {
  return `${compactPlayerName(name1)} / ${compactPlayerName(name2)}`;
}

export function pairInitials(name1: string, name2: string): string {
  const i1 = name1.trim().charAt(0).toUpperCase() || "?";
  const i2 = name2.trim().charAt(0).toUpperCase() || "?";
  return `${i1}${i2}`;
}
