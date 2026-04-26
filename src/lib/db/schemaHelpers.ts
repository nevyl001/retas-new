/** PostgREST: columna inexistente en el esquema expuesto */
export const isMissingColumnError = (
  error: { code?: string; message?: string } | null,
  table: string,
  column: string
) =>
  !!error &&
  error.code === "PGRST204" &&
  typeof error.message === "string" &&
  error.message.includes(`'${column}' column of '${table}'`);

/** Pool global de jugadores reutilizable entre retas (UUID nulo estándar) */
export const GLOBAL_TOURNAMENT_ID =
  "00000000-0000-0000-0000-000000000000";
