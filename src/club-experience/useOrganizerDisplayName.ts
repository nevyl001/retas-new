import { useEffect, useState } from "react";
import { useUser } from "../contexts/UserContext";
import {
  getOrganizerDisplayNameSync,
  resolveOrganizerDisplayName,
} from "../lib/organizer/organizerDisplayName";
import { useClubExperience } from "./ClubExperienceContext";
import { RIVIERA_PRODUCT_NAME } from "./motherBrand";

/** Nombre visible del club/organizador en la experiencia actual. */
export function useOrganizerDisplayName(
  organizadorId?: string | null
): string {
  const { user, userProfile } = useUser();
  const ctx = useClubExperience();
  const orgId = organizadorId ?? ctx.organizadorId;
  const { isClubBranded, manifest } = ctx;

  const hintName =
    user?.id && orgId && user.id === orgId ? userProfile?.name : null;

  const [name, setName] = useState(() =>
    isClubBranded
      ? manifest.displayName
      : getOrganizerDisplayNameSync(orgId, hintName)
  );

  useEffect(() => {
    if (isClubBranded) {
      setName(manifest.displayName);
      return;
    }

    if (!orgId) {
      setName(RIVIERA_PRODUCT_NAME);
      return;
    }

    let active = true;
    setName(getOrganizerDisplayNameSync(orgId, hintName));

    void resolveOrganizerDisplayName(orgId, { hintName }).then((resolved) => {
      if (active) setName(resolved);
    });

    return () => {
      active = false;
    };
  }, [orgId, hintName, isClubBranded, manifest.displayName]);

  return name;
}
