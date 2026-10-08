/**
 * Numeración del historial de la pestaña.
 *
 * Los navegadores no dicen cuántos pasos dio el usuario con Atrás/Adelante, y
 * `popstate` llega cuando el salto ya ocurrió. Para poder deshacerlo (o repetirlo)
 * con `history.go(±delta)` sin añadir entradas, cada entrada guarda su posición en
 * `history.state` bajo una clave propia. Solo usa la History API estándar
 * (Chrome, Edge, Firefox, Safari de escritorio e iOS); no depende de Navigation API.
 *
 * Contrato de instrumentación (se instala una sola vez, de forma idempotente):
 * - El llamador conserva íntegramente su estado: se hace una COPIA superficial del
 *   objeto y solo se añade la clave interna; nunca se pisan propiedades ajenas.
 * - `pushState`  → índice de la entrada actual + 1.
 * - `replaceState` → conserva el índice de la entrada actual (sigue siendo la misma entrada).
 * - `null`/`undefined` pasan a ser `{ [clave]: n }`. Es el único cambio de forma.
 * - Estados que NO son objetos simples (string, número, boolean, array, Date, Map,
 *   Blob, instancias de clase…) no se tocan: añadirles una propiedad cambiaría su
 *   semántica o no sobreviviría al clonado. Esa entrada queda SIN numerar y la guarda
 *   de cambios sin guardar usa su plan de respaldo.
 * - Si el estado ya trae la clave con un valor que no es un índice válido (uso ajeno),
 *   tampoco se toca. Si trae un índice válido (copia de `history.state`), se actualiza.
 * - Las llamadas a `history.go/back/forward` no se tocan.
 * Hoy el código de la app solo pasa `{}` o `null` a pushState/replaceState.
 */

export const HISTORY_INDEX_KEY = "__rivieraHistoryIdx";

const INSTALLED_MARK = Symbol.for("riviera.historyIndex.installed");

type HistoryWithMark = History & { [INSTALLED_MARK]?: () => void };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isValidIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** Índice de la entrada actual o `null` si no está numerada. */
export function readHistoryIndex(): number | null {
  if (typeof window === "undefined") return null;
  const state: unknown = window.history.state;
  if (!isPlainObject(state)) return null;
  const value = state[HISTORY_INDEX_KEY];
  return isValidIndex(value) ? value : null;
}

/**
 * Devuelve el estado con el índice, o el MISMO valor sin tocar si no se puede
 * instrumentar sin cambiar su semántica.
 */
export function withHistoryIndex(data: unknown, index: number): unknown {
  if (data === null || data === undefined) return { [HISTORY_INDEX_KEY]: index };
  if (!isPlainObject(data)) return data;
  if (
    Object.prototype.hasOwnProperty.call(data, HISTORY_INDEX_KEY) &&
    !isValidIndex(data[HISTORY_INDEX_KEY])
  ) {
    return data;
  }
  return { ...data, [HISTORY_INDEX_KEY]: index };
}

/**
 * Instala la numeración. Idempotente (también entre copias del módulo, p. ej. HMR).
 * Devuelve la función que la desinstala y restaura los métodos originales; solo la
 * instalación original puede desinstalar.
 */
export function installHistoryIndexTracking(): () => void {
  if (typeof window === "undefined" || !window.history) return () => undefined;

  const history = window.history as HistoryWithMark;
  const existing = history[INSTALLED_MARK];
  if (existing) return () => undefined;

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function pushStateWithIndex(
    this: History,
    data: unknown,
    unused: string,
    ...rest: [url?: string | URL | null]
  ) {
    const next = (readHistoryIndex() ?? 0) + 1;
    return originalPushState.call(
      this,
      withHistoryIndex(data, next),
      unused,
      ...rest
    );
  };

  history.replaceState = function replaceStateWithIndex(
    this: History,
    data: unknown,
    unused: string,
    ...rest: [url?: string | URL | null]
  ) {
    const current = readHistoryIndex();
    return originalReplaceState.call(
      this,
      current === null ? data : withHistoryIndex(data, current),
      unused,
      ...rest
    );
  };

  // Numera la entrada de partida (0) conservando su estado y su URL.
  if (readHistoryIndex() === null) {
    const state: unknown = history.state;
    const numbered = withHistoryIndex(state, 0);
    if (numbered !== state) {
      originalReplaceState.call(history, numbered, "");
    }
  }

  const uninstall = () => {
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    delete history[INSTALLED_MARK];
  };
  history[INSTALLED_MARK] = uninstall;
  return uninstall;
}
