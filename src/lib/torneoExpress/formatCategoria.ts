/** Texto listo para UI (ej. "4ta" → "4ta"). */
export function formatTorneoExpressCategoria(
  categoria: string | null | undefined
): string | null {
  const t = categoria?.trim();
  return t ? t : null;
}
