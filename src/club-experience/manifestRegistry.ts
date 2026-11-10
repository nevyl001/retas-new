import { resolveBrandingKeyForOrganizador } from "./organizerBindingResolver";
import {
  getManifestByKey,
  listPremiumManifestOptions,
  listRegisteredManifestKeys,
} from "./manifestCatalog";

export {
  getManifestByKey,
  listPremiumManifestOptions,
  listRegisteredManifestKeys,
};

export { resolveBrandingKeyForOrganizador };

/** @deprecated Usar getManifestByKey */
export const getBrandConfigByKey = getManifestByKey;

/** @deprecated Usar resolveBrandingKeyForOrganizador */
export const resolveBrandKeyForOrganizador = resolveBrandingKeyForOrganizador;

export { ORGANIZADOR_CLUB_BINDINGS, ORGANIZADOR_CLUB_INDEX } from "./organizadorClubIndex";
