/**
 * Rutas de la SPA (sin react-router). La URL es la fuente de verdad al refrescar.
 */

export const PATH_SYNC_EVENT = "riviera:pathname-sync";

export type AppView =
  | "main"
  | "winner"
  | "public"
  | "public-americano"
  | "public-vista-publica-americano"
  | "americano-dinamico"
  | "torneo-express"
  | "liga"
  | "duelo-2v2"
  | "jugadores"
  | "coaching"
  | "reta-abierta"
  | "auth-callback"
  | "auth-reset-password"
  | "admin-login"
  | "admin-dashboard"
  | "admin-user"
  | "admin-dev-player-debug"
  | "legal";

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

/**
 * Guardas de navegación interna. Una pantalla con cambios sin guardar registra
 * una guarda; si devuelve `false`, `navigateAppTo` no cambia la URL (la pantalla
 * decide si pregunta al usuario y vuelve a navegar). Sin guardas registradas el
 * comportamiento de `navigateAppTo` es idéntico al anterior.
 */
export type NavigationGuard = (nextPath: string) => boolean;

const navigationGuards = new Set<NavigationGuard>();

/** Registra una guarda. Devuelve la función para quitarla. */
export function registerNavigationGuard(guard: NavigationGuard): () => void {
  navigationGuards.add(guard);
  return () => {
    navigationGuards.delete(guard);
  };
}

function isNavigationAllowed(nextPath: string): boolean {
  for (const guard of Array.from(navigationGuards)) {
    if (!guard(nextPath)) return false;
  }
  return true;
}

/**
 * Guardas de cierre de sesión. Se consultan ANTES de cerrar la sesión (nunca después:
 * una vez cerrada, el redireccionamiento es forzoso y no se puede bloquear). Cada guarda
 * resuelve `true` para continuar o `false` para cancelar el cierre.
 */
export type SessionExitGuard = () => Promise<boolean>;

const sessionExitGuards = new Set<SessionExitGuard>();

export function registerSessionExitGuard(guard: SessionExitGuard): () => void {
  sessionExitGuards.add(guard);
  return () => {
    sessionExitGuards.delete(guard);
  };
}

/** `true` si ninguna guarda se opone al cierre de sesión. Sin guardas, resuelve de inmediato. */
export async function confirmSessionExit(): Promise<boolean> {
  for (const guard of Array.from(sessionExitGuards)) {
    if (!(await guard())) return false;
  }
  return true;
}

/**
 * Puerta única de `popstate` (Atrás / Adelante del navegador).
 *
 * Por qué existe: el navegador ya cambió la URL cuando llega `popstate`, y los listeners
 * permanentes de la app (`App.tsx`, `useSyncPathname`, `MainLayout`, …) cambian la ruta de
 * React al instante y desmontan la pantalla. Un listener que la pantalla protegida registre
 * por su cuenta llega TARDE: en Chromium los listeners de `window` se ejecutan en orden de
 * registro (el flag de captura no les da prioridad) y React vacía su cola síncrona justo
 * al terminar cada listener, así que la pantalla (y su guarda) ya no existe cuando le toca.
 *
 * Solución: un único listener, instalado una vez antes de montar React (ver `index.tsx`),
 * que por registrarse primero se ejecuta antes que cualquier otro. Las pantallas no añaden
 * listeners: registran una guarda aquí. La puerta es la única que llama a
 * `stopImmediatePropagation`, y solo cuando una guarda pide bloquear.
 *
 * Una guarda devuelve `true` para BLOQUEAR el evento (ningún listener posterior lo verá) y
 * `false` para dejarlo pasar. Sin guardas registradas la puerta no hace nada.
 */
export type PopStateGuard = (event: PopStateEvent) => boolean;

const popStateGuards = new Set<PopStateGuard>();
const POPSTATE_GATE_MARK = Symbol.for("riviera.popStateGate.installed");

type GateMark = { handler: (event: PopStateEvent) => void; uninstall: () => void };
type WindowWithGate = Window & { [POPSTATE_GATE_MARK]?: GateMark };

function onPopStateGate(event: PopStateEvent): void {
  if (popStateGuards.size === 0) return;
  for (const guard of Array.from(popStateGuards)) {
    if (guard(event)) {
      event.stopImmediatePropagation();
      return;
    }
  }
}

/**
 * Instala la puerta. Idempotente (también ante recarga en caliente): una segunda llamada no
 * añade otro listener. Devuelve una función que la desinstala (para tests).
 */
export function installPopStateGate(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const w = window as WindowWithGate;
  const existing = w[POPSTATE_GATE_MARK];
  if (existing) {
    if (existing.handler === onPopStateGate) return existing.uninstall;
    // Instancia obsoleta del módulo (recarga en caliente): su listener apunta a otro
    // conjunto de guardas, así que se sustituye para no dejar dos puertas.
    existing.uninstall();
  }

  window.addEventListener("popstate", onPopStateGate, true);
  const uninstall = () => {
    window.removeEventListener("popstate", onPopStateGate, true);
    delete w[POPSTATE_GATE_MARK];
  };
  w[POPSTATE_GATE_MARK] = { handler: onPopStateGate, uninstall };
  return uninstall;
}

