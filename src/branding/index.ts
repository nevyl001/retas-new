export type {
  BrandAssets,
  BrandConfig,
  BrandConfigInput,
  BrandKey,
  BrandMessaging,
  BrandOrganizerBinding,
} from "./types";
export {
  RIVIERA_MOTHER_BRAND_NAME,
  RIVIERA_CO_BRAND_ATTRIBUTION,
  RIVIERA_PRODUCT_NAME,
  RIVIERA_DEFAULT_SLOGAN,
} from "./motherBrand";
export { RIVIERA_DEFAULT_BRAND } from "./defaultBrand";
export { HACK_PADEL_BRAND } from "./brands/hack-padel";
export { ORGANIZADOR_BRAND_INDEX } from "./organizadorBrandIndex";
export { createBrandConfig, mergeBrandConfig } from "./brandConfigFactory";
export {
  brandConfigSource,
  setRuntimeBrandBindings,
} from "./brandConfigSource";
export {
  getMotherAttributionLine,
  getCoBrandCompactLine,
  getHomeEyebrow,
  getAuthSubtitle,
  getAuthProof,
} from "./brandFormatters";
export { resolveBrandLogo } from "./resolveBrandLogo";
export { resolveBrand, isCoBrandedOrganizer } from "./brandResolver";
export { BrandProvider, BrandScope, useBrand } from "./BrandContext";
export { BrandSignature, CoBrandMark } from "./components/BrandSignature";
