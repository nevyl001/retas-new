import React from "react";
import { CoachingClubPage } from "./CoachingClubPage";
import { isCoachingPath } from "./coachingNav";

export function isCoachingClubPath(pathname: string): boolean {
  return isCoachingPath(pathname);
}

export const CoachingRouter: React.FC<{ pathname: string }> = ({
  pathname,
}) => {
  if (!isCoachingPath(pathname)) return null;
  return <CoachingClubPage pathname={pathname} />;
};
