import { useEffect, useState } from "react";

const PATH_SYNC_EVENT = "riviera:pathname-sync";

export function normalizeTorneoPath(path: string): string {
  return path.replace(/\/+$/, "") || "/";
}

/** Mantiene el pathname en sync con pushState/popstate (sin recargar la página). */
export function useSyncPathname(): string {
  const [pathname, setPathname] = useState(() =>
    normalizeTorneoPath(window.location.pathname)
  );

  useEffect(() => {
    const apply = () => {
      const next = normalizeTorneoPath(window.location.pathname);
      setPathname((prev) => (prev === next ? prev : next));
    };

    window.addEventListener("popstate", apply);
    window.addEventListener(PATH_SYNC_EVENT, apply);
    return () => {
      window.removeEventListener("popstate", apply);
      window.removeEventListener(PATH_SYNC_EVENT, apply);
    };
  }, []);

  return pathname;
}

/** Navegación solo por URL; no modifica Supabase ni estado global de retas. */
export function navigateTorneoExpress(path: string): void {
  const next = normalizeTorneoPath(path);
  const current = normalizeTorneoPath(window.location.pathname);
  if (next === current) return;

  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.dispatchEvent(new Event(PATH_SYNC_EVENT));
}
