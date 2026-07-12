import React from "react";
import {
  getHomeEyebrow,
  getHomeWelcomeSubtitle,
  getHomeWelcomeTitle,
  useClubExperience,
  useOrganizerDisplayName,
} from "../../club-experience";
import { ModeHeader } from "../platform/ModeHeader";

interface HomeHeaderProps {
  userName?: string;
  title?: string;
  subtitle?: string;
}

export const HomeHeader: React.FC<HomeHeaderProps> = ({
  userName,
  title: titleOverride,
  subtitle: subtitleOverride,
}) => {
  const { manifest, isClubBranded, organizadorId } = useClubExperience();
  const organizerName = useOrganizerDisplayName(organizadorId);
  const eyebrow = getHomeEyebrow(manifest, isClubBranded, organizerName);
  const title = titleOverride ?? getHomeWelcomeTitle(manifest);
  const subtitle = subtitleOverride ?? getHomeWelcomeSubtitle(manifest, userName);

  return (
    <ModeHeader
      className="home-header rv-mode-header rv-mode-header--entry"
      eyebrow={eyebrow || undefined}
      title={title}
      subtitle={subtitle}
    />
  );
};
