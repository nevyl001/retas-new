import React from "react";
import { CoachingClubPage } from "./CoachingClubPage";
import { CoachPortalPage } from "./CoachPortalPage";
import { StudentCoachingPage } from "./StudentCoachingPage";
import {
  isCoachPortalPath,
  isCoachingPath,
  isStudentCoachingPath,
} from "./coachingNav";

export function isCoachingClubPath(pathname: string): boolean {
  return isCoachingPath(pathname);
}

export const CoachingRouter: React.FC<{ pathname: string }> = ({
  pathname,
}) => {
  if (!isCoachingPath(pathname)) return null;
  if (isStudentCoachingPath(pathname)) {
    return <StudentCoachingPage />;
  }
  if (isCoachPortalPath(pathname)) {
    return <CoachPortalPage />;
  }
  return <CoachingClubPage pathname={pathname} />;
};

