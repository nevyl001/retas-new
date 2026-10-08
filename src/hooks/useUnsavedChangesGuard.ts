import { useCallback, useEffect, useRef, useState } from "react";
import {
  isForcedNavigationInProgress,
  navigateAppTo,
  PATH_SYNC_EVENT,
  readHistoryIndex,
  registerNavigationGuard,
  registerPopStateGuard,
  registerSessionExitGuard,
} from "../lib/appRouting";

export type UnsavedChangesPendingKind = "navigate" | "signout";

export type UnsavedChangesGuard = {
  /** Hay una salida bloqueada esperando la decisión del usuario. */
  isPending: boolean;
  /** Qué intentó hacer el usuario: navegar a otra ruta o cerrar sesión. */
  pendingKind: UnsavedChangesPendingKind | null;
  /** Descarta los cambios y continúa con la salida bloqueada. */
  confirmLeave: () => void;
  /** Cancela la salida: el usuario sigue editando. */
  stay: () => void;
};

type Pending =
  | {
      kind: "navigate";
      path: string;
      /**
       * Índice de historial de la entrada a la que el usuario intentó ir con Atrás/Adelante
       * (ver `historyIndex.ts`); null = navegación nueva o entrada sin numerar.
       */
      destIndex: number | null;
    }
  | { kind: "signout"; resolve: (proceed: boolean) => void };

function currentUrl(): string {
  return window.location.pathname + window.location.search;
}

/** Espera de silencio antes de deshacer un salto: junta ráfagas de Atrás/Adelante en una sola corrección. */
const SETTLE_MS = 50;
/** Si el salto correctivo no aterriza, se reintenta pasado este tiempo. */
const VERIFY_MS = 400;
const MAX_REVERT_ATTEMPTS = 3;

/**
 * Protege una pantalla con cambios sin guardar. Solo actúa mientras `dirty` es true:
 * - navegación interna (`navigateAppTo`): se bloquea y espera decisión;
 * - Atrás/Adelante: el navegador ya se movió; con el índice de cada entrada se calcula
 *   cuántos pasos y se deshace con `history.go(-delta)` (sin añadir entradas). Si el
 *   usuario confirma, se repite con `history.go(delta)`. Las ráfagas se juntan en una
 *   sola corrección, porque `go()` es relativo a la posición del momento en que se ejecuta;
 * - cierre de sesión (`signOut`): se pide confirmación antes de cerrar;
 * - cierre, recarga o salida de la página: diálogo nativo `beforeunload`.
 * Las navegaciones forzosas por fin de sesión nunca se bloquean.
 * Con `dirty === false` no registra nada: no hay confirmaciones sin cambios reales.
 */
