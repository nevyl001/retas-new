import { applyBrandingSyncForOrganizador } from "./BrandingService";
import { shouldKeepDocumentMotherBrand } from "./documentMotherBrandPath";
import { readClubExperienceCache } from "./organizerResolver";
import { debugLog } from "../lib/debug/debugLog";

const PREMIUM_KEYS = new Set([
  "padel-court-series",
  "hack-padel",
  "valvidub-sports",
  "padelito-warehouse",
]);

function isMotherBrandOnlyPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return (
    path === "/auth/callback" ||
    path === "/auth/reset-password" ||
    path === "/admin-login" ||
    path === "/privacidad-terminos" ||
    shouldKeepDocumentMotherBrand(pathname)
  );
}

/**
 * Aplica de inmediato el branding premium cacheado (último club con upgrade).
 * Evita el flash Riviera→club mientras getSession() resuelve.
 * No aplica en rutas de marca madre ni si la caché no es un tenant premium.
 */
export function applyCachedClubExperienceIfSafe(): boolean {
  if (typeof window === "undefined") return false;
  if (isMotherBrandOnlyPath(window.location.pathname)) return false;

  const cached = readClubExperienceCache();
  if (!cached || !PREMIUM_KEYS.has(cached.brandingKey)) return false;

  applyBrandingSyncForOrganizador(cached.organizadorId);
  debugLog("[branding] cache:applied", {
    brandingKey: cached.brandingKey,
    organizadorId: cached.organizadorId,
  });
  return true;
}
