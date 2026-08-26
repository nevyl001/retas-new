import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

/**
 * Page-enter gate: true after the first enter sequence for `resetKey`.
 * Polling must not change resetKey — only jornada/liga navigation should.
 */
export function useLigaPublicEnterOnce(
  enabled: boolean,
  resetKey: string
): { enterActive: boolean; enterDone: boolean } {
  const [enterDone, setEnterDone] = useState(false);
  const [enterActive, setEnterActive] = useState(false);
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setEnterActive(false);
      setEnterDone(false);
      return;
    }
    if (lastKey.current === resetKey) return;
    lastKey.current = resetKey;
    setEnterDone(false);
    setEnterActive(true);

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ms = reduce ? 0 : 780;
    const id = window.setTimeout(() => {
      setEnterActive(false);
      setEnterDone(true);
    }, ms);
    return () => window.clearTimeout(id);
  }, [enabled, resetKey]);

  return { enterActive, enterDone };
}

/** IntersectionObserver once — for section scroll reveal. */
export function useInViewOnce<T extends HTMLElement>(
  enabled: boolean,
  resetKey = ""
): [RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);
  }, [resetKey]);

  useEffect(() => {
    if (!enabled || visible) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, visible, resetKey]);

  return [ref, visible];
}

/**
 * FLIP layout for reordered list items (ranking).
 * Animates transform only; skips if reduced motion.
 */
export function useFlipReorder(
  keys: string[],
  enabled: boolean
): RefObject<HTMLElement> {
  const containerRef = useRef<HTMLElement>(null);
  const prevRects = useRef<Map<string, DOMRect>>(new Map());
  const prevKeys = useRef<string>("");

  useLayoutEffect(() => {
    if (!enabled) return;
    const root = containerRef.current;
    if (!root) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const keySig = keys.join("|");
    const nodes = Array.from(
      root.querySelectorAll<HTMLElement>("[data-flip-key]")
    );
    const nextRects = new Map<string, DOMRect>();
    for (const node of nodes) {
      const k = node.dataset.flipKey;
      if (!k) continue;
      nextRects.set(k, node.getBoundingClientRect());
    }

    if (!reduce && prevKeys.current && prevKeys.current !== keySig) {
      for (const node of nodes) {
        const k = node.dataset.flipKey;
        if (!k) continue;
        const last = prevRects.current.get(k);
        const next = nextRects.get(k);
        if (!last || !next) continue;
        const dx = last.left - next.left;
        const dy = last.top - next.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
        node.style.transform = `translate(${dx}px, ${dy}px)`;
        node.style.transition = "none";
        void node.offsetWidth;
        node.style.transition =
          "transform var(--motion-slow, 400ms) cubic-bezier(0.22, 1, 0.36, 1)";
        node.style.transform = "";
      }
    }

    prevRects.current = nextRects;
    prevKeys.current = keySig;
  }, [keys, enabled]);

  return containerRef;
}
