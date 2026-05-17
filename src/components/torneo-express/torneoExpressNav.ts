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

const TE_GENERAL_BACK_PREFIX = "te_general_back_";

export function setTorneoExpressGeneralBack(
  torneoId: string,
  path: string
): void {
  try {
    sessionStorage.setItem(`${TE_GENERAL_BACK_PREFIX}${torneoId}`, path);
  } catch {
    /* ignore */
  }
}

export function getTorneoExpressGeneralBack(torneoId: string): string {
  try {
    const stored = sessionStorage.getItem(
      `${TE_GENERAL_BACK_PREFIX}${torneoId}`
    );
    if (stored) return stored;
  } catch {
    /* ignore */
  }
  return `/torneo-express/${torneoId}/gestionar`;
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
