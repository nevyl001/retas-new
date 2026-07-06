/**
 * Ficha pública — delega al motor único de identidad.
 * @see playerIdentityService.ts
 */
export {
  getPublicPlayerProfileData,
  debugPlayerIdentity,
  resolvePlayerIdentity,
  resolvePlayerCareer,
  resolvePlayerPoints,
  resolvePlayerHistory,
  resolvePlayerLocalContext,
  resolveLinkedJugadorIdsForIdentity,
} from "./playerIdentityService";

export type {
  GetPublicPlayerProfileInput as GetPublicPlayerProfileDataParams,
  PublicPlayerProfileData,
  PlayerIdentityInput,
  ResolvedPlayerIdentity,
  PlayerCareerBundle,
  PlayerIdentityDebugSnapshot,
} from "./playerIdentityService";
