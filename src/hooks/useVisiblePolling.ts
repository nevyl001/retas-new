import { useCallback, useEffect, useRef } from "react";

export type UseVisiblePollingOptions = {
  /** Recarga (puede ser async). Se invoca bajo el guard de concurrencia. */
  callback: () => void | Promise<void>;
  /** Intervalo en ms entre polls mientras la pestaña está visible. */
  intervalMs: number;
  /** Si false, no monta interval ni listener. Default true. */
  enabled?: boolean;
  /** Si true, ejecuta una carga al montar / al habilitar. Default true. */
  runImmediately?: boolean;
};

/**
 * Polling seguro para vistas públicas:
 * - no poll si `document.hidden`
 * - una recarga al volver a visible
 * - una sola ejecución concurrente
 * - cleanup de interval + visibilitychange
 * - SSR-safe (no toca window/document fuera del efecto)
 */
export function useVisiblePolling({
  callback,
  intervalMs,
  enabled = true,
  runImmediately = true,
}: UseVisiblePollingOptions): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const inFlightRef = useRef(false);

  const safeRun = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      await callbackRef.current();
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    if (runImmediately) {
      void safeRun();
    }

    const intervalId = window.setInterval(() => {
      if (document.hidden) return;
      void safeRun();
    }, intervalMs);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void safeRun();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, [enabled, intervalMs, runImmediately, safeRun]);
}