export function useUnsavedChangesGuard(dirty: boolean): UnsavedChangesGuard {
  const [pending, setPendingState] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const bypassRef = useRef(false);
  /** Índice destino de la repetición confirmada de Atrás/Adelante: ese popstate debe pasar. */
  const allowTargetIndexRef = useRef<number | null>(null);
  /** Cancela la corrección diferida vigente (la define el efecto activo). */
  const cancelSettleRef = useRef<() => void>(() => undefined);

  const setPending = useCallback((next: Pending | null) => {
    pendingRef.current = next;
    setPendingState(next);
  }, []);

  useEffect(() => {
    if (!dirty) {
      setPending(null);
      return;
    }

    const lockedUrl = currentUrl();
    const lockedIndex = readHistoryIndex();

    const unregisterNavigation = registerNavigationGuard((nextPath) => {
      if (bypassRef.current) return true;
      setPending({ kind: "navigate", path: nextPath, destIndex: null });
      return false;
    });

    const unregisterSessionExit = registerSessionExitGuard(
      () =>
        new Promise<boolean>((resolve) => {
          const previous = pendingRef.current;
          if (previous?.kind === "signout") previous.resolve(false);
          setPending({ kind: "signout", resolve });
        })
    );

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Requerido por algunos navegadores para mostrar el diálogo nativo.
      event.returnValue = "";
    };

    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let verifyTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const clearTimers = () => {
      if (settleTimer !== null) clearTimeout(settleTimer);
      if (verifyTimer !== null) clearTimeout(verifyTimer);
      settleTimer = null;
      verifyTimer = null;
    };
    cancelSettleRef.current = () => {
      clearTimers();
      attempts = 0;
    };

    const restoreUrlByPush = () => {
      window.history.pushState(window.history.state, "", lockedUrl);
    };

    // Devuelve el historial a la entrada protegida. Se calcula con la posición ACTUAL.
    const settle = () => {
      settleTimer = null;
      const current = readHistoryIndex();
      if (lockedIndex === null || current === null) return;
      if (current === lockedIndex) {
        attempts = 0;
        return;
      }
      if (attempts >= MAX_REVERT_ATTEMPTS) {
        attempts = 0;
        restoreUrlByPush();
        return;
      }
      attempts += 1;
      window.history.go(lockedIndex - current);
      verifyTimer = setTimeout(settle, VERIFY_MS);
    };

    // Guarda de la puerta única de `popstate` (ver `registerPopStateGuard`). La puerta se
    // ejecuta antes que los listeners de ruteo de la app; así la pantalla no se desmonta
    // antes de que el usuario decida. Devuelve true = bloquear (la puerta detiene el evento).
    const onPopState = (): boolean => {
      if (bypassRef.current || isForcedNavigationInProgress()) return false;

      const destIndex = readHistoryIndex();

      if (allowTargetIndexRef.current !== null && destIndex === allowTargetIndexRef.current) {
        allowTargetIndexRef.current = null;
        return false;
      }

      const indicesKnown = lockedIndex !== null && destIndex !== null;
      const backOnProtectedEntry = indicesKnown
        ? destIndex === lockedIndex
        : currentUrl() === lockedUrl;
      if (backOnProtectedEntry) {
        if (verifyTimer !== null) clearTimeout(verifyTimer);
        verifyTimer = null;
        attempts = 0;
        return false;
      }

      const next = currentUrl();

      if (indicesKnown) {
        setPending({ kind: "navigate", path: next, destIndex });
        clearTimers();
        settleTimer = setTimeout(settle, SETTLE_MS);
        return true;
      }

      // Entrada sin numerar (p. ej. un cambio de hash creado por el navegador):
      // no se conoce la distancia, se restaura la URL como último recurso.
      restoreUrlByPush();
      setPending({ kind: "navigate", path: next, destIndex: null });
      return true;
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    const unregisterPopState = registerPopStateGuard(onPopState);
    return () => {
      unregisterNavigation();
      unregisterSessionExit();
      unregisterPopState();
      // Si había un salto interceptado sin corregir, se devuelve ya el historial
      // a la entrada protegida para que la URL no quede desalineada con la pantalla.
      const hadScheduledRevert = settleTimer !== null;
      clearTimers();
      cancelSettleRef.current = () => undefined;
      if (hadScheduledRevert) settle();
      clearTimers();
      window.removeEventListener("beforeunload", onBeforeUnload);
      // Si la pantalla deja de proteger (guardó o se desmontó) mientras había un
      // cierre de sesión en espera, ese cierre debe continuar.
      const waiting = pendingRef.current;
      if (waiting?.kind === "signout") waiting.resolve(true);
    };
  }, [dirty, setPending]);

  const confirmLeave = useCallback(() => {
    const current = pendingRef.current;
    if (!current) return;
    setPending(null);

    if (current.kind === "signout") {
      current.resolve(true);
      return;
    }

    if (current.destIndex !== null) {
      cancelSettleRef.current();
      const here = readHistoryIndex();
      if (here !== null) {
        const delta = current.destIndex - here;
        if (delta !== 0) {
          allowTargetIndexRef.current = current.destIndex;
          window.history.go(delta);
        } else {
          // Ya estamos en el destino (no se alcanzó a corregir): la app aún no lo ha visto.
          bypassRef.current = true;
          try {
            window.dispatchEvent(new PopStateEvent("popstate"));
            window.dispatchEvent(new Event(PATH_SYNC_EVENT));
          } finally {
            bypassRef.current = false;
          }
        }
        return;
      }
    }

    bypassRef.current = true;
    try {
      navigateAppTo(current.path);
    } finally {
      bypassRef.current = false;
    }
  }, [setPending]);

  const stay = useCallback(() => {
    const current = pendingRef.current;
    if (current?.kind === "signout") current.resolve(false);
    setPending(null);
  }, [setPending]);

  return {
    isPending: pending !== null,
    pendingKind: pending?.kind ?? null,
    confirmLeave,
    stay,
  };
}
