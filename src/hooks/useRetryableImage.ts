import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_MAX_IMAGE_RETRIES,
  advanceRetryImageState,
  initialRetryImageState,
  resolveRetryImageSrc,
  type RetryImageState,
} from "../lib/retryableImage";

export interface UseRetryableImageResult {
  /** src a usar en <img>; null => mostrar fallback (inicial). */
  src: string | null;
  failed: boolean;
  onError: () => void;
}

/**
 * Carga una imagen con reintentos ante fallos transitorios de red. Ante un
 * `onError` espera un pequeño delay y vuelve a solicitar la imagen (con
 * cache-busting) hasta `maxRetries`; agotados, expone `failed` para que el
 * consumidor muestre la inicial. No fuerza remontajes: la key del <img> debe
 * seguir siendo estable (p. ej. el id del jugador).
 */
export function useRetryableImage(
  fotoUrl: string | null | undefined,
  opts?: { maxRetries?: number; retryDelayMs?: number }
): UseRetryableImageResult {
  const maxRetries = opts?.maxRetries ?? DEFAULT_MAX_IMAGE_RETRIES;
  const retryDelayMs = opts?.retryDelayMs ?? 600;
  const trimmed = typeof fotoUrl === "string" ? fotoUrl.trim() : "";

  const [state, setState] = useState<RetryImageState>(initialRetryImageState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Reinicia el estado cuando cambia la foto. La key del <img> no depende de
  // esto, así que no se remonta: solo se resetea el contador de reintentos.
  useEffect(() => {
    clearTimer();
    setState(initialRetryImageState());
    return clearTimer;
  }, [trimmed, clearTimer]);

  const onError = useCallback(() => {
    const prev = stateRef.current;
    if (prev.failed) return;

    const next = advanceRetryImageState(prev, maxRetries);
    if (next.failed) {
      setState(next);
      return;
    }

    // Reintento con delay: da margen a transitorios de red antes de reintentar.
    clearTimer();
    timerRef.current = setTimeout(() => {
      setState((current) =>
        current.failed ? current : advanceRetryImageState(current, maxRetries)
      );
    }, retryDelayMs);
  }, [maxRetries, retryDelayMs, clearTimer]);

  return {
    src: resolveRetryImageSrc(trimmed, state),
    failed: state.failed,
    onError,
  };
}
