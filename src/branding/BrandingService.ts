import {
  applyClubExperienceTheme,
  applyClubFavicon,
  applyClubKeyToDocument,
  clearClubExperienceTheme,
} from "../club-experience/applyClubExperienceTheme";
import {
  isClubBrandedOrganizer,
  resolveClubManifest,
} from "../club-experience/manifestResolver";
import { RIVIERA_DEFAULT_MANIFEST } from "../club-experience/manifests/riviera-default";
import { RIVIERA_PRODUCT_NAME } from "../club-experience/motherBrand";
import type { BrandManifest } from "../club-experience/types";
import {
  clearOrganizerDisplayNameCache,
  getCachedOrganizerDisplayName,
  resolveOrganizerDisplayName,
} from "../lib/organizer/organizerDisplayName";
import { syncRuntimeBindingForOrganizador } from "../lib/branding/organizerBrandingSettings";
import { brandingDevLog, brandingDevLogHtmlTransition } from "./brandingDevLog";
import { CLUB_EXPERIENCE_CACHE_KEY } from "./constants";
import type { TenantBranding } from "./types";

let appliedBranding: TenantBranding | null = null;
const inflightByOrganizadorId = new Map<string, Promise<TenantBranding>>();
const brandingListeners = new Set<() => void>();

function normalizeOrganizadorId(
  organizadorId: string | null | undefined
): string | null {
  const normalized = organizadorId?.trim().toLowerCase();
  return normalized || null;
}

function inflightKey(organizadorId: string | null | undefined): string {
  return normalizeOrganizadorId(organizadorId) ?? "__mother__";
}

function notifyBrandingListeners(): void {
  brandingListeners.forEach((listener) => listener());
}

/** Suscripción a cambios de branding aplicado (solo lectura en UI). */
export function subscribeBranding(listener: () => void): () => void {
  brandingListeners.add(listener);
  return () => {
    brandingListeners.delete(listener);
  };
}

function brandingMatchesApplied(branding: TenantBranding): boolean {
  if (!appliedBranding) return false;

  return (
    normalizeOrganizadorId(appliedBranding.organizadorId) ===
      normalizeOrganizadorId(branding.organizadorId) &&
    appliedBranding.brandingKey === branding.brandingKey &&
    appliedBranding.nombre === branding.nombre &&
    appliedBranding.primaryColor === branding.primaryColor &&
    appliedBranding.logoUrl === branding.logoUrl
  );
}

function manifestToTenantBranding(
  organizadorId: string | null,
  manifest: BrandManifest,
  nombre: string,
  isClubBranded: boolean
): TenantBranding {
  const { colors, fonts, logos } = manifest;
  return {
    organizadorId,
    brandingKey: manifest.brandingKey,
    nombre,
    logoUrl: logos.dark ?? logos.light ?? null,
    primaryColor: colors.primary,
    secondaryColor: colors.secondary,
    background: colors.surface,
    surface: colors.surfaceAlt,
    border: colors.border,
    fontFamily: fonts.body,
    manifest,
    isClubBranded,
  };
}

function persistClubExperienceCache(
  organizadorId: string | null | undefined,
  manifest: BrandManifest
): void {
  if (typeof window === "undefined") return;

  const normalizedOrgId = normalizeOrganizadorId(organizadorId);
  if (
    !normalizedOrgId ||
    manifest.brandingKey === RIVIERA_DEFAULT_MANIFEST.brandingKey
  ) {
    window.localStorage.removeItem(CLUB_EXPERIENCE_CACHE_KEY);
    return;
  }

  window.localStorage.setItem(
    CLUB_EXPERIENCE_CACHE_KEY,
    JSON.stringify({
      organizadorId: normalizedOrgId,
      brandingKey: manifest.brandingKey,
    })
  );
}

function clearClubExperienceCache(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CLUB_EXPERIENCE_CACHE_KEY);
}

export function getAppliedBranding(): TenantBranding | null {
  return appliedBranding;
}

export function applyBrandingToDocument(branding: TenantBranding): void {
  if (brandingMatchesApplied(branding)) {
    document.documentElement.classList.remove("branding-bootstrapping");
    brandingDevLog("apply:skipped-idempotent", {
      brandingKey: branding.brandingKey,
      organizadorId: branding.organizadorId,
    });
    return;
  }

  const beforeClub =
    typeof document !== "undefined"
      ? document.documentElement.getAttribute("data-club")
      : null;

  const { manifest, isClubBranded, organizadorId } = branding;

  applyClubKeyToDocument(manifest.brandingKey);
  applyClubExperienceTheme(manifest);

  if (isClubBranded) {
    applyClubFavicon(manifest);
    persistClubExperienceCache(organizadorId, manifest);
  } else {
    clearClubExperienceCache();
  }

  appliedBranding = branding;
  document.documentElement.classList.remove("branding-bootstrapping");
  brandingDevLogHtmlTransition("apply:done", beforeClub);
  brandingDevLog("apply:brandingKey", {
    brandingKey: branding.brandingKey,
    organizadorId: branding.organizadorId,
    isClubBranded,
  });
  notifyBrandingListeners();
}

/** Resolución síncrona: manifiesto + nombre en caché (premium siempre sync). */
export function resolveBrandingSync(
  organizadorId: string | null | undefined
): TenantBranding {
  const orgId = normalizeOrganizadorId(organizadorId);
  const manifest = resolveClubManifest(orgId);
  const isClubBranded = isClubBrandedOrganizer(orgId);

  let nombre: string;
  if (orgId) {
    const cached = getCachedOrganizerDisplayName(orgId);
    nombre = cached ?? RIVIERA_PRODUCT_NAME;
  } else {
    nombre = RIVIERA_PRODUCT_NAME;
  }

  return manifestToTenantBranding(orgId, manifest, nombre, isClubBranded);
}

/** Fetch async del nombre cuando no hay manifiesto premium. */
export async function resolveBranding(
  organizadorId: string | null | undefined
): Promise<TenantBranding> {
  const orgId = normalizeOrganizadorId(organizadorId);
  const sync = resolveBrandingSync(orgId);

  if (!orgId) {
    return sync;
  }

  const nombre = await resolveOrganizerDisplayName(orgId);
  return manifestToTenantBranding(
    orgId,
    sync.manifest,
    nombre,
    sync.isClubBranded
  );
}

export async function resolveAndApplyBranding(
  organizadorId: string | null | undefined
): Promise<TenantBranding> {
  const key = inflightKey(organizadorId);
  const inflight = inflightByOrganizadorId.get(key);
  if (inflight) return inflight;

  const promise = (async () => {
    await syncRuntimeBindingForOrganizador(organizadorId);
    const branding = await resolveBranding(organizadorId);
    applyBrandingToDocument(branding);
    return branding;
  })().finally(() => {
    inflightByOrganizadorId.delete(key);
  });

  inflightByOrganizadorId.set(key, promise);
  return promise;
}

export function applyBrandingSyncForOrganizador(
  organizadorId: string | null | undefined
): TenantBranding {
  const branding = resolveBrandingSync(organizadorId);
  applyBrandingToDocument(branding);
  return branding;
}

export function clearBrandingCache(): void {
  inflightByOrganizadorId.clear();
  clearClubExperienceCache();
  clearOrganizerDisplayNameCache();
  appliedBranding = null;
}

/**
 * Limpieza total de branding (logout / cambio de tenant).
 * Estado visual = identidad madre Riviera Open (decisión arquitectura).
 */
export function clearTenantBranding(): void {
  clearBrandingCache();
  clearClubExperienceTheme();

  const mother = resolveBrandingSync(null);
  applyBrandingToDocument(mother);
}