/**
 * Registra una guarda de `popstate`. Si la puerta aún no estaba instalada la instala, pero
 * el orden correcto solo se garantiza instalándola al arrancar (`index.tsx`).
 * Devuelve la función para quitar la guarda.
 */
export function registerPopStateGuard(guard: PopStateGuard): () => void {
  installPopStateGate();
  popStateGuards.add(guard);
  return () => {
    popStateGuards.delete(guard);
  };
}

/**
 * Navegaciones forzosas (p. ej. la sesión ya terminó): las guardas no deben bloquearlas.
 * Las pantallas con listeners propios de `popstate` consultan esta marca.
 */
let forcedNavigationDepth = 0;

export function isForcedNavigationInProgress(): boolean {
  return forcedNavigationDepth > 0;
}

// Posición de la entrada actual del historial (ver `historyIndex.ts`).
export { readHistoryIndex } from "./historyIndex";

/** Actualiza la URL y notifica listeners (popstate + sync). */
export function navigateAppTo(path: string): void {
  if (typeof window === "undefined") return;

  const url = new URL(path, window.location.origin);
  const next = url.pathname + url.search;
  const current = window.location.pathname + window.location.search;
  if (next === current) return;
  if (!isNavigationAllowed(next)) return;

  window.history.pushState({}, "", next);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.dispatchEvent(new Event(PATH_SYNC_EVENT));
}

export function navigateToAppHome(): void {
  navigateAppTo("/");
}

/** Tras cerrar sesión: quitar rutas privadas de la barra (evita que el siguiente login herede la URL). */
export function resetProtectedPathToAppHome(): void {
  if (typeof window === "undefined") return;
  const path = normalizeAppPathname(window.location.pathname);
  if (!pathRequiresUserSession(path) || path === "/") return;

  // La sesión ya terminó: ninguna guarda de cambios sin guardar puede frenar esta salida.
  forcedNavigationDepth += 1;
  try {
    window.history.replaceState({}, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.dispatchEvent(new Event(PATH_SYNC_EVENT));
  } finally {
    forcedNavigationDepth -= 1;
  }
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
  if (currentPath === "/privacidad-terminos") return "legal";
  if (currentPath === "/admin-login") return "admin-login";
  if (/^\/admin-dashboard\/usuario\/[^/]+$/i.test(currentPath)) return "admin-user";
  if (currentPath === "/admin-dashboard") return "admin-dashboard";
  if (currentPath === "/admin/dev/player-debug") return "admin-dev-player-debug";
  if (currentPath === "/americano-dinamico") return "americano-dinamico";
  if (currentPath.startsWith("/liga") || /^\/public\/liga\//i.test(currentPath))
    return "liga";
  if (currentPath === "/coaching" || currentPath.startsWith("/coaching/"))
    return "coaching";
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
    currentPath.startsWith("/players/") ||
    currentPath === "/public/ranking-puntos"
  ) {
    return "jugadores";
  }
  if (
    currentPath.startsWith("/torneo-express") ||
    currentPath.startsWith("/eventos/")
  )
    return "torneo-express";
  if (
    /^\/jugar\/[^/]+/i.test(currentPath) ||
    /^\/reta-abierta\/[^/]+/i.test(currentPath)
  ) {
    return "reta-abierta";
  }
  if (/^\/public\/vista-publica\/americano\//i.test(currentPath)) {
    return "public-vista-publica-americano";
  }
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
  if (path.startsWith("/coaching")) return true;
  if (path.startsWith("/duelo-2v2")) return true;
  if (path.startsWith("/public/jugadores")) return false;
  if (path === "/ranking" || path.startsWith("/ranking/")) return false;
  if (path.startsWith("/players/")) return false;
  if (path === "/public/ranking-puntos") return false;
  if (path.startsWith("/jugadores")) return true;
  if (
    path.startsWith("/torneo-express/") &&
    /\/(grupo\/[^/]+|general|grupos|eliminatoria)\/?$/i.test(path)
  ) {
    return false;
  }
  if (/^\/eventos\/[^/]+(\/en-vivo)?\/?$/i.test(path)) return false;
  if (/^\/jugar\/[^/]+/i.test(path)) return false;
  if (/^\/reta-abierta\/[^/]+/i.test(path)) return false;
  if (path === "/admin-login" || path === "/admin-dashboard") return false;
  if (path === "/admin/dev/player-debug") return false;
  if (path === "/auth/callback") return false;
  if (path === "/auth/reset-password") return false;
  if (path === "/privacidad-terminos") return false;
  return true;
}
