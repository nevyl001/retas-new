/**
 * Ficha admin — delega al mismo motor global de identidad que la ficha pública.
 * @see playerIdentityService.ts
 */
export {
  getAdminPlayerProfileData,
  mergeLocalJugadorWithGlobalCareer,
} from "./playerIdentityService";

export type {
  GetAdminPlayerProfileInput,
  AdminPlayerProfileData,
} from "./playerIdentityService";
