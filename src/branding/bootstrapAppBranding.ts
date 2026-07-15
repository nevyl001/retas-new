import { supabase } from "../lib/supabaseClient";
import { getPublicOrganizadorIdFromPath } from "../lib/rivieraJugadores/publicOrganizador";
import { debugLog } from "../lib/debug/debugLog";
import {
  beginBrandingTransition,
  endBrandingTransition,
  markBrandingBootstrapReady,
} from "./brandingTransition";
import { clearTenantBranding, resolveAndApplyBranding } from "./BrandingService";

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

/**
 * Resuelve y aplica branding antes del primer render de React.
 * - Ranking público con ?org o /ranking/o/{id} → club de la URL
 * - Login/auth sin sesión válida → Riviera madre (nunca Hack por caché vieja)
 * - Sesión Supabase válida → branding del organizador logueado
 */
export async function bootstrapAppBranding(): Promise<void> {
  if (typeof document !== "undefined") {
    document.documentElement.classList.add("branding-bootstrapping");
  }

  beginBrandingTransition("bootstrap");

  try {
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

    if (isMotherBrandOnlyPath(window.location.pathname)) {
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
  } finally {
    endBrandingTransition("bootstrap");
    markBrandingBootstrapReady();
  }
}
