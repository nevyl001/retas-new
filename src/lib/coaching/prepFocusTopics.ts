/** Separador legible en `coach_sessions.focus` (también lo ve el alumno). */
export const PREP_FOCUS_SEPARATOR = " · ";

/**
 * Parte el campo `focus` en temas.
 * Acepta el separador oficial y variantes legacy (`|`, saltos de línea).
 */
export function parsePrepFocusTopics(
  focus: string | null | undefined
): string[] {
  if (!focus) return [];
  const trimmed = focus.trim();
  if (!trimmed) return [];

  return trimmed
    .split(/\s*[·|]\s*|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Une los temas en el string que se guarda en `focus`. */
export function serializePrepFocusTopics(
  topics: string[] | null | undefined
): string | null {
  if (!topics || topics.length === 0) return null;
  const cleaned = topics.map((topic) => topic.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;
  return cleaned.join(PREP_FOCUS_SEPARATOR);
}

/**
 * Alterna un tema en la selección del coach.
 * No hay tope: el coach elige todos los que quiera. No añade duplicados.
 */
export function togglePrepFocusTopic(
  current: string[],
  topic: string
): string[] {
  const clean = topic.trim();
  if (!clean) return current;
  if (current.includes(clean)) {
    return current.filter((item) => item !== clean);
  }
  return [...current, clean];
}
