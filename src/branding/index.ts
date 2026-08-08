export type { TenantBranding } from "./types";

export {
  applyBrandingSyncForOrganizador,
  applyBrandingToDocument,
  applyDocumentMotherBrandPreservingCache,
  clearBrandingCache,
  clearTenantBranding,
  getAppliedBranding,
  resolveAndApplyBranding,
  resolveBranding,
  resolveBrandingSync,
  subscribeBranding,
} from "./BrandingService";

export { BrandingTransitionGate } from "./BrandingTransitionGate";

export {
  beginBrandingTransition,
  endBrandingTransition,
  getIsBrandingReady,
  getIsBrandingTransitioning,
  markBrandingBootstrapReady,
  subscribeBrandingTransition,
} from "./brandingTransition";

export type { BrandingTransitionReason } from "./brandingTransition";

export {
  readClubExperienceCache,
  getClubExperienceCacheIfMatches,
  resolveBootstrapOrganizadorId,
} from "./organizerResolver";

export { bootstrapAppBranding } from "./bootstrapAppBranding";
export { applyCachedClubExperienceIfSafe } from "./applyCachedClubExperience";
export { shouldKeepDocumentMotherBrand } from "./documentMotherBrandPath";
