/**
 * Experiencia de Club — sistema de identidad sobre Riviera Open.
 *
 * Etapa B.5: manifiestos, assets, experiencias por superficie.
 * Etapa C (futura): Club Experience en modos de juego.
 */

export type {
  BrandManifest,
  BrandManifestInput,
  BrandManifestOverrides,
  ClubBrandingKey,
  ClubOrganizerBinding,
  ClubImages,
  ClubLogos,
  ClubHomeExperience,
  ClubLandingExperience,
  BrandConfig,
  BrandKey,
} from "./types";

export {
  RIVIERA_MOTHER_BRAND_NAME,
  RIVIERA_CO_BRAND_ATTRIBUTION,
  RIVIERA_PRODUCT_NAME,
  RIVIERA_DEFAULT_SLOGAN,
} from "./motherBrand";

export {
  RIVIERA_DEFAULT_MANIFEST,
  RIVIERA_DEFAULT_BRAND,
} from "./manifests/riviera-default";
export { HACK_PADEL_MANIFEST, HACK_PADEL_BRAND } from "./manifests/hack-padel";

export {
  ORGANIZADOR_CLUB_BINDINGS,
  ORGANIZADOR_CLUB_INDEX,
  ORGANIZADOR_BRAND_INDEX,
} from "./organizadorClubIndex";

export {
  findOrganizerClubBinding,
  isPremiumBrandingEnabledForOrganizador,
  setRuntimeOrganizerClubBindings,
} from "./organizerBindingResolver";

export {
  createBrandManifest,
  mergeBrandManifest,
  createBrandConfig,
  mergeBrandConfig,
} from "./manifestFactory";

export {
  clubManifestSource,
  setRuntimeClubBindings,
  setRuntimeBrandBindings,
  brandConfigSource,
} from "./manifestSource";

export {
  getManifestByKey,
  listRegisteredManifestKeys,
  resolveBrandingKeyForOrganizador,
  getBrandConfigByKey,
  resolveBrandKeyForOrganizador,
} from "./manifestRegistry";

export {
  getMotherAttributionLine,
  getCoBrandCompactLine,
  getHomeEyebrow,
  getHomeWelcomeTitle,
  getHomeWelcomeSubtitle,
  getHomeEmptyState,
  getLandingSubtitle,
  getLandingProofLine,
  getAuthSubtitle,
  getAuthProof,
  getRegistryPageTitle,
  getRegistrySectionLabel,
  getRegistryEmptyMessage,
  getOrganizerRegistryCardSubtitle,
  getDueloRegistryHint,
  getDueloHomeSubtitle,
  getDuelo2v2ModeDescription,
  getOrganizerCelebrateTagline,
  formatTenantDocumentTitle,
  getAccountModeDisabledMessage,
  getLigaVictoriaCelebrateMessage,
  getDueloWinnerCelebrateMessage,
  getDueloLoserCelebrateMessage,
  getWinnersSectionAriaLabel,
  getOrganizerCelebrateParticipantesNote,
  getDueloFinalizarConfirmMessage,
  getPodiumFinalAriaLabel,
} from "./experienceFormatters";

export {
  resolveClubLogo,
  resolveBrandLogo,
  manifestHasClubLogo,
} from "./resolveClubLogo";
export type { ClubLogoSurface, BrandLogoSurface } from "./resolveClubLogo";

export {
  resolveClubManifest,
  isClubBrandedOrganizer,
  resolveBrand,
  isCoBrandedOrganizer,
} from "./manifestResolver";

export {
  applyClubExperienceTheme,
  clearClubExperienceTheme,
  applyClubFavicon,
  applyClubKeyToDocument,
  applyBrandThemeTokens,
  clearBrandThemeTokens,
  applyBrandFavicon,
} from "./applyClubExperienceTheme";

export {
  bootstrapClubExperienceTheme,
  applyClubExperienceForOrganizador,
  resolveBootstrapOrganizadorId,
  persistClubExperienceCache,
  clearClubExperienceCache,
  resetClubExperienceTheme,
  readClubExperienceCache,
  CLUB_EXPERIENCE_CACHE_KEY,
} from "./clubExperienceBootstrap";

export { getClubExperienceCacheIfMatches } from "../branding/organizerResolver";

export { useClubModeEyebrow } from "./useClubModeEyebrow";
export { useOrganizerDisplayName } from "./useOrganizerDisplayName";

export {
  ClubExperienceProvider,
  ClubExperienceScope,
  useClubExperience,
  useBranding,
  BrandProvider,
  BrandScope,
  useBrand,
} from "./ClubExperienceContext";

export {
  ClubIdentity,
  BrandSignature,
  CoBrandMark,
} from "./components/ClubIdentity";
export { PublicEventBrandIdentity } from "./components/PublicEventBrandIdentity";
export { PublicEventNeutralLoading } from "./components/PublicEventNeutralLoading";
export { PublicClubModeEyebrow } from "./components/PublicClubModeEyebrow";
export type { ClubBrandingStatus } from "./ClubExperienceContext";

export type { TenantBranding } from "../branding/types";
export {
  bootstrapAppBranding,
  clearTenantBranding,
  getAppliedBranding,
  resolveBranding,
  resolveBrandingSync,
} from "../branding";
