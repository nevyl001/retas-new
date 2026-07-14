/**
 * PostgREST / supabase-js a menudo pone el texto útil de un RAISE EXCEPTION
 * en `message`, pero a veces el cuerpo real va en `details` / `hint`, y
 * `message` queda como "Bad Request" o vacío.
 */
export type SupabaseLikeError = {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string;
  status?: number;
} | null | undefined;

function cleanPart(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

export function formatSupabaseErrorMessage(
  error: SupabaseLikeError,
  fallback = "No se pudo completar la operación."
): string {
  if (!error) return fallback;

  const parts = [error.message, error.details, error.hint]
    .map(cleanPart)
    .filter(Boolean);

  const unique: string[] = [];
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (unique.some((u) => u.toLowerCase() === lower)) continue;
    // Evitar "Bad Request" / "JWT" genéricos si hay un detalle mejor.
    if (
      (lower === "bad request" || lower === "unauthorized") &&
      parts.some((p) => p.toLowerCase() !== lower && p.length > lower.length)
    ) {
      continue;
    }
    unique.push(part);
  }

  const text = unique.join(" — ").trim();
  if (!text) {
    return error.code ? `${fallback} (${error.code})` : fallback;
  }
  return text;
}
