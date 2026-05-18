import { useEffect, useState } from "react";

/** Animación ease-out de 0 → target (para marcadores). */
export function useCountUp(
  target: number,
  options?: { duration?: number; enabled?: boolean }
): number {
  const duration = options?.duration ?? 650;
  const enabled = options?.enabled ?? true;
  const [value, setValue] = useState(enabled ? 0 : target);

  useEffect(() => {
    if (!enabled) {
      setValue(target);
      return;
    }
    if (target <= 0) {
      setValue(0);
      return;
    }

    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, enabled]);

  return value;
}
