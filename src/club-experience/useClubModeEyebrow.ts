import { getHomeEyebrow } from "./experienceFormatters";
import { useClubExperience } from "./ClubExperienceContext";

/** Eyebrow unificado para headers internos de modo (sin hardcodear Riviera Open). */
export function useClubModeEyebrow(): string {
  const { manifest, isClubBranded } = useClubExperience();
  return getHomeEyebrow(manifest, isClubBranded);
}
