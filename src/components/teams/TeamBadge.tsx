import React from "react";
import "./team-badge.css";

export const TeamBadge: React.FC<{
  name: string;
  teamIndex?: number;
  className?: string;
  title?: string;
}> = ({ name, teamIndex, className = "", title }) => {
  const tone =
    teamIndex === 0
      ? "team-badge--a"
      : teamIndex === 1
        ? "team-badge--b"
        : "team-badge--neutral";

  return (
    <span
      className={`team-badge ${tone} ${className}`.trim()}
      title={title ?? `Equipo ${name}`}
    >
      {name}
    </span>
  );
};
