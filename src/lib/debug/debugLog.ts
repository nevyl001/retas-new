/**
 * Logger de desarrollo centralizado. No-op en producción (gate de build-time
 * de CRA: process.env.NODE_ENV === "production" se elimina por dead-code
 * elimination en el bundle final, igual que los `if` de App.tsx).
 *
 * Uso: reemplazo directo de console.log/info/debug/group/time para código
 * que aporta valor de diagnóstico en desarrollo. NO usar para errores ni
 * advertencias reales — para eso sigue usando console.error / console.warn.
 */

const isProd = process.env.NODE_ENV === "production";

// no-console: off para este archivo vía override en .eslintrc.js — es el
// único wrapper autorizado a llamar console.* directamente.

export function debugLog(...args: unknown[]): void {
  if (isProd) return;
  console.log(...args);
}

export function debugWarn(...args: unknown[]): void {
  if (isProd) return;
  console.warn(...args);
}

export function debugGroup(label: string, fn: () => void): void {
  if (isProd) {
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
  if (isProd) return;
  console.time(label);
}

export function debugTimeEnd(label: string): void {
  if (isProd) return;
  console.timeEnd(label);
}
