import { supabase } from "../lib/supabaseClient";
import { getPublicOrganizadorIdFromPath } from "../lib/rivieraJugadores/publicOrganizador";
import { debugLog } from "../lib/debug/debugLog";
import {
  beginBrandingTransition,
  endBrandingTransition,
  markBrandingBootstrapReady,
} from "./brandingTransition";
import { clearTenantBranding, resolveAndApplyBranding } from "./BrandingService";
import { shouldKeepDocumentMotherBrand } from "./documentMotherBrandPath";

function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

/** Rutas donde el branding es siempre identidad madre (sin club premium). */
function isMotherBrandOnlyPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return (
    path === "/auth/callback" ||
    path === "/auth/reset-password" ||
    path === "/admin-login" ||
    path === "/privacidad-terminos"
  );
}

let bootstrapDegraded = false;
const degradedListeners = new Set<() => void>();

function notifyDegradedListeners(): void {
  degradedListeners.forEach((listener) => listener());
}

function setBootstrapDegraded(value: boolean): void {
  if (bootstrapDegraded === value) return;
  bootstrapDegraded = value;
  notifyDegradedListeners();
}

/** true si el último intento de resolver branding falló y se usó el default. */
export function isBrandingBootstrapDegraded(): boolean {
  return bootstrapDegraded;
}

/** Suscripción a cambios de estado degradado (para un banner de reintento). */
export function subscribeBrandingBootstrapDegraded(
  listener: () => void
): () => void {
  degradedListeners.add(listener);
  return () => {
    degradedListeners.delete(listener);
  };
}

/**
 * Log seguro del fallo de arranque: solo nombre + mensaje de error, nunca
 * el objeto completo (podría traer detalles de red/headers) ni datos de sesión.
 */
function logBrandingBootstrapFailure(error: unknown): void {
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : String(error);
  console.error("[branding] bootstrap:failed — usando branding por defecto", {
    name,
    message,
  });
}

/** Resuelve qué branding aplicar según la ruta/sesión actual. Puede rechazar. */
async function resolveBrandingForCurrentLocation(): Promise<void> {
  if (typeof window === "undefined") {
    clearTenantBranding();
    debugLog("[branding] bootstrap:resolved", { orgId: null, source: "ssr" });
    return;
  }

  const pathOrg = getPublicOrganizadorIdFromPath();
  if (pathOrg) {
    debugLog("[branding] bootstrap:resolved", { orgId: pathOrg, source: "path" });
    await resolveAndApplyBranding(pathOrg);
    return;
  }

  if (
    isMotherBrandOnlyPath(window.location.pathname) ||
    shouldKeepDocumentMotherBrand(window.location.pathname)
  ) {
    debugLog("[branding] bootstrap:resolved", {
      orgId: null,
      source: "mother-path",
      path: window.location.pathname,
    });
    clearTenantBranding();
    return;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.user?.id) {
    debugLog("[branding] bootstrap:resolved", {
      orgId: session.user.id,
      source: "session-restore",
    });
    await resolveAndApplyBranding(session.user.id);
    return;
  }

  debugLog("[branding] bootstrap:resolved", { orgId: null, source: "anonymous" });
  clearTenantBranding();
}

/**
 * Resuelve y aplica branding antes del primer render de React.
 * - Ranking público con ?org o /ranking/o/{id} → club de la URL
 * - Invitaciones /jugar /public /eventos → madre en <html> (scope aplica host)
 * - Login/auth sin sesión válida → Riviera madre (nunca Hack por caché vieja)
 * - Sesión Supabase válida en rutas internas → branding del organizador logueado
 *
 * NUNCA rechaza: un fallo de red/Supabase aplica branding por defecto (marca
 * madre) y marca `isBrandingBootstrapDegraded()` en vez de impedir el primer
 * render de React (ver src/index.tsx). El llamador puede ofrecer un
 * reintento manual vía `retryBrandingBootstrap()`.
 */
export async function bootstrapAppBranding(): Promise<void> {
  if (typeof document !== "undefined") {
    document.documentElement.classList.add("branding-bootstrapping");
  }

  beginBrandingTransition("bootstrap");

  try {
    await resolveBrandingForCurrentLocation();
    setBootstrapDegraded(false);
  } catch (error) {
    logBrandingBootstrapFailure(error);
    clearTenantBranding();
    setBootstrapDegraded(true);
  } finally {
    endBrandingTransition("bootstrap");
    markBrandingBootstrapReady();
  }
}

/**
 * Reintento manual (ej. botón "Reintentar" en un banner no bloqueante).
 * No hace polling ni loop automático — se invoca una vez por click.
 * Devuelve true si esta vez se resolvió sin caer al default.
 */
export async function retryBrandingBootstrap(): Promise<boolean> {
  beginBrandingTransition("bootstrap");
  try {
    await resolveBrandingForCurrentLocation();
    setBootstrapDegraded(false);
    return true;
  } catch (error) {
    logBrandingBootstrapFailure(error);
    clearTenantBranding();
    setBootstrapDegraded(true);
    return false;
  } finally {
    endBrandingTransition("bootstrap");
    markBrandingBootstrapReady();
  }
}
