import React from "react";
import { getHomeEmptyState, useClubExperience } from "../../club-experience";
import { TablerIcon } from "../ui/TablerIcon";

export const EmptyStateRetas: React.FC = () => {
  const { manifest } = useClubExperience();
  const { title, text } = getHomeEmptyState(manifest);

  return (
    <div className="home-empty-retas">
      <span className="home-empty-retas__icon" aria-hidden>
        <TablerIcon name="ball-tennis" size={40} />
      </span>
      <p className="home-empty-retas__title">{title}</p>
      <p className="home-empty-retas__text">{text}</p>
    </div>
  );
};
