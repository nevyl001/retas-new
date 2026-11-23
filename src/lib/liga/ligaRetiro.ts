/** La liga ya tiene calendario o participación. No se borra. */
export class LigaConActividadError extends Error {
  readonly code = "liga_has_activity" as const;

  constructor() {
    super(
      "No es posible eliminar esta liga. Esta competencia ya tiene partidos registrados."
    );
    this.name = "LigaConActividadError";
  }
}

export function ligaTieneHistorialDeportivo(input: {
  jornadasCount?: number | null;
  jornadasLength?: number | null;
}): boolean {
  if (input.jornadasLength != null) return input.jornadasLength > 0;
  return (input.jornadasCount ?? 0) > 0;
}

export function esErrorTecnicoDeLiga(message: string): boolean {
  return /violates foreign key|liga_partidos_liga_id_fkey|duplicate key|syntax error|relation "|column "/i.test(
    message
  );
}

export function mensajeRetiroLiga(error: unknown, fallback: string): string {
  if (error instanceof LigaConActividadError) return error.message;
  if (error instanceof Error) {
    if (esErrorTecnicoDeLiga(error.message)) return fallback;
    return error.message;
  }
  return fallback;
}
