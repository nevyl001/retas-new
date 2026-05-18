/** Valor por defecto al crear partidos o si no hay cancha guardada. */
export const CANCHA_DEFAULT_VALUE = "1";

export function formatCanchaDisplay(raw: string | null | undefined): string {
  const v = raw?.trim();
  if (!v) return "Cancha 1";
  if (/^cancha\s+/i.test(v)) {
    const tail = v.replace(/^cancha\s+/i, "").trim();
    return tail ? `Cancha ${tail}` : "Cancha 1";
  }
  return `Cancha ${v}`;
}

/** Texto corto para el input al editar (solo el número o nombre). */
export function canchaDraftFromStored(raw: string | null | undefined): string {
  const v = raw?.trim();
  if (!v) return CANCHA_DEFAULT_VALUE;
  const prefixed = v.match(/^cancha\s+(.+)$/i);
  if (prefixed) return prefixed[1].trim() || CANCHA_DEFAULT_VALUE;
  return v;
}

export function normalizeCanchaForSave(input: string): string {
  const v = input.trim();
  return v || CANCHA_DEFAULT_VALUE;
}
