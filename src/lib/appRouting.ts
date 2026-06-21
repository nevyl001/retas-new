/**
 * Rutas de la SPA (sin react-router). La URL es la fuente de verdad al refrescar.
 */

export const PATH_SYNC_EVENT = "riviera:pathname-sync";

export type AppView =
  | "main"
  | "winner"
  | "public"
  | "public-americano"
  | "public-americano-pantalla"
  | "public-pantalla"
  | "americano-dinamico"
  | "torneo-express"
  | "liga"
  | "duelo-2v2"
  | "jugadores"
  | "auth-callback"
  | "auth-reset-password"
  | "admin-login"
  | "admin-dashboard";

export function normalizeAppPathname(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

export function parseRetaIdFromPath(pathname: string): string | null {
  const path = normalizeAppPathname(pathname);
  const m = path.match(/^\/reta\/([^/?#]+)/i);
  const raw = m?.[1];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw).trim() || null;
  } catch {
    return raw.trim() || null;
  }
}

export function buildRetaPath(tournamentId: string): string {
  return `/reta/${encodeURIComponent(tournamentId.trim())}`;
}

/** Actualiza la URL y notifica listeners (popstate + sync). */
export function navigateAppTo(path: string): void {
  if (typeof window === "undefined") return;

  const url = new URL(path, window.location.origin);
  const next = url.pathname + url.search;
  const current = window.location.pathname + window.location.search;
  if (next === current) return;

  window.history.pushState({}, "", next);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.dispatchEvent(new Event(PATH_SYNC_EVENT));
}

export function navigateToAppHome(): void {
  navigateAppTo("/");
}

export function navigateToReta(tournamentId: string): void {
  const id = tournamentId.trim();
  if (!id) {
    navigateToAppHome();
    return;
  }
  navigateAppTo(buildRetaPath(id));
}

export function resolveAppViewFromPath(pathname: string): AppView {
  const currentPath = normalizeAppPathname(pathname);

  if (currentPath === "/auth/callback") return "auth-callback";
  if (currentPath === "/auth/reset-password") return "auth-reset-password";
  if (currentPath === "/admin-login") return "admin-login";
  if (currentPath === "/admin-dashboard") return "admin-dashboard";
  if (currentPath === "/americano-dinamico") return "americano-dinamico";
  if (currentPath.startsWith("/liga") || /^\/public\/liga\//i.test(currentPath))
    return "liga";
  if (
    currentPath.startsWith("/duelo-2v2") ||
    /^\/public\/duelo-2v2\//i.test(currentPath)
  )
    return "duelo-2v2";
  if (
    currentPath.startsWith("/jugadores") ||
    currentPath.startsWith("/public/jugadores") ||
    currentPath === "/ranking" ||
    currentPath.startsWith("/ranking/") ||
    currentPath === "/public/ranking-puntos"
  ) {
    return "jugadores";
  }
  if (currentPath.startsWith("/torneo-express")) return "torneo-express";
  if (/^\/public\/pantalla\//i.test(currentPath)) return "public-pantalla";
  if (/^\/public\/americano-pantalla\//i.test(currentPath))
    return "public-americano-pantalla";
  if (/^\/public\/americano\//i.test(currentPath)) return "public-americano";
  if (currentPath.startsWith("/public/")) return "public";
  if (parseRetaIdFromPath(currentPath)) return "main";
  return "main";
}

/** Rutas que requieren sesión de usuario (no públicas ni admin). */
export function pathRequiresUserSession(pathname: string): boolean {
  const path = normalizeAppPathname(pathname);
  if (path.includes("/public/")) return false;
  if (path.startsWith("/liga")) return true;
  if (path.startsWith("/duelo-2v2")) return true;
  if (path.startsWith("/public/jugadores")) return false;
  if (path === "/ranking" || path.startsWith("/ranking/")) return false;
  if (path === "/public/ranking-puntos") return false;
  if (path.startsWith("/jugadores")) return true;
  if (
    path.startsWith("/torneo-express/") &&
    /\/(grupo\/[^/]+|general|grupos|eliminatoria)\/?$/i.test(path)
  ) {
    return false;
  }
  if (path === "/admin-login" || path === "/admin-dashboard") return false;
  if (path === "/auth/callback") return false;
  if (path === "/auth/reset-password") return false;
  return true;
}
