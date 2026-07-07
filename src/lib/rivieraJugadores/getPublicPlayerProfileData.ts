/**
 * Ficha pública — delega al motor único de identidad.
 * @see playerIdentityService.ts
 */
export {
  getPublicPlayerProfileData,
  getAdminPlayerProfileData,
  mergeLocalJugadorWithGlobalCareer,
  debugPlayerIdentity,
  resolvePlayerIdentity,
  resolvePlayerCareer,
  resolvePlayerPoints,
  resolvePlayerHistory,
  resolvePlayerLocalContext,
  resolveLinkedJugadorIdsForIdentity,
} from "./playerIdentityService";

export {
  getPlayerGlobalPoints,
  getPlayerPointsByOrganizer,
} from "./careerPointsByClub";

export {
  resolvePlayerPointsBreakdown,
  breakdownFromCareerResult,
  type PlayerPointsBreakdown,
  type PlayerPointsBreakdownClub,
} from "./playerPointsBreakdown";

export type {
  GetPublicPlayerProfileInput as GetPublicPlayerProfileDataParams,
  GetAdminPlayerProfileInput,
  PublicPlayerProfileData,
  AdminPlayerProfileData,
  PlayerIdentityInput,
  ResolvedPlayerIdentity,
  PlayerCareerBundle,
  PlayerIdentityDebugSnapshot,
} from "./playerIdentityService";
