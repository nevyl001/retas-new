/**
 * Timeout para promesas de red.
 *
 * Motivo (incidente 2026-08-05): en móvil la vista «Mis retas» se quedaba en
 * "Cargando retas…" indefinidamente. `fetch` no tiene timeout por defecto: si
 * la conexión se degrada o el navegador suspende la pestaña en segundo plano,
 * la promesa nunca se resuelve, el `finally` que apaga el spinner nunca corre y
 * el usuario ve un spinner eterno.
 *
 * Nota: esto acota la ESPERA del llamador, no cancela el trabajo del servidor.
 * Todas las escrituras del cierre son idempotentes, así que un timeout seguido
 * de reintento no duplica datos.
 */

export class TimeoutError extends Error {
  readonly code = "ETIMEOUT";

  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

export type WithTimeoutOptions = {
  /** Milisegundos antes de rechazar. */
  timeoutMs: number;
  /** Etiqueta para el mensaje de error. */
  label?: string;
};

/**
 * Rechaza con TimeoutError si `promise` no resuelve dentro de `timeoutMs`.
 * El timer se limpia siempre para no dejar handles abiertos.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  { timeoutMs, label }: WithTimeoutOptions
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(
        new TimeoutError(
          `${label ?? "La operación"} tardó más de ${Math.round(timeoutMs / 1000)}s. Revisa tu conexión e intenta de nuevo.`
        )
      );
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

export function isTimeoutError(error: unknown): error is TimeoutError {
  return (
    error instanceof TimeoutError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === "ETIMEOUT")
  );
}
