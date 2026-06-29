import React from "react";
import {
  getHomeEyebrow,
  getHomeWelcomeSubtitle,
  getHomeWelcomeTitle,
  useClubExperience,
} from "../../club-experience";
import { ModeHeader } from "../platform/ModeHeader";

interface HomeHeaderProps {
  userName?: string;
}

export const HomeHeader: React.FC<HomeHeaderProps> = ({ userName }) => {
  const { manifest, isClubBranded } = useClubExperience();
  const eyebrow = getHomeEyebrow(manifest, isClubBranded);
  const title = getHomeWelcomeTitle(manifest);
  const subtitle = getHomeWelcomeSubtitle(manifest, userName);

  return (
    <ModeHeader
      className="home-header rv-mode-header rv-mode-header--entry"
      eyebrow={eyebrow || undefined}
      title={title}
      subtitle={subtitle}
    />
  );
};
