import React from "react";
import { CoachingClubPage } from "./CoachingClubPage";
import { CoachPortalPage } from "./CoachPortalPage";
import { isCoachPortalPath, isCoachingPath } from "./coachingNav";

export function isCoachingClubPath(pathname: string): boolean {
  return isCoachingPath(pathname);
}

export const CoachingRouter: React.FC<{ pathname: string }> = ({
  pathname,
}) => {
  if (!isCoachingPath(pathname)) return null;
  if (isCoachPortalPath(pathname)) {
    return <CoachPortalPage />;
  }
  return <CoachingClubPage pathname={pathname} />;
};
