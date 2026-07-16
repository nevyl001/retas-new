/**
 * Errores amigables del servicio común Convocatoria Riviera.
 * Nunca exponer mensajes SQL / Postgres / PostgREST crudos en UI.
 */

const GENERIC_LAUNCH =
  "No pudimos crear la convocatoria. Intenta nuevamente.";
const GENERIC_LOAD = "No pudimos cargar la convocatoria. Intenta nuevamente.";
const GENERIC_ACTION = "No pudimos completar la acción. Intenta nuevamente.";

const SQLISH =
  /gen_random_bytes|digest\(|pgcrypto|extensions\.|does not exist|PGRST|postgrest|rpc\/|sql state|postgres|permission denied for|relation .* does not|function .* does not|column .* does not|syntax error|violates|duplicate key|foreign key|check constraint|search_path|supabase\.co\/rest/i;

export type ConvocatoriaErrorKind = "launch" | "load" | "action";

export function mapConvocatoriaUserError(
  raw: unknown,
  kind: ConvocatoriaErrorKind = "action"
): string {
  const fallback =
    kind === "launch"
      ? GENERIC_LAUNCH
      : kind === "load"
        ? GENERIC_LOAD
        : GENERIC_ACTION;

  const message =
    raw instanceof Error
      ? raw.message
      : typeof raw === "string"
        ? raw
        : fallback;

  const trimmed = message.trim();
  if (!trimmed) return fallback;

  // Mensajes de producto ya conocidos (whitelist / validación UI)
  if (
    /no admite convocatoria|guarda el evento|no se pudo crear el borrador|escribe el nombre|indica la cancha|completa día|horario|permiso para lanzar/i.test(
      trimmed
    )
  ) {
    return trimmed;
  }

  if (SQLISH.test(trimmed)) return fallback;
  if (/migración|rpc|sql/i.test(trimmed)) return fallback;

  // Cualquier error de red/servidor genérico
  if (/failed to fetch|network|timeout|500|502|503|404/i.test(trimmed)) {
    return fallback;
  }

  // Por defecto no filtramos mensajes cortos de negocio ("cupo lleno", etc.)
  // pero ocultamos trazas largas o técnicas.
  if (trimmed.length > 160 || /stack|exception|error:/i.test(trimmed)) {
    return fallback;
  }

  return trimmed;
}
