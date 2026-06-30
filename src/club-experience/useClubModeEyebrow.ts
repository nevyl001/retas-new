import { getHomeEyebrow } from "./experienceFormatters";
import { useClubExperience } from "./ClubExperienceContext";
import { useOrganizerDisplayName } from "./useOrganizerDisplayName";

export function useClubModeEyebrow(): string {
  const { manifest, isClubBranded, organizadorId } = useClubExperience();
  const organizerName = useOrganizerDisplayName(organizadorId);
  return getHomeEyebrow(manifest, isClubBranded, organizerName);
}
