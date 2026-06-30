import { useEffect, useState } from "react";
import { useUser } from "../contexts/UserContext";
import {
  getOrganizerDisplayNameSync,
  resolveOrganizerDisplayName,
} from "../lib/organizer/organizerDisplayName";
import { useClubExperience } from "./ClubExperienceContext";
import { RIVIERA_PRODUCT_NAME } from "./motherBrand";

/** Nombre visible del club/organizador (registro / RPC). El upgrade no sustituye este texto. */
export function useOrganizerDisplayName(
  organizadorId?: string | null
): string {
  const { user, userProfile } = useUser();
  const ctx = useClubExperience();
  const orgId = organizadorId ?? ctx.organizadorId;

  const hintName =
    user?.id && orgId && user.id === orgId ? userProfile?.name : null;

  const [name, setName] = useState(() =>
    getOrganizerDisplayNameSync(orgId, hintName)
  );

  useEffect(() => {
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
  }, [orgId, hintName]);

  return name;
}
