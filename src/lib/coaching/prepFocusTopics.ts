/** Máximo de temas que el coach puede fijar en la preparación de una clase. */
export const PREP_FOCUS_MAX_TOPICS = 3;

/** Separador legible en `coach_sessions.focus` (también lo ve el alumno). */
export const PREP_FOCUS_SEPARATOR = " · ";

/**
 * Parte el campo `focus` en temas (1–3).
 * Acepta el separador oficial y variantes legacy (`|`, saltos de línea).
 */
export function parsePrepFocusTopics(
  focus: string | null | undefined
): string[] {
  if (!focus) return [];
  const trimmed = focus.trim();
  if (!trimmed) return [];

  const parts = trimmed
    .split(/\s*[·|]\s*|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return [];
  return parts.slice(0, PREP_FOCUS_MAX_TOPICS);
}

/** Une hasta 3 temas en el string que se guarda en `focus`. */
export function serializePrepFocusTopics(
  topics: string[] | null | undefined
): string | null {
  if (!topics || topics.length === 0) return null;
  const cleaned = topics
    .map((topic) => topic.trim())
    .filter(Boolean)
    .slice(0, PREP_FOCUS_MAX_TOPICS);
  if (cleaned.length === 0) return null;
  return cleaned.join(PREP_FOCUS_SEPARATOR);
}

/**
 * Alterna un tema en la selección del coach.
 * Máximo {@link PREP_FOCUS_MAX_TOPICS}; no añade duplicados.
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
  if (current.length >= PREP_FOCUS_MAX_TOPICS) {
    return current;
  }
  return [...current, clean];
}
