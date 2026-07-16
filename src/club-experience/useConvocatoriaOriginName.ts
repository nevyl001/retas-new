import { getConvocatoriaOriginName } from "./experienceFormatters";
import { useClubExperience } from "./ClubExperienceContext";
import { useOrganizerDisplayName } from "./useOrganizerDisplayName";

/** Club u organizador que creó el juego — para mensaje WhatsApp de convocatoria. */
export function useConvocatoriaOriginName(): string {
  const { manifest, isClubBranded, organizadorId } = useClubExperience();
  const organizerName = useOrganizerDisplayName(organizadorId);
  return getConvocatoriaOriginName(manifest, isClubBranded, organizerName);
}
