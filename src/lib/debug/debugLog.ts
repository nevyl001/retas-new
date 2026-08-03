/**
 * Logger de desarrollo centralizado.
 *
 * - Producción: siempre no-op (dead-code elimination de CRA con NODE_ENV).
 * - Desarrollo: silencioso por defecto (los logs verbosos — branding, realtime,
 *   etc. — no deben ralentizar ni ensuciar la consola en el día a día).
 *
 * Activar en local (cualquiera de los dos):
 *   localStorage.setItem("ro:debug", "1")  // luego recargar
 *   REACT_APP_DEBUG=1                      // al arrancar npm start
 *
 * NO usar para errores ni advertencias reales — console.error / console.warn
 * (o debugWarn abajo) siguen siendo el canal correcto.
 */

const isProd = process.env.NODE_ENV === "production";

// no-console: off para este archivo vía override en .eslintrc.js — es el
// único wrapper autorizado a llamar console.* directamente.

function isVerboseDebugEnabled(): boolean {
  if (isProd) return false;
  if (process.env.REACT_APP_DEBUG === "1") return true;
  try {
    return (
      typeof localStorage !== "undefined" &&
      localStorage.getItem("ro:debug") === "1"
    );
  } catch {
    return false;
  }
}

export function debugLog(...args: unknown[]): void {
  if (!isVerboseDebugEnabled()) return;
  console.log(...args);
}

/** Warnings de diagnóstico en desarrollo; sigue silenciado en producción. */
export function debugWarn(...args: unknown[]): void {
  if (isProd) return;
  console.warn(...args);
}

export function debugGroup(label: string, fn: () => void): void {
  if (!isVerboseDebugEnabled()) {
    fn();
    return;
  }
  console.group(label);
  try {
    fn();
  } finally {
    console.groupEnd();
  }
}

export function debugTime(label: string): void {
  if (!isVerboseDebugEnabled()) return;
  console.time(label);
}

export function debugTimeEnd(label: string): void {
  if (!isVerboseDebugEnabled()) return;
  console.timeEnd(label);
}
