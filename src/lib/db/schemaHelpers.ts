/**
 * Columna inexistente en la tabla expuesta a PostgREST.
 * - PGRST204: mensaje típico de PostgREST ("'col' column of 'table'").
 * - 42703: error PostgreSQL ("column table.col does not exist") que a veces
 *   llega tal cual en respuestas REST.
 */
export const isMissingColumnError = (
  error: { code?: string; message?: string } | null,
  table: string,
  column: string
): boolean => {
  if (!error || typeof error.message !== "string") return false;
  const msg = error.message;
  if (
    error.code === "PGRST204" &&
    msg.includes(`'${column}' column of '${table}'`)
  ) {
    return true;
  }
  if (
    error.code === "42703" &&
    msg.includes(`${table}.${column}`) &&
    msg.toLowerCase().includes("does not exist")
  ) {
    return true;
  }

  const lower = msg.toLowerCase();
  const col = column.toLowerCase();
  const tbl = table.toLowerCase();
  if (
    lower.includes(col) &&
    (lower.includes(tbl) || lower.includes(`'${table}'`)) &&
    (lower.includes("schema cache") ||
      lower.includes("does not exist") ||
      lower.includes("could not find"))
  ) {
    return true;
  }

  return false;
};

/** Pool global de jugadores reutilizable entre retas (UUID nulo estándar) */
export const GLOBAL_TOURNAMENT_ID =
  "00000000-0000-0000-0000-000000000000";
